export class Renderer {
	#canvas = null
	#ctx = null
	#layers = []
	#animationId = null
	#running = false

	options = {
		width: 1280,
		height: 720
	}

	constructor(selectorOrElement, width, height) {
		this.options.width = width ?? this.options.width
		this.options.height = height ?? this.options.height

		if (typeof selectorOrElement === 'string') {
			const parent = document.querySelector(selectorOrElement)
			if (!parent) throw new Error(`Renderer: element not found for selector "${selectorOrElement}"`)
			this.#canvas = Object.assign(document.createElement('canvas'), {
				width: this.options.width,
				height: this.options.height
			})
			parent.appendChild(this.#canvas)
		} else if (selectorOrElement instanceof HTMLCanvasElement) {
			this.#canvas = selectorOrElement
			this.#canvas.width = this.options.width
			this.#canvas.height = this.options.height
		} else {
			throw new Error('Renderer: first argument must be a CSS selector string or a canvas element')
		}

		this.#ctx = this.#canvas.getContext('2d')
		this.#layers = []
	}

	get canvas() {
		return this.#canvas
	}

	get context() {
		return this.#ctx
	}

	get width() {
		return this.options.width
	}

	get height() {
		return this.options.height
	}

	resize(width, height) {
		this.options.width = width
		this.options.height = height
		this.#canvas.width = width
		this.#canvas.height = height
	}

	clear() {
		this.#ctx.clearRect(0, 0, this.options.width, this.options.height)
	}

	drawImage(img, x, y, w, h) {
		if (!img || !img.complete) return
		this.#ctx.drawImage(img, x, y, w ?? img.naturalWidth, h ?? img.naturalHeight)
	}

	drawText(text, x, y, options = {}) {
		const {
			font = '24px sans-serif',
			color = '#ffffff',
			align = 'left',
			baseline = 'top',
			maxWidth = undefined,
			lineHeight = 30,
			shadow = null
		} = options

		this.#ctx.font = font
		this.#ctx.fillStyle = color
		this.#ctx.textAlign = align
		this.#ctx.textBaseline = baseline

		if (shadow) {
			this.#ctx.shadowColor = shadow.color ?? 'rgba(0,0,0,0.5)'
			this.#ctx.shadowBlur = shadow.blur ?? 4
			this.#ctx.shadowOffsetX = shadow.offsetX ?? 2
			this.#ctx.shadowOffsetY = shadow.offsetY ?? 2
		}

		if (maxWidth) {
			const lines = this.#wrapText(text, maxWidth)
			for (let i = 0; i < lines.length; i++) {
				this.#ctx.fillText(lines[i], x, y + i * lineHeight)
			}
		} else {
			this.#ctx.fillText(text, x, y)
		}

		// Reset shadow
		this.#ctx.shadowColor = 'transparent'
		this.#ctx.shadowBlur = 0
		this.#ctx.shadowOffsetX = 0
		this.#ctx.shadowOffsetY = 0
	}

	drawRect(x, y, w, h, options = {}) {
		const {
			fill = null,
			stroke = null,
			strokeWidth = 1,
			alpha = 1.0,
			radius = 0
		} = options

		const prevAlpha = this.#ctx.globalAlpha
		this.#ctx.globalAlpha = alpha

		if (radius > 0) {
			this.#roundRect(x, y, w, h, radius)
			if (fill) {
				this.#ctx.fillStyle = fill
				this.#ctx.fill()
			}
			if (stroke) {
				this.#ctx.strokeStyle = stroke
				this.#ctx.lineWidth = strokeWidth
				this.#ctx.stroke()
			}
		} else {
			if (fill) {
				this.#ctx.fillStyle = fill
				this.#ctx.fillRect(x, y, w, h)
			}
			if (stroke) {
				this.#ctx.strokeStyle = stroke
				this.#ctx.lineWidth = strokeWidth
				this.#ctx.strokeRect(x, y, w, h)
			}
		}

		this.#ctx.globalAlpha = prevAlpha
	}

	setLayer(name, drawFn) {
		const existing = this.#layers.find(l => l.name === name)
		if (existing) {
			existing.draw = drawFn
		} else {
			this.#layers.push({ name, draw: drawFn, visible: true })
		}
	}

	removeLayer(name) {
		this.#layers = this.#layers.filter(l => l.name !== name)
	}

	setLayerVisibility(name, visible) {
		const layer = this.#layers.find(l => l.name === name)
		if (layer) layer.visible = visible
	}

	renderLayers() {
		this.clear()
		for (const layer of this.#layers) {
			if (layer.visible && layer.draw) {
				this.#ctx.save()
				layer.draw(this)
				this.#ctx.restore()
			}
		}
	}

	startLoop(onFrame) {
		if (this.#running) return
		this.#running = true

		let lastTime = 0
		const loop = (timestamp) => {
			if (!this.#running) return
			const deltaTime = lastTime ? (timestamp - lastTime) / 1000 : 0
			lastTime = timestamp

			if (onFrame) onFrame(deltaTime)
			this.renderLayers()

			this.#animationId = requestAnimationFrame(loop)
		}

		this.#animationId = requestAnimationFrame(loop)
	}

	stopLoop() {
		this.#running = false
		if (this.#animationId) {
			cancelAnimationFrame(this.#animationId)
			this.#animationId = null
		}
	}

	get isRunning() {
		return this.#running
	}

	#wrapText(text, maxWidth) {
		const words = text.split(' ')
		const lines = []
		let currentLine = ''

		for (const word of words) {
			const testLine = currentLine ? currentLine + ' ' + word : word
			const metrics = this.#ctx.measureText(testLine)
			if (metrics.width > maxWidth && currentLine) {
				lines.push(currentLine)
				currentLine = word
			} else {
				currentLine = testLine
			}
		}

		if (currentLine) lines.push(currentLine)
		return lines
	}

	#roundRect(x, y, w, h, radius) {
		this.#ctx.beginPath()
		this.#ctx.moveTo(x + radius, y)
		this.#ctx.lineTo(x + w - radius, y)
		this.#ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
		this.#ctx.lineTo(x + w, y + h - radius)
		this.#ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
		this.#ctx.lineTo(x + radius, y + h)
		this.#ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
		this.#ctx.lineTo(x, y + radius)
		this.#ctx.quadraticCurveTo(x, y, x + radius, y)
		this.#ctx.closePath()
	}
}
