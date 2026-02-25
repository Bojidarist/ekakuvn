import { Renderer } from './renderer.js'
import { AssetLoader } from './assetLoader.js'
import { AudioEngine } from './audioEngine.js'
import { DialogueBox } from './dialogueBox.js'
import { SceneController } from './sceneController.js'
import { SaveManager } from './saveManager.js'
import { TransitionManager } from './transitionManager.js'

export class EkakuRuntime {
	#renderer = null
	#assetLoader = null
	#audioEngine = null
	#dialogueBox = null
	#sceneController = null
	#saveManager = null
	#transitionManager = null
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

	// Event handlers
	#boundEscapeHandler = null
	#boundVisibilityHandler = null
	#boundBeforeUnloadHandler = null
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
		this.#dialogueBox = new DialogueBox(this.#renderer)

		this.#assetLoader = new AssetLoader((progress) => {
			this.#drawLoadingScreen(progress)
		})

		this.#transitionManager = new TransitionManager(this.#renderer)

		this.#sceneController = new SceneController({
			renderer: this.#renderer,
			assetLoader: this.#assetLoader,
			audioEngine: this.#audioEngine,
			dialogueBox: this.#dialogueBox,
			transitionManager: this.#transitionManager
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
			if (this.#phase === 'title') {
				this.#drawTitleScreen(renderer)
			} else if (this.#menuVisible) {
				this.#drawMenu(renderer)
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
		document.removeEventListener('keydown', this.#boundEscapeHandler)
		document.removeEventListener('visibilitychange', this.#boundVisibilityHandler)
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
		this.#titleButtons.push('Fullscreen')

		// Set background to title screen
		const menuConfig = this.#script.meta?.mainMenu
		this.#renderer.setLayer('background', (renderer) => {
			if (menuConfig?.background) {
				const bgAsset = this.#assetLoader.getAsset(menuConfig.background)
				if (bgAsset && bgAsset.resource) {
					renderer.drawImage(bgAsset.resource, 0, 0, renderer.width, renderer.height)
					return
				}
			}
			renderer.drawRect(0, 0, renderer.width, renderer.height, { fill: '#1a1a2e' })
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
		const btnW = 280
		const btnH = 50
		const spacing = 16
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
			this.#renderer.canvas.addEventListener('click', this.#menuClickHandler)
		} else if (label === 'Settings') {
			this.#removeTitleListeners()
			this.#phase = 'title'
			this.#menuState = 'settings'
			this.#menuVisible = true
			this.#renderer.canvas.addEventListener('click', this.#menuClickHandler)
		} else if (label === 'Fullscreen') {
			this.#toggleFullscreen()
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
		this.#saveManager.deleteSave('auto')
		await this.#sceneController.start()
	}

	#drawTitleScreen(renderer) {
		const w = renderer.width
		const h = renderer.height
		const centerX = w / 2
		const menuConfig = this.#script.meta?.mainMenu

		// Dim overlay for readability
		renderer.drawRect(0, 0, w, h, { fill: 'rgba(0, 0, 0, 0.4)' })

		// Title
		const title = menuConfig?.title ?? this.#script.meta?.title ?? 'ekakuvn'
		renderer.drawText(title, centerX, h * 0.28, {
			font: 'bold 48px sans-serif',
			color: '#ffffff',
			align: 'center',
			shadow: { color: 'rgba(0, 0, 0, 0.6)', blur: 8, offsetX: 0, offsetY: 3 }
		})

		// Subtitle / author
		const author = this.#script.meta?.author
		if (author) {
			renderer.drawText('by ' + author, centerX, h * 0.28 + 56, {
				font: '20px sans-serif',
				color: 'rgba(255, 255, 255, 0.6)',
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
				fill: hovered ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.07)',
				stroke: hovered ? 'rgba(255, 204, 0, 0.6)' : 'rgba(255, 255, 255, 0.2)',
				radius: 10
			})
			renderer.drawText(this.#titleButtons[i], centerX, by + 16, {
				font: hovered ? 'bold 22px sans-serif' : '22px sans-serif',
				color: hovered ? '#ffcc00' : '#ffffff',
				align: 'center'
			})
		}

		// Version
		const version = this.#script.meta?.version
		if (version) {
			renderer.drawText('v' + version, w - 16, h - 16, {
				font: '12px sans-serif',
				color: 'rgba(255, 255, 255, 0.3)',
				align: 'right'
			})
		}
	}

	// ===== In-Game Menu (Escape key) =====

	#onEscape(event) {
		// Fullscreen toggle on F key
		if (event.key === 'f' || event.key === 'F') {
			this.#toggleFullscreen()
			return
		}

		if (event.key !== 'Escape') return

		if (this.#phase === 'title') {
			// If a sub-menu is open on the title screen, close it
			if (this.#menuVisible) {
				this.#menuVisible = false
				this.#renderer.canvas.removeEventListener('click', this.#menuClickHandler)
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
	}

	#showMenu() {
		this.#menuVisible = true
		this.#menuState = 'main'
		this.#paused = true
		this.#renderer.canvas.addEventListener('click', this.#menuClickHandler)
	}

	#hideMenu() {
		this.#menuVisible = false
		this.#paused = false
		this.#menuState = 'main'
		this.#menuSelectedSlot = null
		this.#renderer.canvas.removeEventListener('click', this.#menuClickHandler)
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
		const btnW = 240
		const btnH = 44
		const startY = 260
		const spacing = 56

		const buttons = ['Resume', 'Save Game', 'Load Game', 'Settings', 'Fullscreen', 'Title Screen']
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
					this.#toggleFullscreen()
				} else if (i === 5) {
					this.#autoSave()
					this.#renderer.canvas.removeEventListener('click', this.#menuClickHandler)
					this.#showTitleScreen()
				}
				return
			}
		}
	}

	#handleSavesMenuClick(x, y) {
		const w = this.#renderer.width
		const centerX = w / 2
		const btnW = 360
		const btnH = 50
		const startY = 200
		const spacing = 60

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
					const fromTitle = this.#phase === 'title'
					this.load(slots[i]).then(success => {
						if (success) {
							this.#renderer.canvas.removeEventListener('click', this.#menuClickHandler)
							this.#menuVisible = false
							this.#menuState = 'main'
							this.#menuSelectedSlot = null
							this.#phase = 'playing'
							this.#started = true
							this.#paused = false
						}
					})
				}
				return
			}
		}

		// Back button
		const backY = startY + slots.length * spacing + 20
		const backW = 120
		const bx = centerX - backW / 2
		if (x >= bx && x <= bx + backW && y >= backY && y <= backY + btnH) {
			if (this.#phase === 'title') {
				this.#menuVisible = false
				this.#renderer.canvas.removeEventListener('click', this.#menuClickHandler)
				this.#showTitleScreen()
			} else {
				this.#menuState = 'main'
			}
		}
	}

	#handleSettingsClick(x, y) {
		const w = this.#renderer.width
		const h = this.#renderer.height
		const centerX = w / 2

		// Volume sliders layout
		const sliderW = 300
		const sliderH = 8
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
		const backW = 120
		const backH = 44
		const bx = centerX - backW / 2
		if (x >= bx && x <= bx + backW && y >= backY && y <= backY + backH) {
			if (this.#phase === 'title') {
				this.#menuVisible = false
				this.#renderer.canvas.removeEventListener('click', this.#menuClickHandler)
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
		const btnW = 140
		const btnH = 44
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

	// ===== Drawing: In-Game Menu =====

	#drawMenu(renderer) {
		renderer.drawRect(0, 0, renderer.width, renderer.height, {
			fill: 'rgba(0, 0, 0, 0.7)'
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

		renderer.drawText(this.#script.meta?.title ?? 'Menu', centerX, 180, {
			font: 'bold 36px sans-serif',
			color: '#ffffff',
			align: 'center'
		})

		const buttons = ['Resume', 'Save Game', 'Load Game', 'Settings', 'Fullscreen', 'Title Screen']
		const btnW = 240
		const btnH = 44
		const startY = 260
		const spacing = 56

		for (let i = 0; i < buttons.length; i++) {
			const bx = centerX - btnW / 2
			const by = startY + i * spacing
			renderer.drawRect(bx, by, btnW, btnH, {
				fill: 'rgba(255, 255, 255, 0.1)',
				stroke: 'rgba(255, 255, 255, 0.3)',
				radius: 8
			})
			renderer.drawText(buttons[i], centerX, by + 14, {
				font: '20px sans-serif',
				color: '#ffffff',
				align: 'center'
			})
		}

		renderer.drawText('Press Escape to close', centerX, renderer.height - 50, {
			font: '14px sans-serif',
			color: 'rgba(255, 255, 255, 0.5)',
			align: 'center'
		})
	}

	#drawSavesMenu(renderer) {
		const w = renderer.width
		const centerX = w / 2
		const isSaving = this.#menuSelectedSlot === 'save'

		renderer.drawText(isSaving ? 'Save Game' : 'Load Game', centerX, 140, {
			font: 'bold 30px sans-serif',
			color: '#ffffff',
			align: 'center'
		})

		const slots = ['slot1', 'slot2', 'slot3']
		const btnW = 360
		const btnH = 50
		const startY = 200
		const spacing = 60

		for (let i = 0; i < slots.length; i++) {
			const save = this.#saveManager.load(slots[i])
			const bx = centerX - btnW / 2
			const by = startY + i * spacing

			renderer.drawRect(bx, by, btnW, btnH, {
				fill: save ? 'rgba(100, 200, 100, 0.15)' : 'rgba(255, 255, 255, 0.08)',
				stroke: save ? 'rgba(100, 200, 100, 0.4)' : 'rgba(255, 255, 255, 0.2)',
				radius: 8
			})

			if (save) {
				const date = new Date(save.timestamp)
				const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
				renderer.drawText(`Slot ${i + 1}: ${save.currentSceneId}`, bx + 16, by + 10, {
					font: '18px sans-serif',
					color: '#ffffff'
				})
				renderer.drawText(dateStr, bx + 16, by + 30, {
					font: '13px sans-serif',
					color: 'rgba(255, 255, 255, 0.6)'
				})
			} else {
				renderer.drawText(`Slot ${i + 1}: Empty`, bx + 16, by + 16, {
					font: '18px sans-serif',
					color: 'rgba(255, 255, 255, 0.4)'
				})
			}
		}

		// Back button
		const backY = startY + slots.length * spacing + 20
		const backW = 120
		renderer.drawRect(centerX - backW / 2, backY, backW, 44, {
			fill: 'rgba(255, 255, 255, 0.1)',
			stroke: 'rgba(255, 255, 255, 0.3)',
			radius: 8
		})
		renderer.drawText('Back', centerX, backY + 14, {
			font: '18px sans-serif',
			color: '#ffffff',
			align: 'center'
		})
	}

	#drawSettingsMenu(renderer) {
		const w = renderer.width
		const centerX = w / 2

		renderer.drawText('Settings', centerX, 160, {
			font: 'bold 30px sans-serif',
			color: '#ffffff',
			align: 'center'
		})

		const sliderW = 300
		const sliderH = 8
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
				font: '16px sans-serif',
				color: 'rgba(255, 255, 255, 0.7)'
			})

			// Percentage
			renderer.drawText(Math.round(volumes[i].value * 100) + '%', sliderX + sliderW, sy - 20, {
				font: '16px sans-serif',
				color: '#ffcc00',
				align: 'right'
			})

			// Track background
			renderer.drawRect(sliderX, sy, sliderW, sliderH, {
				fill: 'rgba(255, 255, 255, 0.15)',
				radius: 4
			})

			// Track fill
			renderer.drawRect(sliderX, sy, sliderW * volumes[i].value, sliderH, {
				fill: '#ffcc00',
				radius: 4
			})

			// Handle
			const handleX = sliderX + sliderW * volumes[i].value
			renderer.drawRect(handleX - 6, sy - 4, 12, sliderH + 8, {
				fill: '#ffffff',
				radius: 6
			})
		}

		// Back button
		const backY = startY + volumes.length * spacing + 30
		const backW = 120
		renderer.drawRect(centerX - backW / 2, backY, backW, 44, {
			fill: 'rgba(255, 255, 255, 0.1)',
			stroke: 'rgba(255, 255, 255, 0.3)',
			radius: 8
		})
		renderer.drawText('Back', centerX, backY + 14, {
			font: '18px sans-serif',
			color: '#ffffff',
			align: 'center'
		})
	}

	#drawConfirmDialog(renderer) {
		const w = renderer.width
		const h = renderer.height
		const centerX = w / 2

		renderer.drawRect(centerX - 200, h / 2 - 60, 400, 140, {
			fill: 'rgba(30, 30, 50, 0.95)',
			stroke: 'rgba(255, 200, 0, 0.5)',
			radius: 12
		})

		renderer.drawText('Overwrite existing save?', centerX, h / 2 - 30, {
			font: '20px sans-serif',
			color: '#ffffff',
			align: 'center'
		})

		const btnW = 140
		const btnH = 44
		const btnY = h / 2 + 20

		// Yes
		renderer.drawRect(centerX - btnW - 10, btnY, btnW, btnH, {
			fill: 'rgba(200, 80, 80, 0.3)',
			stroke: 'rgba(200, 80, 80, 0.6)',
			radius: 8
		})
		renderer.drawText('Yes, overwrite', centerX - btnW / 2 - 10, btnY + 14, {
			font: '16px sans-serif',
			color: '#ffffff',
			align: 'center'
		})

		// No
		renderer.drawRect(centerX + 10, btnY, btnW, btnH, {
			fill: 'rgba(255, 255, 255, 0.1)',
			stroke: 'rgba(255, 255, 255, 0.3)',
			radius: 8
		})
		renderer.drawText('Cancel', centerX + btnW / 2 + 10, btnY + 14, {
			font: '16px sans-serif',
			color: '#ffffff',
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

	// ===== Drawing: Loading Screen =====

	#drawLoadingScreen(progress) {
		const w = this.#renderer.width
		const h = this.#renderer.height

		this.#renderer.clear()
		this.#renderer.drawRect(0, 0, w, h, { fill: '#1a1a2e' })

		// Title
		this.#renderer.drawText(this.#script.meta?.title ?? 'Loading...', w / 2, h / 2 - 60, {
			font: 'bold 32px sans-serif',
			color: '#ffffff',
			align: 'center'
		})

		// Progress bar background
		const barW = 300
		const barH = 12
		const barX = (w - barW) / 2
		const barY = h / 2

		this.#renderer.drawRect(barX, barY, barW, barH, {
			fill: 'rgba(255, 255, 255, 0.1)',
			radius: 6
		})

		// Progress bar fill
		this.#renderer.drawRect(barX, barY, barW * progress.progress, barH, {
			fill: '#ffcc00',
			radius: 6
		})

		// Progress text
		this.#renderer.drawText(`${progress.loaded} / ${progress.total}`, w / 2, barY + 30, {
			font: '16px sans-serif',
			color: 'rgba(255, 255, 255, 0.6)',
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
