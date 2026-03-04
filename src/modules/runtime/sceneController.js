import { CharacterAnimator } from './characterAnimator.js'

export class SceneController {
	#script = null
	#sceneMap = new Map()
	#currentScene = null
	#nodeIndex = 0
	#renderer = null
	#assetLoader = null
	#audioEngine = null
	#dialogueBox = null
	#transitionManager = null
	#themeManager = null
	#characterAnimator = null
	#activeCharacters = new Map() // name -> { assetId, position, scale, flipped, expressions, currentExpression }
	#currentBackground = null
	#currentVideo = null          // { videoEl, loop, volume } or null
	#running = false
	#onSceneChange = null
	#onEnd = null

	constructor({ renderer, assetLoader, audioEngine, dialogueBox, transitionManager, themeManager }) {
		this.#renderer = renderer
		this.#assetLoader = assetLoader
		this.#audioEngine = audioEngine
		this.#dialogueBox = dialogueBox
		this.#transitionManager = transitionManager ?? null
		this.#themeManager = themeManager ?? null
		this.#characterAnimator = new CharacterAnimator()
	}

	get currentSceneId() {
		return this.#currentScene?.id ?? null
	}

	get nodeIndex() {
		return this.#nodeIndex
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

	async start(sceneId, nodeIndex = 0) {
		if (!this.#script) throw new Error('SceneController: no script loaded')

		const startId = sceneId ?? this.#script.startScene
		if (!startId) throw new Error('SceneController: no startScene defined in script')

		this.#running = true
		await this.loadScene(startId, nodeIndex)
	}

	async loadScene(sceneId, startNodeIndex = 0) {
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
		this.#nodeIndex = startNodeIndex
		this.#activeCharacters.clear()
		this.#currentBackground = null
		this.#stopVideo()

		// Set up initial empty layers
		this.#refreshBackgroundLayer()
		this.#refreshCharacterLayer()

		// Notify scene change
		if (this.#onSceneChange) {
			this.#onSceneChange(scene.id)
		}

		// Play scene transition if configured
		if (hasTransition) {
			const transition = scene.transition ?? { type: 'fade', duration: 0.5 }
			await this.#transitionManager.start(transition.type, transition.duration)
		}

		// If restoring to a mid-timeline position, replay earlier nodes silently
		if (startNodeIndex > 0) {
			this.#replayUpTo(startNodeIndex)
		}

		// Start timeline playback
		await this.#playTimeline()
	}

	#refreshBackgroundLayer() {
		const fallbackColor = this.#themeManager?.colors?.background ?? '#1a1a2e'
		const bgAssetId = this.#currentBackground

		this.#renderer.setLayer('background', (renderer) => {
			if (!bgAssetId) {
				renderer.drawRect(0, 0, renderer.width, renderer.height, {
					fill: fallbackColor
				})
				return
			}

			const bgAsset = this.#assetLoader.getAsset(bgAssetId)
			if (bgAsset && bgAsset.resource) {
				renderer.drawImage(bgAsset.resource, 0, 0, renderer.width, renderer.height)
			} else {
				renderer.drawRect(0, 0, renderer.width, renderer.height, {
					fill: fallbackColor
				})
			}
		})
	}

	#refreshCharacterLayer() {
		const chars = [...this.#activeCharacters.values()]

		// Trigger enter animations for newly added characters
		this.#characterAnimator.animateEnter(chars)

		this.#renderer.setLayer('characters', (renderer) => {
			if (chars.length === 0) return

			for (const charData of chars) {
				// Use expression override if set, otherwise default assetId
				let displayAssetId = charData.assetId
				if (charData.currentExpression && charData.expressions) {
					const exprAssetId = charData.expressions[charData.currentExpression]
					if (exprAssetId) displayAssetId = exprAssetId
				}

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

	async #playTimeline() {
		const scene = this.#currentScene
		if (!scene?.timeline) {
			await this.#handleSceneEnd()
			return
		}

		for (let i = this.#nodeIndex; i < scene.timeline.length; i++) {
			if (!this.#running) return

			this.#nodeIndex = i
			const node = scene.timeline[i]

			// Execute the node action
			await this.#executeNode(node, i)

			// If auto-advance, apply delay then continue to next node
			if (node.auto !== false) {
				if (node.delay > 0) {
					await this.#sleep(node.delay)
				}
			}
		}

		// Timeline finished
		this.#nodeIndex = scene.timeline.length
		await this.#handleSceneEnd()
	}

	async #executeNode(node, nodeIndex) {
		switch (node.type) {
			case 'dialogue':
				await this.#dialogueBox.showDialogue(node.speaker, node.text, {
					autoAdvance: node.auto
				})
				break

			case 'showCharacter':
				this.#activeCharacters.set(nodeIndex, {
					name: node.name,
					assetId: node.assetId,
					position: node.position ?? { x: 0.5, y: 0.8 },
					scale: node.scale ?? 1.0,
					flipped: node.flipped ?? false,
					enterAnimation: node.enterAnimation ?? null,
					expressions: node.expressions ?? {},
					currentExpression: null
				})
				this.#refreshCharacterLayer()
				break

			case 'hideCharacter':
				for (const [key, char] of this.#activeCharacters) {
					if (char.name === node.name) this.#activeCharacters.delete(key)
				}
				this.#refreshCharacterLayer()
				break

			case 'expression': {
				for (const [, char] of this.#activeCharacters) {
					if (char.name === node.name) {
						char.currentExpression = node.expression
					}
				}
				this.#refreshCharacterLayer()
				break
			}

			case 'background':
				this.#currentBackground = node.assetId
				this.#refreshBackgroundLayer()
				break

			case 'music':
				if (node.action === 'stop') {
					this.#audioEngine.stopMusic()
				} else {
					this.#playMusic(node.assetId, node.loop)
				}
				break

			case 'sound': {
				const sfxAsset = this.#assetLoader.getAsset(node.assetId)
				if (sfxAsset && sfxAsset.resource) {
					this.#audioEngine.playSfx(sfxAsset.resource)
				}
				break
			}

			case 'wait':
				await this.#sleep(node.duration ?? 0)
				break

			case 'choice': {
				const choice = await this.#dialogueBox.showChoices(node.choices)
				if (choice && choice.targetSceneId) {
					await this.loadScene(choice.targetSceneId)
				} else {
					this.#handleEnd()
				}
				return // Don't continue timeline after choice
			}

			case 'video':
				await this.#playVideo(node.assetId, node.loop, node.volume, node.auto)
				break
		}
	}

	#playMusic(assetId, loop = true) {
		if (!assetId) return

		// Don't restart if same music is already playing
		if (this.#audioEngine.currentMusicId === assetId) return

		const musicAsset = this.#assetLoader.getAsset(assetId)
		if (!musicAsset || !musicAsset.resource) return

		this.#audioEngine.playMusic(musicAsset.resource, assetId, { loop })
	}

	async #playVideo(assetId, loop = false, volume = 1.0, autoAdvance = false) {
		if (!assetId) return

		const videoAsset = this.#assetLoader.getAsset(assetId)
		if (!videoAsset || !videoAsset.resource) return

		const videoEl = videoAsset.resource
		videoEl.loop = loop
		videoEl.muted = false
		videoEl.volume = Math.min(1, Math.max(0, volume ?? 1.0))
		videoEl.currentTime = 0

		this.#currentVideo = { videoEl, loop, volume }
		this.#refreshVideoLayer()

		videoEl.play().catch(() => {})

		if (!autoAdvance) {
			// Wait for the video to finish (or loop = false end)
			await new Promise((resolve) => {
				const onEnd = () => {
					videoEl.removeEventListener('ended', onEnd)
					resolve()
				}
				videoEl.addEventListener('ended', onEnd)
			})
			this.#stopVideo()
		}
	}

	#stopVideo() {
		if (this.#currentVideo) {
			const { videoEl } = this.#currentVideo
			videoEl.pause()
			videoEl.currentTime = 0
			this.#currentVideo = null
		}
		// Clear the video layer
		this.#renderer.setLayer('video', () => {})
	}

	#refreshVideoLayer() {
		const current = this.#currentVideo
		if (!current) {
			this.#renderer.setLayer('video', () => {})
			return
		}

		const { videoEl } = current

		this.#renderer.setLayer('video', (renderer) => {
			if (!videoEl || videoEl.readyState < 2) return

			const w = renderer.width
			const h = renderer.height
			const vw = videoEl.videoWidth
			const vh = videoEl.videoHeight

			if (!vw || !vh) return

			const scale = Math.min(w / vw, h / vh)
			const drawW = vw * scale
			const drawH = vh * scale
			const drawX = (w - drawW) / 2
			const drawY = (h - drawH) / 2

			const ctx = renderer.context
			ctx.save()
			ctx.fillStyle = '#000000'
			ctx.fillRect(0, 0, w, h)
			ctx.drawImage(videoEl, drawX, drawY, drawW, drawH)
			ctx.restore()
		})
	}

	/**
	 * Replay timeline nodes 0..upTo-1 silently to reconstruct visual state.
	 * Does not show dialogue or wait — just applies side effects.
	 */
	#replayUpTo(upTo) {
		const scene = this.#currentScene
		if (!scene?.timeline) return

		for (let i = 0; i < upTo && i < scene.timeline.length; i++) {
			const node = scene.timeline[i]

			switch (node.type) {
				case 'showCharacter':
					this.#activeCharacters.set(i, {
						name: node.name,
						assetId: node.assetId,
						position: node.position ?? { x: 0.5, y: 0.8 },
						scale: node.scale ?? 1.0,
						flipped: node.flipped ?? false,
						enterAnimation: null, // Skip animation on replay
						expressions: node.expressions ?? {},
						currentExpression: null
					})
					break

				case 'hideCharacter':
					for (const [key, char] of this.#activeCharacters) {
						if (char.name === node.name) this.#activeCharacters.delete(key)
					}
					break

				case 'expression': {
					for (const [, char] of this.#activeCharacters) {
						if (char.name === node.name) char.currentExpression = node.expression
					}
					break
				}

				case 'background':
					this.#currentBackground = node.assetId
					break

				case 'music':
					if (node.action === 'stop') {
						this.#audioEngine.stopMusic()
					} else {
						this.#playMusic(node.assetId, node.loop)
					}
					break

				// dialogue, sound, wait, choice are skipped during replay
			}
		}

		// Refresh layers after silent replay
		this.#refreshBackgroundLayer()
		this.#refreshCharacterLayer()
	}

	async #handleSceneEnd() {
		const scene = this.#currentScene
		if (!scene) return

		// Check for choices at scene level
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
		this.#stopVideo()

		if (this.#onEnd) {
			this.#onEnd()
		}
	}

	#sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	stop() {
		this.#running = false
		this.#dialogueBox.hide()
		this.#stopVideo()
	}

	getState() {
		return {
			currentSceneId: this.currentSceneId,
			nodeIndex: this.#nodeIndex,
			musicState: this.#audioEngine.getMusicState()
		}
	}

	async restoreState(state) {
		if (!state || !state.currentSceneId) return

		this.#running = true
		await this.loadScene(state.currentSceneId, state.nodeIndex ?? 0)
	}
}
