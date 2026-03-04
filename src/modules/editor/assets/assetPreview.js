/**
 * Asset preview modals: image preview with dimensions/size,
 * and audio preview with the shared audio player.
 */
import { formatFileSize } from '../../shared/utils.js'
import { createAudioPlayer } from '../../shared/audioPlayerBuilder.js'

export class AssetPreview {
	#activeAudio = null
	#activeVideo = null
	#activeOverlay = null

	/**
	 * Show a full-screen image preview modal.
	 */
	showImage(asset) {
		this.close()

		const overlay = document.createElement('div')
		overlay.className = 'preview-overlay'

		const modal = document.createElement('div')
		modal.className = 'preview-modal'

		const img = document.createElement('img')
		img.src = asset.dataUrl ?? asset.path
		img.alt = asset.name ?? asset.id

		const title = document.createElement('div')
		title.className = 'preview-modal-title'
		title.textContent = asset.name ?? asset.id

		const meta = document.createElement('div')
		meta.className = 'preview-modal-meta'
		meta.textContent = 'Loading...'

		// Load dimensions and compute approximate file size
		img.addEventListener('load', () => {
			const w = img.naturalWidth
			const h = img.naturalHeight
			const sizeBytes = asset.dataUrl
				? Math.round((asset.dataUrl.length - asset.dataUrl.indexOf(',') - 1) * 3 / 4)
				: null
			const sizeStr = sizeBytes != null ? formatFileSize(sizeBytes) : 'unknown size'
			meta.textContent = `${w} \u00D7 ${h} \u2022 ${asset.type} \u2022 ${sizeStr}`
		})

		const closeBtn = document.createElement('button')
		closeBtn.className = 'preview-modal-close'
		closeBtn.textContent = '\u00D7'
		closeBtn.addEventListener('click', () => this.close())

		modal.appendChild(img)
		modal.appendChild(title)
		modal.appendChild(meta)
		overlay.appendChild(modal)
		overlay.appendChild(closeBtn)

		// Close on click outside modal
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) this.close()
		})

		// Close on Escape
		const onKey = (e) => {
			if (e.key === 'Escape') {
				this.close()
				document.removeEventListener('keydown', onKey)
			}
		}
		document.addEventListener('keydown', onKey)

		document.body.appendChild(overlay)
		this.#activeOverlay = { overlay, onKey }
	}

	/**
	 * Show a full-screen video preview modal with native video player.
	 */
	showVideo(asset) {
		this.close()

		const overlay = document.createElement('div')
		overlay.className = 'preview-overlay'

		const modal = document.createElement('div')
		modal.className = 'preview-modal'

		const title = document.createElement('div')
		title.className = 'preview-modal-title'
		title.textContent = asset.name ?? asset.id

		const meta = document.createElement('div')
		meta.className = 'preview-modal-meta'
		meta.textContent = asset.type

		const video = document.createElement('video')
		if (asset.dataUrl) video.src = asset.dataUrl
		video.controls = true
		video.style.cssText = 'max-width: 100%; max-height: 400px; display: block; margin: 8px auto 0;'
		this.#activeVideo = video

		video.addEventListener('loadedmetadata', () => {
			const w = Math.round(video.videoWidth)
			const h = Math.round(video.videoHeight)
			const dur = video.duration ? `${video.duration.toFixed(1)}s` : ''
			const sizeBytes = asset.dataUrl
				? Math.round((asset.dataUrl.length - asset.dataUrl.indexOf(',') - 1) * 3 / 4)
				: null
			const sizeStr = sizeBytes != null ? formatFileSize(sizeBytes) : 'unknown size'
			const parts = [`${w} \u00D7 ${h}`, asset.type]
			if (dur) parts.push(dur)
			parts.push(sizeStr)
			meta.textContent = parts.join(' \u2022 ')
		})

		const closeBtn = document.createElement('button')
		closeBtn.className = 'preview-modal-close'
		closeBtn.textContent = '\u00D7'
		closeBtn.addEventListener('click', () => this.close())

		modal.appendChild(title)
		modal.appendChild(meta)
		modal.appendChild(video)
		overlay.appendChild(modal)
		overlay.appendChild(closeBtn)

		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) this.close()
		})

		const onKey = (e) => {
			if (e.key === 'Escape') {
				this.close()
				document.removeEventListener('keydown', onKey)
			}
		}
		document.addEventListener('keydown', onKey)

		document.body.appendChild(overlay)
		this.#activeOverlay = { overlay, onKey }
	}

	/**
	 * Show a full-screen audio preview modal with player controls.
	 */
	showAudio(asset) {		this.close()

		const overlay = document.createElement('div')
		overlay.className = 'preview-overlay'

		const modal = document.createElement('div')
		modal.className = 'preview-modal'

		const title = document.createElement('div')
		title.className = 'preview-modal-title'
		title.textContent = asset.name ?? asset.id

		const meta = document.createElement('div')
		meta.className = 'preview-modal-meta'
		meta.textContent = asset.type

		const { container: player, audio } = createAudioPlayer(asset)
		this.#activeAudio = audio

		const closeBtn = document.createElement('button')
		closeBtn.className = 'preview-modal-close'
		closeBtn.textContent = '\u00D7'
		closeBtn.addEventListener('click', () => this.close())

		modal.appendChild(title)
		modal.appendChild(meta)
		modal.appendChild(player)
		overlay.appendChild(modal)
		overlay.appendChild(closeBtn)

		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) this.close()
		})

		const onKey = (e) => {
			if (e.key === 'Escape') {
				this.close()
				document.removeEventListener('keydown', onKey)
			}
		}
		document.addEventListener('keydown', onKey)

		document.body.appendChild(overlay)
		this.#activeOverlay = { overlay, onKey }
	}

	/**
	 * Close any open preview and stop audio.
	 */
	close() {
		if (this.#activeOverlay) {
			this.#activeOverlay.overlay.remove()
			if (this.#activeOverlay.onKey) {
				document.removeEventListener('keydown', this.#activeOverlay.onKey)
			}
			this.#activeOverlay = null
		}
		this.#stopAudio()
		this.#stopVideo()
	}

	#stopVideo() {
		if (this.#activeVideo) {
			this.#activeVideo.pause()
			this.#activeVideo.src = ''
			this.#activeVideo = null
		}
	}

	#stopAudio() {
		if (this.#activeAudio) {
			this.#activeAudio.pause()
			this.#activeAudio.src = ''
			this.#activeAudio = null
		}
	}
}
