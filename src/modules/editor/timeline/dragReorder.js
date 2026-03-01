/**
 * Drag-and-drop reordering logic for timeline nodes.
 * Stateless — all functions take DOM elements and state as parameters.
 */

/**
 * Set up the timeline list as a drop zone for new elements dragged from the elements panel.
 * Handles drops that land on the list itself (not on a specific node row).
 * @param {HTMLElement} listEl - The timeline list container element
 * @param {object} state - EditorState instance
 */
export function setupListDropZone(listEl, state) {
	listEl.addEventListener('dragover', (e) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'copy'
		// Only show bottom-border indicator if hovering on the list itself (not a child node)
		if (e.target === listEl || e.target.closest('#timeline-list') === listEl) {
			listEl.classList.add('drop-target')
		}
	})
	listEl.addEventListener('dragleave', (e) => {
		if (!listEl.contains(e.relatedTarget)) {
			listEl.classList.remove('drop-target')
		}
	})
	listEl.addEventListener('drop', (e) => {
		listEl.classList.remove('drop-target')
		// Only handle drops directly on the list (not on child rows, which have their own handler)
		const row = e.target.closest('.timeline-node')
		if (row) return

		e.preventDefault()
		const scene = state.currentScene
		if (!scene) return

		try {
			const data = JSON.parse(e.dataTransfer.getData('text/plain'))
			if (data.type === 'new-element') {
				state.addTimelineNode(scene.id, { type: data.nodeType })
			}
		} catch {
			// Not a valid drag
		}
	})
}

/**
 * Attach drag-start handler to a node row (for reordering).
 * @param {HTMLElement} row - The row element
 * @param {number} index - The node's index in the timeline
 */
export function attachDragStart(row, index) {
	row.addEventListener('dragstart', (e) => {
		e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'timeline-node', index }))
		e.dataTransfer.effectAllowed = 'move'
	})
}

/**
 * Attach drag-over, drag-leave, and drop handlers to a node row (for reordering and inserting).
 * @param {HTMLElement} row - The row element
 * @param {number} index - The node's index in the timeline
 * @param {object} scene - The current scene
 * @param {object} state - EditorState instance
 */
export function attachDropTarget(row, index, scene, state) {
	row.addEventListener('dragover', (e) => {
		e.preventDefault()
		e.stopPropagation()
		row.style.borderTop = '2px solid var(--accent)'
	})
	row.addEventListener('dragleave', () => {
		row.style.borderTop = ''
	})
	row.addEventListener('drop', (e) => {
		e.preventDefault()
		row.style.borderTop = ''
		try {
			const data = JSON.parse(e.dataTransfer.getData('text/plain'))
			if (data.type === 'timeline-node' && data.index !== index) {
				state.reorderTimelineNode(scene.id, data.index, index)
			} else if (data.type === 'new-element') {
				state.addTimelineNode(scene.id, { type: data.nodeType }, index)
			}
		} catch {
			// Not a valid drag
		}
	})
}
