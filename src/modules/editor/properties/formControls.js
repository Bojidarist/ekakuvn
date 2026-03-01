/**
 * Reusable form control builders for the properties panel.
 * Provides labeled inputs, selects, checkboxes, readonly displays, and row layouts.
 */

export function addGroup(container, label, type, value, onChange, attrs = {}) {
	const group = document.createElement('div')
	group.className = 'prop-group'

	const lbl = document.createElement('label')
	lbl.textContent = label
	group.appendChild(lbl)

	const input = document.createElement('input')
	input.type = type
	input.value = value ?? ''
	for (const [k, v] of Object.entries(attrs)) {
		input.setAttribute(k, v)
	}
	input.addEventListener('change', () => onChange(input.value))
	group.appendChild(input)

	container.appendChild(group)
}

export function addSelect(container, label, currentValue, options, onChange) {
	const group = document.createElement('div')
	group.className = 'prop-group'

	const lbl = document.createElement('label')
	lbl.textContent = label
	group.appendChild(lbl)

	const select = document.createElement('select')
	const emptyOpt = document.createElement('option')
	emptyOpt.value = ''
	emptyOpt.textContent = '(none)'
	select.appendChild(emptyOpt)

	for (const opt of options) {
		const o = document.createElement('option')
		o.value = opt.id
		o.textContent = opt.name ?? opt.id
		if (opt.id === currentValue) o.selected = true
		select.appendChild(o)
	}

	select.addEventListener('change', () => onChange(select.value))
	group.appendChild(select)

	container.appendChild(group)
}

export function addCheckbox(container, label, checked, onChange) {
	const group = document.createElement('div')
	group.className = 'prop-group'

	const lbl = document.createElement('label')
	lbl.className = 'checkbox-label'

	const input = document.createElement('input')
	input.type = 'checkbox'
	input.checked = checked
	input.addEventListener('change', () => onChange(input.checked))

	lbl.appendChild(input)
	lbl.appendChild(document.createTextNode(label))
	group.appendChild(lbl)

	container.appendChild(group)
}

export function addReadonly(container, label, value) {
	const group = document.createElement('div')
	group.className = 'prop-group'

	const lbl = document.createElement('label')
	lbl.textContent = label
	group.appendChild(lbl)

	const span = document.createElement('div')
	span.textContent = value
	span.className = 'props-placeholder-text'
	group.appendChild(span)

	container.appendChild(group)
}

export function addRow(container, fields) {
	const row = document.createElement('div')
	row.className = 'prop-row'

	for (const field of fields) {
		const group = document.createElement('div')
		group.className = 'prop-group'

		const lbl = document.createElement('label')
		lbl.textContent = field.label
		group.appendChild(lbl)

		const input = document.createElement('input')
		input.type = field.type
		input.value = field.value ?? ''
		if (field.step) input.step = field.step
		if (field.min) input.min = field.min
		if (field.max) input.max = field.max
		input.addEventListener('change', () => field.onChange(input.value))
		group.appendChild(input)

		row.appendChild(group)
	}

	container.appendChild(row)
}
