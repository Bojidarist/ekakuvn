export class TransitionManager {
	#renderer = null
	#active = false
	#type = 'none'
	#progress = 0
	#duration = 0.5 // seconds
	#resolve = null
	#snapshot = null // ImageData of the previous frame
	#snapshotCanvas = null // cached offscreen canvas

	// Easing: smooth ease-in-out
	static #ease(t) {
		return t < 0.5
			? 2 * t * t
			: 1 - Math.pow(-2 * t + 2, 2) / 2
	}

	constructor(renderer) {
		this.#renderer = renderer
	}

	get isActive() {
		return this.#active
	}

	/**
	 * Capture the current canvas contents as a snapshot for transition.
	 * Call this BEFORE the scene is swapped.
	 */
	captureSnapshot() {
		const ctx = this.#renderer.context
		const w = this.#renderer.width
		const h = this.#renderer.height
		this.#snapshot = ctx.getImageData(0, 0, w, h)
		this.#snapshotCanvas = null
	}

	/**
	 * Start a transition animation.
	 * @param {string} type - 'fade' | 'dissolve' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'none'
	 * @param {number} [duration=0.5] - Duration in seconds
	 * @returns {Promise<void>} Resolves when the transition completes
	 */
	start(type = 'fade', duration = 0.5) {
		if (type === 'none' || !this.#snapshot) {
			this.#snapshot = null
			this.#snapshotCanvas = null
			return Promise.resolve()
		}

		this.#type = type
		this.#duration = Math.max(0.1, duration)
		this.#progress = 0
		this.#active = true

		return new Promise(resolve => {
			this.#resolve = resolve
		})
	}

	/**
	 * Update transition progress. Call this each frame with deltaTime.
	 * @param {number} dt - Delta time in seconds
	 */
	update(dt) {
		if (!this.#active) return

		this.#progress += dt / this.#duration
		if (this.#progress >= 1) {
			this.#progress = 1
			this.#active = false
			this.#snapshot = null
			this.#snapshotCanvas = null
			if (this.#resolve) {
				const resolve = this.#resolve
				this.#resolve = null
				resolve()
			}
		}
	}

	/**
	 * Draw the transition overlay. Call this AFTER normal layer rendering.
	 * @param {Renderer} renderer
	 */
	draw(renderer) {
		if (!this.#active || !this.#snapshot) return

		const ctx = renderer.context
		const w = renderer.width
		const h = renderer.height
		const t = TransitionManager.#ease(this.#progress)

		switch (this.#type) {
			case 'fade':
				this.#drawFade(ctx, w, h, t)
				break
			case 'dissolve':
				this.#drawDissolve(ctx, w, h, t)
				break
			case 'slideLeft':
				this.#drawSlide(ctx, w, h, t, 'left')
				break
			case 'slideRight':
				this.#drawSlide(ctx, w, h, t, 'right')
				break
			case 'slideUp':
				this.#drawSlide(ctx, w, h, t, 'up')
				break
			case 'slideDown':
				this.#drawSlide(ctx, w, h, t, 'down')
				break
			default:
				break
		}
	}

	/**
	 * Fade: old scene fades to black, then new scene fades in from black.
	 * First half: old scene + darkening overlay
	 * Second half: new scene + lightening overlay
	 */
	#drawFade(ctx, w, h, t) {
		if (t < 0.5) {
			// First half: show old scene, darken toward black
			const snapshotCanvas = this.#getSnapshotCanvas(w, h)
			ctx.save()
			ctx.clearRect(0, 0, w, h)
			ctx.drawImage(snapshotCanvas, 0, 0)
			ctx.fillStyle = `rgba(0, 0, 0, ${t * 2})`
			ctx.fillRect(0, 0, w, h)
			ctx.restore()
		} else {
			// Second half: new scene is drawn by layers; apply darkening that fades out
			ctx.save()
			const alpha = (1 - t) * 2
			ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`
			ctx.fillRect(0, 0, w, h)
			ctx.restore()
		}
	}

	/**
	 * Dissolve: crossfade between old and new scene.
	 * Old scene is drawn on top with decreasing opacity.
	 */
	#drawDissolve(ctx, w, h, t) {
		const snapshotCanvas = this.#getSnapshotCanvas(w, h)
		ctx.save()
		ctx.globalAlpha = 1 - t
		ctx.drawImage(snapshotCanvas, 0, 0)
		ctx.globalAlpha = 1
		ctx.restore()
	}

	/**
	 * Slide: old scene slides out in the given direction, new scene is revealed underneath.
	 */
	#drawSlide(ctx, w, h, t, direction) {
		const snapshotCanvas = this.#getSnapshotCanvas(w, h)
		ctx.save()

		let offsetX = 0
		let offsetY = 0

		switch (direction) {
			case 'left':
				offsetX = -w * t
				break
			case 'right':
				offsetX = w * t
				break
			case 'up':
				offsetY = -h * t
				break
			case 'down':
				offsetY = h * t
				break
		}

		ctx.drawImage(snapshotCanvas, offsetX, offsetY)
		ctx.restore()
	}

	/**
	 * Convert the ImageData snapshot to an offscreen canvas for drawing.
	 * Result is cached until the next captureSnapshot() call.
	 */
	#getSnapshotCanvas(w, h) {
		if (this.#snapshotCanvas) return this.#snapshotCanvas

		const offscreen = document.createElement('canvas')
		offscreen.width = w
		offscreen.height = h
		const offCtx = offscreen.getContext('2d')
		offCtx.putImageData(this.#snapshot, 0, 0)
		this.#snapshotCanvas = offscreen
		return offscreen
	}
}
