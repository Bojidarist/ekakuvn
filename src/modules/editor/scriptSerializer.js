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
			if (!confirm(msg)) return
		}

		const script = this.#state.toScript()
		const json = JSON.stringify(script, null, '\t')
		const title = this.#state.project.meta.title ?? 'untitled'
		const filename = this.#slugify(title) + '.evn'
		const compressed = await this.#gzipCompress(json)
		this.#downloadBlob(filename, new Blob([compressed], { type: 'application/gzip' }))
	}

	async exportProjectToFile() {
		const project = structuredClone(this.#state.project)
		const json = JSON.stringify(project, null, '\t')
		const title = project.meta.title ?? 'untitled'
		const filename = this.#slugify(title) + '.ekaku-project.evn'
		const compressed = await this.#gzipCompress(json)
		this.#downloadBlob(filename, new Blob([compressed], { type: 'application/gzip' }))
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

		// Check each scene for missing references
		for (const scene of project.scenes) {
			// Background references a missing asset
			if (scene.background && !assetIds.has(scene.background)) {
				warnings.push(`\u2022 Scene "${scene.id}": background references missing asset "${scene.background}"`)
			}

			// Music references a missing asset
			if (scene.music?.assetId && !assetIds.has(scene.music.assetId)) {
				warnings.push(`\u2022 Scene "${scene.id}": music references missing asset "${scene.music.assetId}"`)
			}

			// Character references missing assets
			for (const char of scene.characters ?? []) {
				if (char.assetId && !assetIds.has(char.assetId)) {
					warnings.push(`\u2022 Scene "${scene.id}": character references missing asset "${char.assetId}"`)
				}
			}

			// Next scene references a missing scene
			if (scene.next && !sceneIds.has(scene.next)) {
				warnings.push(`\u2022 Scene "${scene.id}": next scene "${scene.next}" does not exist`)
			}

			// Choice targets reference missing scenes
			if (scene.choices) {
				for (const choice of scene.choices) {
					if (choice.targetSceneId && !sceneIds.has(choice.targetSceneId)) {
						warnings.push(`\u2022 Scene "${scene.id}": choice "${choice.text}" targets missing scene "${choice.targetSceneId}"`)
					}
					if (!choice.targetSceneId) {
						warnings.push(`\u2022 Scene "${scene.id}": choice "${choice.text}" has no target scene`)
					}
				}
			}

			// Scene has no dialogue and no choices (empty scene)
			if ((!scene.dialogue || scene.dialogue.length === 0) && !scene.choices) {
				warnings.push(`\u2022 Scene "${scene.id}": has no dialogue and no choices`)
			}

			// Dead end: no next scene and no choices
			if (!scene.next && !scene.choices) {
				warnings.push(`\u2022 Scene "${scene.id}": dead end (no next scene or choices)`)
			}
		}

		// Find orphan scenes (not reachable from start scene)
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
				if (scene.choices) {
					for (const choice of scene.choices) {
						if (choice.targetSceneId && !reachable.has(choice.targetSceneId)) {
							queue.push(choice.targetSceneId)
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
		const usedAssets = new Set()
		for (const scene of project.scenes) {
			if (scene.background) usedAssets.add(scene.background)
			if (scene.music?.assetId) usedAssets.add(scene.music.assetId)
			for (const char of scene.characters ?? []) {
				if (char.assetId) usedAssets.add(char.assetId)
			}
		}
		if (project.meta?.mainMenu?.background) {
			usedAssets.add(project.meta.mainMenu.background)
		}
		for (const asset of project.assets) {
			if (!usedAssets.has(asset.id)) {
				warnings.push(`\u2022 Asset "${asset.name ?? asset.id}" is unused`)
			}
		}

		return warnings
	}

	// --- Import ---

	#importFile(file) {
		const reader = new FileReader()
		reader.onload = async (e) => {
			try {
				const buffer = e.target.result
				const json = await this.#readAsJson(buffer)
				const data = JSON.parse(json)
				this.#loadData(data)
			} catch {
				alert('Failed to parse file. Make sure it is a valid .evn or JSON file.')
			}
		}
		reader.onerror = () => {
			alert('Failed to read file.')
		}
		reader.readAsArrayBuffer(file)
	}

	#loadData(data) {
		// Validate basic structure
		if (!data || typeof data !== 'object') {
			alert('Invalid file format.')
			return
		}

		// Detect if it's a runtime script or an editor project
		if (data.meta && data.scenes && Array.isArray(data.scenes)) {
			// Check if it has editor-specific fields (character IDs)
			const hasEditorFields = data.scenes.some(s =>
				s.characters?.some(c => c.id)
			)

			if (hasEditorFields) {
				// Full editor project -- load directly
				this.#state.loadProject(data)
			} else {
				// Runtime script -- convert to editor format
				this.#importRuntimeScript(data)
			}
			return
		}

		alert('Unrecognized file format. Expected an ekaku script or project file.')
	}

	#importRuntimeScript(script) {
		// Convert a runtime script to editor project format
		const project = structuredClone(script)

		// Ensure assets have names
		for (const asset of project.assets) {
			if (!asset.name) {
				asset.name = asset.id
			}
		}

		// Ensure characters have editor IDs
		for (const scene of project.scenes) {
			scene.characters = (scene.characters ?? []).map(c => ({
				id: this.#generateId('char'),
				assetId: c.assetId,
				position: c.position ?? { x: 0.5, y: 0.5 },
				scale: c.scale ?? 1.0,
				flipped: c.flipped ?? false,
				enterAnimation: c.enterAnimation ?? { type: 'none', duration: 0.4 }
			}))

			// Normalize optional fields
			scene.dialogue = scene.dialogue ?? []
			scene.choices = scene.choices ?? null
			scene.next = scene.next ?? null
			scene.background = scene.background ?? null
			scene.music = scene.music ?? null
			scene.transition = scene.transition ?? { type: 'fade', duration: 0.5 }
		}

		this.#state.loadProject(project)
	}

	// --- Compression ---

	async #gzipCompress(text) {
		const encoder = new TextEncoder()
		const input = encoder.encode(text)
		const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))
		const reader = stream.getReader()
		const chunks = []
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			chunks.push(value)
		}
		// Concatenate all chunks into a single Uint8Array
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
		const result = new Uint8Array(totalLength)
		let offset = 0
		for (const chunk of chunks) {
			result.set(chunk, offset)
			offset += chunk.length
		}
		return result
	}

	async #gzipDecompress(buffer) {
		const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
		const reader = stream.getReader()
		const chunks = []
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			chunks.push(value)
		}
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
		const result = new Uint8Array(totalLength)
		let offset = 0
		for (const chunk of chunks) {
			result.set(chunk, offset)
			offset += chunk.length
		}
		return new TextDecoder().decode(result)
	}

	#isGzipped(buffer) {
		const bytes = new Uint8Array(buffer, 0, 2)
		return bytes[0] === 0x1f && bytes[1] === 0x8b
	}

	async #readAsJson(buffer) {
		if (this.#isGzipped(buffer)) {
			return await this.#gzipDecompress(buffer)
		}
		return new TextDecoder().decode(buffer)
	}

	// --- Helpers ---

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

	#generateId(prefix) {
		return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
	}
}
