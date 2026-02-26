export class PanelResizer {
	#config
	#root
	#handles = []
	#activeHandle = null
	#startPos = 0
	#startSize = 0

	// Default panel sizes
	static defaults = {
		panelLeftWidth: 260,
		panelRightWidth: 280,
		panelBottomHeight: 220
	}

	// Constraints
	static constraints = {
		panelLeftWidth: { min: 150, max: 500 },
		panelRightWidth: { min: 150, max: 500 },
		panelBottomHeight: { min: 80, max: 500 }
	}

	// Arrow function handlers to preserve `this` for private field access
	#onMouseMove = (e) => {
		if (!this.#activeHandle) return
		const pos = this.#activeHandle.direction === 'col' ? e.clientX : e.clientY
		this.#updateSize(pos)
	}

	#onMouseUp = () => {
		this.#endDrag()
	}

	#onTouchMove = (e) => {
		if (!this.#activeHandle) return
		e.preventDefault()
		const touch = e.touches[0]
		const pos = this.#activeHandle.direction === 'col' ? touch.clientX : touch.clientY
		this.#updateSize(pos)
	}

	#onTouchEnd = () => {
		this.#endDrag()
	}

	constructor(config) {
		this.#config = config
		this.#root = document.getElementById('editor-root')

		this.#setupHandle('resize-left', 'panelLeftWidth', 'col')
		this.#setupHandle('resize-right', 'panelRightWidth', 'col')
		this.#setupHandle('resize-bottom', 'panelBottomHeight', 'row')

		this.#restoreSizes()
	}

	#setupHandle(elementId, sizeKey, direction) {
		const el = document.getElementById(elementId)
		if (!el) return

		const handle = { el, sizeKey, direction }
		this.#handles.push(handle)

		// Mouse events
		el.addEventListener('mousedown', (e) => {
			e.preventDefault()
			this.#startDrag(handle, direction === 'col' ? e.clientX : e.clientY)
		})

		// Touch events
		el.addEventListener('touchstart', (e) => {
			e.preventDefault()
			const touch = e.touches[0]
			this.#startDrag(handle, direction === 'col' ? touch.clientX : touch.clientY)
		}, { passive: false })

		// Double-click to reset
		el.addEventListener('dblclick', () => {
			this.#resetSize(sizeKey)
		})
	}

	#startDrag(handle, startPos) {
		this.#activeHandle = handle
		this.#startPos = startPos
		this.#startSize = this.#getCurrentSize(handle.sizeKey)

		handle.el.classList.add('active')

		if (handle.direction === 'col') {
			document.body.classList.add('resizing')
		} else {
			document.body.classList.add('resizing-row')
		}

		// Attach move/end listeners
		document.addEventListener('mousemove', this.#onMouseMove)
		document.addEventListener('mouseup', this.#onMouseUp)
		document.addEventListener('touchmove', this.#onTouchMove, { passive: false })
		document.addEventListener('touchend', this.#onTouchEnd)
	}

	#updateSize(currentPos) {
		const handle = this.#activeHandle
		if (!handle) return

		const delta = currentPos - this.#startPos
		let newSize

		switch (handle.sizeKey) {
			case 'panelLeftWidth':
				// Dragging right = bigger
				newSize = this.#startSize + delta
				break
			case 'panelRightWidth':
				// Dragging left = bigger (right panel grows opposite)
				newSize = this.#startSize - delta
				break
			case 'panelBottomHeight':
				// Dragging up = bigger (bottom panel grows upward)
				newSize = this.#startSize - delta
				break
		}

		const { min, max } = PanelResizer.constraints[handle.sizeKey]
		newSize = Math.max(min, Math.min(max, newSize))

		this.#applySize(handle.sizeKey, newSize)
	}

	#endDrag() {
		if (!this.#activeHandle) return

		this.#activeHandle.el.classList.remove('active')

		document.body.classList.remove('resizing')
		document.body.classList.remove('resizing-row')

		// Save current size
		const size = this.#getCurrentSize(this.#activeHandle.sizeKey)
		this.#config.set(this.#activeHandle.sizeKey, size)

		this.#activeHandle = null

		// Remove listeners
		document.removeEventListener('mousemove', this.#onMouseMove)
		document.removeEventListener('mouseup', this.#onMouseUp)
		document.removeEventListener('touchmove', this.#onTouchMove)
		document.removeEventListener('touchend', this.#onTouchEnd)
	}

	#getCurrentSize(sizeKey) {
		const varName = this.#sizeKeyToCssVar(sizeKey)
		const value = getComputedStyle(this.#root).getPropertyValue(varName)
		return parseInt(value, 10) || PanelResizer.defaults[sizeKey]
	}

	#applySize(sizeKey, px) {
		const varName = this.#sizeKeyToCssVar(sizeKey)
		this.#root.style.setProperty(varName, px + 'px')
	}

	#resetSize(sizeKey) {
		const defaultSize = PanelResizer.defaults[sizeKey]
		this.#applySize(sizeKey, defaultSize)
		this.#config.set(sizeKey, defaultSize)
	}

	#restoreSizes() {
		for (const key of Object.keys(PanelResizer.defaults)) {
			const saved = this.#config.get(key)
			if (saved != null) {
				const { min, max } = PanelResizer.constraints[key]
				const clamped = Math.max(min, Math.min(max, saved))
				this.#applySize(key, clamped)
			}
		}
	}

	#sizeKeyToCssVar(sizeKey) {
		// panelLeftWidth -> --panel-left-width
		return '--' + sizeKey.replace(/([A-Z])/g, '-$1').toLowerCase()
	}
}
