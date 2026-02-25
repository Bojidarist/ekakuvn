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

	/**
	 * Draw styled text with markup support.
	 * Markup: *bold*, _italic_, {#hexcolor}colored text{/}
	 * Segments are rendered inline with word wrapping.
	 *
	 * @param {string} text - Raw text with markup
	 * @param {number} x - Start X position
	 * @param {number} y - Start Y position
	 * @param {object} options - Drawing options
	 * @param {number} [charLimit] - If set, only render this many visible characters (for typewriter)
	 */
	drawRichText(text, x, y, options = {}, charLimit = null) {
		const {
			font = '24px sans-serif',
			color = '#ffffff',
			baseline = 'top',
			maxWidth = undefined,
			lineHeight = 30
		} = options

		this.#ctx.textBaseline = baseline

		// Parse the markup text into styled segments
		const segments = Renderer.parseMarkup(text)

		// Build font variants from the base font
		const fontParts = Renderer.#parseFontString(font)

		// If no maxWidth and no charLimit, simple inline render
		if (!maxWidth && charLimit === null) {
			let cursorX = x
			for (const seg of segments) {
				const segFont = Renderer.#buildFont(fontParts, seg.bold, seg.italic)
				this.#ctx.font = segFont
				this.#ctx.fillStyle = seg.color ?? color
				this.#ctx.fillText(seg.text, cursorX, y)
				cursorX += this.#ctx.measureText(seg.text).width
			}
			return
		}

		// Word-level wrapping with styled segments
		// Flatten segments into word-tokens, each carrying style
		const tokens = Renderer.#tokenize(segments)

		// Apply charLimit: count visible characters across all tokens
		let charsRemaining = charLimit ?? Infinity
		const visibleTokens = []
		for (const token of tokens) {
			if (charsRemaining <= 0) break
			if (token.text.length <= charsRemaining) {
				visibleTokens.push(token)
				charsRemaining -= token.text.length
			} else {
				visibleTokens.push({
					...token,
					text: token.text.slice(0, charsRemaining)
				})
				charsRemaining = 0
			}
		}

		// Layout into lines
		const effectiveMaxWidth = maxWidth ?? Infinity
		const lines = []
		let currentLine = []
		let currentLineWidth = 0

		for (const token of visibleTokens) {
			const segFont = Renderer.#buildFont(fontParts, token.bold, token.italic)
			this.#ctx.font = segFont
			const tokenWidth = this.#ctx.measureText(token.text).width

			// If it's a newline token
			if (token.text === '\n') {
				lines.push(currentLine)
				currentLine = []
				currentLineWidth = 0
				continue
			}

			// Check if adding this token exceeds maxWidth
			if (currentLineWidth + tokenWidth > effectiveMaxWidth && currentLine.length > 0) {
				lines.push(currentLine)
				currentLine = []
				currentLineWidth = 0
				// Skip leading space on new line
				if (token.isSpace) continue
			}

			currentLine.push({ ...token, width: tokenWidth, font: segFont })
			currentLineWidth += tokenWidth
		}
		if (currentLine.length > 0) lines.push(currentLine)

		// Render lines
		for (let i = 0; i < lines.length; i++) {
			let cursorX = x
			for (const tok of lines[i]) {
				this.#ctx.font = tok.font
				this.#ctx.fillStyle = tok.color ?? color
				this.#ctx.fillText(tok.text, cursorX, y + i * lineHeight)
				cursorX += tok.width
			}
		}
	}

	/**
	 * Parse markup text into styled segments.
	 * Markup: *bold*, _italic_, {#hexcolor}text{/}
	 * @param {string} text
	 * @returns {Array<{text: string, bold: boolean, italic: boolean, color: string|null}>}
	 */
	static parseMarkup(text) {
		const segments = []
		let bold = false
		let italic = false
		let color = null
		let buffer = ''
		let i = 0

		const flush = () => {
			if (buffer.length > 0) {
				segments.push({ text: buffer, bold, italic, color })
				buffer = ''
			}
		}

		while (i < text.length) {
			const ch = text[i]

			// Color markup: {#hexcolor}
			if (ch === '{' && text[i + 1] === '#') {
				const end = text.indexOf('}', i + 2)
				if (end > i + 2) {
					flush()
					color = text.slice(i + 1, end) // e.g. "#ff0000"
					i = end + 1
					continue
				}
			}

			// End color: {/}
			if (ch === '{' && text[i + 1] === '/' && text[i + 2] === '}') {
				flush()
				color = null
				i += 3
				continue
			}

			// Bold: *text*
			if (ch === '*') {
				// Check this isn't an escaped or empty sequence
				if (i + 1 < text.length && text[i + 1] !== ' ' && text[i + 1] !== '*') {
					flush()
					bold = !bold
					i++
					continue
				}
				// If at end of bold span
				if (bold) {
					flush()
					bold = false
					i++
					continue
				}
			}

			// Italic: _text_
			if (ch === '_') {
				if (i + 1 < text.length && text[i + 1] !== ' ' && text[i + 1] !== '_') {
					flush()
					italic = !italic
					i++
					continue
				}
				if (italic) {
					flush()
					italic = false
					i++
					continue
				}
			}

			buffer += ch
			i++
		}

		flush()
		return segments
	}

	/**
	 * Count the number of visible (non-markup) characters in a marked-up string.
	 * @param {string} text
	 * @returns {number}
	 */
	static countVisibleChars(text) {
		const segments = Renderer.parseMarkup(text)
		let count = 0
		for (const seg of segments) {
			count += seg.text.length
		}
		return count
	}

	/**
	 * Parse a CSS font string into its parts.
	 * @param {string} font - e.g. "bold 20px sans-serif" or "20px sans-serif"
	 * @returns {{ size: string, family: string }}
	 */
	static #parseFontString(font) {
		// Extract size and family, ignoring weight/style
		const match = font.match(/(\d+(?:\.\d+)?px)\s+(.+)/)
		if (match) {
			return { size: match[1], family: match[2] }
		}
		return { size: '20px', family: 'sans-serif' }
	}

	/**
	 * Build a CSS font string with optional bold/italic.
	 */
	static #buildFont(parts, bold, italic) {
		let prefix = ''
		if (italic) prefix += 'italic '
		if (bold) prefix += 'bold '
		return `${prefix}${parts.size} ${parts.family}`
	}

	/**
	 * Tokenize styled segments into word-level tokens for wrapping.
	 */
	static #tokenize(segments) {
		const tokens = []
		for (const seg of segments) {
			// Split on spaces, keeping spaces as separate tokens
			const parts = seg.text.split(/( |\n)/g)
			for (const part of parts) {
				if (part.length === 0) continue
				tokens.push({
					text: part,
					bold: seg.bold,
					italic: seg.italic,
					color: seg.color,
					isSpace: part === ' '
				})
			}
		}
		return tokens
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
