/**
 * Hit testing and selection geometry for editor canvas elements.
 * Stateless — all functions take the active state as parameters.
 */

/**
 * Find a character by its timeline node ID.
 * @param {Map} activeChars - Map of active characters
 * @param {string} nodeId - Timeline node ID
 * @returns {object|null}
 */
export function findCharByNodeId(activeChars, nodeId) {
	for (const [, char] of activeChars) {
		if (char.nodeId === nodeId) return char
	}
	return null
}

/**
 * Find a character by name.
 * @param {Map} activeChars - Map of active characters
 * @param {string} name - Character name
 * @returns {object|null}
 */
export function findCharByName(activeChars, name) {
	for (const [, char] of activeChars) {
		if (char.name === name) return char
	}
	return null
}

/**
 * Compute corner handle positions for a selection rectangle.
 * @param {number} drawX - Left edge of the bounding box
 * @param {number} drawY - Top edge of the bounding box
 * @param {number} drawW - Width of the bounding box
 * @param {number} drawH - Height of the bounding box
 * @param {number} handleSize - Size of each handle square
 * @returns {number[][]} Array of [x, y] positions for each corner
 */
export function getHandlePositions(drawX, drawY, drawW, drawH, handleSize) {
	return [
		[drawX - handleSize / 2, drawY - handleSize / 2],                    // top-left
		[drawX + drawW - handleSize / 2, drawY - handleSize / 2],            // top-right
		[drawX - handleSize / 2, drawY + drawH - handleSize / 2],            // bottom-left
		[drawX + drawW - handleSize / 2, drawY + drawH - handleSize / 2]     // bottom-right
	]
}

/**
 * Get the CSS cursor style for a given resize handle.
 * @param {string} handle - Handle name ('top-left', 'top-right', 'bottom-left', 'bottom-right')
 * @returns {string}
 */
export function getHandleCursor(handle) {
	if (handle === 'top-left' || handle === 'bottom-right') return 'nwse-resize'
	return 'nesw-resize'
}

/**
 * Test if a point hits a resize handle on the currently selected character.
 * @param {number} canvasX - X coordinate in canvas space
 * @param {number} canvasY - Y coordinate in canvas space
 * @param {string|null} selectedId - Currently selected element ID
 * @param {Map} activeChars - Map of active characters
 * @param {Function} getImage - Function to get a loaded image by asset ID
 * @param {number} rendererWidth - Canvas width
 * @param {number} rendererHeight - Canvas height
 * @returns {object|null} Hit result with handle, nodeId, and geometry, or null
 */
export function hitTestHandle(canvasX, canvasY, selectedId, activeChars, getImage, rendererWidth, rendererHeight) {
	if (!selectedId) return null

	const char = findCharByNodeId(activeChars, selectedId)
	if (!char) return null

	const img = getImage(char.assetId)
	if (!img) return null

	const scale = char.scale ?? 1.0
	const drawW = img.naturalWidth * scale
	const drawH = img.naturalHeight * scale
	const drawX = char.position.x * rendererWidth - drawW / 2
	const drawY = char.position.y * rendererHeight - drawH

	const handleSize = 8
	const hitPad = 4
	const corners = getHandlePositions(drawX, drawY, drawW, drawH, handleSize)
	const handleNames = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

	for (let i = 0; i < corners.length; i++) {
		const [cx, cy] = corners[i]
		if (canvasX >= cx - hitPad && canvasX <= cx + handleSize + hitPad &&
			canvasY >= cy - hitPad && canvasY <= cy + handleSize + hitPad) {
			return {
				handle: handleNames[i],
				nodeId: char.nodeId,
				charName: null,
				drawX, drawY, drawW, drawH
			}
		}
	}

	return null
}

/**
 * Test if a point hits a character sprite (top-most first).
 * @param {number} canvasX - X coordinate in canvas space
 * @param {number} canvasY - Y coordinate in canvas space
 * @param {Map} activeChars - Map of active characters
 * @param {Function} getImage - Function to get a loaded image by asset ID
 * @param {number} rendererWidth - Canvas width
 * @param {number} rendererHeight - Canvas height
 * @returns {object|null} Hit result with nodeId, charName, offsetX, offsetY, or null
 */
export function hitTestCharacter(canvasX, canvasY, activeChars, getImage, rendererWidth, rendererHeight) {
	// Convert active chars Map to array for reverse iteration (top-most first)
	const entries = [...activeChars.entries()]
	for (let i = entries.length - 1; i >= 0; i--) {
		const [, char] = entries[i]
		const img = getImage(char.assetId)
		if (!img) continue

		const scale = char.scale ?? 1.0
		const drawW = img.naturalWidth * scale
		const drawH = img.naturalHeight * scale
		const drawX = char.position.x * rendererWidth - drawW / 2
		const drawY = char.position.y * rendererHeight - drawH

		if (canvasX >= drawX && canvasX <= drawX + drawW &&
			canvasY >= drawY && canvasY <= drawY + drawH) {
			return { nodeId: char.nodeId, charName: char.name, offsetX: canvasX - drawX, offsetY: canvasY - drawY }
		}
	}

	return null
}
