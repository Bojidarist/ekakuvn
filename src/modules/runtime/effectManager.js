export class EffectManager {
	#renderer = null
	#colorEffects = new Map() // effectKey -> CSS filter fragment string
	#animSlots = []           // [{ type, intensity, duration, frequency, elapsed }]
	#flashSlots = []          // [{ color, duration, elapsed }]
	#flashDrawFn = null       // registered with renderer as 'flash' layer draw fn

	constructor(renderer) {
		this.#renderer = renderer

		// Register a flash layer — the draw function is updated as slots change
		this.#flashDrawFn = (r) => this.#drawFlash(r)
	}

	getFlashLayerFn() {
		return this.#flashDrawFn
	}

	/**
	 * Apply an effect node.
	 * @param {object} node - Runtime node (flat — node.effectType, node.intensity, etc.)
	 */
	apply(node) {
		const type = node.effectType ?? 'reset'

		switch (type) {
			case 'reset':
				this.reset()
				break

			// Color/filter effects
			case 'negate':
				this.#colorEffects.set('negate', 'invert(100%)')
				this.#refreshFilter()
				break
			case 'grayscale':
				this.#colorEffects.set('grayscale', 'grayscale(100%)')
				this.#refreshFilter()
				break
			case 'sepia':
				this.#colorEffects.set('sepia', 'sepia(100%)')
				this.#refreshFilter()
				break
			case 'blur': {
				const px = node.amount ?? 4
				this.#colorEffects.set('blur', `blur(${px}px)`)
				this.#refreshFilter()
				break
			}
			case 'brightness': {
				const pct = node.amount ?? 150
				this.#colorEffects.set('brightness', `brightness(${pct}%)`)
				this.#refreshFilter()
				break
			}
			case 'contrast': {
				const pct = node.amount ?? 150
				this.#colorEffects.set('contrast', `contrast(${pct}%)`)
				this.#refreshFilter()
				break
			}
			case 'saturate': {
				const pct = node.amount ?? 200
				this.#colorEffects.set('saturate', `saturate(${pct}%)`)
				this.#refreshFilter()
				break
			}
			case 'hue': {
				const deg = node.amount ?? 180
				this.#colorEffects.set('hue', `hue-rotate(${deg}deg)`)
				this.#refreshFilter()
				break
			}

			// Screen animation effects
			case 'shake':
			case 'sway':
			case 'bounce':
			case 'tilt':
			case 'zoom-pulse':
				this.#animSlots.push({
					type,
					intensity: node.intensity ?? 8,
					duration: (node.duration ?? 500) / 1000, // store in seconds
					frequency: node.frequency ?? 2,
					elapsed: 0
				})
				break

			// Flash effect
			case 'flash':
				this.#flashSlots.push({
					color: node.color ?? '#ffffff',
					duration: (node.duration ?? 300) / 1000, // store in seconds
					elapsed: 0
				})
				break
		}
	}

	reset() {
		this.#colorEffects.clear()
		this.#animSlots = []
		this.#flashSlots = []
		this.#refreshFilter()
		this.#renderer.setScreenTransform(null)
	}

	/**
	 * Advance all active effect slots by dt seconds.
	 * @param {number} dt - Delta time in seconds
	 */
	update(dt) {
		// Advance animation slots
		if (this.#animSlots.length > 0) {
			for (const slot of this.#animSlots) {
				slot.elapsed += dt
			}
			// Remove expired slots
			this.#animSlots = this.#animSlots.filter(s => s.elapsed < s.duration)

			// Sum contributions from all active animation slots
			let tx = 0
			let ty = 0
			let rotation = 0
			let scale = 1

			for (const slot of this.#animSlots) {
				const t = slot.elapsed
				const freq = slot.frequency
				const intensity = slot.intensity

				switch (slot.type) {
					case 'shake':
						tx += (Math.random() * 2 - 1) * intensity
						ty += (Math.random() * 2 - 1) * intensity
						break
					case 'sway':
						tx += Math.sin(t * freq * Math.PI * 2) * intensity
						break
					case 'bounce':
						ty += Math.abs(Math.sin(t * freq * Math.PI * 2)) * -intensity
						break
					case 'tilt':
						rotation += (Math.sin(t * freq * Math.PI * 2) * intensity * Math.PI) / 180
						break
					case 'zoom-pulse':
						scale += Math.sin(t * freq * Math.PI * 2) * intensity
						break
				}
			}

			if (this.#animSlots.length > 0) {
				this.#renderer.setScreenTransform({ tx, ty, rotation, scale })
			} else {
				this.#renderer.setScreenTransform(null)
			}
		}

		// Advance flash slots
		if (this.#flashSlots.length > 0) {
			for (const slot of this.#flashSlots) {
				slot.elapsed += dt
			}
			this.#flashSlots = this.#flashSlots.filter(s => s.elapsed < s.duration)
		}
	}

	#refreshFilter() {
		if (this.#colorEffects.size === 0) {
			this.#renderer.setFilter('none')
		} else {
			const filterStr = [...this.#colorEffects.values()].join(' ')
			this.#renderer.setFilter(filterStr)
		}
	}

	#drawFlash(renderer) {
		if (this.#flashSlots.length === 0) return

		const ctx = renderer.context
		const w = renderer.width
		const h = renderer.height

		for (const slot of this.#flashSlots) {
			const progress = slot.elapsed / slot.duration
			const alpha = Math.max(0, 1 - progress)

			ctx.save()
			ctx.globalAlpha = alpha
			ctx.fillStyle = slot.color
			ctx.fillRect(0, 0, w, h)
			ctx.restore()
		}
	}

	dispose() {
		this.reset()
	}
}
