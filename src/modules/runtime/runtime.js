import { Renderer } from './renderer.js'
import { AssetLoader } from './assetLoader.js'
import { AudioEngine } from './audioEngine.js'
import { DialogueBox } from './dialogueBox.js'
import { SceneController } from './sceneController.js'
import { SaveManager } from './saveManager.js'
import { TransitionManager } from './transitionManager.js'
import { ThemeManager } from './themeManager.js'

export class EkakuRuntime {
	#renderer = null
	#assetLoader = null
	#audioEngine = null
	#dialogueBox = null
	#sceneController = null
	#saveManager = null
	#transitionManager = null
	#themeManager = null
	#script = null
	#paused = false
	#started = false

	// Title screen state
	#phase = 'loading' // loading | title | playing
	#titleHovered = -1
	#titleButtons = []

	// In-game menu state
	#menuVisible = false
	#menuState = 'main' // main | saves | settings | confirmOverwrite
	#menuSelectedSlot = null

	// Slider drag state
	#draggingSlider = null // { index, volumeEntry } when dragging a settings slider
	#boundMenuMousedown = null
	#boundMenuMousemove = null
	#boundMenuMouseup = null

	// Event handlers
	#boundEscapeHandler = null
	#boundVisibilityHandler = null
	#boundBeforeUnloadHandler = null
	#boundFullscreenHandler = null
	#boundTitleClickHandler = null
	#boundTitleMoveHandler = null

	// Event callbacks
	onSceneChange = null
	onEnd = null
	onSave = null
	onLoad = null

	constructor(targetOrSelector, script) {
		if (!script) throw new Error('EkakuRuntime: script is required')

		this.#script = script
		const resolution = script.meta?.resolution ?? { width: 1280, height: 720 }

		// Create ThemeManager from script meta
		this.#themeManager = new ThemeManager(script.meta?.theme ?? null)

		// Create or find canvas
		if (typeof targetOrSelector === 'string') {
			this.#renderer = new Renderer(targetOrSelector, resolution.width, resolution.height)
		} else if (targetOrSelector instanceof HTMLCanvasElement) {
			this.#renderer = new Renderer(targetOrSelector, resolution.width, resolution.height)
		} else {
			const container = document.createElement('div')
			container.id = 'ekakuvn-runtime'
			document.body.appendChild(container)
			this.#renderer = new Renderer(container, resolution.width, resolution.height)
		}

		// AudioEngine is created but AudioContext is deferred until user gesture
		this.#audioEngine = new AudioEngine()
		this.#dialogueBox = new DialogueBox(this.#renderer, this.#themeManager)

		this.#assetLoader = new AssetLoader((progress) => {
			this.#drawLoadingScreen(progress)
		})

		this.#transitionManager = new TransitionManager(this.#renderer)

		this.#sceneController = new SceneController({
			renderer: this.#renderer,
			assetLoader: this.#assetLoader,
			audioEngine: this.#audioEngine,
			dialogueBox: this.#dialogueBox,
			transitionManager: this.#transitionManager,
			themeManager: this.#themeManager
		})

		// Compute script hash for save manager
		const hash = SaveManager.computeHash(script)
		this.#saveManager = new SaveManager(hash)

		// Set up render layers
		this.#renderer.setLayer('background', () => {})
		this.#renderer.setLayer('characters', () => {})
		this.#renderer.setLayer('dialogue', (renderer) => {
			if (this.#phase === 'playing') {
				this.#dialogueBox.draw(renderer)
			}
		})
		this.#renderer.setLayer('transition', (renderer) => {
			this.#transitionManager.draw(renderer)
		})
		this.#renderer.setLayer('overlay', (renderer) => {
			if (this.#menuVisible) {
				this.#drawMenu(renderer)
			} else if (this.#phase === 'title') {
				this.#drawTitleScreen(renderer)
			}
		})

		// Wire scene events
		this.#sceneController.onSceneChange = (sceneId) => {
			this.#autoSave()
			if (this.onSceneChange) this.onSceneChange(sceneId)
		}

		this.#sceneController.onEnd = () => {
			this.#showTitleScreen()
			if (this.onEnd) this.onEnd()
		}

		// Keyboard handler for menu
		this.#boundEscapeHandler = this.#onEscape.bind(this)
		document.addEventListener('keydown', this.#boundEscapeHandler)

		// Auto-save on visibility change and beforeunload
		this.#boundVisibilityHandler = () => {
			if (document.hidden && this.#started && !this.#paused) {
				this.#autoSave()
			}
		}
		document.addEventListener('visibilitychange', this.#boundVisibilityHandler)

		this.#boundBeforeUnloadHandler = () => {
			if (this.#started) this.#autoSave()
		}
		window.addEventListener('beforeunload', this.#boundBeforeUnloadHandler)

		// Fullscreen change: update canvas scaling
		this.#boundFullscreenHandler = this.#onFullscreenChange.bind(this)
		document.addEventListener('fullscreenchange', this.#boundFullscreenHandler)
	}

	async start() {
		// Load the script into the scene controller
		this.#sceneController.loadScript(this.#script)

		// Load assets (loading screen is drawn via progress callback)
		await this.#assetLoader.loadManifest(this.#script.assets)

		// Start render loop
		this.#renderer.startLoop((dt) => {
			if (!this.#paused && this.#phase === 'playing') {
				this.#dialogueBox.update(dt)
				this.#sceneController.update(dt)
			}
			this.#transitionManager.update(dt)
		})

		// Show title screen (AudioContext will be created on first user click)
		this.#showTitleScreen()
	}

	pause() {
		this.#paused = true
		this.#autoSave()
	}

	resume() {
		this.#paused = false
	}

	save(slotName) {
		const state = this.#sceneController.getState()
		const success = this.#saveManager.save(slotName, state)
		if (success && this.onSave) {
			this.onSave(slotName)
		}
		return success
	}

	async load(slotName) {
		const saveData = this.#saveManager.load(slotName)
		if (!saveData) return false

		await this.#sceneController.restoreState(saveData)

		if (this.onLoad) {
			this.onLoad(slotName)
		}

		return true
	}

	listSaves() {
		return this.#saveManager.listSaves()
	}

	deleteSave(slotName) {
		this.#saveManager.deleteSave(slotName)
	}

	dispose() {
		this.#renderer.stopLoop()
		this.#dialogueBox.dispose()
		this.#audioEngine.dispose()
		this.#removeTitleListeners()
		this.#removeMenuListeners()
		document.removeEventListener('keydown', this.#boundEscapeHandler)
		document.removeEventListener('visibilitychange', this.#boundVisibilityHandler)
		document.removeEventListener('fullscreenchange', this.#boundFullscreenHandler)
		window.removeEventListener('beforeunload', this.#boundBeforeUnloadHandler)
	}

	#autoSave() {
		if (!this.#started || !this.#sceneController.currentSceneId) return
		this.save('auto')
	}

	// ===== Title Screen =====

	#showTitleScreen() {
		this.#phase = 'title'
		this.#started = false
		this.#paused = true
		this.#dialogueBox.paused = true
		this.#menuVisible = false
		this.#titleHovered = -1

		// Stop any playing scene
		this.#sceneController.stop()

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
		this.#boundTitleClickHandler = this.#onTitleClick.bind(this)
		this.#boundTitleMoveHandler = this.#onTitleMove.bind(this)
		this.#renderer.canvas.addEventListener('click', this.#boundTitleClickHandler)
		this.#renderer.canvas.addEventListener('mousemove', this.#boundTitleMoveHandler)
	}

	#removeTitleListeners() {
		if (this.#boundTitleClickHandler) {
			this.#renderer.canvas.removeEventListener('click', this.#boundTitleClickHandler)
			this.#boundTitleClickHandler = null
		}
		if (this.#boundTitleMoveHandler) {
			this.#renderer.canvas.removeEventListener('mousemove', this.#boundTitleMoveHandler)
			this.#boundTitleMoveHandler = null
		}
		this.#renderer.canvas.style.cursor = 'default'
	}

	#getTitleButtonLayout() {
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

	#getTitleButtonIndex(x, y) {
		const { centerX, btnW, btnH, spacing, startY } = this.#getTitleButtonLayout()

		for (let i = 0; i < this.#titleButtons.length; i++) {
			const bx = centerX - btnW / 2
			const by = startY + i * (btnH + spacing)
			if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
				return i
			}
		}
		return -1
	}

	#onTitleClick(event) {
		const pos = this.#getCanvasPos(event)
		const idx = this.#getTitleButtonIndex(pos.x, pos.y)
		if (idx < 0) return

		const label = this.#titleButtons[idx]

		// This click is a user gesture -- safe to create AudioContext now
		this.#audioEngine.ensureResumed()

		if (label === 'New Game') {
			this.#removeTitleListeners()
			this.#startNewGame()
		} else if (label === 'Load Game') {
			this.#removeTitleListeners()
			this.#phase = 'title' // stay on title but show saves menu overlay
			this.#menuState = 'saves'
			this.#menuSelectedSlot = 'load'
			this.#menuVisible = true
			this.#addMenuListeners()
		} else if (label === 'Settings') {
			this.#removeTitleListeners()
			this.#phase = 'title'
			this.#menuState = 'settings'
			this.#menuVisible = true
			this.#addMenuListeners()
		}
	}

	#onTitleMove(event) {
		const pos = this.#getCanvasPos(event)
		this.#titleHovered = this.#getTitleButtonIndex(pos.x, pos.y)
		this.#renderer.canvas.style.cursor = this.#titleHovered >= 0 ? 'pointer' : 'default'
	}

	async #startNewGame() {
		this.#phase = 'playing'
		this.#started = true
		this.#paused = false
		this.#dialogueBox.paused = false
		this.#saveManager.deleteSave('auto')
		await this.#sceneController.start()
	}

	#drawTitleScreen(renderer) {
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
		const { btnW, btnH, spacing, startY } = this.#getTitleButtonLayout()

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

	// ===== In-Game Menu and Keyboard Shortcuts =====

	#onEscape(event) {
		// Fullscreen toggle on F key
		if (event.key === 'f' || event.key === 'F') {
			this.#toggleFullscreen()
			return
		}

		// Menu toggle on M key
		if (event.key === 'm' || event.key === 'M') {
			if (this.#phase === 'title') {
				// If a sub-menu is open on the title screen, close it
				if (this.#menuVisible) {
					this.#menuVisible = false
					this.#draggingSlider = null
					this.#removeMenuListeners()
					this.#showTitleScreen()
				}
				return
			}

			if (this.#phase !== 'playing') return

			if (this.#menuVisible) {
				this.#hideMenu()
			} else {
				this.#showMenu()
			}
			return
		}

		// Escape key closes submenus on title screen (but not during gameplay)
		if (event.key === 'Escape') {
			if (this.#phase === 'title' && this.#menuVisible) {
				this.#menuVisible = false
				this.#draggingSlider = null
				this.#removeMenuListeners()
				this.#showTitleScreen()
			}
		}
	}

	#showMenu() {
		this.#menuVisible = true
		this.#menuState = 'main'
		this.#paused = true
		this.#dialogueBox.paused = true
		this.#addMenuListeners()
	}

	#hideMenu() {
		this.#menuVisible = false
		this.#paused = false
		this.#dialogueBox.paused = false
		this.#menuState = 'main'
		this.#menuSelectedSlot = null
		this.#draggingSlider = null
		this.#removeMenuListeners()
	}

	#addMenuListeners() {
		this.#renderer.canvas.addEventListener('click', this.#menuClickHandler)
		this.#boundMenuMousedown = this.#onMenuMousedown.bind(this)
		this.#boundMenuMousemove = this.#onMenuMousemove.bind(this)
		this.#boundMenuMouseup = this.#onMenuMouseup.bind(this)
		this.#renderer.canvas.addEventListener('mousedown', this.#boundMenuMousedown)
		this.#renderer.canvas.addEventListener('mousemove', this.#boundMenuMousemove)
		this.#renderer.canvas.addEventListener('mouseup', this.#boundMenuMouseup)
	}

	#removeMenuListeners() {
		this.#renderer.canvas.removeEventListener('click', this.#menuClickHandler)
		if (this.#boundMenuMousedown) {
			this.#renderer.canvas.removeEventListener('mousedown', this.#boundMenuMousedown)
			this.#renderer.canvas.removeEventListener('mousemove', this.#boundMenuMousemove)
			this.#renderer.canvas.removeEventListener('mouseup', this.#boundMenuMouseup)
			this.#boundMenuMousedown = null
			this.#boundMenuMousemove = null
			this.#boundMenuMouseup = null
		}
	}

	#menuClickHandler = (event) => {
		const pos = this.#getCanvasPos(event)

		if (this.#menuState === 'main') {
			this.#handleMainMenuClick(pos.x, pos.y)
		} else if (this.#menuState === 'saves') {
			this.#handleSavesMenuClick(pos.x, pos.y)
		} else if (this.#menuState === 'settings') {
			this.#handleSettingsClick(pos.x, pos.y)
		} else if (this.#menuState === 'confirmOverwrite') {
			this.#handleConfirmClick(pos.x, pos.y)
		}
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
					this.#hideMenu()
				} else if (i === 1) {
					this.#menuState = 'saves'
					this.#menuSelectedSlot = 'save'
				} else if (i === 2) {
					this.#menuState = 'saves'
					this.#menuSelectedSlot = 'load'
				} else if (i === 3) {
					this.#menuState = 'settings'
				} else if (i === 4) {
					this.#autoSave()
					this.#removeMenuListeners()
					this.#showTitleScreen()
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
				if (this.#menuSelectedSlot === 'save') {
					const existing = this.#saveManager.load(slots[i])
					if (existing) {
						this.#menuState = 'confirmOverwrite'
						this.#menuSelectedSlot = slots[i]
					} else {
						this.save(slots[i])
						this.#hideMenu()
					}
				} else {
					// Load
					const slotName = slots[i]
					this.#removeMenuListeners()
					this.#menuVisible = false
					this.#menuState = 'main'
					this.#menuSelectedSlot = null
					this.#phase = 'playing'
					this.#started = true
					this.#paused = false
					this.#dialogueBox.paused = false
					this.load(slotName)
				}
				return
			}
		}

		// Back button
		const backY = startY + slots.length * spacing + 20
		const backW = sv.backWidth
		const bx = centerX - backW / 2
		if (x >= bx && x <= bx + backW && y >= backY && y <= backY + sv.backHeight) {
			if (this.#phase === 'title') {
				this.#menuVisible = false
				this.#removeMenuListeners()
				this.#showTitleScreen()
			} else {
				this.#menuState = 'main'
			}
		}
	}

	#handleSettingsClick(x, y) {
		const w = this.#renderer.width
		const centerX = w / 2
		const st = this.#themeManager.settings

		// Volume sliders layout
		const sliderW = st.sliderWidth
		const sliderX = centerX - sliderW / 2
		const startY = 240
		const spacing = 70

		const volumes = [
			{ label: 'Master', get: () => this.#audioEngine.volumes.master, set: (v) => this.#audioEngine.setMasterVolume(v) },
			{ label: 'Music', get: () => this.#audioEngine.volumes.music, set: (v) => this.#audioEngine.setMusicVolume(v) },
			{ label: 'SFX', get: () => this.#audioEngine.volumes.sfx, set: (v) => this.#audioEngine.setSfxVolume(v) }
		]

		for (let i = 0; i < volumes.length; i++) {
			const sy = startY + i * spacing
			if (y >= sy && y <= sy + 30 && x >= sliderX && x <= sliderX + sliderW) {
				const val = Math.max(0, Math.min(1, (x - sliderX) / sliderW))
				volumes[i].set(val)
				return
			}
		}

		// Back button
		const backY = startY + volumes.length * spacing + 30
		const backW = st.backWidth
		const backH = st.backHeight
		const bx2 = centerX - backW / 2
		if (x >= bx2 && x <= bx2 + backW && y >= backY && y <= backY + backH) {
			if (this.#phase === 'title') {
				this.#menuVisible = false
				this.#removeMenuListeners()
				this.#showTitleScreen()
			} else {
				this.#menuState = 'main'
			}
		}
	}

	#handleConfirmClick(x, y) {
		const w = this.#renderer.width
		const h = this.#renderer.height
		const centerX = w / 2
		const cf = this.#themeManager.confirm
		const btnW = cf.buttonWidth
		const btnH = cf.buttonHeight
		const btnY = h / 2 + 20

		// Yes button
		if (x >= centerX - btnW - 10 && x <= centerX - 10 && y >= btnY && y <= btnY + btnH) {
			this.save(this.#menuSelectedSlot)
			this.#hideMenu()
			return
		}

		// No button
		if (x >= centerX + 10 && x <= centerX + btnW + 10 && y >= btnY && y <= btnY + btnH) {
			this.#menuState = 'saves'
			this.#menuSelectedSlot = 'save'
		}
	}

	// ===== Slider Drag Handling =====

	#getVolumeEntries() {
		return [
			{ label: 'Master', get: () => this.#audioEngine.volumes.master, set: (v) => this.#audioEngine.setMasterVolume(v) },
			{ label: 'Music', get: () => this.#audioEngine.volumes.music, set: (v) => this.#audioEngine.setMusicVolume(v) },
			{ label: 'SFX', get: () => this.#audioEngine.volumes.sfx, set: (v) => this.#audioEngine.setSfxVolume(v) }
		]
	}

	#getSliderLayout() {
		const st = this.#themeManager.settings
		const sliderW = st.sliderWidth
		const sliderX = this.#renderer.width / 2 - sliderW / 2
		return { sliderX, sliderW, startY: 240, spacing: 70 }
	}

	#onMenuMousedown(event) {
		if (this.#menuState !== 'settings') return

		const pos = this.#getCanvasPos(event)
		const { sliderX, sliderW, startY, spacing } = this.#getSliderLayout()
		const volumes = this.#getVolumeEntries()

		for (let i = 0; i < volumes.length; i++) {
			const sy = startY + i * spacing
			if (pos.y >= sy - 4 && pos.y <= sy + 30 + 4 && pos.x >= sliderX - 10 && pos.x <= sliderX + sliderW + 10) {
				const val = Math.max(0, Math.min(1, (pos.x - sliderX) / sliderW))
				volumes[i].set(val)
				this.#draggingSlider = { index: i, set: volumes[i].set }
				return
			}
		}
	}

	#onMenuMousemove(event) {
		if (!this.#draggingSlider) return

		const pos = this.#getCanvasPos(event)
		const { sliderX, sliderW } = this.#getSliderLayout()
		const val = Math.max(0, Math.min(1, (pos.x - sliderX) / sliderW))
		this.#draggingSlider.set(val)
	}

	#onMenuMouseup() {
		this.#draggingSlider = null
	}

	// ===== Drawing: In-Game Menu =====

	#drawMenu(renderer) {
		renderer.drawRect(0, 0, renderer.width, renderer.height, {
			fill: this.#themeManager.colors.overlay
		})

		if (this.#menuState === 'main') {
			this.#drawMainMenu(renderer)
		} else if (this.#menuState === 'saves') {
			this.#drawSavesMenu(renderer)
		} else if (this.#menuState === 'settings') {
			this.#drawSettingsMenu(renderer)
		} else if (this.#menuState === 'confirmOverwrite') {
			this.#drawConfirmDialog(renderer)
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
		const isSaving = this.#menuSelectedSlot === 'save'
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

	#drawSettingsMenu(renderer) {
		const w = renderer.width
		const centerX = w / 2
		const st = this.#themeManager.settings
		const tm = this.#themeManager

		renderer.drawText('Settings', centerX, 160, {
			font: tm.font(st.headerFont, st.headerSize, true),
			color: tm.color(st.headerColor, 'primary'),
			align: 'center'
		})

		const sliderW = st.sliderWidth
		const sliderH = st.sliderHeight
		const sliderX = centerX - sliderW / 2
		const startY = 240
		const spacing = 70

		const volumes = [
			{ label: 'Master Volume', value: this.#audioEngine.volumes.master },
			{ label: 'Music Volume', value: this.#audioEngine.volumes.music },
			{ label: 'SFX Volume', value: this.#audioEngine.volumes.sfx }
		]

		for (let i = 0; i < volumes.length; i++) {
			const sy = startY + i * spacing

			// Label
			renderer.drawText(volumes[i].label, sliderX, sy - 20, {
				font: tm.font(st.labelFont, st.labelSize),
				color: st.labelColor
			})

			// Percentage
			renderer.drawText(Math.round(volumes[i].value * 100) + '%', sliderX + sliderW, sy - 20, {
				font: tm.font(null, st.labelSize),
				color: tm.color(st.valueColor, 'accent'),
				align: 'right'
			})

			// Track background
			renderer.drawRect(sliderX, sy, sliderW, sliderH, {
				fill: st.sliderTrackColor,
				radius: st.sliderRadius
			})

			// Track fill
			renderer.drawRect(sliderX, sy, sliderW * volumes[i].value, sliderH, {
				fill: tm.color(st.sliderFillColor, 'accent'),
				radius: st.sliderRadius
			})

			// Handle
			const handleX = sliderX + sliderW * volumes[i].value
			renderer.drawRect(handleX - st.sliderHandleWidth / 2, sy - 4, st.sliderHandleWidth, sliderH + 8, {
				fill: tm.color(st.sliderHandleColor, 'primary'),
				radius: st.sliderHandleRadius
			})
		}

		// Back button
		const backY = startY + volumes.length * spacing + 30
		const backW = st.backWidth
		renderer.drawRect(centerX - backW / 2, backY, backW, st.backHeight, {
			fill: this.#themeManager.menu.buttonFill,
			stroke: this.#themeManager.menu.buttonStroke,
			radius: this.#themeManager.menu.buttonRadius
		})
		renderer.drawText('Back', centerX, backY + 14, {
			font: tm.font(st.backFont, st.backSize),
			color: tm.color(null, 'primary'),
			align: 'center'
		})
	}

	#drawConfirmDialog(renderer) {
		const w = renderer.width
		const h = renderer.height
		const centerX = w / 2
		const cf = this.#themeManager.confirm
		const tm = this.#themeManager

		renderer.drawRect(centerX - cf.width / 2, h / 2 - cf.height / 2 + 10, cf.width, cf.height, {
			fill: cf.bgColor,
			stroke: cf.strokeColor,
			radius: cf.radius
		})

		renderer.drawText('Overwrite existing save?', centerX, h / 2 - 30, {
			font: tm.font(cf.textFont, cf.textSize),
			color: tm.color(cf.textColor, 'primary'),
			align: 'center'
		})

		const btnW = cf.buttonWidth
		const btnH = cf.buttonHeight
		const btnY = h / 2 + 20

		// Yes
		renderer.drawRect(centerX - btnW - 10, btnY, btnW, btnH, {
			fill: cf.confirmFill,
			stroke: cf.confirmStroke,
			radius: cf.buttonRadius
		})
		renderer.drawText('Yes, overwrite', centerX - btnW / 2 - 10, btnY + 14, {
			font: tm.font(cf.buttonFont, cf.buttonSize),
			color: tm.color(null, 'primary'),
			align: 'center'
		})

		// No
		renderer.drawRect(centerX + 10, btnY, btnW, btnH, {
			fill: cf.cancelFill,
			stroke: cf.cancelStroke,
			radius: cf.buttonRadius
		})
		renderer.drawText('Cancel', centerX + btnW / 2 + 10, btnY + 14, {
			font: tm.font(cf.buttonFont, cf.buttonSize),
			color: tm.color(null, 'primary'),
			align: 'center'
		})
	}

	// ===== Fullscreen =====

	#toggleFullscreen() {
		const el = this.#renderer.canvas.parentElement ?? this.#renderer.canvas
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {})
		} else {
			el.requestFullscreen().catch(() => {
				// Fallback: try on the canvas itself
				this.#renderer.canvas.requestFullscreen().catch(() => {})
			})
		}
	}

	#onFullscreenChange() {
		const canvas = this.#renderer.canvas
		if (document.fullscreenElement) {
			// Entering fullscreen: compute CSS size to fill screen while keeping aspect ratio
			const screenW = window.innerWidth
			const screenH = window.innerHeight
			const canvasW = this.#renderer.width
			const canvasH = this.#renderer.height
			const scale = Math.min(screenW / canvasW, screenH / canvasH)
			canvas.style.width = Math.round(canvasW * scale) + 'px'
			canvas.style.height = Math.round(canvasH * scale) + 'px'
		} else {
			// Exiting fullscreen: remove inline size overrides, let CSS handle it
			canvas.style.width = ''
			canvas.style.height = ''
		}
	}

	// ===== Drawing: Loading Screen =====

	#drawLoadingScreen(progress) {
		const w = this.#renderer.width
		const h = this.#renderer.height
		const ld = this.#themeManager.loading
		const tm = this.#themeManager

		this.#renderer.clear()
		this.#renderer.drawRect(0, 0, w, h, { fill: tm.colors.background })

		// Title
		this.#renderer.drawText(this.#script.meta?.title ?? 'Loading...', w / 2, h / 2 - 60, {
			font: tm.font(ld.titleFont, ld.titleSize, true),
			color: tm.color(ld.titleColor, 'primary'),
			align: 'center'
		})

		// Progress bar background
		const barW = ld.barWidth
		const barH = ld.barHeight
		const barX = (w - barW) / 2
		const barY = h / 2

		this.#renderer.drawRect(barX, barY, barW, barH, {
			fill: ld.barTrackColor,
			radius: ld.barRadius
		})

		// Progress bar fill
		this.#renderer.drawRect(barX, barY, barW * progress.progress, barH, {
			fill: tm.color(ld.barFillColor, 'accent'),
			radius: ld.barRadius
		})

		// Progress text
		this.#renderer.drawText(`${progress.loaded} / ${progress.total}`, w / 2, barY + 30, {
			font: tm.font(ld.progressFont, ld.progressSize),
			color: tm.color(ld.progressColor, 'textSecondary'),
			align: 'center'
		})
	}

	// ===== Helpers =====

	#getCanvasPos(event) {
		const rect = this.#renderer.canvas.getBoundingClientRect()
		const scaleX = this.#renderer.width / rect.width
		const scaleY = this.#renderer.height / rect.height
		return {
			x: (event.clientX - rect.left) * scaleX,
			y: (event.clientY - rect.top) * scaleY
		}
	}
}
