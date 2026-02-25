import { CharacterAnimator } from './characterAnimator.js'

export class SceneController {
	#script = null
	#sceneMap = new Map()
	#currentScene = null
	#dialogueIndex = 0
	#renderer = null
	#assetLoader = null
	#audioEngine = null
	#dialogueBox = null
	#transitionManager = null
	#characterAnimator = null
	#activeExpressions = new Map() // charIndex -> assetId override
	#running = false
	#onSceneChange = null
	#onEnd = null

	constructor({ renderer, assetLoader, audioEngine, dialogueBox, transitionManager }) {
		this.#renderer = renderer
		this.#assetLoader = assetLoader
		this.#audioEngine = audioEngine
		this.#dialogueBox = dialogueBox
		this.#transitionManager = transitionManager ?? null
		this.#characterAnimator = new CharacterAnimator()
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

	/**
	 * Update per-frame animations (character enter/exit).
	 * @param {number} dt - Delta time in seconds
	 */
	update(dt) {
		this.#characterAnimator.update(dt)
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

		// Capture snapshot for transition (before changing the scene)
		const hasTransition = this.#transitionManager && this.#currentScene
		if (hasTransition) {
			this.#renderer.renderLayers()
			this.#transitionManager.captureSnapshot()
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

		// Play scene transition if configured
		if (hasTransition) {
			const transition = scene.transition ?? { type: 'fade', duration: 0.5 }
			await this.#transitionManager.start(transition.type, transition.duration)
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
		// Reset active expressions for new scene
		this.#activeExpressions.clear()

		// Trigger enter animations for characters
		this.#characterAnimator.animateEnter(scene.characters ?? [])

		this.#renderer.setLayer('characters', (renderer) => {
			if (!scene.characters || scene.characters.length === 0) return

			for (let i = 0; i < scene.characters.length; i++) {
				const charData = scene.characters[i]

				// Use expression override if set, otherwise default assetId
				const displayAssetId = this.#activeExpressions.get(i) ?? charData.assetId
				const charAsset = this.#assetLoader.getAsset(displayAssetId)
				if (!charAsset || !charAsset.resource) continue

				const img = charAsset.resource
				const scale = charData.scale ?? 1.0
				const drawW = img.naturalWidth * scale
				const drawH = img.naturalHeight * scale

				// Get animated transform (if any animation is active)
				const anim = this.#characterAnimator.getTransform(charData)
				const offsetX = anim ? anim.offsetX * renderer.width : 0
				const offsetY = anim ? anim.offsetY * renderer.height : 0
				const alpha = anim ? anim.alpha : 1

				// Position is normalized 0-1, convert to canvas coordinates
				const drawX = charData.position.x * renderer.width - drawW / 2 + offsetX
				const drawY = charData.position.y * renderer.height - drawH + offsetY

				const ctx = renderer.context
				ctx.save()
				ctx.globalAlpha = alpha

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

			// Apply expression change if specified
			if (entry.expression && scene.characters) {
				this.#applyExpression(scene, entry.speaker, entry.expression)
			}

			// Show dialogue and wait for player to advance
			await this.#dialogueBox.showDialogue(entry.speaker, entry.text)
		}

		// Dialogue finished, handle choices or next scene
		this.#dialogueIndex = scene.dialogue.length
		await this.#handleSceneEnd()
	}

	#applyExpression(scene, speaker, expression) {
		if (!scene.characters) return

		for (let i = 0; i < scene.characters.length; i++) {
			const charData = scene.characters[i]
			if (!charData.expressions) continue

			// Match by speaker name: compare against the asset name/id
			const charAsset = this.#assetLoader.getAsset(charData.assetId)
			const charName = charAsset ? (charAsset.id ?? '') : ''

			// Match if: speaker matches asset name, or there's only one character in scene
			const isMatch = scene.characters.length === 1 ||
				(speaker && charName.toLowerCase() === speaker.toLowerCase())

			if (isMatch && charData.expressions[expression]) {
				this.#activeExpressions.set(i, charData.expressions[expression])
			}
		}
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
