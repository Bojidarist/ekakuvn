export class AssetLoader {
	#assets = new Map()
	#totalCount = 0
	#loadedCount = 0
	#onProgress = null

	constructor(onProgress) {
		this.#onProgress = onProgress ?? null
	}

	async loadManifest(manifest) {
		if (!manifest || !Array.isArray(manifest)) {
			console.warn('AssetLoader: manifest is empty or invalid')
			return this.#assets
		}

		this.#totalCount = manifest.length
		this.#loadedCount = 0

		const promises = manifest.map(entry => this.#loadAsset(entry))
		await Promise.allSettled(promises)

		return this.#assets
	}

	getAsset(id) {
		return this.#assets.get(id) ?? null
	}

	hasAsset(id) {
		return this.#assets.has(id)
	}

	get progress() {
		if (this.#totalCount === 0) return 1
		return this.#loadedCount / this.#totalCount
	}

	get loadedCount() {
		return this.#loadedCount
	}

	get totalCount() {
		return this.#totalCount
	}

	async #loadAsset(entry) {
		const { id, type, path, dataUrl } = entry
		const src = dataUrl || path

		try {
			let resource = null

			if (type === 'background' || type === 'character') {
				resource = await this.#loadImage(src)
			} else if (type === 'music' || type === 'sound') {
				resource = await this.#loadAudio(src)
			} else {
				console.warn(`AssetLoader: unknown asset type "${type}" for "${id}"`)
			}

			if (resource) {
				this.#assets.set(id, { id, type, path, resource })
			}
		} catch (err) {
			console.warn(`AssetLoader: failed to load "${id}" from "${path}"`, err)
		}

		this.#loadedCount++
		this.#emitProgress()
	}

	#loadImage(path) {
		return new Promise((resolve, reject) => {
			const img = new Image()
			img.onload = () => resolve(img)
			img.onerror = () => reject(new Error(`Failed to load image: ${path}`))
			img.src = path
		})
	}

	#loadAudio(path) {
		return new Promise((resolve, reject) => {
			const audio = new Audio()
			audio.preload = 'auto'

			const onCanPlay = () => {
				audio.removeEventListener('canplaythrough', onCanPlay)
				audio.removeEventListener('error', onError)
				resolve(audio)
			}

			const onError = () => {
				audio.removeEventListener('canplaythrough', onCanPlay)
				audio.removeEventListener('error', onError)
				reject(new Error(`Failed to load audio: ${path}`))
			}

			audio.addEventListener('canplaythrough', onCanPlay)
			audio.addEventListener('error', onError)
			audio.src = path
			audio.load()
		})
	}

	#emitProgress() {
		if (this.#onProgress) {
			this.#onProgress({
				loaded: this.#loadedCount,
				total: this.#totalCount,
				progress: this.progress
			})
		}
	}
}
