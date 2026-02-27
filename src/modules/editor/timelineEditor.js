export class TimelineEditor {
	#state = null
	#listEl = null
	#elementsEl = null
	#editingNodeId = null
	#selectedNodeId = null

	// Node type metadata for rendering
	#nodeTypes = {
		dialogue: { label: 'text', color: '#6b7280', icon: '\uD83D\uDCAC' },
		showCharacter: { label: 'char', color: '#991b1b', icon: '\uD83E\uDDCD' },
		hideCharacter: { label: 'char', color: '#7f1d1d', icon: '\uD83D\uDEAA' },
		expression: { label: 'expr', color: '#b91c1c', icon: '\uD83C\uDFAD' },
		background: { label: 'bg', color: '#5b2130', icon: '\uD83C\uDF04' },
		music: { label: 'music', color: '#1e40af', icon: '\uD83C\uDFB5' },
		sound: { label: 'sfx', color: '#1e3a8a', icon: '\uD83D\uDD0A' },
		wait: { label: 'wait', color: '#6b21a8', icon: '\u23F3' },
		choice: { label: 'choice', color: '#0d9488', icon: '\u2934' }
	}

	// Elements panel order
	#elementOrder = ['dialogue', 'showCharacter', 'hideCharacter', 'expression', 'background', 'music', 'sound', 'wait', 'choice']

	constructor(state) {
		this.#state = state
		this.#listEl = document.getElementById('timeline-list')
		this.#elementsEl = document.getElementById('timeline-elements')

		this.#buildElementsPanel()
		this.#setupListDropZone()

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
		for (const type of this.#elementOrder) {
			const meta = this.#nodeTypes[type]
			const btn = document.createElement('button')
			btn.className = 'timeline-element-btn'
			btn.draggable = true
			btn.style.setProperty('--node-color', meta.color)
			btn.innerHTML = `<span class="element-icon">${meta.icon}</span><span class="element-label">${this.#friendlyTypeName(type)}</span>`
			btn.title = `Add ${this.#friendlyTypeName(type)} node`
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

	#setupListDropZone() {
		this.#listEl.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.dataTransfer.dropEffect = 'copy'
			// Only show bottom-border indicator if hovering on the list itself (not a child node)
			if (e.target === this.#listEl || e.target.closest('#timeline-list') === this.#listEl) {
				this.#listEl.classList.add('drop-target')
			}
		})
		this.#listEl.addEventListener('dragleave', (e) => {
			if (!this.#listEl.contains(e.relatedTarget)) {
				this.#listEl.classList.remove('drop-target')
			}
		})
		this.#listEl.addEventListener('drop', (e) => {
			this.#listEl.classList.remove('drop-target')
			// Only handle drops directly on the list (not on child rows, which have their own handler)
			const row = e.target.closest('.timeline-node')
			if (row) return

			e.preventDefault()
			const scene = this.#state.currentScene
			if (!scene) return

			try {
				const data = JSON.parse(e.dataTransfer.getData('text/plain'))
				if (data.type === 'new-element') {
					this.#state.addTimelineNode(scene.id, { type: data.nodeType })
				}
			} catch {
				// Not a valid drag
			}
		})
	}

	#friendlyTypeName(type) {
		const names = {
			dialogue: 'Dialogue',
			showCharacter: 'Show Character',
			hideCharacter: 'Hide Character',
			expression: 'Expression',
			background: 'Background',
			music: 'Music',
			sound: 'Sound FX',
			wait: 'Wait',
			choice: 'Choice'
		}
		return names[type] ?? type
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
		const meta = this.#nodeTypes[node.type] ?? { label: '?', color: '#555', icon: '?' }
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
		summary.textContent = this.#getNodeSummary(node)

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
		delBtn.style.color = 'var(--danger)'
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
		row.addEventListener('dragstart', (e) => {
			e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'timeline-node', index }))
			e.dataTransfer.effectAllowed = 'move'
		})
		row.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.dataTransfer.dropEffect = 'move'
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
					this.#state.reorderTimelineNode(scene.id, data.index, index)
				} else if (data.type === 'new-element') {
					this.#state.addTimelineNode(scene.id, { type: data.nodeType }, index)
				}
			} catch {
				// Not a valid drag
			}
		})

		this.#listEl.appendChild(row)
	}

	// --- Node edit form ---

	#renderNodeEdit(index, node, scene) {
		const meta = this.#nodeTypes[node.type] ?? { label: '?', color: '#555', icon: '?' }
		const form = document.createElement('div')
		form.className = 'timeline-node active editing'
		form.style.setProperty('--node-color', meta.color)

		// Color bar
		const bar = document.createElement('div')
		bar.className = 'node-color-bar'

		// Header
		const header = document.createElement('div')
		header.className = 'node-edit-header'
		header.textContent = this.#friendlyTypeName(node.type)

		form.appendChild(bar)
		form.appendChild(header)

		// Type-specific fields
		const fieldsContainer = document.createElement('div')
		fieldsContainer.className = 'node-edit-fields'

		const fields = this.#buildEditFields(node, scene)
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
				data: this.#collectEditFields(node.type, fieldsContainer, node.data)
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

	// --- Edit field builders ---

	#buildEditFields(node, scene) {
		switch (node.type) {
			case 'dialogue': return this.#buildDialogueFields(node, scene)
			case 'showCharacter': return this.#buildShowCharacterFields(node, scene)
			case 'hideCharacter': return this.#buildHideCharacterFields(node, scene)
			case 'expression': return this.#buildExpressionFields(node, scene)
			case 'background': return this.#buildAssetFields(node, 'background')
			case 'music': return this.#buildMusicFields(node)
			case 'sound': return this.#buildAssetFields(node, 'sound')
			case 'wait': return this.#buildWaitFields(node)
			case 'choice': return this.#buildChoiceFields(node, scene)
			default: return []
		}
	}

	#buildDialogueFields(node, scene) {
		const fields = []

		fields.push(this.#makeField('Speaker', () => {
			const input = document.createElement('input')
			input.type = 'text'
			input.value = node.data.speaker ?? ''
			input.placeholder = '(narrator)'
			input.dataset.field = 'speaker'
			return input
		}))

		fields.push(this.#makeField('Text', () => {
			const input = document.createElement('textarea')
			input.value = node.data.text ?? ''
			input.placeholder = 'Dialogue text...'
			input.rows = 2
			input.dataset.field = 'text'
			return input
		}))

		return fields
	}

	#buildShowCharacterFields(node, scene) {
		const fields = []

		fields.push(this.#makeField('Name', () => {
			const input = document.createElement('input')
			input.type = 'text'
			input.value = node.data.name ?? ''
			input.placeholder = 'Character name'
			input.dataset.field = 'name'
			return input
		}))

		fields.push(this.#makeField('Asset', () => {
			const select = document.createElement('select')
			select.dataset.field = 'assetId'
			const emptyOpt = document.createElement('option')
			emptyOpt.value = ''
			emptyOpt.textContent = '(none)'
			select.appendChild(emptyOpt)

			for (const asset of this.#state.getAssetsByType('character')) {
				const opt = document.createElement('option')
				opt.value = asset.id
				opt.textContent = asset.name || asset.id
				if (asset.id === node.data.assetId) opt.selected = true
				select.appendChild(opt)
			}
			return select
		}))

		// Position X / Y
		const posRow = document.createElement('div')
		posRow.className = 'node-edit-row'
		posRow.appendChild(this.#makeField('Pos X', () => {
			const input = document.createElement('input')
			input.type = 'number'
			input.step = '0.05'
			input.min = '0'
			input.max = '1'
			input.value = node.data.position?.x ?? 0.5
			input.dataset.field = 'posX'
			return input
		}))
		posRow.appendChild(this.#makeField('Pos Y', () => {
			const input = document.createElement('input')
			input.type = 'number'
			input.step = '0.05'
			input.min = '0'
			input.max = '1'
			input.value = node.data.position?.y ?? 0.8
			input.dataset.field = 'posY'
			return input
		}))
		fields.push(posRow)

		// Scale + Flip
		const scaleRow = document.createElement('div')
		scaleRow.className = 'node-edit-row'
		scaleRow.appendChild(this.#makeField('Scale', () => {
			const input = document.createElement('input')
			input.type = 'number'
			input.step = '0.1'
			input.min = '0.1'
			input.value = node.data.scale ?? 1.0
			input.dataset.field = 'scale'
			return input
		}))
		scaleRow.appendChild(this.#makeField('Flipped', () => {
			const label = document.createElement('label')
			label.className = 'node-edit-checkbox'
			const check = document.createElement('input')
			check.type = 'checkbox'
			check.checked = node.data.flipped ?? false
			check.dataset.field = 'flipped'
			label.appendChild(check)
			label.appendChild(document.createTextNode(' Flip'))
			return label
		}))
		fields.push(scaleRow)

		return fields
	}

	#buildHideCharacterFields(node, scene) {
		const fields = []

		fields.push(this.#makeField('Character Name', () => {
			const input = document.createElement('input')
			input.type = 'text'
			input.value = node.data.name ?? ''
			input.placeholder = 'Character to hide'
			input.dataset.field = 'name'
			return input
		}))

		return fields
	}

	#buildExpressionFields(node, scene) {
		const fields = []

		fields.push(this.#makeField('Character Name', () => {
			const input = document.createElement('input')
			input.type = 'text'
			input.value = node.data.name ?? ''
			input.placeholder = 'Character name'
			input.dataset.field = 'name'
			return input
		}))

		fields.push(this.#makeField('Expression', () => {
			const input = document.createElement('input')
			input.type = 'text'
			input.value = node.data.expression ?? ''
			input.placeholder = 'Expression name'
			input.dataset.field = 'expression'
			return input
		}))

		return fields
	}

	#buildAssetFields(node, assetType) {
		const fields = []

		fields.push(this.#makeField('Asset', () => {
			const select = document.createElement('select')
			select.dataset.field = 'assetId'
			const emptyOpt = document.createElement('option')
			emptyOpt.value = ''
			emptyOpt.textContent = '(none)'
			select.appendChild(emptyOpt)

			for (const asset of this.#state.getAssetsByType(assetType)) {
				const opt = document.createElement('option')
				opt.value = asset.id
				opt.textContent = asset.name || asset.id
				if (asset.id === node.data.assetId) opt.selected = true
				select.appendChild(opt)
			}
			return select
		}))

		return fields
	}

	#buildMusicFields(node) {
		const fields = this.#buildAssetFields(node, 'music')

		const actionRow = document.createElement('div')
		actionRow.className = 'node-edit-row'

		actionRow.appendChild(this.#makeField('Action', () => {
			const select = document.createElement('select')
			select.dataset.field = 'action'
			for (const val of ['play', 'stop']) {
				const opt = document.createElement('option')
				opt.value = val
				opt.textContent = val.charAt(0).toUpperCase() + val.slice(1)
				if (val === (node.data.action ?? 'play')) opt.selected = true
				select.appendChild(opt)
			}
			return select
		}))

		actionRow.appendChild(this.#makeField('Loop', () => {
			const label = document.createElement('label')
			label.className = 'node-edit-checkbox'
			const check = document.createElement('input')
			check.type = 'checkbox'
			check.checked = node.data.loop ?? true
			check.dataset.field = 'loop'
			label.appendChild(check)
			label.appendChild(document.createTextNode(' Loop'))
			return label
		}))

		fields.push(actionRow)
		return fields
	}

	#buildWaitFields(node) {
		const fields = []

		fields.push(this.#makeField('Duration (ms)', () => {
			const input = document.createElement('input')
			input.type = 'number'
			input.min = '0'
			input.step = '100'
			input.value = node.data.duration ?? 1000
			input.dataset.field = 'duration'
			return input
		}))

		return fields
	}

	#buildChoiceFields(node, scene) {
		const fields = []
		const choices = node.data.choices ?? []

		for (let i = 0; i < choices.length; i++) {
			const choice = choices[i]
			const choiceRow = document.createElement('div')
			choiceRow.className = 'node-edit-choice-row'

			const textInput = document.createElement('input')
			textInput.type = 'text'
			textInput.value = choice.text ?? ''
			textInput.placeholder = `Choice ${i + 1} text`
			textInput.dataset.field = `choice-text-${i}`

			const targetSelect = document.createElement('select')
			targetSelect.dataset.field = `choice-target-${i}`
			const emptyOpt = document.createElement('option')
			emptyOpt.value = ''
			emptyOpt.textContent = '(none)'
			targetSelect.appendChild(emptyOpt)
			for (const s of this.#state.scenes) {
				if (s.id === scene.id) continue
				const opt = document.createElement('option')
				opt.value = s.id
				opt.textContent = s.id
				if (s.id === choice.targetSceneId) opt.selected = true
				targetSelect.appendChild(opt)
			}

			const removeBtn = document.createElement('button')
			removeBtn.textContent = '\u2715'
			removeBtn.title = 'Remove choice'
			removeBtn.className = 'node-edit-choice-remove'
			removeBtn.dataset.choiceIndex = i

			choiceRow.appendChild(textInput)
			choiceRow.appendChild(targetSelect)
			choiceRow.appendChild(removeBtn)
			fields.push(choiceRow)
		}

		// Add choice button
		const addBtn = document.createElement('button')
		addBtn.textContent = '+ Add Choice'
		addBtn.className = 'node-edit-add-choice'
		addBtn.dataset.field = 'add-choice'
		fields.push(addBtn)

		return fields
	}

	// --- Collect edit values ---

	#collectEditFields(type, container, originalData = {}) {
		const get = (field) => container.querySelector(`[data-field="${field}"]`)
		const val = (field) => get(field)?.value ?? ''
		const num = (field) => parseFloat(val(field)) || 0
		const checked = (field) => get(field)?.checked ?? false

		switch (type) {
			case 'dialogue':
				return { speaker: val('speaker') || null, text: val('text'), voiceAssetId: null }

			case 'showCharacter':
				return {
					name: val('name'),
					assetId: val('assetId') || null,
					position: { x: num('posX'), y: num('posY') },
					scale: num('scale') || 1.0,
					flipped: checked('flipped'),
					// Preserve expressions and enterAnimation that are not editable in timeline
					expressions: originalData.expressions ?? {},
					enterAnimation: originalData.enterAnimation ?? { type: 'none', duration: 0.4, delay: 0 }
				}

			case 'hideCharacter':
				return { name: val('name') }

			case 'expression':
				return { name: val('name'), expression: val('expression'), expressionAssetId: null }

			case 'background':
				return { assetId: val('assetId') || null }

			case 'music':
				return { assetId: val('assetId') || null, action: val('action') || 'play', loop: checked('loop') }

			case 'sound':
				return { assetId: val('assetId') || null }

			case 'wait':
				return { duration: Math.max(0, parseInt(val('duration')) || 0) }

			case 'choice': {
				const choices = []
				const rows = container.querySelectorAll('.node-edit-choice-row')
				rows.forEach((row, i) => {
					const text = row.querySelector(`[data-field="choice-text-${i}"]`)?.value ?? ''
					const target = row.querySelector(`[data-field="choice-target-${i}"]`)?.value || null
					choices.push({ text, targetSceneId: target })
				})
				// Handle add/remove via data attribute
				return { choices: choices.length > 0 ? choices : [{ text: '', targetSceneId: null }] }
			}

			default:
				return {}
		}
	}

	// --- Node summary text ---

	#getNodeSummary(node) {
		const d = node.data
		switch (node.type) {
			case 'dialogue': {
				const speaker = d.speaker || '(narrator)'
				const text = d.text ? (d.text.length > 40 ? d.text.slice(0, 40) + '...' : d.text) : '(empty)'
				return `${speaker}: ${text}`
			}
			case 'showCharacter':
				return `${d.name || '?'} (show)`
			case 'hideCharacter':
				return `${d.name || '?'} (hide)`
			case 'expression':
				return `${d.name || '?'} \u2192 ${d.expression || '?'}`
			case 'background': {
				const asset = d.assetId ? this.#state.assets.find(a => a.id === d.assetId) : null
				return asset ? (asset.name || asset.id) : '(none)'
			}
			case 'music': {
				if (d.action === 'stop') return 'Stop music'
				const asset = d.assetId ? this.#state.assets.find(a => a.id === d.assetId) : null
				return asset ? (asset.name || asset.id) : '(none)'
			}
			case 'sound': {
				const asset = d.assetId ? this.#state.assets.find(a => a.id === d.assetId) : null
				return asset ? (asset.name || asset.id) : '(none)'
			}
			case 'wait':
				return `Wait ${d.duration ?? 0}ms`
			case 'choice':
				return `${d.choices?.length ?? 0} choice(s)`
			default:
				return node.type
		}
	}

	// --- Helpers ---

	#makeField(labelText, buildInput) {
		const wrapper = document.createElement('div')
		wrapper.className = 'node-edit-field'

		const label = document.createElement('label')
		label.textContent = labelText

		const input = buildInput()
		wrapper.appendChild(label)
		wrapper.appendChild(input)
		return wrapper
	}

	#renderEmpty(message) {
		const el = document.createElement('div')
		el.textContent = message
		el.style.cssText = 'padding: 24px; text-align: center; color: var(--text-secondary); font-size: 13px;'
		this.#listEl.appendChild(el)
	}

	#createActionBtn(icon, title) {
		const btn = document.createElement('button')
		btn.textContent = icon
		btn.title = title
		btn.style.cssText = 'padding: 2px 6px; font-size: 11px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer;'
		btn.addEventListener('mouseenter', () => { btn.style.color = 'var(--text-primary)' })
		btn.addEventListener('mouseleave', () => { btn.style.color = 'var(--text-secondary)' })
		return btn
	}
}
