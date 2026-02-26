import { Renderer } from './renderer.js'

export class DialogueBox {
	#renderer = null
	#theme = null
	#state = 'idle' // idle | typing | waiting | choices
	#currentSpeaker = null
	#currentText = ''
	#revealedChars = 0
	#visibleCharCount = 0
	#typewriterSpeed = 30 // chars per second
	#elapsed = 0
	#choices = []
	#hoveredChoice = -1
	#resolveChoice = null
	#resolveAdvance = null
	#autoAdvance = false
	#boundClick = null
	#boundKeydown = null
	#boundMousemove = null

	// When true, input events are ignored (menu is open, game is paused)
	paused = false

	constructor(renderer, theme = null) {
		this.#renderer = renderer
		this.#theme = theme
		this.#typewriterSpeed = this.#d.typewriterSpeed

		this.#boundClick = this.#onClick.bind(this)
		this.#boundKeydown = this.#onKeydown.bind(this)
		this.#boundMousemove = this.#onMousemove.bind(this)

		this.#renderer.canvas.addEventListener('click', this.#boundClick)
		this.#renderer.canvas.addEventListener('mousemove', this.#boundMousemove)
		document.addEventListener('keydown', this.#boundKeydown)
	}

	/**
	 * Shorthand for dialogue theme section with resolved fallbacks.
	 */
	get #d() {
		if (!this.#theme) {
			// Fallback to hardcoded defaults when no theme is provided
			return {
				boxHeight: 180,
				boxMargin: 20,
				boxPadding: 20,
				boxColor: 'rgba(0, 0, 0, 0.75)',
				boxRadius: 12,
				speakerFont: 'bold 22px sans-serif',
				speakerColor: '#ffcc00',
				textFont: '20px sans-serif',
				textColor: '#ffffff',
				textLineHeight: 28,
				choiceFont: '20px sans-serif',
				choiceColor: '#ffffff',
				choiceHoverColor: '#ffcc00',
				choiceBgColor: 'rgba(255, 255, 255, 0.1)',
				choiceHoverBgColor: 'rgba(255, 204, 0, 0.2)',
				choiceStrokeColor: 'rgba(255, 255, 255, 0.3)',
				choiceRadius: 8,
				choicePadding: 12,
				choiceSpacing: 8,
				choiceWidth: 400,
				choiceHeight: 44,
				advanceIndicator: true,
				typewriterSpeed: 30
			}
		}

		const d = this.#theme.dialogue
		const t = this.#theme
		return {
			boxHeight: d.boxHeight,
			boxMargin: d.boxMargin,
			boxPadding: d.boxPadding,
			boxColor: d.boxColor,
			boxRadius: d.boxRadius,
			speakerFont: t.font(d.speakerFont, d.speakerSize, true),
			speakerColor: t.color(d.speakerColor, 'accent'),
			textFont: t.font(d.textFont, d.textSize),
			textColor: t.color(d.textColor, 'primary'),
			textLineHeight: d.textLineHeight,
			choiceFont: t.font(d.choiceFont, d.choiceSize),
			choiceColor: t.color(d.choiceColor, 'primary'),
			choiceHoverColor: t.color(d.choiceHoverColor, 'accent'),
			choiceBgColor: d.choiceBgColor,
			choiceHoverBgColor: d.choiceHoverBgColor,
			choiceStrokeColor: d.choiceStrokeColor,
			choiceRadius: d.choiceRadius,
			choicePadding: d.choicePadding,
			choiceSpacing: d.choiceSpacing,
			choiceWidth: d.choiceWidth,
			choiceHeight: d.choiceHeight,
			advanceIndicator: d.advanceIndicator,
			typewriterSpeed: d.typewriterSpeed
		}
	}

	get state() {
		return this.#state
	}

	update(deltaTime) {
		if (this.#state === 'typing') {
			this.#elapsed += deltaTime
			const charsToReveal = Math.floor(this.#elapsed * this.#typewriterSpeed)
			if (charsToReveal >= this.#visibleCharCount) {
				this.#revealedChars = this.#visibleCharCount
				if (this.#autoAdvance) {
					// Auto-advance: resolve immediately without waiting for click
					this.#state = 'idle'
					if (this.#resolveAdvance) {
						const resolve = this.#resolveAdvance
						this.#resolveAdvance = null
						resolve()
					}
				} else {
					this.#state = 'waiting'
				}
			} else {
				this.#revealedChars = charsToReveal
			}
		}
	}

	draw(renderer) {
		if (this.#state === 'idle') return

		const w = renderer.width
		const h = renderer.height
		const d = this.#d

		const boxX = d.boxMargin
		const boxY = h - d.boxHeight - d.boxMargin
		const boxW = w - d.boxMargin * 2

		// Draw box background
		renderer.drawRect(boxX, boxY, boxW, d.boxHeight, {
			fill: d.boxColor,
			radius: d.boxRadius
		})

		const textX = boxX + d.boxPadding
		let textY = boxY + d.boxPadding

		// Draw speaker name
		if (this.#currentSpeaker) {
			renderer.drawText(this.#currentSpeaker, textX, textY, {
				font: d.speakerFont,
				color: d.speakerColor
			})
			textY += 30
		}

		// Draw revealed text (with markup support)
		if (this.#state === 'choices') {
			// Show full text above choices
			renderer.drawRichText(this.#currentText, textX, textY, {
				font: d.textFont,
				color: d.textColor,
				maxWidth: boxW - d.boxPadding * 2,
				lineHeight: d.textLineHeight
			})
		} else {
			renderer.drawRichText(this.#currentText, textX, textY, {
				font: d.textFont,
				color: d.textColor,
				maxWidth: boxW - d.boxPadding * 2,
				lineHeight: d.textLineHeight
			}, this.#revealedChars)
		}

		// Draw advance indicator
		if (this.#state === 'waiting' && d.advanceIndicator) {
			const indicatorX = boxX + boxW - d.boxPadding - 10
			const indicatorY = boxY + d.boxHeight - d.boxPadding - 5
			const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7
			const indicatorColor = d.textColor
			// Extract RGB from the text color for pulsing alpha
			renderer.drawText('\u25BC', indicatorX, indicatorY, {
				font: this.#theme ? this.#theme.font(null, 16) : '16px sans-serif',
				color: `rgba(255, 255, 255, ${pulse})`,
				align: 'center'
			})
		}

		// Draw choices
		if (this.#state === 'choices') {
			this.#drawChoices(renderer)
		}
	}

	showDialogue(speaker, text, options = {}) {
		this.#currentSpeaker = speaker
		this.#currentText = text
		this.#visibleCharCount = Renderer.countVisibleChars(text)
		this.#revealedChars = 0
		this.#elapsed = 0
		this.#autoAdvance = options.autoAdvance ?? false
		this.#state = 'typing'

		return new Promise(resolve => {
			this.#resolveAdvance = resolve
		})
	}

	showChoices(choices) {
		this.#choices = choices
		this.#hoveredChoice = -1
		this.#state = 'choices'

		return new Promise(resolve => {
			this.#resolveChoice = resolve
		})
	}

	hide() {
		this.#state = 'idle'
		this.#currentSpeaker = null
		this.#currentText = ''
		this.#visibleCharCount = 0
		this.#revealedChars = 0
		this.#choices = []
		this.#hoveredChoice = -1
	}

	dispose() {
		this.#renderer.canvas.removeEventListener('click', this.#boundClick)
		this.#renderer.canvas.removeEventListener('mousemove', this.#boundMousemove)
		document.removeEventListener('keydown', this.#boundKeydown)
	}

	#drawChoices(renderer) {
		const w = renderer.width
		const h = renderer.height
		const d = this.#d

		const startX = (w - d.choiceWidth) / 2
		const totalH = this.#choices.length * (d.choiceHeight + d.choiceSpacing) - d.choiceSpacing
		const startY = (h - totalH) / 2

		for (let i = 0; i < this.#choices.length; i++) {
			const y = startY + i * (d.choiceHeight + d.choiceSpacing)
			const isHovered = i === this.#hoveredChoice

			renderer.drawRect(startX, y, d.choiceWidth, d.choiceHeight, {
				fill: isHovered ? d.choiceHoverBgColor : d.choiceBgColor,
				stroke: isHovered ? d.choiceHoverColor : d.choiceStrokeColor,
				strokeWidth: 1,
				radius: d.choiceRadius
			})

			renderer.drawText(this.#choices[i].text, startX + d.choicePadding, y + d.choicePadding, {
				font: d.choiceFont,
				color: isHovered ? d.choiceHoverColor : d.choiceColor
			})
		}
	}

	#getChoiceAtPosition(x, y) {
		const w = this.#renderer.width
		const h = this.#renderer.height
		const d = this.#d

		const startX = (w - d.choiceWidth) / 2
		const totalH = this.#choices.length * (d.choiceHeight + d.choiceSpacing) - d.choiceSpacing
		const startY = (h - totalH) / 2

		for (let i = 0; i < this.#choices.length; i++) {
			const cy = startY + i * (d.choiceHeight + d.choiceSpacing)
			if (x >= startX && x <= startX + d.choiceWidth && y >= cy && y <= cy + d.choiceHeight) {
				return i
			}
		}

		return -1
	}

	#getCanvasPosition(event) {
		const rect = this.#renderer.canvas.getBoundingClientRect()
		const scaleX = this.#renderer.width / rect.width
		const scaleY = this.#renderer.height / rect.height
		return {
			x: (event.clientX - rect.left) * scaleX,
			y: (event.clientY - rect.top) * scaleY
		}
	}

	#onClick(event) {
		if (this.paused) return

		if (this.#state === 'typing') {
			// Skip typewriter, reveal full text
			this.#revealedChars = this.#visibleCharCount
			this.#state = 'waiting'
			return
		}

		if (this.#state === 'waiting') {
			this.#state = 'idle'
			if (this.#resolveAdvance) {
				const resolve = this.#resolveAdvance
				this.#resolveAdvance = null
				resolve()
			}
			return
		}

		if (this.#state === 'choices') {
			const pos = this.#getCanvasPosition(event)
			const idx = this.#getChoiceAtPosition(pos.x, pos.y)
			if (idx >= 0) {
				const choice = this.#choices[idx]
				this.#state = 'idle'
				this.#choices = []
				if (this.#resolveChoice) {
					const resolve = this.#resolveChoice
					this.#resolveChoice = null
					resolve(choice)
				}
			}
		}
	}

	#onKeydown(event) {
		if (this.paused) return

		if (event.key === ' ' || event.key === 'Enter') {
			if (this.#state === 'typing') {
				this.#revealedChars = this.#visibleCharCount
				this.#state = 'waiting'
				event.preventDefault()
				return
			}

			if (this.#state === 'waiting') {
				this.#state = 'idle'
				if (this.#resolveAdvance) {
					const resolve = this.#resolveAdvance
					this.#resolveAdvance = null
					resolve()
				}
				event.preventDefault()
			}
		}
	}

	#onMousemove(event) {
		if (this.#state !== 'choices') {
			this.#hoveredChoice = -1
			return
		}

		const pos = this.#getCanvasPosition(event)
		this.#hoveredChoice = this.#getChoiceAtPosition(pos.x, pos.y)

		// Update cursor style
		this.#renderer.canvas.style.cursor = this.#hoveredChoice >= 0 ? 'pointer' : 'default'
	}
}
