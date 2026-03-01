import { getCanvasPosition } from '../shared/canvasUtils.js'
import { SettingsScreen } from './settingsScreen.js'
import { ConfirmDialog } from './confirmDialog.js'

export class MenuScreen {
	#runtime = null
	#renderer = null
	#themeManager = null
	#script = null
	#saveManager = null
	#audioEngine = null
	#settingsScreen = null
	#confirmDialog = null

	#visible = false
	#state = 'main' // main | saves | settings | confirmOverwrite
	#selectedSlot = null

	#boundClickHandler = null
	#boundMousedown = null
	#boundMousemove = null
	#boundMouseup = null

	constructor({ runtime, renderer, themeManager, script, saveManager, audioEngine }) {
		this.#runtime = runtime
		this.#renderer = renderer
		this.#themeManager = themeManager
		this.#script = script
		this.#saveManager = saveManager
		this.#audioEngine = audioEngine

		this.#settingsScreen = new SettingsScreen({ renderer, themeManager, audioEngine })
		this.#confirmDialog = new ConfirmDialog({ renderer, themeManager })
	}

	get visible() {
		return this.#visible
	}

	get state() {
		return this.#state
	}

	set state(val) {
		this.#state = val
	}

	get selectedSlot() {
		return this.#selectedSlot
	}

	set selectedSlot(val) {
		this.#selectedSlot = val
	}

	show(state = 'main', selectedSlot = null) {
		this.#visible = true
		this.#state = state
		this.#selectedSlot = selectedSlot
		this.#addListeners()
	}

	hide() {
		this.#visible = false
		this.#state = 'main'
		this.#selectedSlot = null
		this.#settingsScreen.clearDrag()
		this.#removeListeners()
	}

	clearDrag() {
		this.#settingsScreen.clearDrag()
	}

	draw(renderer) {
		renderer.drawRect(0, 0, renderer.width, renderer.height, {
			fill: this.#themeManager.colors.overlay
		})

		if (this.#state === 'main') {
			this.#drawMainMenu(renderer)
		} else if (this.#state === 'saves') {
			this.#drawSavesMenu(renderer)
		} else if (this.#state === 'settings') {
			this.#settingsScreen.draw(renderer)
		} else if (this.#state === 'confirmOverwrite') {
			this.#confirmDialog.draw(renderer)
		}
	}

	#addListeners() {
		this.#boundClickHandler = this.#onClick.bind(this)
		this.#boundMousedown = this.#onMousedown.bind(this)
		this.#boundMousemove = this.#onMousemove.bind(this)
		this.#boundMouseup = this.#onMouseup.bind(this)
		this.#renderer.canvas.addEventListener('click', this.#boundClickHandler)
		this.#renderer.canvas.addEventListener('mousedown', this.#boundMousedown)
		this.#renderer.canvas.addEventListener('mousemove', this.#boundMousemove)
		this.#renderer.canvas.addEventListener('mouseup', this.#boundMouseup)
	}

	removeListeners() {
		this.#removeListeners()
	}

	#removeListeners() {
		if (this.#boundClickHandler) {
			this.#renderer.canvas.removeEventListener('click', this.#boundClickHandler)
			this.#boundClickHandler = null
		}
		if (this.#boundMousedown) {
			this.#renderer.canvas.removeEventListener('mousedown', this.#boundMousedown)
			this.#renderer.canvas.removeEventListener('mousemove', this.#boundMousemove)
			this.#renderer.canvas.removeEventListener('mouseup', this.#boundMouseup)
			this.#boundMousedown = null
			this.#boundMousemove = null
			this.#boundMouseup = null
		}
	}

	#onClick(event) {
		const pos = getCanvasPosition(event, this.#renderer.canvas, this.#renderer.width, this.#renderer.height)

		if (this.#state === 'main') {
			this.#handleMainMenuClick(pos.x, pos.y)
		} else if (this.#state === 'saves') {
			this.#handleSavesMenuClick(pos.x, pos.y)
		} else if (this.#state === 'settings') {
			const result = this.#settingsScreen.handleClick(pos.x, pos.y)
			if (result === 'back') {
				this.#runtime.onMenuBack()
			}
		} else if (this.#state === 'confirmOverwrite') {
			const result = this.#confirmDialog.handleClick(pos.x, pos.y)
			if (result === 'confirm') {
				this.#runtime.saveToSlot(this.#selectedSlot)
				this.#runtime.hideMenu()
			} else if (result === 'cancel') {
				this.#state = 'saves'
				this.#selectedSlot = 'save'
			}
		}
	}

	#onMousedown(event) {
		if (this.#state === 'settings') {
			this.#settingsScreen.onMousedown(event)
		}
	}

	#onMousemove(event) {
		if (this.#state === 'settings') {
			this.#settingsScreen.onMousemove(event)
		}
	}

	#onMouseup() {
		this.#settingsScreen.onMouseup()
	}

	#handleMainMenuClick(x, y) {
		const w = this.#renderer.width
		const centerX = w / 2
		const m = this.#themeManager.menu
		const btnW = m.buttonWidth
		const btnH = m.buttonHeight
		const startY = 260
		const spacing = m.buttonSpacing

		const buttons = ['Resume', 'Save Game', 'Load Game', 'Settings', 'Title Screen']
		for (let i = 0; i < buttons.length; i++) {
			const bx = centerX - btnW / 2
			const by = startY + i * spacing
			if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
				if (i === 0) {
					this.#runtime.hideMenu()
				} else if (i === 1) {
					this.#state = 'saves'
					this.#selectedSlot = 'save'
				} else if (i === 2) {
					this.#state = 'saves'
					this.#selectedSlot = 'load'
				} else if (i === 3) {
					this.#state = 'settings'
				} else if (i === 4) {
					this.#runtime.returnToTitle()
				}
				return
			}
		}
	}

	#handleSavesMenuClick(x, y) {
		const w = this.#renderer.width
		const centerX = w / 2
		const sv = this.#themeManager.saves
		const btnW = sv.slotWidth
		const btnH = sv.slotHeight
		const startY = 200
		const spacing = sv.slotSpacing

		const slots = ['slot1', 'slot2', 'slot3']
		for (let i = 0; i < slots.length; i++) {
			const bx = centerX - btnW / 2
			const by = startY + i * spacing
			if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
				if (this.#selectedSlot === 'save') {
					const existing = this.#saveManager.load(slots[i])
					if (existing) {
						this.#state = 'confirmOverwrite'
						this.#selectedSlot = slots[i]
					} else {
						this.#runtime.saveToSlot(slots[i])
						this.#runtime.hideMenu()
					}
				} else {
					// Load
					this.#runtime.loadFromSlot(slots[i])
				}
				return
			}
		}

		// Back button
		const backY = startY + slots.length * spacing + 20
		const backW = sv.backWidth
		const bx = centerX - backW / 2
		if (x >= bx && x <= bx + backW && y >= backY && y <= backY + sv.backHeight) {
			this.#runtime.onMenuBack()
		}
	}

	#drawMainMenu(renderer) {
		const w = renderer.width
		const centerX = w / 2
		const m = this.#themeManager.menu
		const tm = this.#themeManager

		renderer.drawText(this.#script.meta?.title ?? 'Menu', centerX, 180, {
			font: tm.font(m.titleFont, m.titleSize, true),
			color: tm.color(m.titleColor, 'primary'),
			align: 'center'
		})

		const buttons = ['Resume', 'Save Game', 'Load Game', 'Settings', 'Title Screen']
		const btnW = m.buttonWidth
		const btnH = m.buttonHeight
		const startY = 260
		const spacing = m.buttonSpacing

		for (let i = 0; i < buttons.length; i++) {
			const bx = centerX - btnW / 2
			const by = startY + i * spacing
			renderer.drawRect(bx, by, btnW, btnH, {
				fill: m.buttonFill,
				stroke: m.buttonStroke,
				radius: m.buttonRadius
			})
			renderer.drawText(buttons[i], centerX, by + 14, {
				font: tm.font(m.buttonFont, m.buttonSize),
				color: tm.color(m.buttonColor, 'primary'),
				align: 'center'
			})
		}

		renderer.drawText('Press M to close \u00b7 F for fullscreen', centerX, renderer.height - 50, {
			font: tm.font(null, 14),
			color: tm.color(m.hintColor, 'textHint'),
			align: 'center'
		})
	}

	#drawSavesMenu(renderer) {
		const w = renderer.width
		const centerX = w / 2
		const isSaving = this.#selectedSlot === 'save'
		const sv = this.#themeManager.saves
		const tm = this.#themeManager

		renderer.drawText(isSaving ? 'Save Game' : 'Load Game', centerX, 140, {
			font: tm.font(sv.headerFont, sv.headerSize, true),
			color: tm.color(sv.headerColor, 'primary'),
			align: 'center'
		})

		const slots = ['slot1', 'slot2', 'slot3']
		const btnW = sv.slotWidth
		const btnH = sv.slotHeight
		const startY = 200
		const spacing = sv.slotSpacing

		for (let i = 0; i < slots.length; i++) {
			const save = this.#saveManager.load(slots[i])
			const bx = centerX - btnW / 2
			const by = startY + i * spacing

			renderer.drawRect(bx, by, btnW, btnH, {
				fill: save ? sv.slotOccupiedFill : sv.slotFill,
				stroke: save ? sv.slotOccupiedStroke : sv.slotStroke,
				radius: sv.slotRadius
			})

			if (save) {
				const date = new Date(save.timestamp)
				const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
				renderer.drawText(`Slot ${i + 1}: ${save.currentSceneId}`, bx + 16, by + 10, {
					font: tm.font(sv.slotFont, sv.slotSize),
					color: tm.color(null, 'primary')
				})
				renderer.drawText(dateStr, bx + 16, by + 30, {
					font: tm.font(null, sv.slotDateSize),
					color: tm.color(null, 'textSecondary')
				})
			} else {
				renderer.drawText(`Slot ${i + 1}: Empty`, bx + 16, by + 16, {
					font: tm.font(sv.slotFont, sv.slotSize),
					color: tm.color(sv.slotEmptyColor, 'textDisabled')
				})
			}
		}

		// Back button
		const backY = startY + slots.length * spacing + 20
		const backW = sv.backWidth
		renderer.drawRect(centerX - backW / 2, backY, backW, sv.backHeight, {
			fill: this.#themeManager.menu.buttonFill,
			stroke: this.#themeManager.menu.buttonStroke,
			radius: this.#themeManager.menu.buttonRadius
		})
		renderer.drawText('Back', centerX, backY + 14, {
			font: tm.font(sv.backFont, sv.backSize),
			color: tm.color(null, 'primary'),
			align: 'center'
		})
	}
}
