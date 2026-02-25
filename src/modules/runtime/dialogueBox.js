import { Renderer } from './renderer.js'

export class DialogueBox {
	#renderer = null
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
	#boundClick = null
	#boundKeydown = null
	#boundMousemove = null

	options = {
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
		choiceRadius: 8,
		choicePadding: 12,
		choiceSpacing: 8,
		advanceIndicator: true,
		typewriterSpeed: 30
	}

	constructor(renderer, options = {}) {
		this.#renderer = renderer
		Object.assign(this.options, options)
		this.#typewriterSpeed = this.options.typewriterSpeed

		this.#boundClick = this.#onClick.bind(this)
		this.#boundKeydown = this.#onKeydown.bind(this)
		this.#boundMousemove = this.#onMousemove.bind(this)

		this.#renderer.canvas.addEventListener('click', this.#boundClick)
		this.#renderer.canvas.addEventListener('mousemove', this.#boundMousemove)
		document.addEventListener('keydown', this.#boundKeydown)
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
				this.#state = 'waiting'
			} else {
				this.#revealedChars = charsToReveal
			}
		}
	}

	draw(renderer) {
		if (this.#state === 'idle') return

		const w = renderer.width
		const h = renderer.height
		const { boxHeight, boxMargin, boxPadding, boxColor, boxRadius } = this.options

		const boxX = boxMargin
		const boxY = h - boxHeight - boxMargin
		const boxW = w - boxMargin * 2

		// Draw box background
		renderer.drawRect(boxX, boxY, boxW, boxHeight, {
			fill: boxColor,
			radius: boxRadius
		})

		const textX = boxX + boxPadding
		let textY = boxY + boxPadding

		// Draw speaker name
		if (this.#currentSpeaker) {
			renderer.drawText(this.#currentSpeaker, textX, textY, {
				font: this.options.speakerFont,
				color: this.options.speakerColor
			})
			textY += 30
		}

		// Draw revealed text (with markup support)
		if (this.#state === 'choices') {
			// Show full text above choices
			renderer.drawRichText(this.#currentText, textX, textY, {
				font: this.options.textFont,
				color: this.options.textColor,
				maxWidth: boxW - boxPadding * 2,
				lineHeight: this.options.textLineHeight
			})
		} else {
			renderer.drawRichText(this.#currentText, textX, textY, {
				font: this.options.textFont,
				color: this.options.textColor,
				maxWidth: boxW - boxPadding * 2,
				lineHeight: this.options.textLineHeight
			}, this.#revealedChars)
		}

		// Draw advance indicator
		if (this.#state === 'waiting' && this.options.advanceIndicator) {
			const indicatorX = boxX + boxW - boxPadding - 10
			const indicatorY = boxY + boxHeight - boxPadding - 5
			const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7
			renderer.drawText('\u25BC', indicatorX, indicatorY, {
				font: '16px sans-serif',
				color: `rgba(255, 255, 255, ${pulse})`,
				align: 'center'
			})
		}

		// Draw choices
		if (this.#state === 'choices') {
			this.#drawChoices(renderer)
		}
	}

	showDialogue(speaker, text) {
		this.#currentSpeaker = speaker
		this.#currentText = text
		this.#visibleCharCount = Renderer.countVisibleChars(text)
		this.#revealedChars = 0
		this.#elapsed = 0
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
		const { choicePadding, choiceSpacing, choiceRadius } = this.options

		const choiceW = 400
		const choiceH = 44
		const startX = (w - choiceW) / 2
		const totalH = this.#choices.length * (choiceH + choiceSpacing) - choiceSpacing
		const startY = (h - totalH) / 2

		for (let i = 0; i < this.#choices.length; i++) {
			const y = startY + i * (choiceH + choiceSpacing)
			const isHovered = i === this.#hoveredChoice

			renderer.drawRect(startX, y, choiceW, choiceH, {
				fill: isHovered ? this.options.choiceHoverBgColor : this.options.choiceBgColor,
				stroke: isHovered ? this.options.choiceHoverColor : 'rgba(255,255,255,0.3)',
				strokeWidth: 1,
				radius: choiceRadius
			})

			renderer.drawText(this.#choices[i].text, startX + choicePadding, y + choicePadding, {
				font: this.options.choiceFont,
				color: isHovered ? this.options.choiceHoverColor : this.options.choiceColor
			})
		}
	}

	#getChoiceAtPosition(x, y) {
		const w = this.#renderer.width
		const h = this.#renderer.height
		const { choiceSpacing } = this.options

		const choiceW = 400
		const choiceH = 44
		const startX = (w - choiceW) / 2
		const totalH = this.#choices.length * (choiceH + choiceSpacing) - choiceSpacing
		const startY = (h - totalH) / 2

		for (let i = 0; i < this.#choices.length; i++) {
			const cy = startY + i * (choiceH + choiceSpacing)
			if (x >= startX && x <= startX + choiceW && y >= cy && y <= cy + choiceH) {
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
