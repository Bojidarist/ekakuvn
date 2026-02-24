import { Renderer } from '../runtime/renderer.js'

export class EditorCanvas {
	#state = null
	#renderer = null
	#canvas = null
	#dragging = null // { characterId, offsetX, offsetY }
	#loadedImages = new Map()

	constructor(state) {
		this.#state = state
		this.#canvas = document.getElementById('editor-canvas')

		const resolution = state.project.meta.resolution
		this.#renderer = new Renderer(this.#canvas, resolution.width, resolution.height)

		// Set up layers
		this.#renderer.setLayer('background', (r) => this.#drawBackground(r))
		this.#renderer.setLayer('characters', (r) => this.#drawCharacters(r))
		this.#renderer.setLayer('selection', (r) => this.#drawSelection(r))
		this.#renderer.setLayer('dropHint', () => {})

		// Start render loop
		this.#renderer.startLoop(() => {})

		// Mouse events for character interaction
		this.#canvas.addEventListener('mousedown', (e) => this.#onMouseDown(e))
		this.#canvas.addEventListener('mousemove', (e) => this.#onMouseMove(e))
		this.#canvas.addEventListener('mouseup', () => this.#onMouseUp())
		this.#canvas.addEventListener('click', (e) => this.#onClick(e))

		// Drag-and-drop from asset panel
		this.#canvas.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.dataTransfer.dropEffect = 'copy'
		})
		this.#canvas.addEventListener('drop', (e) => this.#onDrop(e))

		// Listen for state changes
		this.#state.on('sceneChanged', () => this.#preloadSceneImages())
		this.#state.on('sceneUpdated', () => this.#preloadSceneImages())
		this.#state.on('assetsChanged', () => this.#preloadSceneImages())
		this.#state.on('projectChanged', () => this.#preloadSceneImages())

		this.#preloadSceneImages()
	}

	get renderer() {
		return this.#renderer
	}

	#preloadSceneImages() {
		const scene = this.#state.currentScene
		if (!scene) return

		// Preload background
		if (scene.background) {
			this.#ensureImage(scene.background)
		}

		// Preload characters
		for (const char of scene.characters) {
			this.#ensureImage(char.assetId)
		}
	}

	#ensureImage(assetId) {
		if (this.#loadedImages.has(assetId)) return

		const asset = this.#state.assets.find(a => a.id === assetId)
		if (!asset) return
		if (asset.type !== 'background' && asset.type !== 'character') return

		const img = new Image()
		img.src = asset.dataUrl ?? asset.path
		this.#loadedImages.set(assetId, img)
	}

	#getImage(assetId) {
		const img = this.#loadedImages.get(assetId)
		if (img && img.complete && img.naturalWidth > 0) return img
		return null
	}

	#drawBackground(renderer) {
		const scene = this.#state.currentScene
		if (!scene) {
			renderer.drawRect(0, 0, renderer.width, renderer.height, { fill: '#2a2a4a' })
			renderer.drawText('No scene selected', renderer.width / 2, renderer.height / 2, {
				font: '20px sans-serif',
				color: 'rgba(255,255,255,0.3)',
				align: 'center'
			})
			return
		}

		if (scene.background) {
			const img = this.#getImage(scene.background)
			if (img) {
				renderer.drawImage(img, 0, 0, renderer.width, renderer.height)
				return
			}
		}

		// Default dark background
		renderer.drawRect(0, 0, renderer.width, renderer.height, { fill: '#1a1a2e' })
	}

	#drawCharacters(renderer) {
		const scene = this.#state.currentScene
		if (!scene) return

		for (const char of scene.characters) {
			const img = this.#getImage(char.assetId)
			if (!img) continue

			const scale = char.scale ?? 1.0
			const drawW = img.naturalWidth * scale
			const drawH = img.naturalHeight * scale
			const drawX = char.position.x * renderer.width - drawW / 2
			const drawY = char.position.y * renderer.height - drawH

			const ctx = renderer.context
			ctx.save()

			if (char.flipped) {
				ctx.translate(drawX + drawW, drawY)
				ctx.scale(-1, 1)
				ctx.drawImage(img, 0, 0, drawW, drawH)
			} else {
				ctx.drawImage(img, drawX, drawY, drawW, drawH)
			}

			ctx.restore()
		}
	}

	#drawSelection(renderer) {
		const selectedId = this.#state.selectedElementId
		if (!selectedId) return

		const scene = this.#state.currentScene
		if (!scene) return

		const char = scene.characters.find(c => c.id === selectedId)
		if (!char) return

		const img = this.#getImage(char.assetId)
		if (!img) return

		const scale = char.scale ?? 1.0
		const drawW = img.naturalWidth * scale
		const drawH = img.naturalHeight * scale
		const drawX = char.position.x * renderer.width - drawW / 2
		const drawY = char.position.y * renderer.height - drawH

		// Selection bounding box
		renderer.drawRect(drawX - 2, drawY - 2, drawW + 4, drawH + 4, {
			stroke: '#ffcc00',
			strokeWidth: 2
		})

		// Corner handles
		const handleSize = 8
		const corners = [
			[drawX - handleSize / 2, drawY - handleSize / 2],
			[drawX + drawW - handleSize / 2, drawY - handleSize / 2],
			[drawX - handleSize / 2, drawY + drawH - handleSize / 2],
			[drawX + drawW - handleSize / 2, drawY + drawH - handleSize / 2]
		]

		for (const [cx, cy] of corners) {
			renderer.drawRect(cx, cy, handleSize, handleSize, {
				fill: '#ffcc00',
				stroke: '#000000',
				strokeWidth: 1
			})
		}
	}

	#getCanvasPosition(event) {
		const rect = this.#canvas.getBoundingClientRect()
		const scaleX = this.#renderer.width / rect.width
		const scaleY = this.#renderer.height / rect.height
		return {
			x: (event.clientX - rect.left) * scaleX,
			y: (event.clientY - rect.top) * scaleY
		}
	}

	#hitTestCharacter(canvasX, canvasY) {
		const scene = this.#state.currentScene
		if (!scene) return null

		// Test in reverse order (top-most first)
		for (let i = scene.characters.length - 1; i >= 0; i--) {
			const char = scene.characters[i]
			const img = this.#getImage(char.assetId)
			if (!img) continue

			const scale = char.scale ?? 1.0
			const drawW = img.naturalWidth * scale
			const drawH = img.naturalHeight * scale
			const drawX = char.position.x * this.#renderer.width - drawW / 2
			const drawY = char.position.y * this.#renderer.height - drawH

			if (canvasX >= drawX && canvasX <= drawX + drawW &&
				canvasY >= drawY && canvasY <= drawY + drawH) {
				return { character: char, offsetX: canvasX - drawX, offsetY: canvasY - drawY }
			}
		}

		return null
	}

	#onMouseDown(e) {
		const pos = this.#getCanvasPosition(e)
		const hit = this.#hitTestCharacter(pos.x, pos.y)

		if (hit) {
			this.#state.selectElement(hit.character.id)
			this.#dragging = {
				characterId: hit.character.id,
				offsetX: hit.offsetX,
				offsetY: hit.offsetY
			}
			this.#canvas.style.cursor = 'grabbing'
		}
	}

	#onMouseMove(e) {
		if (!this.#dragging) {
			// Update cursor based on hover
			const pos = this.#getCanvasPosition(e)
			const hit = this.#hitTestCharacter(pos.x, pos.y)
			this.#canvas.style.cursor = hit ? 'grab' : 'default'
			return
		}

		const pos = this.#getCanvasPosition(e)
		const scene = this.#state.currentScene
		if (!scene) return

		const char = scene.characters.find(c => c.id === this.#dragging.characterId)
		if (!char) return

		const img = this.#getImage(char.assetId)
		if (!img) return

		const scale = char.scale ?? 1.0
		const drawW = img.naturalWidth * scale
		const drawH = img.naturalHeight * scale

		// Convert back to normalized coordinates
		const newX = (pos.x - this.#dragging.offsetX + drawW / 2) / this.#renderer.width
		const newY = (pos.y - this.#dragging.offsetY + drawH) / this.#renderer.height

		// Clamp to canvas
		char.position.x = Math.max(0, Math.min(1, newX))
		char.position.y = Math.max(0, Math.min(1, newY))
	}

	#onMouseUp() {
		if (this.#dragging) {
			const scene = this.#state.currentScene
			if (scene) {
				const char = scene.characters.find(c => c.id === this.#dragging.characterId)
				if (char) {
					this.#state.updateCharacter(scene.id, char.id, {
						position: { ...char.position }
					})
				}
			}
			this.#dragging = null
			this.#canvas.style.cursor = 'default'
		}
	}

	#onClick(e) {
		if (this.#dragging) return

		const pos = this.#getCanvasPosition(e)
		const hit = this.#hitTestCharacter(pos.x, pos.y)

		if (hit) {
			this.#state.selectElement(hit.character.id)
		} else {
			this.#state.selectElement(null)
		}
	}

	#onDrop(e) {
		e.preventDefault()
		const raw = e.dataTransfer.getData('application/ekaku-asset')
		if (!raw) return

		try {
			const { assetId, assetType } = JSON.parse(raw)
			const scene = this.#state.currentScene
			if (!scene) return

			const pos = this.#getCanvasPosition(e)

			if (assetType === 'character') {
				const char = this.#state.addCharacter(scene.id, {
					assetId,
					position: {
						x: pos.x / this.#renderer.width,
						y: pos.y / this.#renderer.height
					}
				})
				if (char) {
					this.#ensureImage(assetId)
					this.#state.selectElement(char.id)
				}
			} else if (assetType === 'background') {
				this.#state.updateScene(scene.id, 'background', assetId)
				this.#ensureImage(assetId)
			}
		} catch {
			// Invalid drop data
		}
	}
}
