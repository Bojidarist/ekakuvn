/**
 * Inline editing forms for each timeline node type.
 * Stateless — all functions take the node data and state as parameters.
 */

/**
 * Build type-specific edit fields for a timeline node.
 * @param {object} node - The timeline node
 * @param {object} scene - The current scene
 * @param {object} state - EditorState instance (for asset/scene lookups)
 * @returns {HTMLElement[]}
 */
export function buildEditFields(node, scene, state) {
	switch (node.type) {
		case 'dialogue': return buildDialogueFields(node)
		case 'showCharacter': return buildShowCharacterFields(node, state)
		case 'hideCharacter': return buildHideCharacterFields(node)
		case 'expression': return buildExpressionFields(node)
		case 'background': return buildAssetFields(node, 'background', state)
		case 'music': return buildMusicFields(node, state)
		case 'sound': return buildAssetFields(node, 'sound', state)
		case 'wait': return buildWaitFields(node)
		case 'choice': return buildChoiceFields(node, scene, state)
		case 'video': return buildVideoFields(node, state)
		default: return []
	}
}

/**
 * Collect form values from the edit fields container.
 * @param {string} type - Node type
 * @param {HTMLElement} container - The fields container element
 * @param {object} originalData - Original node data (for preserving non-editable fields)
 * @returns {object}
 */
export function collectEditFields(type, container, originalData = {}) {
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

		case 'video':
			return {
				assetId: val('assetId') || null,
				loop: checked('loop'),
				volume: Math.min(1, Math.max(0, parseFloat(val('volume')) || 1.0))
			}

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

// --- Field helpers ---

function makeField(labelText, buildInput) {
	const wrapper = document.createElement('div')
	wrapper.className = 'node-edit-field'

	const label = document.createElement('label')
	label.textContent = labelText

	const input = buildInput()
	wrapper.appendChild(label)
	wrapper.appendChild(input)
	return wrapper
}

// --- Per-type field builders ---

function buildDialogueFields(node) {
	const fields = []

	fields.push(makeField('Speaker', () => {
		const input = document.createElement('input')
		input.type = 'text'
		input.value = node.data.speaker ?? ''
		input.placeholder = '(narrator)'
		input.dataset.field = 'speaker'
		return input
	}))

	fields.push(makeField('Text', () => {
		const input = document.createElement('textarea')
		input.value = node.data.text ?? ''
		input.placeholder = 'Dialogue text...'
		input.rows = 2
		input.dataset.field = 'text'
		return input
	}))

	return fields
}

function buildShowCharacterFields(node, state) {
	const fields = []

	fields.push(makeField('Name', () => {
		const input = document.createElement('input')
		input.type = 'text'
		input.value = node.data.name ?? ''
		input.placeholder = 'Character name'
		input.dataset.field = 'name'
		return input
	}))

	fields.push(makeField('Asset', () => {
		const select = document.createElement('select')
		select.dataset.field = 'assetId'
		const emptyOpt = document.createElement('option')
		emptyOpt.value = ''
		emptyOpt.textContent = '(none)'
		select.appendChild(emptyOpt)

		for (const asset of state.getAssetsByType('character')) {
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
	posRow.appendChild(makeField('Pos X', () => {
		const input = document.createElement('input')
		input.type = 'number'
		input.step = '0.05'
		input.min = '0'
		input.max = '1'
		input.value = node.data.position?.x ?? 0.5
		input.dataset.field = 'posX'
		return input
	}))
	posRow.appendChild(makeField('Pos Y', () => {
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
	scaleRow.appendChild(makeField('Scale', () => {
		const input = document.createElement('input')
		input.type = 'number'
		input.step = '0.1'
		input.min = '0.1'
		input.value = node.data.scale ?? 1.0
		input.dataset.field = 'scale'
		return input
	}))
	scaleRow.appendChild(makeField('Flipped', () => {
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

function buildHideCharacterFields(node) {
	const fields = []

	fields.push(makeField('Character Name', () => {
		const input = document.createElement('input')
		input.type = 'text'
		input.value = node.data.name ?? ''
		input.placeholder = 'Character to hide'
		input.dataset.field = 'name'
		return input
	}))

	return fields
}

function buildExpressionFields(node) {
	const fields = []

	fields.push(makeField('Character Name', () => {
		const input = document.createElement('input')
		input.type = 'text'
		input.value = node.data.name ?? ''
		input.placeholder = 'Character name'
		input.dataset.field = 'name'
		return input
	}))

	fields.push(makeField('Expression', () => {
		const input = document.createElement('input')
		input.type = 'text'
		input.value = node.data.expression ?? ''
		input.placeholder = 'Expression name'
		input.dataset.field = 'expression'
		return input
	}))

	return fields
}

function buildAssetFields(node, assetType, state) {
	const fields = []

	fields.push(makeField('Asset', () => {
		const select = document.createElement('select')
		select.dataset.field = 'assetId'
		const emptyOpt = document.createElement('option')
		emptyOpt.value = ''
		emptyOpt.textContent = '(none)'
		select.appendChild(emptyOpt)

		for (const asset of state.getAssetsByType(assetType)) {
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

function buildMusicFields(node, state) {
	const fields = buildAssetFields(node, 'music', state)

	const actionRow = document.createElement('div')
	actionRow.className = 'node-edit-row'

	actionRow.appendChild(makeField('Action', () => {
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

	actionRow.appendChild(makeField('Loop', () => {
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

function buildWaitFields(node) {
	const fields = []

	fields.push(makeField('Duration (ms)', () => {
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

function buildChoiceFields(node, scene, state) {	const fields = []
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
		for (const s of state.scenes) {
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

function buildVideoFields(node, state) {
	const fields = []

	fields.push(makeField('Asset', () => {
		const select = document.createElement('select')
		select.dataset.field = 'assetId'
		const emptyOpt = document.createElement('option')
		emptyOpt.value = ''
		emptyOpt.textContent = '(none)'
		select.appendChild(emptyOpt)

		for (const asset of state.getAssetsByType('video')) {
			const opt = document.createElement('option')
			opt.value = asset.id
			opt.textContent = asset.name || asset.id
			if (asset.id === node.data.assetId) opt.selected = true
			select.appendChild(opt)
		}
		return select
	}))

	const optionsRow = document.createElement('div')
	optionsRow.className = 'node-edit-row'

	optionsRow.appendChild(makeField('Loop', () => {
		const label = document.createElement('label')
		label.className = 'node-edit-checkbox'
		const check = document.createElement('input')
		check.type = 'checkbox'
		check.checked = node.data.loop ?? false
		check.dataset.field = 'loop'
		label.appendChild(check)
		label.appendChild(document.createTextNode(' Loop'))
		return label
	}))

	optionsRow.appendChild(makeField('Volume', () => {
		const input = document.createElement('input')
		input.type = 'number'
		input.step = '0.1'
		input.min = '0'
		input.max = '1'
		input.value = node.data.volume ?? 1.0
		input.dataset.field = 'volume'
		return input
	}))

	fields.push(optionsRow)

	return fields
}
