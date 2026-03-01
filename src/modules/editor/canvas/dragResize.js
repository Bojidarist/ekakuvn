/**
 * Mouse drag and resize interaction handler for the editor canvas.
 * Stateful — tracks current drag and resize operations.
 */

import { getCanvasPosition } from '../../shared/canvasUtils.js'
import { findCharByNodeId, hitTestHandle, hitTestCharacter, getHandleCursor } from './hitTesting.js'

export class DragResizeHandler {
	#canvas = null
	#renderer = null
	#state = null
	#getActiveChars = null
	#getImage = null
	#dragging = null   // { nodeId, charName, offsetX, offsetY }
	#resizing = null   // { nodeId, handle, startX, startY, startScale, anchorX, anchorY, imgW, imgH, startPosition }

	/**
	 * @param {HTMLCanvasElement} canvas - The editor canvas element
	 * @param {object} renderer - Renderer instance (for width/height)
	 * @param {object} state - EditorState instance
	 * @param {Function} getActiveChars - Returns the active characters Map
	 * @param {Function} getImage - Returns a loaded image by asset ID
	 */
	constructor(canvas, renderer, state, getActiveChars, getImage) {
		this.#canvas = canvas
		this.#renderer = renderer
		this.#state = state
		this.#getActiveChars = getActiveChars
		this.#getImage = getImage

		canvas.addEventListener('mousedown', (e) => this.#onMouseDown(e))
		canvas.addEventListener('mousemove', (e) => this.#onMouseMove(e))
		canvas.addEventListener('mouseup', () => this.#onMouseUp())
		canvas.addEventListener('click', (e) => this.#onClick(e))
	}

	/** Whether a resize is currently in progress (for scale tooltip rendering). */
	get resizing() {
		return this.#resizing
	}

	#onMouseDown(e) {
		const pos = getCanvasPosition(e, this.#canvas, this.#renderer.width, this.#renderer.height)
		const activeChars = this.#getActiveChars()

		// Check resize handles first (only on currently selected character)
		const handleHit = hitTestHandle(pos.x, pos.y, this.#state.selectedElementId, activeChars, this.#getImage, this.#renderer.width, this.#renderer.height)
		if (handleHit) {
			const char = findCharByNodeId(activeChars, handleHit.nodeId)
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
			this.#canvas.style.cursor = getHandleCursor(handleHit.handle)
			return
		}

		// Then check character body hits for dragging
		const hit = hitTestCharacter(pos.x, pos.y, activeChars, this.#getImage, this.#renderer.width, this.#renderer.height)

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
		const activeChars = this.#getActiveChars()

		// Handle resize drag
		if (this.#resizing) {
			const pos = getCanvasPosition(e, this.#canvas, this.#renderer.width, this.#renderer.height)
			const char = findCharByNodeId(activeChars, this.#resizing.nodeId)
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

			this.#canvas.style.cursor = getHandleCursor(r.handle)
			return
		}

		if (!this.#dragging) {
			const pos = getCanvasPosition(e, this.#canvas, this.#renderer.width, this.#renderer.height)
			const handleHit = hitTestHandle(pos.x, pos.y, this.#state.selectedElementId, activeChars, this.#getImage, this.#renderer.width, this.#renderer.height)
			if (handleHit) {
				this.#canvas.style.cursor = getHandleCursor(handleHit.handle)
				return
			}
			const hit = hitTestCharacter(pos.x, pos.y, activeChars, this.#getImage, this.#renderer.width, this.#renderer.height)
			this.#canvas.style.cursor = hit ? 'grab' : 'default'
			return
		}

		const pos = getCanvasPosition(e, this.#canvas, this.#renderer.width, this.#renderer.height)
		const char = findCharByNodeId(activeChars, this.#dragging.nodeId)
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
				const char = findCharByNodeId(this.#getActiveChars(), this.#resizing.nodeId)
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
				const char = findCharByNodeId(this.#getActiveChars(), this.#dragging.nodeId)
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

		const pos = getCanvasPosition(e, this.#canvas, this.#renderer.width, this.#renderer.height)
		const hit = hitTestCharacter(pos.x, pos.y, this.#getActiveChars(), this.#getImage, this.#renderer.width, this.#renderer.height)

		if (hit) {
			this.#state.selectElement(hit.nodeId)
		} else {
			this.#state.selectElement(null)
		}
	}
}
