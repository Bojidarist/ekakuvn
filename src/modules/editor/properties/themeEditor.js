/**
 * Theme editor content builder.
 * Provides buildContent(container) for use by SettingsModal.
 */

export class ThemeEditor {
	#state = null

	constructor(state) {
		this.#state = state
	}

	buildContent(container) {
		const meta = this.#state.project.meta
		const theme = meta.theme ?? {}

		// --- Global Colors ---
		this.#addSection(container, 'Colors', 'Global palette used across all UI elements', (section) => {
			const colors = theme.colors ?? {}

			this.#addColor(section, 'Accent', colors.accent, '#ffcc00', (val) => {
				this.#updateTheme(meta, 'colors', 'accent', val, '#ffcc00')
			})
			this.#addColor(section, 'Primary text', colors.primary, '#ffffff', (val) => {
				this.#updateTheme(meta, 'colors', 'primary', val, '#ffffff')
			})
			this.#addColor(section, 'Background', colors.background, '#1a1a2e', (val) => {
				this.#updateTheme(meta, 'colors', 'background', val, '#1a1a2e')
			})
		})

		// --- Font ---
		this.#addSection(container, 'Font', 'Global font family applied to all text', (section) => {
			const fontFamilies = [
				{ id: 'sans-serif', name: 'Sans-serif (default)' },
				{ id: 'serif', name: 'Serif' },
				{ id: 'monospace', name: 'Monospace' },
				{ id: 'cursive', name: 'Cursive' },
				{ id: 'fantasy', name: 'Fantasy' }
			]
			this.#addSelect(section, 'Font family', theme.fontFamily ?? 'sans-serif', fontFamilies, (val) => {
				this.#updateRoot(meta, 'fontFamily', val || null, 'sans-serif')
			})
		})

		// --- Dialogue Box ---
		this.#addSection(container, 'Dialogue Box', 'Textbox shown during conversations', (section) => {
			const d = theme.dialogue ?? {}

			this.#addNumber(section, 'Box opacity', this.#parseAlpha(d.boxColor, 0.75), (val) => {
				const alpha = Math.max(0, Math.min(1, parseFloat(val) || 0.75))
				this.#updateTheme(meta, 'dialogue', 'boxColor', `rgba(0, 0, 0, ${alpha})`, 'rgba(0, 0, 0, 0.75)')
			}, { step: '0.05', min: '0', max: '1' })

			this.#addNumber(section, 'Corner radius', d.boxRadius ?? 12, (val) => {
				this.#updateTheme(meta, 'dialogue', 'boxRadius', parseInt(val) || 12, 12)
			}, { step: '1', min: '0', max: '30' })

			this.#addNumber(section, 'Box height', d.boxHeight ?? 180, (val) => {
				this.#updateTheme(meta, 'dialogue', 'boxHeight', parseInt(val) || 180, 180)
			}, { step: '10', min: '100', max: '400' })

			this.#addNumber(section, 'Box margin', d.boxMargin ?? 20, (val) => {
				this.#updateTheme(meta, 'dialogue', 'boxMargin', parseInt(val) || 20, 20)
			}, { step: '5', min: '0', max: '60' })

			this.#addNumber(section, 'Box padding', d.boxPadding ?? 20, (val) => {
				this.#updateTheme(meta, 'dialogue', 'boxPadding', parseInt(val) || 20, 20)
			}, { step: '5', min: '5', max: '40' })

			this.#addNumber(section, 'Speaker size', d.speakerSize ?? 22, (val) => {
				this.#updateTheme(meta, 'dialogue', 'speakerSize', parseInt(val) || 22, 22)
			}, { step: '1', min: '12', max: '40' })

			this.#addNumber(section, 'Text size', d.textSize ?? 20, (val) => {
				this.#updateTheme(meta, 'dialogue', 'textSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '36' })

			this.#addNumber(section, 'Line height', d.textLineHeight ?? 28, (val) => {
				this.#updateTheme(meta, 'dialogue', 'textLineHeight', parseInt(val) || 28, 28)
			}, { step: '1', min: '16', max: '48' })

			this.#addNumber(section, 'Typewriter speed', d.typewriterSpeed ?? 30, (val) => {
				this.#updateTheme(meta, 'dialogue', 'typewriterSpeed', parseInt(val) || 30, 30)
			}, { step: '5', min: '0', max: '200' })

			this.#addCheckbox(section, 'Advance indicator', d.advanceIndicator ?? true, (val) => {
				this.#updateTheme(meta, 'dialogue', 'advanceIndicator', val, true)
			})
		})

		// --- Choices ---
		this.#addSection(container, 'Choices', 'Choice buttons shown during branching dialogue', (section) => {
			const d = theme.dialogue ?? {}

			this.#addNumber(section, 'Choice size', d.choiceSize ?? 20, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '36' })

			this.#addNumber(section, 'Choice width', d.choiceWidth ?? 400, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceWidth', parseInt(val) || 400, 400)
			}, { step: '10', min: '200', max: '800' })

			this.#addNumber(section, 'Choice height', d.choiceHeight ?? 44, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceHeight', parseInt(val) || 44, 44)
			}, { step: '2', min: '30', max: '80' })

			this.#addNumber(section, 'Choice radius', d.choiceRadius ?? 8, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceRadius', parseInt(val) || 8, 8)
			}, { step: '1', min: '0', max: '20' })

			this.#addNumber(section, 'Spacing', d.choiceSpacing ?? 8, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceSpacing', parseInt(val) || 8, 8)
			}, { step: '2', min: '0', max: '24' })
		})

		// --- Title Screen ---
		this.#addSection(container, 'Title Screen', 'Main menu shown when the game starts', (section) => {
			const ts = theme.titleScreen ?? {}

			this.#addNumber(section, 'Title size', ts.titleSize ?? 48, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'titleSize', parseInt(val) || 48, 48)
			}, { step: '2', min: '24', max: '80' })

			this.#addNumber(section, 'Subtitle size', ts.subtitleSize ?? 20, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'subtitleSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '36' })

			this.#addNumber(section, 'Button width', ts.buttonWidth ?? 280, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonWidth', parseInt(val) || 280, 280)
			}, { step: '10', min: '150', max: '500' })

			this.#addNumber(section, 'Button height', ts.buttonHeight ?? 50, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonHeight', parseInt(val) || 50, 50)
			}, { step: '2', min: '30', max: '80' })

			this.#addNumber(section, 'Button radius', ts.buttonRadius ?? 10, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonRadius', parseInt(val) || 10, 10)
			}, { step: '1', min: '0', max: '25' })

			this.#addNumber(section, 'Button size', ts.buttonSize ?? 22, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonSize', parseInt(val) || 22, 22)
			}, { step: '1', min: '12', max: '36' })

			this.#addNumber(section, 'Button spacing', ts.buttonSpacing ?? 16, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonSpacing', parseInt(val) || 16, 16)
			}, { step: '2', min: '4', max: '40' })
		})

		// --- In-Game Menu ---
		this.#addSection(container, 'In-Game Menu', 'Pause menu shown during gameplay', (section) => {
			const m = theme.menu ?? {}

			this.#addNumber(section, 'Title size', m.titleSize ?? 36, (val) => {
				this.#updateTheme(meta, 'menu', 'titleSize', parseInt(val) || 36, 36)
			}, { step: '2', min: '20', max: '60' })

			this.#addNumber(section, 'Button width', m.buttonWidth ?? 240, (val) => {
				this.#updateTheme(meta, 'menu', 'buttonWidth', parseInt(val) || 240, 240)
			}, { step: '10', min: '150', max: '500' })

			this.#addNumber(section, 'Button height', m.buttonHeight ?? 44, (val) => {
				this.#updateTheme(meta, 'menu', 'buttonHeight', parseInt(val) || 44, 44)
			}, { step: '2', min: '30', max: '80' })

			this.#addNumber(section, 'Button radius', m.buttonRadius ?? 8, (val) => {
				this.#updateTheme(meta, 'menu', 'buttonRadius', parseInt(val) || 8, 8)
			}, { step: '1', min: '0', max: '20' })

			this.#addNumber(section, 'Button size', m.buttonSize ?? 20, (val) => {
				this.#updateTheme(meta, 'menu', 'buttonSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '36' })
		})

		// --- Save/Load ---
		this.#addSection(container, 'Save / Load', 'Save and load slot menus', (section) => {
			const s = theme.saves ?? {}

			this.#addNumber(section, 'Header size', s.headerSize ?? 30, (val) => {
				this.#updateTheme(meta, 'saves', 'headerSize', parseInt(val) || 30, 30)
			}, { step: '2', min: '18', max: '48' })

			this.#addNumber(section, 'Slot width', s.slotWidth ?? 360, (val) => {
				this.#updateTheme(meta, 'saves', 'slotWidth', parseInt(val) || 360, 360)
			}, { step: '10', min: '200', max: '600' })

			this.#addNumber(section, 'Slot height', s.slotHeight ?? 50, (val) => {
				this.#updateTheme(meta, 'saves', 'slotHeight', parseInt(val) || 50, 50)
			}, { step: '2', min: '30', max: '80' })

			this.#addNumber(section, 'Slot radius', s.slotRadius ?? 8, (val) => {
				this.#updateTheme(meta, 'saves', 'slotRadius', parseInt(val) || 8, 8)
			}, { step: '1', min: '0', max: '20' })

			this.#addNumber(section, 'Slot font size', s.slotSize ?? 18, (val) => {
				this.#updateTheme(meta, 'saves', 'slotSize', parseInt(val) || 18, 18)
			}, { step: '1', min: '12', max: '28' })
		})

		// --- Settings ---
		this.#addSection(container, 'Settings', 'Volume and display settings menu', (section) => {
			const st = theme.settings ?? {}

			this.#addNumber(section, 'Header size', st.headerSize ?? 30, (val) => {
				this.#updateTheme(meta, 'settings', 'headerSize', parseInt(val) || 30, 30)
			}, { step: '2', min: '18', max: '48' })

			this.#addNumber(section, 'Label size', st.labelSize ?? 16, (val) => {
				this.#updateTheme(meta, 'settings', 'labelSize', parseInt(val) || 16, 16)
			}, { step: '1', min: '12', max: '24' })

			this.#addNumber(section, 'Slider width', st.sliderWidth ?? 300, (val) => {
				this.#updateTheme(meta, 'settings', 'sliderWidth', parseInt(val) || 300, 300)
			}, { step: '10', min: '150', max: '500' })

			this.#addNumber(section, 'Slider radius', st.sliderRadius ?? 4, (val) => {
				this.#updateTheme(meta, 'settings', 'sliderRadius', parseInt(val) || 4, 4)
			}, { step: '1', min: '0', max: '12' })
		})

		// --- Loading Screen ---
		this.#addSection(container, 'Loading Screen', 'Progress display during asset loading', (section) => {
			const l = theme.loading ?? {}

			this.#addNumber(section, 'Title size', l.titleSize ?? 32, (val) => {
				this.#updateTheme(meta, 'loading', 'titleSize', parseInt(val) || 32, 32)
			}, { step: '2', min: '18', max: '56' })

			this.#addNumber(section, 'Bar width', l.barWidth ?? 300, (val) => {
				this.#updateTheme(meta, 'loading', 'barWidth', parseInt(val) || 300, 300)
			}, { step: '10', min: '150', max: '600' })

			this.#addNumber(section, 'Bar height', l.barHeight ?? 12, (val) => {
				this.#updateTheme(meta, 'loading', 'barHeight', parseInt(val) || 12, 12)
			}, { step: '1', min: '4', max: '24' })

			this.#addNumber(section, 'Bar radius', l.barRadius ?? 6, (val) => {
				this.#updateTheme(meta, 'loading', 'barRadius', parseInt(val) || 6, 6)
			}, { step: '1', min: '0', max: '12' })
		})

		// --- Confirm Dialog ---
		this.#addSection(container, 'Confirm Dialog', 'Confirmation popup for destructive actions', (section) => {
			const c = theme.confirm ?? {}

			this.#addNumber(section, 'Width', c.width ?? 400, (val) => {
				this.#updateTheme(meta, 'confirm', 'width', parseInt(val) || 400, 400)
			}, { step: '10', min: '250', max: '600' })

			this.#addNumber(section, 'Height', c.height ?? 140, (val) => {
				this.#updateTheme(meta, 'confirm', 'height', parseInt(val) || 140, 140)
			}, { step: '10', min: '100', max: '300' })

			this.#addNumber(section, 'Corner radius', c.radius ?? 12, (val) => {
				this.#updateTheme(meta, 'confirm', 'radius', parseInt(val) || 12, 12)
			}, { step: '1', min: '0', max: '24' })

			this.#addNumber(section, 'Text size', c.textSize ?? 20, (val) => {
				this.#updateTheme(meta, 'confirm', 'textSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '32' })

			this.#addNumber(section, 'Button width', c.buttonWidth ?? 140, (val) => {
				this.#updateTheme(meta, 'confirm', 'buttonWidth', parseInt(val) || 140, 140)
			}, { step: '10', min: '80', max: '250' })

			this.#addNumber(section, 'Button radius', c.buttonRadius ?? 8, (val) => {
				this.#updateTheme(meta, 'confirm', 'buttonRadius', parseInt(val) || 8, 8)
			}, { step: '1', min: '0', max: '20' })
		})
	}

	// --- Theme editor UI builders ---

	#addSection(container, title, description, buildFn) {
		const section = document.createElement('div')
		section.className = 'theme-section'

		const header = document.createElement('div')
		header.className = 'theme-section-header'

		const arrow = document.createElement('span')
		arrow.className = 'theme-section-arrow'
		arrow.textContent = '\u25B6'
		header.appendChild(arrow)

		const titleEl = document.createElement('span')
		titleEl.className = 'theme-section-title'
		titleEl.textContent = title
		header.appendChild(titleEl)

		section.appendChild(header)

		const content = document.createElement('div')
		content.className = 'theme-section-content'
		content.style.display = 'none'

		if (description) {
			const desc = document.createElement('div')
			desc.className = 'theme-section-desc'
			desc.textContent = description
			content.appendChild(desc)
		}

		buildFn(content)
		section.appendChild(content)

		header.addEventListener('click', () => {
			const isOpen = content.style.display !== 'none'
			content.style.display = isOpen ? 'none' : ''
			arrow.textContent = isOpen ? '\u25B6' : '\u25BC'
		})

		container.appendChild(section)
	}

	#addColor(container, label, value, defaultValue, onChange) {
		const row = document.createElement('div')
		row.className = 'theme-field'

		const lbl = document.createElement('span')
		lbl.className = 'theme-field-label'
		lbl.textContent = label

		const controls = document.createElement('div')
		controls.className = 'theme-field-controls'

		const colorInput = document.createElement('input')
		colorInput.type = 'color'
		colorInput.className = 'theme-color-input'
		colorInput.value = value ?? defaultValue
		colorInput.addEventListener('input', () => onChange(colorInput.value))

		const hex = document.createElement('span')
		hex.className = 'theme-color-hex'
		hex.textContent = (value ?? defaultValue).toUpperCase()
		colorInput.addEventListener('input', () => {
			hex.textContent = colorInput.value.toUpperCase()
		})

		const resetBtn = document.createElement('button')
		resetBtn.className = 'theme-field-reset'
		resetBtn.textContent = '\u21A9'
		resetBtn.title = 'Reset to default'
		resetBtn.addEventListener('click', () => {
			colorInput.value = defaultValue
			hex.textContent = defaultValue.toUpperCase()
			onChange(defaultValue)
		})

		controls.appendChild(colorInput)
		controls.appendChild(hex)
		controls.appendChild(resetBtn)
		row.appendChild(lbl)
		row.appendChild(controls)
		container.appendChild(row)
	}

	#addNumber(container, label, value, onChange, attrs = {}) {
		const row = document.createElement('div')
		row.className = 'theme-field'

		const lbl = document.createElement('span')
		lbl.className = 'theme-field-label'
		lbl.textContent = label

		const input = document.createElement('input')
		input.type = 'number'
		input.className = 'theme-number-input'
		input.value = value ?? ''
		for (const [k, v] of Object.entries(attrs)) {
			input.setAttribute(k, v)
		}
		input.addEventListener('change', () => onChange(input.value))

		row.appendChild(lbl)
		row.appendChild(input)
		container.appendChild(row)
	}

	#addSelect(container, label, currentValue, options, onChange) {
		const row = document.createElement('div')
		row.className = 'theme-field'

		const lbl = document.createElement('span')
		lbl.className = 'theme-field-label'
		lbl.textContent = label

		const select = document.createElement('select')
		select.className = 'theme-select-input'
		for (const opt of options) {
			const o = document.createElement('option')
			o.value = opt.id
			o.textContent = opt.name ?? opt.id
			if (opt.id === currentValue) o.selected = true
			select.appendChild(o)
		}
		select.addEventListener('change', () => onChange(select.value))

		row.appendChild(lbl)
		row.appendChild(select)
		container.appendChild(row)
	}

	#addCheckbox(container, label, checked, onChange) {
		const row = document.createElement('div')
		row.className = 'theme-field'

		const lbl = document.createElement('label')
		lbl.className = 'theme-field-checkbox'

		const input = document.createElement('input')
		input.type = 'checkbox'
		input.checked = checked
		input.addEventListener('change', () => onChange(input.checked))

		lbl.appendChild(input)
		lbl.appendChild(document.createTextNode(label))
		row.appendChild(lbl)
		container.appendChild(row)
	}

	/**
	 * Update a nested theme property (e.g. theme.colors.accent).
	 * If the value equals the default, removes it to keep theme sparse.
	 */
	#updateTheme(meta, section, key, value, defaultValue) {
		const theme = structuredClone(meta.theme ?? {})
		if (!theme[section]) theme[section] = {}

		if (value === defaultValue) {
			delete theme[section][key]
			if (Object.keys(theme[section]).length === 0) delete theme[section]
		} else {
			theme[section][key] = value
		}

		this.#state.updateMeta('theme', Object.keys(theme).length > 0 ? theme : null)
	}

	/**
	 * Update a root-level theme property (e.g. theme.fontFamily).
	 */
	#updateRoot(meta, key, value, defaultValue) {
		const theme = structuredClone(meta.theme ?? {})

		if (value === defaultValue || value === null) {
			delete theme[key]
		} else {
			theme[key] = value
		}

		this.#state.updateMeta('theme', Object.keys(theme).length > 0 ? theme : null)
	}

	/**
	 * Extract alpha from an rgba() string, returning a fallback if not parseable.
	 */
	#parseAlpha(rgbaStr, fallback) {
		if (!rgbaStr) return fallback
		const match = rgbaStr.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/)
		return match ? parseFloat(match[1]) : fallback
	}
}
