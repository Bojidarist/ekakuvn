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
			// Check if it has editor-specific fields (timeline node IDs)
			const hasEditorFields = data.scenes.some(s =>
				s.timeline?.some(n => n.id)
			)

			if (hasEditorFields) {
				// Full editor project -- load directly (migration happens in loadProject)
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

		for (const scene of project.scenes) {
			if (scene.timeline && Array.isArray(scene.timeline)) {
				// New runtime format (timeline nodes without IDs, flattened data)
				// Convert to editor format: add IDs and wrap data
				scene.timeline = scene.timeline.map(node => {
					const { type, auto, delay, ...rest } = node
					return {
						id: this.#generateId('node'),
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
						id: this.#generateId('node'),
						type: 'background',
						auto: true,
						delay: 0,
						data: { assetId: scene.background }
					})
				}

				if (scene.music?.assetId) {
					scene.timeline.push({
						id: this.#generateId('node'),
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
						id: this.#generateId('node'),
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
							id: this.#generateId('node'),
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
						id: this.#generateId('node'),
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
						id: this.#generateId('node'),
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
