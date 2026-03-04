import { Renderer } from './renderer.js'
import { AssetLoader } from './assetLoader.js'
import { AudioEngine } from './audioEngine.js'
import { DialogueBox } from './dialogueBox.js'
import { SceneController } from './sceneController.js'
import { SaveManager } from './saveManager.js'
import { TransitionManager } from './transitionManager.js'
import { ThemeManager } from './themeManager.js'
import { TitleScreen } from './titleScreen.js'
import { MenuScreen } from './menuScreen.js'
import { LoadingScreen } from './loadingScreen.js'

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

	#phase = 'loading' // loading | title | playing
	#titleScreen = null
	#menuScreen = null
	#loadingScreen = null

	// Event handlers
	#boundEscapeHandler = null
	#boundVisibilityHandler = null
	#boundBeforeUnloadHandler = null
	#boundFullscreenHandler = null

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
			this.#loadingScreen.draw(progress)
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

		// Create screen modules
		this.#loadingScreen = new LoadingScreen({
			renderer: this.#renderer,
			themeManager: this.#themeManager,
			script: this.#script
		})

		this.#titleScreen = new TitleScreen({
			runtime: this,
			renderer: this.#renderer,
			themeManager: this.#themeManager,
			script: this.#script,
			assetLoader: this.#assetLoader,
			saveManager: this.#saveManager,
			audioEngine: this.#audioEngine
		})

		this.#menuScreen = new MenuScreen({
			runtime: this,
			renderer: this.#renderer,
			themeManager: this.#themeManager,
			script: this.#script,
			saveManager: this.#saveManager,
			audioEngine: this.#audioEngine
		})

		// Set up render layers
		this.#renderer.setLayer('background', () => {})
		this.#renderer.setLayer('characters', () => {})
		this.#renderer.setLayer('video', () => {})
		this.#renderer.setLayer('dialogue', (renderer) => {
			if (this.#phase === 'playing') {
				this.#dialogueBox.draw(renderer)
			}
		})
		this.#renderer.setLayer('transition', (renderer) => {
			this.#transitionManager.draw(renderer)
		})
		this.#renderer.setLayer('overlay', (renderer) => {
			if (this.#menuScreen.visible) {
				this.#menuScreen.draw(renderer)
			} else if (this.#phase === 'title') {
				this.#titleScreen.draw(renderer)
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
		this.#titleScreen.removeListeners()
		this.#menuScreen.removeListeners()
		document.removeEventListener('keydown', this.#boundEscapeHandler)
		document.removeEventListener('visibilitychange', this.#boundVisibilityHandler)
		document.removeEventListener('fullscreenchange', this.#boundFullscreenHandler)
		window.removeEventListener('beforeunload', this.#boundBeforeUnloadHandler)
	}

	// ===== Callbacks from screen modules =====

	async startNewGame() {
		this.#phase = 'playing'
		this.#started = true
		this.#paused = false
		this.#dialogueBox.paused = false
		this.#saveManager.deleteSave('auto')
		await this.#sceneController.start()
	}

	openTitleSubMenu(state, selectedSlot = null) {
		this.#phase = 'title'
		this.#menuScreen.show(state, selectedSlot)
	}

	hideMenu() {
		this.#menuScreen.hide()
		if (this.#phase === 'playing') {
			this.#paused = false
			this.#dialogueBox.paused = false
		}
	}

	returnToTitle() {
		this.#autoSave()
		this.#menuScreen.removeListeners()
		this.#showTitleScreen()
	}

	onMenuBack() {
		if (this.#phase === 'title') {
			this.#menuScreen.hide()
			this.#showTitleScreen()
		} else {
			this.#menuScreen.state = 'main'
		}
	}

	saveToSlot(slotName) {
		this.save(slotName)
	}

	loadFromSlot(slotName) {
		this.#menuScreen.hide()
		this.#phase = 'playing'
		this.#started = true
		this.#paused = false
		this.#dialogueBox.paused = false
		this.load(slotName)
	}

	// ===== Private =====

	#autoSave() {
		if (!this.#started || !this.#sceneController.currentSceneId) return
		this.save('auto')
	}

	#showTitleScreen() {
		this.#phase = 'title'
		this.#started = false
		this.#paused = true
		this.#dialogueBox.paused = true
		this.#menuScreen.hide()

		// Stop any playing scene
		this.#sceneController.stop()
		this.#audioEngine.stopMusic()

		this.#titleScreen.show()
	}

	#onEscape(event) {
		// Fullscreen toggle on F key
		if (event.key === 'f' || event.key === 'F') {
			this.#toggleFullscreen()
			return
		}

		// Menu toggle on M key
		if (event.key === 'm' || event.key === 'M') {
			if (this.#phase === 'title') {
				if (this.#menuScreen.visible) {
					this.#menuScreen.clearDrag()
					this.#menuScreen.hide()
					this.#showTitleScreen()
				}
				return
			}

			if (this.#phase !== 'playing') return

			if (this.#menuScreen.visible) {
				this.hideMenu()
			} else {
				this.#paused = true
				this.#dialogueBox.paused = true
				this.#menuScreen.show()
			}
			return
		}

		// Escape key closes submenus on title screen
		if (event.key === 'Escape') {
			if (this.#phase === 'title' && this.#menuScreen.visible) {
				this.#menuScreen.clearDrag()
				this.#menuScreen.hide()
				this.#showTitleScreen()
			}
		}
	}

	#toggleFullscreen() {
		const el = this.#renderer.canvas.parentElement ?? this.#renderer.canvas
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {})
		} else {
			el.requestFullscreen().catch(() => {
				this.#renderer.canvas.requestFullscreen().catch(() => {})
			})
		}
	}

	#onFullscreenChange() {
		const canvas = this.#renderer.canvas
		if (document.fullscreenElement) {
			const screenW = window.innerWidth
			const screenH = window.innerHeight
			const canvasW = this.#renderer.width
			const canvasH = this.#renderer.height
			const scale = Math.min(screenW / canvasW, screenH / canvasH)
			canvas.style.width = Math.round(canvasW * scale) + 'px'
			canvas.style.height = Math.round(canvasH * scale) + 'px'
		} else {
			canvas.style.width = ''
			canvas.style.height = ''
		}
	}
}
