import { Renderer } from '../runtime/renderer.js'

export class EditorCanvas {
	#state = null
	#renderer = null
	#canvas = null
	#dragging = null // { characterId, offsetX, offsetY }
	#resizing = null // { characterId, handle, startX, startY, startScale, anchorX, anchorY }
	#loadedImages = new Map()
	#dialoguePreview = null // { speaker, text } or null
	#textboxVisible = true

	constructor(state) {
		this.#state = state
		this.#canvas = document.getElementById('editor-canvas')

		const resolution = state.project.meta.resolution
		this.#renderer = new Renderer(this.#canvas, resolution.width, resolution.height)

		// Set up layers
		this.#renderer.setLayer('background', (r) => this.#drawBackground(r))
		this.#renderer.setLayer('characters', (r) => this.#drawCharacters(r))
		this.#renderer.setLayer('selection', (r) => this.#drawSelection(r))
		this.#renderer.setLayer('textbox', (r) => this.#drawTextbox(r))
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

		// Listen for dialogue preview changes
		this.#state.on('dialoguePreviewChanged', (data) => {
			this.#dialoguePreview = data
		})
	}

	get renderer() {
		return this.#renderer
	}

	get textboxVisible() {
		return this.#textboxVisible
	}

	set textboxVisible(visible) {
		this.#textboxVisible = visible
	}

	#preloadSceneImages() {
		const scene = this.#state.currentScene
		if (!scene) return

		// Preload background
		if (scene.background) {
			this.#ensureImage(scene.background)
		}

		// Preload characters and their expressions
		for (const char of scene.characters) {
			this.#ensureImage(char.assetId)
			if (char.expressions) {
				for (const exprAssetId of Object.values(char.expressions)) {
					this.#ensureImage(exprAssetId)
				}
			}
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

		// Determine active expression from dialogue preview
		const preview = this.#dialoguePreview
		const activeExpression = preview?.expression ?? null
		const activeSpeaker = preview?.speaker ?? null

		for (const char of scene.characters) {
			// Resolve which image to display: expression override or default
			let displayAssetId = char.assetId
			if (activeExpression && char.expressions && char.expressions[activeExpression]) {
				// If the dialogue line's speaker matches one of the character asset names,
				// or if there's only one character, apply the expression
				const asset = this.#state.assets.find(a => a.id === char.assetId)
				const charName = asset ? (asset.name ?? asset.id) : char.assetId
				if (scene.characters.length === 1 ||
					(activeSpeaker && charName.toLowerCase() === activeSpeaker.toLowerCase())) {
					displayAssetId = char.expressions[activeExpression]
				}
			}

			const img = this.#getImage(displayAssetId)
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
		const corners = this.#getHandlePositions(drawX, drawY, drawW, drawH, handleSize)

		for (const [cx, cy] of corners) {
			renderer.drawRect(cx, cy, handleSize, handleSize, {
				fill: '#ffcc00',
				stroke: '#000000',
				strokeWidth: 1
			})
		}

		// Scale tooltip during resize
		if (this.#resizing && this.#resizing.characterId === selectedId) {
			const pct = Math.round(scale * 100)
			const ctx = renderer.context
			ctx.save()
			ctx.font = '12px sans-serif'
			const text = `${pct}%`
			const tw = ctx.measureText(text).width
			const tx = drawX + drawW / 2 - tw / 2
			const ty = drawY - 14
			ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
			ctx.fillRect(tx - 4, ty - 12, tw + 8, 16)
			ctx.fillStyle = '#ffcc00'
			ctx.fillText(text, tx, ty)
			ctx.restore()
		}
	}

	#drawTextbox(renderer) {
		if (!this.#textboxVisible) return

		const preview = this.#dialoguePreview
		if (!preview) return

		const w = renderer.width
		const h = renderer.height

		// Read theme from project (matches runtime ThemeManager defaults)
		const theme = this.#state.project.meta.theme ?? {}
		const dialogue = theme.dialogue ?? {}
		const colors = theme.colors ?? {}
		const fontFamily = theme.fontFamily ?? 'sans-serif'

		const boxHeight = dialogue.boxHeight ?? 180
		const boxMargin = dialogue.boxMargin ?? 20
		const boxPadding = dialogue.boxPadding ?? 20
		const boxRadius = dialogue.boxRadius ?? 12

		const boxX = boxMargin
		const boxY = h - boxHeight - boxMargin
		const boxW = w - boxMargin * 2

		// Draw box background
		renderer.drawRect(boxX, boxY, boxW, boxHeight, {
			fill: dialogue.boxColor ?? 'rgba(0, 0, 0, 0.75)',
			radius: boxRadius
		})

		const textX = boxX + boxPadding
		let textY = boxY + boxPadding

		const speakerSize = dialogue.speakerSize ?? 22
		const textSize = dialogue.textSize ?? 20
		const accentColor = colors.accent ?? '#ffcc00'
		const primaryColor = colors.primary ?? '#ffffff'

		// Draw speaker name
		if (preview.speaker) {
			renderer.drawText(preview.speaker, textX, textY, {
				font: dialogue.speakerFont ?? `bold ${speakerSize}px ${fontFamily}`,
				color: dialogue.speakerColor ?? accentColor
			})
			textY += speakerSize + 8
		}

		// Draw dialogue text
		if (preview.text) {
			renderer.drawText(preview.text, textX, textY, {
				font: dialogue.textFont ?? `${textSize}px ${fontFamily}`,
				color: dialogue.textColor ?? primaryColor,
				maxWidth: boxW - boxPadding * 2,
				lineHeight: dialogue.textLineHeight ?? 28
			})
		}
	}

	#getHandlePositions(drawX, drawY, drawW, drawH, handleSize) {
		return [
			[drawX - handleSize / 2, drawY - handleSize / 2],                    // top-left
			[drawX + drawW - handleSize / 2, drawY - handleSize / 2],            // top-right
			[drawX - handleSize / 2, drawY + drawH - handleSize / 2],            // bottom-left
			[drawX + drawW - handleSize / 2, drawY + drawH - handleSize / 2]     // bottom-right
		]
	}

	#hitTestHandle(canvasX, canvasY) {
		const selectedId = this.#state.selectedElementId
		if (!selectedId) return null

		const scene = this.#state.currentScene
		if (!scene) return null

		const char = scene.characters.find(c => c.id === selectedId)
		if (!char) return null

		const img = this.#getImage(char.assetId)
		if (!img) return null

		const scale = char.scale ?? 1.0
		const drawW = img.naturalWidth * scale
		const drawH = img.naturalHeight * scale
		const drawX = char.position.x * this.#renderer.width - drawW / 2
		const drawY = char.position.y * this.#renderer.height - drawH

		const handleSize = 8
		const hitPad = 4 // extra hit area around handles
		const corners = this.#getHandlePositions(drawX, drawY, drawW, drawH, handleSize)
		const handleNames = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

		for (let i = 0; i < corners.length; i++) {
			const [cx, cy] = corners[i]
			if (canvasX >= cx - hitPad && canvasX <= cx + handleSize + hitPad &&
				canvasY >= cy - hitPad && canvasY <= cy + handleSize + hitPad) {
				return {
					handle: handleNames[i],
					characterId: char.id,
					drawX, drawY, drawW, drawH
				}
			}
		}

		return null
	}

	#getHandleCursor(handle) {
		if (handle === 'top-left' || handle === 'bottom-right') return 'nwse-resize'
		return 'nesw-resize'
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

		// Check resize handles first (only on currently selected character)
		const handleHit = this.#hitTestHandle(pos.x, pos.y)
		if (handleHit) {
			const scene = this.#state.currentScene
			if (!scene) return
			const char = scene.characters.find(c => c.id === handleHit.characterId)
			if (!char) return
			const img = this.#getImage(char.assetId)
			if (!img) return

			const scale = char.scale ?? 1.0
			const drawW = img.naturalWidth * scale
			const drawH = img.naturalHeight * scale
			const drawX = char.position.x * this.#renderer.width - drawW / 2
			const drawY = char.position.y * this.#renderer.height - drawH

			// Anchor is the opposite corner
			let anchorX, anchorY
			switch (handleHit.handle) {
				case 'top-left': anchorX = drawX + drawW; anchorY = drawY + drawH; break
				case 'top-right': anchorX = drawX; anchorY = drawY + drawH; break
				case 'bottom-left': anchorX = drawX + drawW; anchorY = drawY; break
				case 'bottom-right': anchorX = drawX; anchorY = drawY; break
			}

			this.#resizing = {
				characterId: handleHit.characterId,
				handle: handleHit.handle,
				startX: pos.x,
				startY: pos.y,
				startScale: scale,
				anchorX,
				anchorY,
				imgW: img.naturalWidth,
				imgH: img.naturalHeight,
				startPosition: { ...char.position }
			}
			this.#canvas.style.cursor = this.#getHandleCursor(handleHit.handle)
			return
		}

		// Then check character body hits for dragging
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
		// Handle resize drag
		if (this.#resizing) {
			const pos = this.#getCanvasPosition(e)
			const scene = this.#state.currentScene
			if (!scene) return
			const char = scene.characters.find(c => c.id === this.#resizing.characterId)
			if (!char) return

			const r = this.#resizing
			// Distance from anchor to current mouse
			const curDist = Math.sqrt(
				Math.pow(pos.x - r.anchorX, 2) + Math.pow(pos.y - r.anchorY, 2)
			)
			// Distance from anchor to start mouse
			const startDist = Math.sqrt(
				Math.pow(r.startX - r.anchorX, 2) + Math.pow(r.startY - r.anchorY, 2)
			)

			if (startDist > 0) {
				let newScale = r.startScale * (curDist / startDist)
				newScale = Math.max(0.05, Math.min(5, newScale))
				char.scale = newScale

				// Reposition so the anchor corner stays fixed.
				// Characters are drawn with:
				//   drawX = position.x * width - drawW / 2
				//   drawY = position.y * height - drawH
				// So: position.x = (drawX + drawW / 2) / width
				//     position.y = (drawY + drawH) / height
				const newW = r.imgW * newScale
				const newH = r.imgH * newScale

				let newDrawX, newDrawY
				switch (r.handle) {
					case 'top-left':
						// anchor is bottom-right, so bottom-right stays fixed
						newDrawX = r.anchorX - newW
						newDrawY = r.anchorY - newH
						break
					case 'top-right':
						// anchor is bottom-left
						newDrawX = r.anchorX
						newDrawY = r.anchorY - newH
						break
					case 'bottom-left':
						// anchor is top-right
						newDrawX = r.anchorX - newW
						newDrawY = r.anchorY
						break
					case 'bottom-right':
						// anchor is top-left
						newDrawX = r.anchorX
						newDrawY = r.anchorY
						break
				}

				char.position.x = (newDrawX + newW / 2) / this.#renderer.width
				char.position.y = (newDrawY + newH) / this.#renderer.height
			}

			this.#canvas.style.cursor = this.#getHandleCursor(r.handle)
			return
		}

		if (!this.#dragging) {
			// Update cursor based on hover (handles first, then characters)
			const pos = this.#getCanvasPosition(e)
			const handleHit = this.#hitTestHandle(pos.x, pos.y)
			if (handleHit) {
				this.#canvas.style.cursor = this.#getHandleCursor(handleHit.handle)
				return
			}
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
		if (this.#resizing) {
			const scene = this.#state.currentScene
			if (scene) {
				const char = scene.characters.find(c => c.id === this.#resizing.characterId)
				if (char) {
					this.#state.updateCharacter(scene.id, char.id, {
						scale: char.scale,
						position: { ...char.position }
					})
				}
			}
			this.#resizing = null
			this.#canvas.style.cursor = 'default'
			return
		}

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
		if (this.#dragging || this.#resizing) return

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
