export class SceneController {
	#script = null
	#sceneMap = new Map()
	#currentScene = null
	#dialogueIndex = 0
	#renderer = null
	#assetLoader = null
	#audioEngine = null
	#dialogueBox = null
	#running = false
	#onSceneChange = null
	#onEnd = null

	constructor({ renderer, assetLoader, audioEngine, dialogueBox }) {
		this.#renderer = renderer
		this.#assetLoader = assetLoader
		this.#audioEngine = audioEngine
		this.#dialogueBox = dialogueBox
	}

	get currentSceneId() {
		return this.#currentScene?.id ?? null
	}

	get dialogueIndex() {
		return this.#dialogueIndex
	}

	get isRunning() {
		return this.#running
	}

	set onSceneChange(fn) {
		this.#onSceneChange = fn
	}

	set onEnd(fn) {
		this.#onEnd = fn
	}

	loadScript(script) {
		this.#script = script
		this.#sceneMap.clear()

		if (script.scenes && Array.isArray(script.scenes)) {
			for (const scene of script.scenes) {
				this.#sceneMap.set(scene.id, scene)
			}
		}
	}

	getScene(sceneId) {
		return this.#sceneMap.get(sceneId) ?? null
	}

	getSceneName(sceneId) {
		const scene = this.#sceneMap.get(sceneId)
		return scene ? scene.id : null
	}

	async start(sceneId, dialogueIndex = 0) {
		if (!this.#script) throw new Error('SceneController: no script loaded')

		const startId = sceneId ?? this.#script.startScene
		if (!startId) throw new Error('SceneController: no startScene defined in script')

		this.#running = true
		await this.loadScene(startId, dialogueIndex)
	}

	async loadScene(sceneId, startDialogueIndex = 0) {
		const scene = this.#sceneMap.get(sceneId)
		if (!scene) {
			console.warn(`SceneController: scene "${sceneId}" not found`)
			this.#handleEnd()
			return
		}

		this.#currentScene = scene
		this.#dialogueIndex = startDialogueIndex

		// Set up background layer
		this.#setupBackground(scene)

		// Set up characters layer
		this.#setupCharacters(scene)

		// Set up music
		this.#setupMusic(scene)

		// Notify scene change
		if (this.#onSceneChange) {
			this.#onSceneChange(scene.id)
		}

		// Start dialogue playback
		await this.#playDialogue()
	}

	#setupBackground(scene) {
		this.#renderer.setLayer('background', (renderer) => {
			if (!scene.background) {
				renderer.drawRect(0, 0, renderer.width, renderer.height, {
					fill: '#1a1a2e'
				})
				return
			}

			const bgAsset = this.#assetLoader.getAsset(scene.background)
			if (bgAsset && bgAsset.resource) {
				renderer.drawImage(bgAsset.resource, 0, 0, renderer.width, renderer.height)
			} else {
				renderer.drawRect(0, 0, renderer.width, renderer.height, {
					fill: '#1a1a2e'
				})
			}
		})
	}

	#setupCharacters(scene) {
		this.#renderer.setLayer('characters', (renderer) => {
			if (!scene.characters || scene.characters.length === 0) return

			for (const charData of scene.characters) {
				const charAsset = this.#assetLoader.getAsset(charData.assetId)
				if (!charAsset || !charAsset.resource) continue

				const img = charAsset.resource
				const scale = charData.scale ?? 1.0
				const drawW = img.naturalWidth * scale
				const drawH = img.naturalHeight * scale

				// Position is normalized 0-1, convert to canvas coordinates
				// x: 0 = left edge, 1 = right edge (character centered on x)
				// y: 0 = top, 1 = bottom (character bottom-aligned to y)
				const drawX = charData.position.x * renderer.width - drawW / 2
				const drawY = charData.position.y * renderer.height - drawH

				const ctx = renderer.context
				ctx.save()

				if (charData.flipped) {
					ctx.translate(drawX + drawW, drawY)
					ctx.scale(-1, 1)
					ctx.drawImage(img, 0, 0, drawW, drawH)
				} else {
					ctx.drawImage(img, drawX, drawY, drawW, drawH)
				}

				ctx.restore()
			}
		})
	}

	#setupMusic(scene) {
		if (!scene.music) {
			this.#audioEngine.stopMusic()
			return
		}

		const musicAsset = this.#assetLoader.getAsset(scene.music.assetId)
		if (!musicAsset || !musicAsset.resource) return

		// Don't restart if same music is already playing
		if (this.#audioEngine.currentMusicId === scene.music.assetId) return

		this.#audioEngine.playMusic(musicAsset.resource, scene.music.assetId, {
			loop: scene.music.loop ?? true
		})
	}

	async #playDialogue() {
		const scene = this.#currentScene
		if (!scene || !scene.dialogue) {
			await this.#handleSceneEnd()
			return
		}

		for (let i = this.#dialogueIndex; i < scene.dialogue.length; i++) {
			if (!this.#running) return

			this.#dialogueIndex = i
			const entry = scene.dialogue[i]

			// Show dialogue and wait for player to advance
			await this.#dialogueBox.showDialogue(entry.speaker, entry.text)
		}

		// Dialogue finished, handle choices or next scene
		this.#dialogueIndex = scene.dialogue.length
		await this.#handleSceneEnd()
	}

	async #handleSceneEnd() {
		const scene = this.#currentScene
		if (!scene) return

		// Check for choices
		if (scene.choices && scene.choices.length > 0) {
			const choice = await this.#dialogueBox.showChoices(scene.choices)
			if (choice && choice.targetSceneId) {
				await this.loadScene(choice.targetSceneId)
			} else {
				this.#handleEnd()
			}
			return
		}

		// Check for linear next
		if (scene.next) {
			this.#dialogueBox.hide()
			await this.loadScene(scene.next)
			return
		}

		// No next, no choices - end of game
		this.#handleEnd()
	}

	#handleEnd() {
		this.#running = false
		this.#dialogueBox.hide()
		this.#audioEngine.stopMusic()

		if (this.#onEnd) {
			this.#onEnd()
		}
	}

	stop() {
		this.#running = false
		this.#dialogueBox.hide()
	}

	getState() {
		return {
			currentSceneId: this.currentSceneId,
			dialogueIndex: this.#dialogueIndex,
			musicState: this.#audioEngine.getMusicState()
		}
	}

	async restoreState(state) {
		if (!state || !state.currentSceneId) return

		const musicOptions = {}
		if (state.musicState && state.musicState.currentTime) {
			musicOptions.startTime = state.musicState.currentTime
		}

		this.#running = true
		await this.loadScene(state.currentSceneId, state.dialogueIndex ?? 0)
	}
}
