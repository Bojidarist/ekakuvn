import { buildEditFields, collectEditFields } from './timeline/nodeEditForms.js'
import { nodeTypes, elementOrder, friendlyTypeName, getNodeSummary } from './timeline/nodeSummary.js'
import { setupListDropZone, attachDragStart, attachDropTarget } from './timeline/dragReorder.js'

export class TimelineEditor {
	#state = null
	#listEl = null
	#elementsEl = null
	#editingNodeId = null
	#selectedNodeId = null

	constructor(state) {
		this.#state = state
		this.#listEl = document.getElementById('timeline-list')
		this.#elementsEl = document.getElementById('timeline-elements')

		this.#buildElementsPanel()
		setupListDropZone(this.#listEl, this.#state)

		this.#state.on('timelineChanged', () => this.render())
		this.#state.on('sceneChanged', () => {
			this.#editingNodeId = null
			this.#selectedNodeId = null
			this.#emitPreview(null)
			this.render()
		})
		this.#state.on('projectChanged', () => {
			this.#editingNodeId = null
			this.#selectedNodeId = null
			this.#emitPreview(null)
			this.render()
		})

		this.render()
	}

	#emitPreview(nodeIndex) {
		this.#state.emit('timelinePreviewChanged', nodeIndex)
	}

	#buildElementsPanel() {
		for (const type of elementOrder) {
			const meta = nodeTypes[type]
			const btn = document.createElement('button')
			btn.className = 'timeline-element-btn'
			btn.draggable = true
			btn.style.setProperty('--node-color', meta.color)
			btn.innerHTML = `<span class="element-icon">${meta.icon}</span><span class="element-label">${friendlyTypeName(type)}</span>`
			btn.title = `Add ${friendlyTypeName(type)} node`
			btn.addEventListener('click', () => {
				const scene = this.#state.currentScene
				if (!scene) return
				const insertIdx = this.#selectedNodeId
					? scene.timeline.findIndex(n => n.id === this.#selectedNodeId) + 1
					: undefined
				this.#state.addTimelineNode(scene.id, { type }, insertIdx)
			})
			btn.addEventListener('dragstart', (e) => {
				e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'new-element', nodeType: type }))
				e.dataTransfer.effectAllowed = 'copy'
			})
			this.#elementsEl.appendChild(btn)
		}
	}

	render() {
		this.#listEl.innerHTML = ''
		const scene = this.#state.currentScene
		if (!scene) {
			this.#renderEmpty('Select a scene to edit timeline')
			return
		}

		if (!scene.timeline || scene.timeline.length === 0) {
			this.#renderEmpty('No timeline nodes. Use the Elements panel to add nodes.')
			return
		}

		for (let i = 0; i < scene.timeline.length; i++) {
			const node = scene.timeline[i]
			if (this.#editingNodeId === node.id) {
				this.#renderNodeEdit(i, node, scene)
			} else {
				this.#renderNodeRow(i, node, scene)
			}
		}
	}

	// --- Node row (display mode) ---

	#renderNodeRow(index, node, scene) {
		const meta = nodeTypes[node.type] ?? { label: '?', color: '#555', icon: '?' }
		const row = document.createElement('div')
		row.className = 'timeline-node'
		if (this.#selectedNodeId === node.id) row.className += ' active'
		row.draggable = true
		row.style.setProperty('--node-color', meta.color)

		// Color bar
		const bar = document.createElement('div')
		bar.className = 'node-color-bar'

		// Type badge
		const badge = document.createElement('span')
		badge.className = 'node-badge'
		badge.textContent = `[${meta.label}]`

		// Summary text
		const summary = document.createElement('span')
		summary.className = 'node-summary'
		summary.textContent = getNodeSummary(node, this.#state)

		// Auto indicator
		const autoEl = document.createElement('span')
		autoEl.className = 'node-auto'
		if (node.auto) {
			autoEl.textContent = 'auto'
			autoEl.title = 'Auto-advance (no click needed)'
		} else {
			autoEl.innerHTML = '&#9744;'
			autoEl.title = 'Manual (waits for click)'
		}

		// Delay indicator (only if > 0)
		const delayEl = document.createElement('span')
		delayEl.className = 'node-delay'
		if (node.delay > 0) {
			delayEl.textContent = `+${node.delay}ms`
			delayEl.title = `Delay ${node.delay}ms before next node`
		}

		// Actions
		const actions = document.createElement('span')
		actions.className = 'node-actions'

		const dupBtn = this.#createActionBtn('\u2398', 'Duplicate')
		dupBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#state.duplicateTimelineNode(scene.id, node.id)
		})

		const delBtn = this.#createActionBtn('\u2715', 'Delete')
		delBtn.classList.add('node-action-btn-danger')
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#state.removeTimelineNode(scene.id, node.id)
		})

		actions.appendChild(dupBtn)
		actions.appendChild(delBtn)

		row.appendChild(bar)
		row.appendChild(badge)
		row.appendChild(summary)
		if (node.delay > 0) row.appendChild(delayEl)
		row.appendChild(autoEl)
		row.appendChild(actions)

		// Click to select for preview
		row.addEventListener('click', () => {
			this.#selectedNodeId = node.id
			this.#emitPreview(index)
			this.#state.selectElement(node.id)
			this.render()
		})

		// Double-click to edit
		row.addEventListener('dblclick', () => {
			this.#editingNodeId = node.id
			this.render()
		})

		// Drag reorder
		attachDragStart(row, index)
		attachDropTarget(row, index, scene, this.#state)

		this.#listEl.appendChild(row)
	}

	// --- Node edit form ---

	#renderNodeEdit(index, node, scene) {
		const meta = nodeTypes[node.type] ?? { label: '?', color: '#555', icon: '?' }
		const form = document.createElement('div')
		form.className = 'timeline-node active editing'
		form.style.setProperty('--node-color', meta.color)

		// Color bar
		const bar = document.createElement('div')
		bar.className = 'node-color-bar'

		// Header
		const header = document.createElement('div')
		header.className = 'node-edit-header'
		header.textContent = friendlyTypeName(node.type)

		form.appendChild(bar)
		form.appendChild(header)

		// Type-specific fields
		const fieldsContainer = document.createElement('div')
		fieldsContainer.className = 'node-edit-fields'

		const fields = buildEditFields(node, scene, this.#state)
		for (const field of fields) {
			fieldsContainer.appendChild(field)
		}

		form.appendChild(fieldsContainer)

		// Common fields: auto + delay
		const commonRow = document.createElement('div')
		commonRow.className = 'node-edit-common'

		const autoLabel = document.createElement('label')
		autoLabel.className = 'node-edit-checkbox'
		const autoCheck = document.createElement('input')
		autoCheck.type = 'checkbox'
		autoCheck.checked = node.auto
		autoLabel.appendChild(autoCheck)
		autoLabel.appendChild(document.createTextNode(' Auto-advance'))

		const delayLabel = document.createElement('label')
		delayLabel.className = 'node-edit-delay-label'
		delayLabel.textContent = 'Delay (ms)'
		const delayInput = document.createElement('input')
		delayInput.type = 'number'
		delayInput.min = '0'
		delayInput.step = '100'
		delayInput.value = node.delay
		delayInput.className = 'node-edit-delay'

		commonRow.appendChild(autoLabel)
		commonRow.appendChild(delayLabel)
		commonRow.appendChild(delayInput)

		form.appendChild(commonRow)

		// Button row
		const btnRow = document.createElement('div')
		btnRow.className = 'node-edit-buttons'

		const saveBtn = document.createElement('button')
		saveBtn.textContent = 'Done'
		saveBtn.addEventListener('click', () => {
			const updates = {
				auto: autoCheck.checked,
				delay: Math.max(0, parseInt(delayInput.value) || 0),
				data: collectEditFields(node.type, fieldsContainer, node.data)
			}
			this.#state.updateTimelineNode(scene.id, node.id, updates)
			this.#selectedNodeId = node.id
			this.#emitPreview(index)
			this.#editingNodeId = null
			this.render()
		})

		const cancelBtn = document.createElement('button')
		cancelBtn.textContent = 'Cancel'
		cancelBtn.addEventListener('click', () => {
			this.#editingNodeId = null
			this.render()
		})

		btnRow.appendChild(cancelBtn)
		btnRow.appendChild(saveBtn)

		form.appendChild(btnRow)
		this.#listEl.appendChild(form)
	}

	// --- Helpers ---

	#renderEmpty(message) {
		const el = document.createElement('div')
		el.textContent = message
		el.className = 'timeline-empty'
		this.#listEl.appendChild(el)
	}

	#createActionBtn(icon, title) {
		const btn = document.createElement('button')
		btn.textContent = icon
		btn.title = title
		btn.className = 'node-action-btn'
		return btn
	}
}
