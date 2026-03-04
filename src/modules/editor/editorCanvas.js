import { Renderer } from '../runtime/renderer.js'
import { getCanvasPosition } from '../shared/canvasUtils.js'
import { findCharByNodeId, getHandlePositions } from './canvas/hitTesting.js'
import { DragResizeHandler } from './canvas/dragResize.js'

export class EditorCanvas {
	#state = null
	#renderer = null
	#canvas = null
	#dragResize = null
	#loadedImages = new Map()
	#loadedVideos = new Map()
	#previewNodeIndex = null // index in timeline, or null for full scene
	#textboxVisible = true

	// Cached computed state (recalculated on preview/scene change)
	#activeChars = new Map()   // Map<nodeId, { nodeId, name, assetId, position, scale, flipped, expressions, currentExpression }>
	#activeBgAssetId = null
	#activeDialogue = null     // { speaker, text } or null
	#activeVideoAssetId = null // assetId of the video node active at preview index, or null

	constructor(state) {
		this.#state = state
		this.#canvas = document.getElementById('editor-canvas')

		const resolution = state.project.meta.resolution
		this.#renderer = new Renderer(this.#canvas, resolution.width, resolution.height)

		// Set up layers
		this.#renderer.setLayer('background', (r) => this.#drawBackground(r))
		this.#renderer.setLayer('characters', (r) => this.#drawCharacters(r))
		this.#renderer.setLayer('video', (r) => this.#drawVideo(r))
		this.#renderer.setLayer('selection', (r) => this.#drawSelection(r))
		this.#renderer.setLayer('textbox', (r) => this.#drawTextbox(r))
		this.#renderer.setLayer('dropHint', () => {})

		// Start render loop
		this.#renderer.startLoop(() => {})

		// Set up drag/resize interaction handler
		this.#dragResize = new DragResizeHandler(
			this.#canvas,
			this.#renderer,
			this.#state,
			() => this.#activeChars,
			(assetId) => this.#getImage(assetId)
		)

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
		this.#state.on('assetsChanged', () => this.#preloadSceneAssets())
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
			this.#activeVideoAssetId = null
			return
		}

		const idx = this.#previewNodeIndex
		this.#activeChars = this.#state.getActiveCharacters(scene.id, idx)
		this.#activeBgAssetId = this.#state.getActiveBackground(scene.id, idx)
		this.#activeDialogue = this.#getActiveDialogue(scene, idx)
		this.#activeVideoAssetId = this.#getActiveVideo(scene, idx)

		this.#preloadSceneAssets()
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

	#getActiveVideo(scene, upToIndex) {
		if (!scene.timeline || scene.timeline.length === 0) return null

		// A video node is "active" only at its exact index (it's a one-shot node)
		if (upToIndex === undefined || upToIndex === null) return null

		const node = scene.timeline[upToIndex]
		if (node && node.type === 'video') return node.data.assetId ?? null
		return null
	}

	// --- Image preloading ---

	#preloadSceneAssets() {
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

		// Preload video thumbnail for the active video node
		if (this.#activeVideoAssetId) {
			this.#ensureVideoThumbnail(this.#activeVideoAssetId)
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

	#ensureVideoThumbnail(assetId) {
		if (!assetId) return
		if (this.#loadedVideos.has(assetId)) return

		const asset = this.#state.assets.find(a => a.id === assetId)
		if (!asset || asset.type !== 'video') return

		const video = document.createElement('video')
		video.muted = true
		video.preload = 'metadata'
		video.src = asset.dataUrl ?? asset.path

		// Seek to first frame so we can draw a thumbnail
		video.addEventListener('loadedmetadata', () => {
			video.currentTime = 0
		}, { once: true })

		this.#loadedVideos.set(assetId, video)
	}

	#getImage(assetId) {
		const img = this.#loadedImages.get(assetId)
		if (img && img.complete && img.naturalWidth > 0) return img
		return null
	}

	#getVideoElement(assetId) {
		return this.#loadedVideos.get(assetId) ?? null
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

	#drawVideo(renderer) {
		if (!this.#activeVideoAssetId) return

		const video = this.#getVideoElement(this.#activeVideoAssetId)
		const w = renderer.width
		const h = renderer.height

		// Dim the background to indicate video overlay
		const ctx = renderer.context
		ctx.save()
		ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
		ctx.fillRect(0, 0, w, h)

		// Draw video thumbnail frame if available
		if (video && video.readyState >= 2 && video.videoWidth > 0) {
			const vw = video.videoWidth
			const vh = video.videoHeight
			const scale = Math.min(w / vw, h / vh)
			const drawW = vw * scale
			const drawH = vh * scale
			const drawX = (w - drawW) / 2
			const drawY = (h - drawH) / 2
			ctx.drawImage(video, drawX, drawY, drawW, drawH)
		}

		// Draw a play-icon overlay to indicate this is a video node
		const iconSize = 64
		const cx = w / 2
		const cy = h / 2
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
		ctx.beginPath()
		ctx.arc(cx, cy, iconSize / 2, 0, Math.PI * 2)
		ctx.fill()
		ctx.fillStyle = '#ffffff'
		ctx.beginPath()
		ctx.moveTo(cx - 12, cy - 18)
		ctx.lineTo(cx - 12, cy + 18)
		ctx.lineTo(cx + 20, cy)
		ctx.closePath()
		ctx.fill()

		// Label at bottom
		const asset = this.#state.assets.find(a => a.id === this.#activeVideoAssetId)
		const label = asset ? (asset.name ?? asset.id) : 'Video'
		ctx.font = '16px sans-serif'
		ctx.fillStyle = 'rgba(255,255,255,0.8)'
		ctx.textAlign = 'center'
		ctx.fillText(label, cx, h - 24)
		ctx.restore()
	}

	#drawSelection(renderer) {
		const selectedId = this.#state.selectedElementId
		if (!selectedId) return

		const scene = this.#state.currentScene
		if (!scene) return

		// Find the selected character in active chars (selected by nodeId)
		const char = findCharByNodeId(this.#activeChars, selectedId)
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
		const corners = getHandlePositions(drawX, drawY, drawW, drawH, handleSize)

		for (const [cx, cy] of corners) {
			renderer.drawRect(cx, cy, handleSize, handleSize, {
				fill: '#ffcc00',
				stroke: '#000000',
				strokeWidth: 1
			})
		}

		// Scale tooltip during resize
		const resizing = this.#dragResize.resizing
		if (resizing && resizing.nodeId === selectedId) {
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

	// --- Asset drop from panel ---

	#onDrop(e) {
		e.preventDefault()
		const raw = e.dataTransfer.getData('application/ekaku-asset')
		if (!raw) return

		try {
			const { assetId, assetType } = JSON.parse(raw)
			const scene = this.#state.currentScene
			if (!scene) return

			const pos = getCanvasPosition(e, this.#canvas, this.#renderer.width, this.#renderer.height)

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
			} else if (assetType === 'video') {
				this.#state.addTimelineNode(scene.id, {
					type: 'video',
					auto: false,
					data: { assetId, loop: false, volume: 1.0 }
				})
				this.#ensureVideoThumbnail(assetId)
			}
		} catch {
			// Invalid drop data
		}
	}
}
