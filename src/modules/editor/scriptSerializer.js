import { EditorModal } from './editorModal.js'
import { generateId } from '../shared/utils.js'
import { gzipCompress, isGzipped, readAsJson } from '../shared/compression.js'
import { assetDB } from '../shared/assetDB.js'
import { zipAsync, unzipAsync } from '../shared/archiveUtils.js'
import { spinner } from './loadingSpinner.js'

export class ScriptSerializer {
	#state = null
	#fileInput = null

	constructor(state) {
		this.#state = state
		this.#fileInput = document.getElementById('file-input-script')

		this.#fileInput.addEventListener('change', (e) => {
			const file = e.target.files[0]
			if (file) this.#importFile(file)
			this.#fileInput.value = ''
		})
	}

	// --- Public API ---

	openImportDialog() {
		this.#fileInput.click()
	}

	async exportToFile() {
		// Validate before export
		const warnings = this.#validate()
		if (warnings.length > 0) {
			const msg = 'Export warnings:\n\n' + warnings.join('\n') + '\n\nExport anyway?'
			if (!await EditorModal.confirm(msg)) return
		}

		await spinner.wrap('Exporting…', async () => {
			// Ensure all assets have their dataUrl populated from IndexedDB
			await this.#hydrateAssetsForExport()

			const script = this.#state.toScript()
			const json = JSON.stringify(script, null, '\t')
			const title = this.#state.project.meta.title ?? 'untitled'
			const filename = this.#slugify(title) + '.evn'
			const compressed = await gzipCompress(json)
			this.#downloadBlob(filename, new Blob([compressed], { type: 'application/gzip' }))
		})
	}

	async exportProjectToFile() {
		await spinner.wrap('Saving…', async () => {
			const project = structuredClone(this.#state.project)

			// Strip dataUrls — assets are stored as separate files in the zip
			for (const asset of project.assets) {
				asset.dataUrl = null
			}

			const title = project.meta.title ?? 'untitled'
			const filename = this.#slugify(title) + '.ekaku-project.evn'

			// Build zip entries: project.json + one file per asset
			const files = {}
			files['project.json'] = new TextEncoder().encode(JSON.stringify(project, null, '\t'))

			for (const asset of project.assets) {
				const blob = await assetDB.getBlob(asset.id)
				if (!blob) continue
				const ext = asset.path ? asset.path.split('.').pop() : mimeToExt(blob.type)
				files[`assets/${asset.id}.${ext}`] = new Uint8Array(await blob.arrayBuffer())
			}

			const zipBlob = await zipAsync(files)
			this.#downloadBlob(filename, zipBlob)
		})
	}

	/**
	 * Populate each asset's in-memory dataUrl from IndexedDB when it is missing.
	 * Uses getDataUrl() (base64) rather than get() (blob URL) because the result
	 * must be embeddable in the exported JSON file.
	 * Only used for the runtime .evn export (images only).
	 */
	async #hydrateAssetsForExport() {
		for (const asset of this.#state.project.assets) {
			if (!asset.dataUrl || asset.dataUrl.startsWith('blob:')) {
				// For video/audio: base64 in JSON is not viable — omit; runtime will need path
				if (asset.type === 'video' || asset.type === 'music' || asset.type === 'sound') continue
				asset.dataUrl = await assetDB.getDataUrl(asset.id) ?? null
			}
		}
	}

	// --- Validation ---

	#validate() {
		const warnings = []
		const project = this.#state.project
		const assetIds = new Set(project.assets.map(a => a.id))
		const sceneIds = new Set(project.scenes.map(s => s.id))

		// Check for empty project
		if (project.scenes.length === 0) {
			warnings.push('\u2022 No scenes defined')
			return warnings
		}

		// Check start scene
		if (!project.startScene) {
			warnings.push('\u2022 No start scene set')
		} else if (!sceneIds.has(project.startScene)) {
			warnings.push(`\u2022 Start scene "${project.startScene}" does not exist`)
		}

		// Check each scene's timeline nodes
		const usedAssets = new Set()
		if (project.meta?.mainMenu?.background) {
			usedAssets.add(project.meta.mainMenu.background)
		}

		for (const scene of project.scenes) {
			const timeline = scene.timeline ?? []
			let hasDialogue = false
			let hasChoice = false

			for (const node of timeline) {
				if (node.type === 'dialogue') {
					hasDialogue = true
				}

				if (node.type === 'choice') {
					hasChoice = true
					const choices = node.data?.choices ?? []
					for (const choice of choices) {
						if (choice.targetSceneId && !sceneIds.has(choice.targetSceneId)) {
							warnings.push(`\u2022 Scene "${scene.id}": choice "${choice.text}" targets missing scene "${choice.targetSceneId}"`)
						}
						if (!choice.targetSceneId) {
							warnings.push(`\u2022 Scene "${scene.id}": choice "${choice.text || '(empty)'}" has no target scene`)
						}
					}
				}

				// Check asset references in nodes
				const assetId = node.data?.assetId
				if (assetId) {
					usedAssets.add(assetId)
					if (!assetIds.has(assetId)) {
						warnings.push(`\u2022 Scene "${scene.id}": ${node.type} node references missing asset "${assetId}"`)
					}
				}

				// Check expression asset references in showCharacter nodes
				if (node.type === 'showCharacter' && node.data?.expressions) {
					for (const [exprName, exprAssetId] of Object.entries(node.data.expressions)) {
						if (exprAssetId) {
							usedAssets.add(exprAssetId)
							if (!assetIds.has(exprAssetId)) {
								warnings.push(`\u2022 Scene "${scene.id}": expression "${exprName}" references missing asset "${exprAssetId}"`)
							}
						}
					}
				}
			}

			// Next scene references a missing scene
			if (scene.next && !sceneIds.has(scene.next)) {
				warnings.push(`\u2022 Scene "${scene.id}": next scene "${scene.next}" does not exist`)
			}

			// Empty timeline
			if (timeline.length === 0) {
				warnings.push(`\u2022 Scene "${scene.id}": has no timeline nodes`)
			} else if (!hasDialogue && !hasChoice) {
				warnings.push(`\u2022 Scene "${scene.id}": has no dialogue or choice nodes`)
			}

			// Dead end: no next scene and no choice node
			if (!scene.next && !hasChoice) {
				warnings.push(`\u2022 Scene "${scene.id}": dead end (no next scene or choice node)`)
			}
		}

		// Find orphan scenes
		if (project.startScene && sceneIds.has(project.startScene)) {
			const reachable = new Set()
			const queue = [project.startScene]
			while (queue.length > 0) {
				const id = queue.shift()
				if (reachable.has(id)) continue
				reachable.add(id)

				const scene = project.scenes.find(s => s.id === id)
				if (!scene) continue

				if (scene.next && !reachable.has(scene.next)) {
					queue.push(scene.next)
				}

				// Find choice nodes in timeline for reachability
				for (const node of scene.timeline ?? []) {
					if (node.type === 'choice' && node.data?.choices) {
						for (const choice of node.data.choices) {
							if (choice.targetSceneId && !reachable.has(choice.targetSceneId)) {
								queue.push(choice.targetSceneId)
							}
						}
					}
				}
			}

			for (const scene of project.scenes) {
				if (!reachable.has(scene.id)) {
					warnings.push(`\u2022 Scene "${scene.id}": orphan (not reachable from start scene)`)
				}
			}
		}

		// Check for unused assets
		for (const asset of project.assets) {
			if (!usedAssets.has(asset.id)) {
				warnings.push(`\u2022 Asset "${asset.name ?? asset.id}" is unused`)
			}
		}

		return warnings
	}

	// --- Import ---

	#importFile(file) {
		// New format: .evn project archive (ZIP) — detect by magic bytes or old .zip extension
		// We read the first 4 bytes to check for the ZIP magic number PK\x03\x04
		const reader = new FileReader()
		reader.onload = async (e) => {
			try {
				const buffer = e.target.result
				if (isZipBuffer(buffer)) {
					await spinner.wrap('Opening project…', () => this.#importZipProject(file, buffer))
					return
				}

				// Legacy format: .evn (gzip JSON) or plain JSON
				await spinner.wrap('Opening project…', async () => {
					const json = await readAsJson(buffer)
					const data = JSON.parse(json)
					await this.#loadData(data)
				})
			} catch {
				EditorModal.alert('Failed to parse file. Make sure it is a valid .evn or JSON file.')
			}
		}
		reader.onerror = () => {
			EditorModal.alert('Failed to read file.')
		}
		reader.readAsArrayBuffer(file)
	}

	async #importZipProject(file, buffer) {
		try {
			const entries = await unzipAsync(new Uint8Array(buffer ?? await file.arrayBuffer()))

			// Parse project.json
			if (!entries['project.json']) {
				EditorModal.alert('Invalid project zip: missing project.json')
				return
			}
			const json = new TextDecoder().decode(entries['project.json'])
			const project = JSON.parse(json)

			// Clear stale localStorage and IDB *before* storing the new blobs so
			// that loadProjectFromFile can find them.  (loadProjectFromFile would
			// normally do this itself, but that would wipe the blobs we are about
			// to write — so we pass skipStorageClear=true below.)
			await this.#state.clearStorage()

			// Restore asset blobs into IndexedDB
			for (const [path, bytes] of Object.entries(entries)) {
				if (!path.startsWith('assets/')) continue
				// Filename: assets/<id>.<ext>
				const filename = path.slice('assets/'.length)
				const dotIdx = filename.lastIndexOf('.')
				const id = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename
				const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1) : ''
				const mimeType = extToMime(ext)
				const blob = new Blob([bytes], { type: mimeType })
				await assetDB.put(id, blob)
			}

			await this.#loadData(project, true)
		} catch (err) {
			EditorModal.alert('Failed to open project zip: ' + err.message)
		}
	}

	async #loadData(data, skipStorageClear = false) {
		// Validate basic structure
		if (!data || typeof data !== 'object') {
			EditorModal.alert('Invalid file format.')
			return
		}

		// Detect if it's a runtime script or an editor project
		if (data.meta && data.scenes && Array.isArray(data.scenes)) {
			// Check if it has editor-specific fields (timeline node IDs, sections, folders)
			const hasEditorFields = data.scenes.some(s =>
				s.timeline?.some(n => n.id)
			) || Array.isArray(data.sceneSections) || Array.isArray(data.folders)

			if (hasEditorFields) {
				// Full editor project -- load via async path to migrate assets into IndexedDB
				await this.#state.loadProjectFromFile(data, skipStorageClear)
			} else {
				// Runtime script -- convert to editor format
				await this.#importRuntimeScript(data, skipStorageClear)
			}
			return
		}

		EditorModal.alert('Unrecognized file format. Expected an ekaku script or project file.')
	}

	async #importRuntimeScript(script, skipStorageClear = false) {
		// Convert a runtime script to editor project format
		const project = structuredClone(script)

		// Ensure assets have names
		for (const asset of project.assets) {
			if (!asset.name) {
				asset.name = asset.id
			}
		}

		for (const scene of project.scenes) {
			if (scene.timeline && Array.isArray(scene.timeline)) {
				// New runtime format (timeline nodes without IDs, flattened data)
				// Convert to editor format: add IDs and wrap data
				scene.timeline = scene.timeline.map(node => {
					const { type, auto, delay, ...rest } = node
					return {
						id: generateId('node'),
						type,
						auto: auto ?? false,
						delay: delay ?? 0,
						data: rest
					}
				})
			} else {
				// Old runtime format (flat fields: characters, dialogue, etc.)
				// Build timeline from old fields, then EditorState#migrateScene will
				// handle the rest on load
				scene.timeline = []

				if (scene.background) {
					scene.timeline.push({
						id: generateId('node'),
						type: 'background',
						auto: true,
						delay: 0,
						data: { assetId: scene.background }
					})
				}

				if (scene.music?.assetId) {
					scene.timeline.push({
						id: generateId('node'),
						type: 'music',
						auto: true,
						delay: 0,
						data: {
							assetId: scene.music.assetId,
							loop: scene.music.loop ?? true,
							action: 'play'
						}
					})
				}

				for (const char of scene.characters ?? []) {
					scene.timeline.push({
						id: generateId('node'),
						type: 'showCharacter',
						auto: true,
						delay: 0,
						data: {
							name: char.name ?? '',
							assetId: char.assetId,
							position: char.position ?? { x: 0.5, y: 0.8 },
							scale: char.scale ?? 1.0,
							flipped: char.flipped ?? false,
							expressions: char.expressions ?? {}
						}
					})
				}

				for (const line of scene.dialogue ?? []) {
					if (line.expression) {
						scene.timeline.push({
							id: generateId('node'),
							type: 'expression',
							auto: true,
							delay: 0,
							data: {
								name: line.speaker ?? '',
								expression: line.expression,
								expressionAssetId: null
							}
						})
					}
					scene.timeline.push({
						id: generateId('node'),
						type: 'dialogue',
						auto: false,
						delay: 0,
						data: {
							speaker: line.speaker ?? null,
							text: line.text ?? '',
							voiceAssetId: line.voiceAssetId ?? null
						}
					})
				}

				if (scene.choices && scene.choices.length > 0) {
					scene.timeline.push({
						id: generateId('node'),
						type: 'choice',
						auto: false,
						delay: 0,
						data: { choices: scene.choices }
					})
				}

				// Clean up old fields
				delete scene.background
				delete scene.music
				delete scene.characters
				delete scene.dialogue
				delete scene.choices
			}

			// Normalize flow fields
			scene.next = scene.next ?? null
			scene.transition = scene.transition ?? { type: 'fade', duration: 0.5 }
		}

		await this.#state.loadProjectFromFile(project, skipStorageClear)
	}

	#downloadBlob(filename, blob) {
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = filename
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	#slugify(text) {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			|| 'untitled'
	}
}

// --- Format detection ---

/**
 * Return true if the ArrayBuffer starts with the ZIP magic bytes PK\x03\x04.
 * Used to distinguish ZIP project archives from gzip runtime scripts when both
 * share the .evn extension.
 * @param {ArrayBuffer} buffer
 */
function isZipBuffer(buffer) {
	if (buffer.byteLength < 4) return false
	const view = new Uint8Array(buffer, 0, 4)
	return view[0] === 0x50 && view[1] === 0x4B && view[2] === 0x03 && view[3] === 0x04
}

// --- MIME / extension helpers ---

const MIME_TO_EXT = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
	'audio/mpeg': 'mp3',
	'audio/ogg': 'ogg',
	'audio/wav': 'wav',
	'audio/flac': 'flac',
	'audio/aac': 'aac',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/ogg': 'ogv',
	'video/quicktime': 'mov',
}

const EXT_TO_MIME = Object.fromEntries(Object.entries(MIME_TO_EXT).map(([m, e]) => [e, m]))

function mimeToExt(mime) {
	return MIME_TO_EXT[mime] ?? mime.split('/').pop() ?? 'bin'
}

function extToMime(ext) {
	return EXT_TO_MIME[ext.toLowerCase()] ?? 'application/octet-stream'
}
