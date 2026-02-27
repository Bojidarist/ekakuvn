export function getCanvasPosition(event, canvas, logicalWidth, logicalHeight) {
	const rect = canvas.getBoundingClientRect()
	const scaleX = logicalWidth / rect.width
	const scaleY = logicalHeight / rect.height
	return {
		x: (event.clientX - rect.left) * scaleX,
		y: (event.clientY - rect.top) * scaleY
	}
}
