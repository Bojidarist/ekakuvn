import { getCanvasPosition } from '../shared/canvasUtils.js'

export class TitleScreen {
	#runtime = null
	#renderer = null
	#themeManager = null
	#script = null
	#assetLoader = null
	#saveManager = null
	#audioEngine = null

	#titleHovered = -1
	#titleButtons = []
	#boundClickHandler = null
	#boundMoveHandler = null

	constructor({ runtime, renderer, themeManager, script, assetLoader, saveManager, audioEngine }) {
		this.#runtime = runtime
		this.#renderer = renderer
		this.#themeManager = themeManager
		this.#script = script
		this.#assetLoader = assetLoader
		this.#saveManager = saveManager
		this.#audioEngine = audioEngine
	}

	show() {
		this.#titleHovered = -1

		// Build button list
		this.#titleButtons = ['New Game']
		if (this.#saveManager.hasAutoSave() || this.#saveManager.listSaves().length > 0) {
			this.#titleButtons.push('Load Game')
		}
		this.#titleButtons.push('Settings')

		// Set background to title screen
		const menuConfig = this.#script.meta?.mainMenu
		const bgColor = this.#themeManager.colors.background
		this.#renderer.setLayer('background', (renderer) => {
			if (menuConfig?.background) {
				const bgAsset = this.#assetLoader.getAsset(menuConfig.background)
				if (bgAsset && bgAsset.resource) {
					renderer.drawImage(bgAsset.resource, 0, 0, renderer.width, renderer.height)
					return
				}
			}
			renderer.drawRect(0, 0, renderer.width, renderer.height, { fill: bgColor })
		})
		this.#renderer.setLayer('characters', () => {})

		// Set up title screen input
		this.#boundClickHandler = this.#onClick.bind(this)
		this.#boundMoveHandler = this.#onMove.bind(this)
		this.#renderer.canvas.addEventListener('click', this.#boundClickHandler)
		this.#renderer.canvas.addEventListener('mousemove', this.#boundMoveHandler)
	}

	removeListeners() {
		if (this.#boundClickHandler) {
			this.#renderer.canvas.removeEventListener('click', this.#boundClickHandler)
			this.#boundClickHandler = null
		}
		if (this.#boundMoveHandler) {
			this.#renderer.canvas.removeEventListener('mousemove', this.#boundMoveHandler)
			this.#boundMoveHandler = null
		}
		this.#renderer.canvas.style.cursor = 'default'
	}

	draw(renderer) {
		const w = renderer.width
		const h = renderer.height
		const centerX = w / 2
		const menuConfig = this.#script.meta?.mainMenu
		const ts = this.#themeManager.titleScreen
		const tm = this.#themeManager

		// Dim overlay for readability
		renderer.drawRect(0, 0, w, h, { fill: tm.colors.dimOverlay })

		// Title
		const title = menuConfig?.title ?? this.#script.meta?.title ?? 'ekakuvn'
		renderer.drawText(title, centerX, h * 0.28, {
			font: tm.font(ts.titleFont, ts.titleSize, true),
			color: tm.color(ts.titleColor, 'primary'),
			align: 'center',
			shadow: ts.titleShadow
		})

		// Subtitle / author
		const author = this.#script.meta?.author
		if (author) {
			renderer.drawText('by ' + author, centerX, h * 0.28 + 56, {
				font: tm.font(ts.subtitleFont, ts.subtitleSize),
				color: tm.color(ts.subtitleColor, 'textSecondary'),
				align: 'center'
			})
		}

		// Buttons
		const { btnW, btnH, spacing, startY } = this.#getButtonLayout()

		for (let i = 0; i < this.#titleButtons.length; i++) {
			const bx = centerX - btnW / 2
			const by = startY + i * (btnH + spacing)
			const hovered = i === this.#titleHovered

			renderer.drawRect(bx, by, btnW, btnH, {
				fill: hovered ? ts.buttonHoverFill : ts.buttonFill,
				stroke: hovered ? ts.buttonHoverStroke : ts.buttonStroke,
				radius: ts.buttonRadius
			})
			renderer.drawText(this.#titleButtons[i], centerX, by + 16, {
				font: tm.font(ts.buttonFont, ts.buttonSize, hovered),
				color: hovered ? tm.color(ts.buttonHoverColor, 'accent') : tm.color(ts.buttonColor, 'primary'),
				align: 'center'
			})
		}

		// Version
		const version = this.#script.meta?.version
		if (version) {
			renderer.drawText('v' + version, w - 16, h - 16, {
				font: tm.font(null, 12),
				color: tm.color(ts.versionColor, 'textMuted'),
				align: 'right'
			})
		}
	}

	#getButtonLayout() {
		const w = this.#renderer.width
		const h = this.#renderer.height
		const centerX = w / 2
		const ts = this.#themeManager.titleScreen
		const btnW = ts.buttonWidth
		const btnH = ts.buttonHeight
		const spacing = ts.buttonSpacing
		const totalH = this.#titleButtons.length * btnH + (this.#titleButtons.length - 1) * spacing
		const startY = h / 2 + 20

		return { centerX, btnW, btnH, spacing, startY, totalH }
	}

	#getButtonIndex(x, y) {
		const { centerX, btnW, btnH, spacing, startY } = this.#getButtonLayout()

		for (let i = 0; i < this.#titleButtons.length; i++) {
			const bx = centerX - btnW / 2
			const by = startY + i * (btnH + spacing)
			if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
				return i
			}
		}
		return -1
	}

	#onClick(event) {
		const pos = getCanvasPosition(event, this.#renderer.canvas, this.#renderer.width, this.#renderer.height)
		const idx = this.#getButtonIndex(pos.x, pos.y)
		if (idx < 0) return

		const label = this.#titleButtons[idx]

		// This click is a user gesture -- safe to create AudioContext now
		this.#audioEngine.ensureResumed()

		if (label === 'New Game') {
			this.removeListeners()
			this.#runtime.startNewGame()
		} else if (label === 'Load Game') {
			this.removeListeners()
			this.#runtime.openTitleSubMenu('saves', 'load')
		} else if (label === 'Settings') {
			this.removeListeners()
			this.#runtime.openTitleSubMenu('settings')
		}
	}

	#onMove(event) {
		const pos = getCanvasPosition(event, this.#renderer.canvas, this.#renderer.width, this.#renderer.height)
		this.#titleHovered = this.#getButtonIndex(pos.x, pos.y)
		this.#renderer.canvas.style.cursor = this.#titleHovered >= 0 ? 'pointer' : 'default'
	}
}
