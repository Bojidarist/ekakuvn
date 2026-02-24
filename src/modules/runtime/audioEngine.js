export class AudioEngine {
	#context = null
	#musicGain = null
	#sfxGain = null
	#masterGain = null
	#currentMusic = null
	#currentMusicId = null
	#initialized = false

	volumes = {
		master: 1.0,
		music: 0.7,
		sfx: 1.0
	}

	constructor() {
		// AudioContext is created lazily to avoid browser autoplay warnings
	}

	get context() {
		this.#ensureInitialized()
		return this.#context
	}

	get currentMusicId() {
		return this.#currentMusicId
	}

	get currentMusicTime() {
		if (this.#currentMusic) {
			return this.#currentMusic.currentTime
		}
		return 0
	}

	#ensureInitialized() {
		if (this.#initialized) return

		this.#context = new (window.AudioContext || window.webkitAudioContext)()
		this.#masterGain = this.#context.createGain()
		this.#musicGain = this.#context.createGain()
		this.#sfxGain = this.#context.createGain()

		this.#musicGain.connect(this.#masterGain)
		this.#sfxGain.connect(this.#masterGain)
		this.#masterGain.connect(this.#context.destination)

		this.#applyVolumes()
		this.#initialized = true
	}

	async ensureResumed() {
		this.#ensureInitialized()

		if (this.#context.state === 'running') return

		if (this.#context.state === 'suspended') {
			// Try to resume, but don't block if it requires a user gesture
			try {
				await this.#context.resume()
			} catch {
				// Ignore -- will retry on user interaction
			}

			// If still suspended, set up listeners to resume on first user interaction
			if (this.#context.state === 'suspended') {
				const resumeOnGesture = () => {
					this.#context.resume().catch(() => {})
					document.removeEventListener('click', resumeOnGesture)
					document.removeEventListener('keydown', resumeOnGesture)
					document.removeEventListener('touchstart', resumeOnGesture)
				}
				document.addEventListener('click', resumeOnGesture)
				document.addEventListener('keydown', resumeOnGesture)
				document.addEventListener('touchstart', resumeOnGesture)
			}
		}
	}

	playMusic(audioElement, assetId, options = {}) {
		this.#ensureInitialized()
		const { loop = true, startTime = 0 } = options

		this.stopMusic()

		const source = this.#context.createMediaElementSource(audioElement.cloneNode())
		source.connect(this.#musicGain)

		const clone = source.mediaElement
		clone.loop = loop
		clone.currentTime = startTime
		clone.play().catch(err => {
			console.warn('AudioEngine: music playback failed', err)
		})

		this.#currentMusic = clone
		this.#currentMusicId = assetId
	}

	stopMusic() {
		if (this.#currentMusic) {
			this.#currentMusic.pause()
			this.#currentMusic.currentTime = 0
			this.#currentMusic = null
			this.#currentMusicId = null
		}
	}

	playSfx(audioElement) {
		this.#ensureInitialized()
		const source = this.#context.createMediaElementSource(audioElement.cloneNode())
		source.connect(this.#sfxGain)

		const clone = source.mediaElement
		clone.loop = false
		clone.play().catch(err => {
			console.warn('AudioEngine: sfx playback failed', err)
		})

		clone.addEventListener('ended', () => {
			clone.remove()
		})
	}

	setMasterVolume(value) {
		this.volumes.master = Math.max(0, Math.min(1, value))
		if (this.#initialized) this.#applyVolumes()
	}

	setMusicVolume(value) {
		this.volumes.music = Math.max(0, Math.min(1, value))
		if (this.#initialized) this.#applyVolumes()
	}

	setSfxVolume(value) {
		this.volumes.sfx = Math.max(0, Math.min(1, value))
		if (this.#initialized) this.#applyVolumes()
	}

	getMusicState() {
		if (!this.#currentMusic) return null
		return {
			assetId: this.#currentMusicId,
			currentTime: this.#currentMusic.currentTime,
			volume: this.volumes.music
		}
	}

	dispose() {
		this.stopMusic()
		if (this.#context && this.#context.state !== 'closed') {
			this.#context.close()
		}
	}

	#applyVolumes() {
		this.#masterGain.gain.value = this.volumes.master
		this.#musicGain.gain.value = this.volumes.music
		this.#sfxGain.gain.value = this.volumes.sfx
	}
}
