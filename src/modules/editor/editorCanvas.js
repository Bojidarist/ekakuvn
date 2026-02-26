import { Renderer } from '../runtime/renderer.js'

export class EditorCanvas {
	#state = null
	#renderer = null
	#canvas = null
	#dragging = null // { nodeId, charName, offsetX, offsetY }
	#resizing = null // { nodeId, charName, handle, startX, startY, startScale, anchorX, anchorY }
	#loadedImages = new Map()
	#previewNodeIndex = null // index in timeline, or null for full scene
	#textboxVisible = true

	// Cached computed state (recalculated on preview/scene change)
	#activeChars = new Map()   // Map<nodeId, { nodeId, name, assetId, position, scale, flipped, expressions, currentExpression }>
	#activeBgAssetId = null
	#activeDialogue = null     // { speaker, text } or null

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
		this.#state.on('sceneChanged', () => {
			this.#previewNodeIndex = null
			this.#recomputeState()
		})
		this.#state.on('timelineChanged', () => this.#recomputeState())
		this.#state.on('assetsChanged', () => this.#preloadSceneImages())
		this.#state.on('projectChanged', () => {
			this.#previewNodeIndex = null
			this.#recomputeState()
		})

		// Listen for timeline preview changes (emitted by TimelineEditor)
		this.#state.on('timelinePreviewChanged', (nodeIndex) => {
			this.#previewNodeIndex = nodeIndex
			this.#recomputeState()
		})

		this.#recomputeState()
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

	// --- Timeline state computation ---

	#recomputeState() {
		const scene = this.#state.currentScene
		if (!scene) {
			this.#activeChars = new Map()
			this.#activeBgAssetId = null
			this.#activeDialogue = null
			return
		}

		const idx = this.#previewNodeIndex
		this.#activeChars = this.#state.getActiveCharacters(scene.id, idx)
		this.#activeBgAssetId = this.#state.getActiveBackground(scene.id, idx)
		this.#activeDialogue = this.#getActiveDialogue(scene, idx)

		this.#preloadSceneImages()
	}

	#getActiveDialogue(scene, upToIndex) {
		if (!scene.timeline || scene.timeline.length === 0) return null

		const limit = upToIndex !== undefined ? upToIndex + 1 : scene.timeline.length
		let dialogue = null

		for (let i = 0; i < limit && i < scene.timeline.length; i++) {
			const node = scene.timeline[i]
			if (node.type === 'dialogue') {
				dialogue = { speaker: node.data.speaker, text: node.data.text }
			}
		}

		return dialogue
	}

	// --- Image preloading ---

	#preloadSceneImages() {
		// Preload background
		if (this.#activeBgAssetId) {
			this.#ensureImage(this.#activeBgAssetId)
		}

		// Preload all character assets and their expressions
		for (const [, char] of this.#activeChars) {
			this.#ensureImage(char.assetId)
			if (char.expressions) {
				for (const exprAssetId of Object.values(char.expressions)) {
					this.#ensureImage(exprAssetId)
				}
			}
		}
	}

	#ensureImage(assetId) {
		if (!assetId) return
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

	// --- Drawing ---

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

		if (this.#activeBgAssetId) {
			const img = this.#getImage(this.#activeBgAssetId)
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

		for (const [, char] of this.#activeChars) {
			// Resolve which image to display: expression override or default
			let displayAssetId = char.assetId
			if (char.currentExpression && char.expressions && char.expressions[char.currentExpression]) {
				displayAssetId = char.expressions[char.currentExpression]
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

		// Find the selected character in active chars (selected by nodeId)
		const char = this.#findCharByNodeId(selectedId)
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
		if (this.#resizing && this.#resizing.nodeId === selectedId) {
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
		if (!this.#activeDialogue) return

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
		if (this.#activeDialogue.speaker) {
			renderer.drawText(this.#activeDialogue.speaker, textX, textY, {
				font: dialogue.speakerFont ?? `bold ${speakerSize}px ${fontFamily}`,
				color: dialogue.speakerColor ?? accentColor
			})
			textY += speakerSize + 8
		}

		// Draw dialogue text
		if (this.#activeDialogue.text) {
			renderer.drawText(this.#activeDialogue.text, textX, textY, {
				font: dialogue.textFont ?? `${textSize}px ${fontFamily}`,
				color: dialogue.textColor ?? primaryColor,
				maxWidth: boxW - boxPadding * 2,
				lineHeight: dialogue.textLineHeight ?? 28
			})
		}
	}

	// --- Character lookup helpers ---

	#findCharByNodeId(nodeId) {
		for (const [, char] of this.#activeChars) {
			if (char.nodeId === nodeId) return char
		}
		return null
	}

	#findCharByName(name) {
		for (const [, char] of this.#activeChars) {
			if (char.name === name) return char
		}
		return null
	}

	// --- Selection / handle geometry ---

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

		const char = this.#findCharByNodeId(selectedId)
		if (!char) return null

		const img = this.#getImage(char.assetId)
		if (!img) return null

		const scale = char.scale ?? 1.0
		const drawW = img.naturalWidth * scale
		const drawH = img.naturalHeight * scale
		const drawX = char.position.x * this.#renderer.width - drawW / 2
		const drawY = char.position.y * this.#renderer.height - drawH

		const handleSize = 8
		const hitPad = 4
		const corners = this.#getHandlePositions(drawX, drawY, drawW, drawH, handleSize)
		const handleNames = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

		for (let i = 0; i < corners.length; i++) {
			const [cx, cy] = corners[i]
			if (canvasX >= cx - hitPad && canvasX <= cx + handleSize + hitPad &&
				canvasY >= cy - hitPad && canvasY <= cy + handleSize + hitPad) {
				return {
					handle: handleNames[i],
					nodeId: char.nodeId,
					charName: null, // filled below
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
		// Convert active chars Map to array for reverse iteration (top-most first)
		const entries = [...this.#activeChars.entries()]
		for (let i = entries.length - 1; i >= 0; i--) {
			const [, char] = entries[i]
			const img = this.#getImage(char.assetId)
			if (!img) continue

			const scale = char.scale ?? 1.0
			const drawW = img.naturalWidth * scale
			const drawH = img.naturalHeight * scale
			const drawX = char.position.x * this.#renderer.width - drawW / 2
			const drawY = char.position.y * this.#renderer.height - drawH

			if (canvasX >= drawX && canvasX <= drawX + drawW &&
				canvasY >= drawY && canvasY <= drawY + drawH) {
				return { nodeId: char.nodeId, charName: char.name, offsetX: canvasX - drawX, offsetY: canvasY - drawY }
			}
		}

		return null
	}

	// --- Mouse interaction ---

	#onMouseDown(e) {
		const pos = this.#getCanvasPosition(e)

		// Check resize handles first (only on currently selected character)
		const handleHit = this.#hitTestHandle(pos.x, pos.y)
		if (handleHit) {
			const char = this.#findCharByNodeId(handleHit.nodeId)
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
				nodeId: handleHit.nodeId,
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
			this.#state.selectElement(hit.nodeId)
			this.#dragging = {
				nodeId: hit.nodeId,
				charName: hit.charName,
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
			const char = this.#findCharByNodeId(this.#resizing.nodeId)
			if (!char) return

			const r = this.#resizing
			const curDist = Math.sqrt(
				Math.pow(pos.x - r.anchorX, 2) + Math.pow(pos.y - r.anchorY, 2)
			)
			const startDist = Math.sqrt(
				Math.pow(r.startX - r.anchorX, 2) + Math.pow(r.startY - r.anchorY, 2)
			)

			if (startDist > 0) {
				let newScale = r.startScale * (curDist / startDist)
				newScale = Math.max(0.05, Math.min(5, newScale))

				// We update the local cached char for live visual feedback
				char.scale = newScale

				const newW = r.imgW * newScale
				const newH = r.imgH * newScale

				let newDrawX, newDrawY
				switch (r.handle) {
					case 'top-left':
						newDrawX = r.anchorX - newW
						newDrawY = r.anchorY - newH
						break
					case 'top-right':
						newDrawX = r.anchorX
						newDrawY = r.anchorY - newH
						break
					case 'bottom-left':
						newDrawX = r.anchorX - newW
						newDrawY = r.anchorY
						break
					case 'bottom-right':
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
		const char = this.#findCharByNodeId(this.#dragging.nodeId)
		if (!char) return

		const img = this.#getImage(char.assetId)
		if (!img) return

		const scale = char.scale ?? 1.0
		const drawW = img.naturalWidth * scale
		const drawH = img.naturalHeight * scale

		const newX = (pos.x - this.#dragging.offsetX + drawW / 2) / this.#renderer.width
		const newY = (pos.y - this.#dragging.offsetY + drawH) / this.#renderer.height

		// Update local cached char for live visual feedback
		char.position.x = Math.max(0, Math.min(1, newX))
		char.position.y = Math.max(0, Math.min(1, newY))
	}

	#onMouseUp() {
		if (this.#resizing) {
			const scene = this.#state.currentScene
			if (scene) {
				const char = this.#findCharByNodeId(this.#resizing.nodeId)
				if (char) {
					this.#state.updateTimelineNode(scene.id, this.#resizing.nodeId, {
						data: {
							scale: char.scale,
							position: { ...char.position }
						}
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
				const char = this.#findCharByNodeId(this.#dragging.nodeId)
				if (char) {
					this.#state.updateTimelineNode(scene.id, this.#dragging.nodeId, {
						data: {
							position: { ...char.position }
						}
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
			this.#state.selectElement(hit.nodeId)
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
				// Look up asset name for the character name field
				const asset = this.#state.assets.find(a => a.id === assetId)
				const name = asset ? (asset.name ?? asset.id) : assetId

				this.#state.addTimelineNode(scene.id, {
					type: 'showCharacter',
					auto: true,
					data: {
						name,
						assetId,
						position: {
							x: pos.x / this.#renderer.width,
							y: pos.y / this.#renderer.height
						},
						scale: 1.0,
						flipped: false
					}
				})
				this.#ensureImage(assetId)
			} else if (assetType === 'background') {
				this.#state.addTimelineNode(scene.id, {
					type: 'background',
					auto: true,
					data: { assetId }
				})
				this.#ensureImage(assetId)
			}
		} catch {
			// Invalid drop data
		}
	}
}
