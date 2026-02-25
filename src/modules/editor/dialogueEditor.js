export class DialogueEditor {
	#state = null
	#listEl = null
	#editingIndex = null
	#editingType = null // 'dialogue' or 'choice'
	#selectedDialogueIndex = null

	constructor(state) {
		this.#state = state
		this.#listEl = document.getElementById('dialogue-list')

		document.getElementById('btn-add-dialogue').addEventListener('click', () => {
			const scene = this.#state.currentScene
			if (!scene) return
			this.#state.addDialogue(scene.id, { speaker: '', text: '' })
		})

		document.getElementById('btn-add-choice').addEventListener('click', () => {
			const scene = this.#state.currentScene
			if (!scene) return
			this.#state.addChoice(scene.id, { text: '', targetSceneId: null })
		})

		this.#state.on('dialogueChanged', () => this.render())
		this.#state.on('sceneChanged', () => {
			this.#editingIndex = null
			this.#editingType = null
			this.#selectedDialogueIndex = null
			this.#emitPreview(null)
			this.render()
		})
		this.#state.on('projectChanged', () => {
			this.#editingIndex = null
			this.#editingType = null
			this.#selectedDialogueIndex = null
			this.#emitPreview(null)
			this.render()
		})

		this.render()
	}

	#emitPreview(data) {
		this.#state.emit('dialoguePreviewChanged', data)
	}

	render() {
		this.#listEl.innerHTML = ''
		const scene = this.#state.currentScene
		if (!scene) {
			this.#renderEmpty('Select a scene to edit dialogue')
			return
		}

		// Render dialogue lines
		for (let i = 0; i < scene.dialogue.length; i++) {
			const entry = scene.dialogue[i]
			if (this.#editingIndex === i && this.#editingType === 'dialogue') {
				this.#renderDialogueEdit(i, entry, scene)
			} else {
				this.#renderDialogueRow(i, entry, scene)
			}
		}

		// Separator before choices if both exist
		if (scene.dialogue.length > 0 && scene.choices && scene.choices.length > 0) {
			const sep = document.createElement('div')
			sep.style.cssText = 'height: 1px; background: var(--border-color); margin: 8px 0;'
			this.#listEl.appendChild(sep)

			const label = document.createElement('div')
			label.textContent = 'Choices (branching)'
			label.style.cssText = 'font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; padding: 0 4px 4px;'
			this.#listEl.appendChild(label)
		}

		// Render choices
		if (scene.choices) {
			for (let i = 0; i < scene.choices.length; i++) {
				const choice = scene.choices[i]
				if (this.#editingIndex === i && this.#editingType === 'choice') {
					this.#renderChoiceEdit(i, choice, scene)
				} else {
					this.#renderChoiceRow(i, choice, scene)
				}
			}
		}

		if (scene.dialogue.length === 0 && (!scene.choices || scene.choices.length === 0)) {
			this.#renderEmpty('No dialogue yet. Click "+ Line" or "+ Choice" to add.')
		}
	}

	// --- Dialogue rows ---

	#renderDialogueRow(index, entry, scene) {
		const row = document.createElement('div')
		row.className = 'dialogue-entry'
		if (this.#selectedDialogueIndex === index) row.className += ' active'
		row.draggable = true

		// Index
		const indexEl = document.createElement('span')
		indexEl.className = 'entry-index'
		indexEl.textContent = String(index + 1)

		// Speaker
		const speakerEl = document.createElement('span')
		speakerEl.className = 'entry-speaker'
		speakerEl.textContent = entry.speaker || '(narrator)'

		// Text (with expression badge if set)
		const textEl = document.createElement('span')
		textEl.className = 'entry-text'
		if (entry.expression) {
			const badge = document.createElement('span')
			badge.textContent = entry.expression
			badge.style.cssText = 'display: inline-block; background: var(--accent); color: var(--bg-dark); font-size: 10px; padding: 1px 5px; border-radius: 3px; margin-right: 6px; font-weight: 500; vertical-align: middle;'
			textEl.appendChild(badge)
			textEl.appendChild(document.createTextNode(entry.text || '(empty)'))
		} else {
			textEl.textContent = entry.text || '(empty)'
		}
		if (!entry.text) textEl.style.color = 'var(--text-secondary)'

		// Actions
		const actions = document.createElement('span')
		actions.className = 'entry-actions'

		const editBtn = this.#createActionBtn('\u270E', 'Edit')
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#editingIndex = index
			this.#editingType = 'dialogue'
			this.render()
		})

		const upBtn = this.#createActionBtn('\u2191', 'Move up')
		upBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			if (index > 0) this.#state.reorderDialogue(scene.id, index, index - 1)
		})

		const downBtn = this.#createActionBtn('\u2193', 'Move down')
		downBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			if (index < scene.dialogue.length - 1) this.#state.reorderDialogue(scene.id, index, index + 1)
		})

		const delBtn = this.#createActionBtn('\u2715', 'Delete')
		delBtn.style.color = 'var(--danger)'
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#state.removeDialogue(scene.id, index)
		})

		actions.appendChild(editBtn)
		actions.appendChild(upBtn)
		actions.appendChild(downBtn)
		actions.appendChild(delBtn)

		row.appendChild(indexEl)
		row.appendChild(speakerEl)
		row.appendChild(textEl)
		row.appendChild(actions)

		// Click to select for preview
		row.addEventListener('click', () => {
			this.#selectedDialogueIndex = index
			this.#emitPreview({
				speaker: entry.speaker || null,
				text: entry.text || '',
				expression: entry.expression || null
			})
			this.render()
		})

		// Double-click to edit
		row.addEventListener('dblclick', () => {
			this.#editingIndex = index
			this.#editingType = 'dialogue'
			this.render()
		})

		// Drag reorder
		row.addEventListener('dragstart', (e) => {
			e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'dialogue', index }))
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
				if (data.type === 'dialogue' && data.index !== index) {
					this.#state.reorderDialogue(scene.id, data.index, index)
				}
			} catch {
				// Not a valid drag
			}
		})

		this.#listEl.appendChild(row)
	}

	#renderDialogueEdit(index, entry, scene) {
		const form = document.createElement('div')
		form.className = 'dialogue-entry active'
		form.style.flexDirection = 'column'
		form.style.gap = '6px'

		// Speaker row
		const speakerRow = document.createElement('div')
		speakerRow.style.cssText = 'display: flex; gap: 8px; align-items: center;'

		const speakerLabel = document.createElement('label')
		speakerLabel.textContent = 'Speaker'
		speakerLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 52px;'

		const speakerInput = document.createElement('input')
		speakerInput.type = 'text'
		speakerInput.value = entry.speaker ?? ''
		speakerInput.placeholder = '(narrator)'
		speakerInput.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); font-size: 13px; outline: none;'

		speakerRow.appendChild(speakerLabel)
		speakerRow.appendChild(speakerInput)

		// Text row
		const textRow = document.createElement('div')
		textRow.style.cssText = 'display: flex; gap: 8px; align-items: flex-start;'

		const textLabel = document.createElement('label')
		textLabel.textContent = 'Text'
		textLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 52px; padding-top: 6px;'

		const textInput = document.createElement('textarea')
		textInput.value = entry.text ?? ''
		textInput.placeholder = 'Dialogue text...'
		textInput.rows = 2
		textInput.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); font-size: 13px; font-family: inherit; outline: none; resize: vertical; min-height: 40px;'

		textRow.appendChild(textLabel)
		textRow.appendChild(textInput)

		// Expression row
		const availableExpressions = this.#state.getSceneExpressions(scene.id)
		let exprRow = null
		let exprSelect = null

		if (availableExpressions.length > 0) {
			exprRow = document.createElement('div')
			exprRow.style.cssText = 'display: flex; gap: 8px; align-items: center;'

			const exprLabel = document.createElement('label')
			exprLabel.textContent = 'Expression'
			exprLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 52px;'

			exprSelect = document.createElement('select')
			exprSelect.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); font-size: 13px; outline: none;'

			const noneOpt = document.createElement('option')
			noneOpt.value = ''
			noneOpt.textContent = '(default)'
			exprSelect.appendChild(noneOpt)

			for (const name of availableExpressions) {
				const opt = document.createElement('option')
				opt.value = name
				opt.textContent = name
				if (name === entry.expression) opt.selected = true
				exprSelect.appendChild(opt)
			}

			exprRow.appendChild(exprLabel)
			exprRow.appendChild(exprSelect)
		}

		// Button row
		const btnRow = document.createElement('div')
		btnRow.style.cssText = 'display: flex; gap: 6px; justify-content: flex-end;'

		const saveBtn = document.createElement('button')
		saveBtn.textContent = 'Done'
		saveBtn.style.cssText = 'padding: 4px 12px; font-size: 12px;'
		saveBtn.addEventListener('click', () => {
			this.#state.updateDialogue(scene.id, index, {
				speaker: speakerInput.value || null,
				text: textInput.value,
				expression: exprSelect ? (exprSelect.value || null) : entry.expression
			})
			this.#selectedDialogueIndex = index
			this.#emitPreview({
				speaker: speakerInput.value || null,
				text: textInput.value,
				expression: exprSelect ? (exprSelect.value || null) : entry.expression
			})
			this.#editingIndex = null
			this.#editingType = null
			this.render()
		})

		const cancelBtn = document.createElement('button')
		cancelBtn.textContent = 'Cancel'
		cancelBtn.style.cssText = 'padding: 4px 12px; font-size: 12px;'
		cancelBtn.addEventListener('click', () => {
			this.#editingIndex = null
			this.#editingType = null
			this.render()
		})

		btnRow.appendChild(cancelBtn)
		btnRow.appendChild(saveBtn)

		form.appendChild(speakerRow)
		form.appendChild(textRow)
		if (exprRow) form.appendChild(exprRow)
		form.appendChild(btnRow)

		this.#listEl.appendChild(form)

		// Focus the text input
		textInput.focus()

		// Save on Ctrl+Enter
		textInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				saveBtn.click()
			}
		})
		speakerInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				textInput.focus()
			}
		})
	}

	// --- Choice rows ---

	#renderChoiceRow(index, choice, scene) {
		const row = document.createElement('div')
		row.className = 'dialogue-entry choice-entry'

		// Index
		const indexEl = document.createElement('span')
		indexEl.className = 'entry-index'
		indexEl.textContent = String.fromCharCode(65 + index) // A, B, C, ...

		// "Choice" label
		const speakerEl = document.createElement('span')
		speakerEl.className = 'entry-speaker'
		speakerEl.textContent = 'Choice'

		// Text + target
		const textEl = document.createElement('span')
		textEl.className = 'entry-text'
		const targetLabel = choice.targetSceneId ? ` \u2192 ${choice.targetSceneId}` : ''
		textEl.textContent = (choice.text || '(empty)') + targetLabel
		if (!choice.text) textEl.style.color = 'var(--text-secondary)'

		// Actions
		const actions = document.createElement('span')
		actions.className = 'entry-actions'

		const editBtn = this.#createActionBtn('\u270E', 'Edit')
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#editingIndex = index
			this.#editingType = 'choice'
			this.render()
		})

		const delBtn = this.#createActionBtn('\u2715', 'Delete')
		delBtn.style.color = 'var(--danger)'
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#state.removeChoice(scene.id, index)
		})

		actions.appendChild(editBtn)
		actions.appendChild(delBtn)

		row.appendChild(indexEl)
		row.appendChild(speakerEl)
		row.appendChild(textEl)
		row.appendChild(actions)

		// Double-click to edit
		row.addEventListener('dblclick', () => {
			this.#editingIndex = index
			this.#editingType = 'choice'
			this.render()
		})

		this.#listEl.appendChild(row)
	}

	#renderChoiceEdit(index, choice, scene) {
		const form = document.createElement('div')
		form.className = 'dialogue-entry choice-entry active'
		form.style.flexDirection = 'column'
		form.style.gap = '6px'

		// Text row
		const textRow = document.createElement('div')
		textRow.style.cssText = 'display: flex; gap: 8px; align-items: center;'

		const textLabel = document.createElement('label')
		textLabel.textContent = 'Text'
		textLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 52px;'

		const textInput = document.createElement('input')
		textInput.type = 'text'
		textInput.value = choice.text ?? ''
		textInput.placeholder = 'Choice text...'
		textInput.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); font-size: 13px; outline: none;'

		textRow.appendChild(textLabel)
		textRow.appendChild(textInput)

		// Target scene row
		const targetRow = document.createElement('div')
		targetRow.style.cssText = 'display: flex; gap: 8px; align-items: center;'

		const targetLabel = document.createElement('label')
		targetLabel.textContent = 'Target'
		targetLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 52px;'

		const targetSelect = document.createElement('select')
		targetSelect.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); font-size: 13px; outline: none;'

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

		targetRow.appendChild(targetLabel)
		targetRow.appendChild(targetSelect)

		// Button row
		const btnRow = document.createElement('div')
		btnRow.style.cssText = 'display: flex; gap: 6px; justify-content: flex-end;'

		const saveBtn = document.createElement('button')
		saveBtn.textContent = 'Done'
		saveBtn.style.cssText = 'padding: 4px 12px; font-size: 12px;'
		saveBtn.addEventListener('click', () => {
			this.#state.updateChoice(scene.id, index, {
				text: textInput.value,
				targetSceneId: targetSelect.value || null
			})
			this.#editingIndex = null
			this.#editingType = null
			this.render()
		})

		const cancelBtn = document.createElement('button')
		cancelBtn.textContent = 'Cancel'
		cancelBtn.style.cssText = 'padding: 4px 12px; font-size: 12px;'
		cancelBtn.addEventListener('click', () => {
			this.#editingIndex = null
			this.#editingType = null
			this.render()
		})

		btnRow.appendChild(cancelBtn)
		btnRow.appendChild(saveBtn)

		form.appendChild(textRow)
		form.appendChild(targetRow)
		form.appendChild(btnRow)

		this.#listEl.appendChild(form)

		// Focus the text input
		textInput.focus()

		// Save on Enter
		textInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				saveBtn.click()
			}
		})
	}

	// --- Helpers ---

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
