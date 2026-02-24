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
				flipped: c.flipped ?? false
			}))

			// Normalize optional fields
			scene.dialogue = scene.dialogue ?? []
			scene.choices = scene.choices ?? null
			scene.next = scene.next ?? null
			scene.background = scene.background ?? null
			scene.music = scene.music ?? null
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
