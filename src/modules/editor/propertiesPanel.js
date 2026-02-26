export class PropertiesPanel {
	#state = null
	#contentEl = null
	#selectedAssetId = null
	#propAudio = null
	#themeOverlay = null

	constructor(state) {
		this.#state = state
		this.#contentEl = document.getElementById('properties-content')

		this.#state.on('selectionChanged', () => {
			// When a timeline node is selected on canvas, clear asset selection display
			if (this.#state.selectedElementId) {
				this.#selectedAssetId = null
			}
			this.render()
		})
		this.#state.on('sceneChanged', () => this.render())
		this.#state.on('sceneUpdated', () => this.render())
		this.#state.on('timelineChanged', () => this.render())
		this.#state.on('projectChanged', () => {
			this.#selectedAssetId = null
			this.#stopPropAudio()
			this.render()
		})
		this.#state.on('assetSelectionChanged', (assetId) => {
			this.#stopPropAudio()
			this.#selectedAssetId = assetId
			this.render()
		})
		this.#state.on('assetsChanged', () => {
			// Re-render if the selected asset was removed
			if (this.#selectedAssetId) {
				const asset = this.#state.assets.find(a => a.id === this.#selectedAssetId)
				if (!asset) {
					this.#selectedAssetId = null
					this.#stopPropAudio()
				}
			}
			this.render()
		})

		this.render()
	}

	render() {
		this.#contentEl.innerHTML = ''

		const selectedId = this.#state.selectedElementId
		const scene = this.#state.currentScene

		if (selectedId && scene) {
			const node = this.#state.getTimelineNode(scene.id, selectedId)
			if (node) {
				this.#renderTimelineNodeProps(node, scene)
				return
			}
		}

		// Show asset preview if an asset is selected in the grid
		if (this.#selectedAssetId) {
			const asset = this.#state.assets.find(a => a.id === this.#selectedAssetId)
			if (asset) {
				this.#renderAssetPreview(asset)
				return
			}
		}

		if (scene) {
			this.#renderSceneProps(scene)
			return
		}

		this.#renderProjectProps()
	}

	#renderProjectProps() {
		const meta = this.#state.project.meta

		this.#addGroup('Title', 'text', meta.title, (val) => {
			this.#state.updateMeta('title', val)
		})

		this.#addGroup('Author', 'text', meta.author, (val) => {
			this.#state.updateMeta('author', val)
		})

		this.#addRow([
			{ label: 'Width', type: 'number', value: meta.resolution.width, onChange: (val) => {
				meta.resolution.width = parseInt(val) || 1280
			}},
			{ label: 'Height', type: 'number', value: meta.resolution.height, onChange: (val) => {
				meta.resolution.height = parseInt(val) || 720
			}}
		])

		// --- Title Screen / Main Menu ---
		const divider = document.createElement('hr')
		divider.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 16px 0;'
		this.#contentEl.appendChild(divider)

		const menuHeader = document.createElement('h4')
		menuHeader.textContent = 'Title Screen'
		menuHeader.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(menuHeader)

		const mainMenu = meta.mainMenu ?? { background: null, title: null }

		// Title screen title override
		this.#addGroup('Display title', 'text', mainMenu.title ?? '', (val) => {
			if (!meta.mainMenu) meta.mainMenu = { background: null, title: null }
			meta.mainMenu.title = val || null
			this.#state.updateMeta('mainMenu', meta.mainMenu)
		})

		// Title screen background (show all image assets)
		const backgrounds = this.#state.getImageAssets()
		this.#addSelect('Background', mainMenu.background ?? '', backgrounds, (val) => {
			if (!meta.mainMenu) meta.mainMenu = { background: null, title: null }
			meta.mainMenu.background = val || null
			this.#state.updateMeta('mainMenu', meta.mainMenu)
		})

		const hint = document.createElement('div')
		hint.textContent = 'The title screen is shown before gameplay starts. If no background is set, a solid color is used.'
		hint.style.cssText = 'font-size: 12px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4;'
		this.#contentEl.appendChild(hint)

		// --- Theme ---
		this.#renderThemeSection(meta)
	}

	#renderThemeSection(meta) {
		const divider = document.createElement('hr')
		divider.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 16px 0;'
		this.#contentEl.appendChild(divider)

		const header = document.createElement('h4')
		header.textContent = 'Theme'
		header.style.cssText = 'color: var(--accent); margin-bottom: 8px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		const themeHint = document.createElement('div')
		themeHint.textContent = 'Customize how the game looks at runtime: colors, fonts, dialogue box, menus, and more.'
		themeHint.style.cssText = 'font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;'
		this.#contentEl.appendChild(themeHint)

		// Show current theme status
		const theme = meta.theme
		const status = document.createElement('div')
		status.style.cssText = 'font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;'
		if (theme && Object.keys(theme).length > 0) {
			const count = this.#countThemeOverrides(theme)
			status.textContent = `${count} custom override${count !== 1 ? 's' : ''} set`
			status.style.color = 'var(--accent)'
		} else {
			status.textContent = 'Using default theme'
		}
		this.#contentEl.appendChild(status)

		const editBtn = document.createElement('button')
		editBtn.textContent = 'Edit Theme\u2026'
		editBtn.style.cssText = 'width: 100%; font-size: 13px;'
		editBtn.addEventListener('click', () => this.openThemeEditor())
		this.#contentEl.appendChild(editBtn)
	}

	#countThemeOverrides(obj) {
		let count = 0
		for (const val of Object.values(obj)) {
			if (val && typeof val === 'object' && !Array.isArray(val)) {
				count += this.#countThemeOverrides(val)
			} else {
				count++
			}
		}
		return count
	}

	// --- Theme editor modal ---

	openThemeEditor() {
		if (this.#themeOverlay) return

		const overlay = document.createElement('div')
		overlay.className = 'theme-editor-overlay'

		const modal = document.createElement('div')
		modal.className = 'theme-editor-modal'

		// Header
		const modalHeader = document.createElement('div')
		modalHeader.className = 'theme-editor-header'

		const title = document.createElement('h3')
		title.textContent = 'Theme Editor'
		modalHeader.appendChild(title)

		const closeBtn = document.createElement('button')
		closeBtn.className = 'theme-editor-close'
		closeBtn.textContent = '\u2715'
		closeBtn.title = 'Close'
		closeBtn.addEventListener('click', () => this.#closeThemeEditor())
		modalHeader.appendChild(closeBtn)

		modal.appendChild(modalHeader)

		// Scrollable body
		const body = document.createElement('div')
		body.className = 'theme-editor-body'

		this.#buildThemeEditorContent(body)

		modal.appendChild(body)

		// Footer
		const footer = document.createElement('div')
		footer.className = 'theme-editor-footer'

		const resetBtn = document.createElement('button')
		resetBtn.textContent = 'Reset All to Defaults'
		resetBtn.className = 'theme-editor-reset'
		resetBtn.addEventListener('click', () => {
			this.#state.updateMeta('theme', null)
			body.innerHTML = ''
			this.#buildThemeEditorContent(body)
		})
		footer.appendChild(resetBtn)

		const doneBtn = document.createElement('button')
		doneBtn.textContent = 'Done'
		doneBtn.className = 'theme-editor-done'
		doneBtn.addEventListener('click', () => this.#closeThemeEditor())
		footer.appendChild(doneBtn)

		modal.appendChild(footer)

		overlay.appendChild(modal)

		// Close on backdrop click
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) this.#closeThemeEditor()
		})

		// Close on Escape
		const onKey = (e) => {
			if (e.key === 'Escape') this.#closeThemeEditor()
		}
		document.addEventListener('keydown', onKey)

		this.#themeOverlay = { overlay, onKey }
		document.body.appendChild(overlay)
	}

	#closeThemeEditor() {
		if (!this.#themeOverlay) return
		document.removeEventListener('keydown', this.#themeOverlay.onKey)
		this.#themeOverlay.overlay.remove()
		this.#themeOverlay = null
	}

	#buildThemeEditorContent(container) {
		const meta = this.#state.project.meta
		const theme = meta.theme ?? {}

		// --- Global Colors ---
		this.#addThemeSection(container, 'Colors', 'Global palette used across all UI elements', (section) => {
			const colors = theme.colors ?? {}

			this.#addThemeColor(section, 'Accent', colors.accent, '#ffcc00', (val) => {
				this.#updateTheme(meta, 'colors', 'accent', val, '#ffcc00')
			})
			this.#addThemeColor(section, 'Primary text', colors.primary, '#ffffff', (val) => {
				this.#updateTheme(meta, 'colors', 'primary', val, '#ffffff')
			})
			this.#addThemeColor(section, 'Background', colors.background, '#1a1a2e', (val) => {
				this.#updateTheme(meta, 'colors', 'background', val, '#1a1a2e')
			})
		})

		// --- Font ---
		this.#addThemeSection(container, 'Font', 'Global font family applied to all text', (section) => {
			const fontFamilies = [
				{ id: 'sans-serif', name: 'Sans-serif (default)' },
				{ id: 'serif', name: 'Serif' },
				{ id: 'monospace', name: 'Monospace' },
				{ id: 'cursive', name: 'Cursive' },
				{ id: 'fantasy', name: 'Fantasy' }
			]
			this.#addThemeSelect(section, 'Font family', theme.fontFamily ?? 'sans-serif', fontFamilies, (val) => {
				this.#updateThemeRoot(meta, 'fontFamily', val || null, 'sans-serif')
			})
		})

		// --- Dialogue Box ---
		this.#addThemeSection(container, 'Dialogue Box', 'Textbox shown during conversations', (section) => {
			const d = theme.dialogue ?? {}

			this.#addThemeNumber(section, 'Box opacity', this.#parseAlpha(d.boxColor, 0.75), (val) => {
				const alpha = Math.max(0, Math.min(1, parseFloat(val) || 0.75))
				this.#updateTheme(meta, 'dialogue', 'boxColor', `rgba(0, 0, 0, ${alpha})`, 'rgba(0, 0, 0, 0.75)')
			}, { step: '0.05', min: '0', max: '1' })

			this.#addThemeNumber(section, 'Corner radius', d.boxRadius ?? 12, (val) => {
				this.#updateTheme(meta, 'dialogue', 'boxRadius', parseInt(val) || 12, 12)
			}, { step: '1', min: '0', max: '30' })

			this.#addThemeNumber(section, 'Box height', d.boxHeight ?? 180, (val) => {
				this.#updateTheme(meta, 'dialogue', 'boxHeight', parseInt(val) || 180, 180)
			}, { step: '10', min: '100', max: '400' })

			this.#addThemeNumber(section, 'Box margin', d.boxMargin ?? 20, (val) => {
				this.#updateTheme(meta, 'dialogue', 'boxMargin', parseInt(val) || 20, 20)
			}, { step: '5', min: '0', max: '60' })

			this.#addThemeNumber(section, 'Box padding', d.boxPadding ?? 20, (val) => {
				this.#updateTheme(meta, 'dialogue', 'boxPadding', parseInt(val) || 20, 20)
			}, { step: '5', min: '5', max: '40' })

			this.#addThemeNumber(section, 'Speaker size', d.speakerSize ?? 22, (val) => {
				this.#updateTheme(meta, 'dialogue', 'speakerSize', parseInt(val) || 22, 22)
			}, { step: '1', min: '12', max: '40' })

			this.#addThemeNumber(section, 'Text size', d.textSize ?? 20, (val) => {
				this.#updateTheme(meta, 'dialogue', 'textSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '36' })

			this.#addThemeNumber(section, 'Line height', d.textLineHeight ?? 28, (val) => {
				this.#updateTheme(meta, 'dialogue', 'textLineHeight', parseInt(val) || 28, 28)
			}, { step: '1', min: '16', max: '48' })

			this.#addThemeNumber(section, 'Typewriter speed', d.typewriterSpeed ?? 30, (val) => {
				this.#updateTheme(meta, 'dialogue', 'typewriterSpeed', parseInt(val) || 30, 30)
			}, { step: '5', min: '0', max: '200' })

			this.#addThemeCheckbox(section, 'Advance indicator', d.advanceIndicator ?? true, (val) => {
				this.#updateTheme(meta, 'dialogue', 'advanceIndicator', val, true)
			})
		})

		// --- Choices ---
		this.#addThemeSection(container, 'Choices', 'Choice buttons shown during branching dialogue', (section) => {
			const d = theme.dialogue ?? {}

			this.#addThemeNumber(section, 'Choice size', d.choiceSize ?? 20, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '36' })

			this.#addThemeNumber(section, 'Choice width', d.choiceWidth ?? 400, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceWidth', parseInt(val) || 400, 400)
			}, { step: '10', min: '200', max: '800' })

			this.#addThemeNumber(section, 'Choice height', d.choiceHeight ?? 44, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceHeight', parseInt(val) || 44, 44)
			}, { step: '2', min: '30', max: '80' })

			this.#addThemeNumber(section, 'Choice radius', d.choiceRadius ?? 8, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceRadius', parseInt(val) || 8, 8)
			}, { step: '1', min: '0', max: '20' })

			this.#addThemeNumber(section, 'Spacing', d.choiceSpacing ?? 8, (val) => {
				this.#updateTheme(meta, 'dialogue', 'choiceSpacing', parseInt(val) || 8, 8)
			}, { step: '2', min: '0', max: '24' })
		})

		// --- Title Screen ---
		this.#addThemeSection(container, 'Title Screen', 'Main menu shown when the game starts', (section) => {
			const ts = theme.titleScreen ?? {}

			this.#addThemeNumber(section, 'Title size', ts.titleSize ?? 48, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'titleSize', parseInt(val) || 48, 48)
			}, { step: '2', min: '24', max: '80' })

			this.#addThemeNumber(section, 'Subtitle size', ts.subtitleSize ?? 20, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'subtitleSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '36' })

			this.#addThemeNumber(section, 'Button width', ts.buttonWidth ?? 280, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonWidth', parseInt(val) || 280, 280)
			}, { step: '10', min: '150', max: '500' })

			this.#addThemeNumber(section, 'Button height', ts.buttonHeight ?? 50, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonHeight', parseInt(val) || 50, 50)
			}, { step: '2', min: '30', max: '80' })

			this.#addThemeNumber(section, 'Button radius', ts.buttonRadius ?? 10, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonRadius', parseInt(val) || 10, 10)
			}, { step: '1', min: '0', max: '25' })

			this.#addThemeNumber(section, 'Button size', ts.buttonSize ?? 22, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonSize', parseInt(val) || 22, 22)
			}, { step: '1', min: '12', max: '36' })

			this.#addThemeNumber(section, 'Button spacing', ts.buttonSpacing ?? 16, (val) => {
				this.#updateTheme(meta, 'titleScreen', 'buttonSpacing', parseInt(val) || 16, 16)
			}, { step: '2', min: '4', max: '40' })
		})

		// --- In-Game Menu ---
		this.#addThemeSection(container, 'In-Game Menu', 'Pause menu shown during gameplay', (section) => {
			const m = theme.menu ?? {}

			this.#addThemeNumber(section, 'Title size', m.titleSize ?? 36, (val) => {
				this.#updateTheme(meta, 'menu', 'titleSize', parseInt(val) || 36, 36)
			}, { step: '2', min: '20', max: '60' })

			this.#addThemeNumber(section, 'Button width', m.buttonWidth ?? 240, (val) => {
				this.#updateTheme(meta, 'menu', 'buttonWidth', parseInt(val) || 240, 240)
			}, { step: '10', min: '150', max: '500' })

			this.#addThemeNumber(section, 'Button height', m.buttonHeight ?? 44, (val) => {
				this.#updateTheme(meta, 'menu', 'buttonHeight', parseInt(val) || 44, 44)
			}, { step: '2', min: '30', max: '80' })

			this.#addThemeNumber(section, 'Button radius', m.buttonRadius ?? 8, (val) => {
				this.#updateTheme(meta, 'menu', 'buttonRadius', parseInt(val) || 8, 8)
			}, { step: '1', min: '0', max: '20' })

			this.#addThemeNumber(section, 'Button size', m.buttonSize ?? 20, (val) => {
				this.#updateTheme(meta, 'menu', 'buttonSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '36' })
		})

		// --- Save/Load ---
		this.#addThemeSection(container, 'Save / Load', 'Save and load slot menus', (section) => {
			const s = theme.saves ?? {}

			this.#addThemeNumber(section, 'Header size', s.headerSize ?? 30, (val) => {
				this.#updateTheme(meta, 'saves', 'headerSize', parseInt(val) || 30, 30)
			}, { step: '2', min: '18', max: '48' })

			this.#addThemeNumber(section, 'Slot width', s.slotWidth ?? 360, (val) => {
				this.#updateTheme(meta, 'saves', 'slotWidth', parseInt(val) || 360, 360)
			}, { step: '10', min: '200', max: '600' })

			this.#addThemeNumber(section, 'Slot height', s.slotHeight ?? 50, (val) => {
				this.#updateTheme(meta, 'saves', 'slotHeight', parseInt(val) || 50, 50)
			}, { step: '2', min: '30', max: '80' })

			this.#addThemeNumber(section, 'Slot radius', s.slotRadius ?? 8, (val) => {
				this.#updateTheme(meta, 'saves', 'slotRadius', parseInt(val) || 8, 8)
			}, { step: '1', min: '0', max: '20' })

			this.#addThemeNumber(section, 'Slot font size', s.slotSize ?? 18, (val) => {
				this.#updateTheme(meta, 'saves', 'slotSize', parseInt(val) || 18, 18)
			}, { step: '1', min: '12', max: '28' })
		})

		// --- Settings ---
		this.#addThemeSection(container, 'Settings', 'Volume and display settings menu', (section) => {
			const st = theme.settings ?? {}

			this.#addThemeNumber(section, 'Header size', st.headerSize ?? 30, (val) => {
				this.#updateTheme(meta, 'settings', 'headerSize', parseInt(val) || 30, 30)
			}, { step: '2', min: '18', max: '48' })

			this.#addThemeNumber(section, 'Label size', st.labelSize ?? 16, (val) => {
				this.#updateTheme(meta, 'settings', 'labelSize', parseInt(val) || 16, 16)
			}, { step: '1', min: '12', max: '24' })

			this.#addThemeNumber(section, 'Slider width', st.sliderWidth ?? 300, (val) => {
				this.#updateTheme(meta, 'settings', 'sliderWidth', parseInt(val) || 300, 300)
			}, { step: '10', min: '150', max: '500' })

			this.#addThemeNumber(section, 'Slider radius', st.sliderRadius ?? 4, (val) => {
				this.#updateTheme(meta, 'settings', 'sliderRadius', parseInt(val) || 4, 4)
			}, { step: '1', min: '0', max: '12' })
		})

		// --- Loading Screen ---
		this.#addThemeSection(container, 'Loading Screen', 'Progress display during asset loading', (section) => {
			const l = theme.loading ?? {}

			this.#addThemeNumber(section, 'Title size', l.titleSize ?? 32, (val) => {
				this.#updateTheme(meta, 'loading', 'titleSize', parseInt(val) || 32, 32)
			}, { step: '2', min: '18', max: '56' })

			this.#addThemeNumber(section, 'Bar width', l.barWidth ?? 300, (val) => {
				this.#updateTheme(meta, 'loading', 'barWidth', parseInt(val) || 300, 300)
			}, { step: '10', min: '150', max: '600' })

			this.#addThemeNumber(section, 'Bar height', l.barHeight ?? 12, (val) => {
				this.#updateTheme(meta, 'loading', 'barHeight', parseInt(val) || 12, 12)
			}, { step: '1', min: '4', max: '24' })

			this.#addThemeNumber(section, 'Bar radius', l.barRadius ?? 6, (val) => {
				this.#updateTheme(meta, 'loading', 'barRadius', parseInt(val) || 6, 6)
			}, { step: '1', min: '0', max: '12' })
		})

		// --- Confirm Dialog ---
		this.#addThemeSection(container, 'Confirm Dialog', 'Confirmation popup for destructive actions', (section) => {
			const c = theme.confirm ?? {}

			this.#addThemeNumber(section, 'Width', c.width ?? 400, (val) => {
				this.#updateTheme(meta, 'confirm', 'width', parseInt(val) || 400, 400)
			}, { step: '10', min: '250', max: '600' })

			this.#addThemeNumber(section, 'Height', c.height ?? 140, (val) => {
				this.#updateTheme(meta, 'confirm', 'height', parseInt(val) || 140, 140)
			}, { step: '10', min: '100', max: '300' })

			this.#addThemeNumber(section, 'Corner radius', c.radius ?? 12, (val) => {
				this.#updateTheme(meta, 'confirm', 'radius', parseInt(val) || 12, 12)
			}, { step: '1', min: '0', max: '24' })

			this.#addThemeNumber(section, 'Text size', c.textSize ?? 20, (val) => {
				this.#updateTheme(meta, 'confirm', 'textSize', parseInt(val) || 20, 20)
			}, { step: '1', min: '12', max: '32' })

			this.#addThemeNumber(section, 'Button width', c.buttonWidth ?? 140, (val) => {
				this.#updateTheme(meta, 'confirm', 'buttonWidth', parseInt(val) || 140, 140)
			}, { step: '10', min: '80', max: '250' })

			this.#addThemeNumber(section, 'Button radius', c.buttonRadius ?? 8, (val) => {
				this.#updateTheme(meta, 'confirm', 'buttonRadius', parseInt(val) || 8, 8)
			}, { step: '1', min: '0', max: '20' })
		})
	}

	// --- Theme editor UI builders ---

	#addThemeSection(container, title, description, buildFn) {
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

	#addThemeColor(container, label, value, defaultValue, onChange) {
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

	#addThemeNumber(container, label, value, onChange, attrs = {}) {
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

	#addThemeSelect(container, label, currentValue, options, onChange) {
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

	#addThemeCheckbox(container, label, checked, onChange) {
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
	#updateThemeRoot(meta, key, value, defaultValue) {
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

	#renderSceneProps(scene) {
		const header = document.createElement('h4')
		header.textContent = 'Scene: ' + scene.id
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		// Transition settings
		const transitionHeader = document.createElement('h4')
		transitionHeader.textContent = 'Transition In'
		transitionHeader.style.cssText = 'color: var(--accent); margin-bottom: 8px; font-size: 13px;'
		this.#contentEl.appendChild(transitionHeader)

		const transitionTypes = [
			{ id: 'fade', name: 'Fade (through black)' },
			{ id: 'dissolve', name: 'Dissolve (crossfade)' },
			{ id: 'slideLeft', name: 'Slide left' },
			{ id: 'slideRight', name: 'Slide right' },
			{ id: 'slideUp', name: 'Slide up' },
			{ id: 'slideDown', name: 'Slide down' },
			{ id: 'none', name: 'None (instant)' }
		]

		const currentTransition = scene.transition ?? { type: 'fade', duration: 0.5 }
		this.#addSelect('Type', currentTransition.type, transitionTypes, (val) => {
			this.#state.updateScene(scene.id, 'transition', {
				type: val || 'fade',
				duration: currentTransition.duration ?? 0.5
			})
		})

		this.#addGroup('Duration (s)', 'number', currentTransition.duration ?? 0.5, (val) => {
			this.#state.updateScene(scene.id, 'transition', {
				type: currentTransition.type ?? 'fade',
				duration: parseFloat(val) || 0.5
			})
		}, { step: '0.1', min: '0.1', max: '3' })

		// Next scene
		const flowDivider = document.createElement('hr')
		flowDivider.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 12px 0;'
		this.#contentEl.appendChild(flowDivider)

		const flowHeader = document.createElement('h4')
		flowHeader.textContent = 'Flow'
		flowHeader.style.cssText = 'color: var(--accent); margin-bottom: 8px; font-size: 13px;'
		this.#contentEl.appendChild(flowHeader)

		const allScenes = this.#state.scenes.filter(s => s.id !== scene.id)
		this.#addSelect('Next scene', scene.next ?? '', allScenes.map(s => ({ id: s.id, name: s.id })), (val) => {
			this.#state.updateScene(scene.id, 'next', val || null)
			if (val) {
				this.#state.updateScene(scene.id, 'choices', null)
			}
		})

		// Start scene checkbox
		this.#addCheckbox('Start scene', this.#state.project.startScene === scene.id, (val) => {
			if (val) {
				this.#state.project.startScene = scene.id
			}
		})

		const hint = document.createElement('div')
		hint.textContent = 'Background, music, and characters are now managed via timeline nodes.'
		hint.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-top: 12px; line-height: 1.4;'
		this.#contentEl.appendChild(hint)
	}

	#renderTimelineNodeProps(node, scene) {
		switch (node.type) {
			case 'showCharacter':
				this.#renderShowCharacterNodeProps(node, scene)
				break
			case 'hideCharacter':
				this.#renderHideCharacterNodeProps(node, scene)
				break
			case 'dialogue':
				this.#renderDialogueNodeProps(node, scene)
				break
			case 'expression':
				this.#renderExpressionNodeProps(node, scene)
				break
			case 'background':
				this.#renderBackgroundNodeProps(node, scene)
				break
			case 'music':
				this.#renderMusicNodeProps(node, scene)
				break
			case 'sound':
				this.#renderSoundNodeProps(node, scene)
				break
			case 'wait':
				this.#renderWaitNodeProps(node, scene)
				break
			case 'choice':
				this.#renderChoiceNodeProps(node, scene)
				break
			default:
				this.#addReadonly('Type', node.type)
				break
		}

		// Common: auto / delay
		const commonDivider = document.createElement('hr')
		commonDivider.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 12px 0;'
		this.#contentEl.appendChild(commonDivider)

		this.#addCheckbox('Auto-advance', node.auto ?? false, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { auto: val })
		})

		this.#addGroup('Delay (ms)', 'number', node.delay ?? 0, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { delay: parseInt(val) || 0 })
		}, { step: '100', min: '0' })

		// Delete button
		const delBtn = document.createElement('button')
		delBtn.textContent = 'Remove node'
		delBtn.style.cssText = 'margin-top: 16px; width: 100%; color: var(--danger); border-color: var(--danger);'
		delBtn.addEventListener('click', () => {
			this.#state.removeTimelineNode(scene.id, node.id)
		})
		this.#contentEl.appendChild(delBtn)
	}

	#renderShowCharacterNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Show Character'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		const data = node.data

		// Character name
		this.#addGroup('Name', 'text', data.name ?? '', (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { name: val } })
		})

		// Asset info
		const asset = this.#state.assets.find(a => a.id === data.assetId)
		if (asset) {
			this.#addReadonly('Asset', asset.name ?? asset.id)
		}

		// Asset picker
		const charAssets = this.#state.getAssetsByType('character')
		this.#addSelect('Character asset', data.assetId ?? '', charAssets, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
		})

		// Position
		this.#addRow([
			{ label: 'X', type: 'number', value: Math.round((data.position?.x ?? 0.5) * 100) / 100, step: '0.01', onChange: (val) => {
				this.#state.updateTimelineNode(scene.id, node.id, {
					data: { position: { ...(data.position ?? { x: 0.5, y: 0.8 }), x: parseFloat(val) || 0 } }
				})
			}},
			{ label: 'Y', type: 'number', value: Math.round((data.position?.y ?? 0.8) * 100) / 100, step: '0.01', onChange: (val) => {
				this.#state.updateTimelineNode(scene.id, node.id, {
					data: { position: { ...(data.position ?? { x: 0.5, y: 0.8 }), y: parseFloat(val) || 0 } }
				})
			}}
		])

		// Scale
		this.#addGroup('Scale', 'number', data.scale ?? 1.0, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, {
				data: { scale: parseFloat(val) || 1.0 }
			})
		}, { step: '0.1', min: '0.1', max: '5' })

		// Flip
		this.#addCheckbox('Flip horizontal', data.flipped ?? false, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { flipped: val } })
		})

		// Enter animation settings
		const animDivider = document.createElement('hr')
		animDivider.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 12px 0;'
		this.#contentEl.appendChild(animDivider)

		const animHeader = document.createElement('h4')
		animHeader.textContent = 'Enter Animation'
		animHeader.style.cssText = 'color: var(--accent); margin-bottom: 8px; font-size: 13px;'
		this.#contentEl.appendChild(animHeader)

		const animTypes = [
			{ id: 'none', name: 'None (instant)' },
			{ id: 'fadeIn', name: 'Fade in' },
			{ id: 'slideLeft', name: 'Slide from left' },
			{ id: 'slideRight', name: 'Slide from right' },
			{ id: 'slideUp', name: 'Slide from below' },
			{ id: 'slideDown', name: 'Slide from above' },
			{ id: 'slideLeftFade', name: 'Slide left + fade' },
			{ id: 'slideRightFade', name: 'Slide right + fade' }
		]

		const currentAnim = data.enterAnimation ?? { type: 'none', duration: 0.4 }
		this.#addSelect('Type', currentAnim.type, animTypes, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, {
				data: {
					enterAnimation: {
						type: val || 'none',
						duration: currentAnim.duration ?? 0.4,
						delay: currentAnim.delay ?? 0
					}
				}
			})
		})

		if (currentAnim.type !== 'none') {
			this.#addGroup('Duration (s)', 'number', currentAnim.duration ?? 0.4, (val) => {
				this.#state.updateTimelineNode(scene.id, node.id, {
					data: {
						enterAnimation: {
							...currentAnim,
							duration: parseFloat(val) || 0.4
						}
					}
				})
			}, { step: '0.05', min: '0.1', max: '3' })

			this.#addGroup('Delay (s)', 'number', currentAnim.delay ?? 0, (val) => {
				this.#state.updateTimelineNode(scene.id, node.id, {
					data: {
						enterAnimation: {
							...currentAnim,
							delay: parseFloat(val) || 0
						}
					}
				})
			}, { step: '0.05', min: '0', max: '5' })
		}

		// Expressions section
		const exprDivider = document.createElement('hr')
		exprDivider.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 12px 0;'
		this.#contentEl.appendChild(exprDivider)

		const exprHeader = document.createElement('h4')
		exprHeader.textContent = 'Expressions'
		exprHeader.style.cssText = 'color: var(--accent); margin-bottom: 8px; font-size: 13px;'
		this.#contentEl.appendChild(exprHeader)

		const exprHint = document.createElement('div')
		exprHint.textContent = 'Map expression names to character image assets. Use these in dialogue lines to swap the displayed sprite.'
		exprHint.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.4;'
		this.#contentEl.appendChild(exprHint)

		// List existing expressions
		const expressions = data.expressions ?? {}

		for (const [name, exprAssetId] of Object.entries(expressions)) {
			const exprRow = document.createElement('div')
			exprRow.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 6px;'

			const nameSpan = document.createElement('span')
			nameSpan.textContent = name
			nameSpan.style.cssText = 'font-size: 12px; color: var(--text-primary); min-width: 60px; font-weight: 500;'

			const exprAsset = charAssets.find(a => a.id === exprAssetId)
			const assetSpan = document.createElement('span')
			assetSpan.textContent = exprAsset ? (exprAsset.name ?? exprAsset.id) : '(missing)'
			assetSpan.style.cssText = 'flex: 1; font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
			if (!exprAsset) assetSpan.style.color = 'var(--danger)'

			const removeBtn = document.createElement('button')
			removeBtn.textContent = '\u2715'
			removeBtn.title = 'Remove expression'
			removeBtn.style.cssText = 'padding: 2px 6px; font-size: 10px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer;'
			removeBtn.addEventListener('mouseenter', () => { removeBtn.style.color = 'var(--danger)' })
			removeBtn.addEventListener('mouseleave', () => { removeBtn.style.color = 'var(--text-secondary)' })
			removeBtn.addEventListener('click', () => {
				this.#state.removeCharacterExpression(scene.id, node.id, name)
			})

			exprRow.appendChild(nameSpan)
			exprRow.appendChild(assetSpan)
			exprRow.appendChild(removeBtn)
			this.#contentEl.appendChild(exprRow)
		}

		// Add new expression form
		const addRow = document.createElement('div')
		addRow.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-top: 4px;'

		const nameInput = document.createElement('input')
		nameInput.type = 'text'
		nameInput.placeholder = 'Name (e.g. happy)'
		nameInput.style.cssText = 'width: 90px; padding: 3px 6px; font-size: 12px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); outline: none;'

		const assetSelect = document.createElement('select')
		assetSelect.style.cssText = 'flex: 1; padding: 3px 6px; font-size: 12px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); outline: none;'

		const exprEmptyOpt = document.createElement('option')
		exprEmptyOpt.value = ''
		exprEmptyOpt.textContent = '(select asset)'
		assetSelect.appendChild(exprEmptyOpt)

		for (const a of charAssets) {
			const opt = document.createElement('option')
			opt.value = a.id
			opt.textContent = a.name ?? a.id
			assetSelect.appendChild(opt)
		}

		const addExprBtn = document.createElement('button')
		addExprBtn.textContent = '+'
		addExprBtn.title = 'Add expression'
		addExprBtn.style.cssText = 'padding: 3px 8px; font-size: 12px;'
		addExprBtn.addEventListener('click', () => {
			const exprName = nameInput.value.trim().toLowerCase()
			const exprAssetVal = assetSelect.value
			if (!exprName || !exprAssetVal) return
			this.#state.addCharacterExpression(scene.id, node.id, exprName, exprAssetVal)
		})

		addRow.appendChild(nameInput)
		addRow.appendChild(assetSelect)
		addRow.appendChild(addExprBtn)
		this.#contentEl.appendChild(addRow)
	}

	#renderHideCharacterNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Hide Character'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		this.#addGroup('Character name', 'text', node.data.name ?? '', (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { name: val } })
		})
	}

	#renderDialogueNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Dialogue'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		this.#addGroup('Speaker', 'text', node.data.speaker ?? '', (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { speaker: val || null } })
		})

		// Text area (multi-line)
		const textGroup = document.createElement('div')
		textGroup.className = 'prop-group'

		const textLabel = document.createElement('label')
		textLabel.textContent = 'Text'
		textGroup.appendChild(textLabel)

		const textArea = document.createElement('textarea')
		textArea.value = node.data.text ?? ''
		textArea.rows = 3
		textArea.style.cssText = 'width: 100%; resize: vertical; font-size: 13px; padding: 6px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); outline: none; font-family: inherit;'
		textArea.addEventListener('change', () => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { text: textArea.value } })
		})
		textGroup.appendChild(textArea)
		this.#contentEl.appendChild(textGroup)

		// Voice asset
		const soundAssets = this.#state.getAssetsByType('sound')
		this.#addSelect('Voice clip', node.data.voiceAssetId ?? '', soundAssets, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { voiceAssetId: val || null } })
		})
	}

	#renderExpressionNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Expression'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		this.#addGroup('Character name', 'text', node.data.name ?? '', (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { name: val } })
		})

		this.#addGroup('Expression', 'text', node.data.expression ?? '', (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { expression: val } })
		})

		// Expression asset override (optional)
		const charAssets = this.#state.getAssetsByType('character')
		this.#addSelect('Asset override', node.data.expressionAssetId ?? '', charAssets, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { expressionAssetId: val || null } })
		})

		const hint = document.createElement('div')
		hint.textContent = 'Changes the expression on an already-visible character. The expression name must match one defined on the showCharacter node, or use the asset override.'
		hint.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-top: 8px; line-height: 1.4;'
		this.#contentEl.appendChild(hint)
	}

	#renderBackgroundNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Background'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		const imageAssets = this.#state.getImageAssets()
		this.#addSelect('Image', node.data.assetId ?? '', imageAssets, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
		})
	}

	#renderMusicNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Music'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		const actions = [
			{ id: 'play', name: 'Play' },
			{ id: 'stop', name: 'Stop' }
		]
		this.#addSelect('Action', node.data.action ?? 'play', actions, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { action: val } })
		})

		if ((node.data.action ?? 'play') === 'play') {
			const musicAssets = this.#state.getAssetsByType('music')
			this.#addSelect('Track', node.data.assetId ?? '', musicAssets, (val) => {
				this.#state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
			})

			this.#addCheckbox('Loop', node.data.loop ?? true, (val) => {
				this.#state.updateTimelineNode(scene.id, node.id, { data: { loop: val } })
			})
		}
	}

	#renderSoundNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Sound Effect'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		const soundAssets = this.#state.getAssetsByType('sound')
		this.#addSelect('Audio', node.data.assetId ?? '', soundAssets, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
		})
	}

	#renderWaitNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Wait'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		this.#addGroup('Duration (ms)', 'number', node.data.duration ?? 1000, (val) => {
			this.#state.updateTimelineNode(scene.id, node.id, { data: { duration: parseInt(val) || 1000 } })
		}, { step: '100', min: '0' })
	}

	#renderChoiceNodeProps(node, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Choice'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		const choices = node.data.choices ?? []
		const allScenes = this.#state.scenes

		for (let i = 0; i < choices.length; i++) {
			const choice = choices[i]
			const choiceRow = document.createElement('div')
			choiceRow.style.cssText = 'border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; margin-bottom: 8px;'

			const choiceLabel = document.createElement('div')
			choiceLabel.textContent = `Choice ${i + 1}`
			choiceLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; font-weight: 500;'
			choiceRow.appendChild(choiceLabel)

			// Choice text
			const textInput = document.createElement('input')
			textInput.type = 'text'
			textInput.value = choice.text ?? ''
			textInput.placeholder = 'Choice text'
			textInput.style.cssText = 'width: 100%; padding: 4px 6px; font-size: 12px; margin-bottom: 4px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); outline: none; box-sizing: border-box;'
			const idx = i
			textInput.addEventListener('change', () => {
				const updated = [...(node.data.choices ?? [])]
				updated[idx] = { ...updated[idx], text: textInput.value }
				this.#state.updateTimelineNode(scene.id, node.id, { data: { choices: updated } })
			})
			choiceRow.appendChild(textInput)

			// Target scene
			const sceneSelect = document.createElement('select')
			sceneSelect.style.cssText = 'width: 100%; padding: 4px 6px; font-size: 12px; margin-bottom: 4px; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--bg-dark); color: var(--text-primary); outline: none; box-sizing: border-box;'

			const emptyOpt = document.createElement('option')
			emptyOpt.value = ''
			emptyOpt.textContent = '(no target)'
			sceneSelect.appendChild(emptyOpt)

			for (const s of allScenes) {
				const opt = document.createElement('option')
				opt.value = s.id
				opt.textContent = s.id
				if (s.id === choice.targetSceneId) opt.selected = true
				sceneSelect.appendChild(opt)
			}

			sceneSelect.addEventListener('change', () => {
				const updated = [...(node.data.choices ?? [])]
				updated[idx] = { ...updated[idx], targetSceneId: sceneSelect.value || null }
				this.#state.updateTimelineNode(scene.id, node.id, { data: { choices: updated } })
			})
			choiceRow.appendChild(sceneSelect)

			// Remove choice button
			const removeChoiceBtn = document.createElement('button')
			removeChoiceBtn.textContent = 'Remove'
			removeChoiceBtn.style.cssText = 'padding: 2px 8px; font-size: 11px; color: var(--danger); border-color: var(--danger); background: transparent; cursor: pointer;'
			removeChoiceBtn.addEventListener('click', () => {
				const updated = [...(node.data.choices ?? [])]
				updated.splice(idx, 1)
				this.#state.updateTimelineNode(scene.id, node.id, { data: { choices: updated } })
			})
			choiceRow.appendChild(removeChoiceBtn)

			this.#contentEl.appendChild(choiceRow)
		}

		// Add choice button
		const addChoiceBtn = document.createElement('button')
		addChoiceBtn.textContent = '+ Add choice'
		addChoiceBtn.style.cssText = 'width: 100%; font-size: 12px; margin-top: 4px;'
		addChoiceBtn.addEventListener('click', () => {
			const updated = [...(node.data.choices ?? []), { text: '', targetSceneId: null }]
			this.#state.updateTimelineNode(scene.id, node.id, { data: { choices: updated } })
		})
		this.#contentEl.appendChild(addChoiceBtn)
	}

	// --- Asset preview ---

	#renderAssetPreview(asset) {
		const header = document.createElement('h4')
		header.textContent = 'Asset'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		this.#addReadonly('Name', asset.name ?? asset.id)
		this.#addReadonly('Type', asset.type)

		if (asset.type === 'background' || asset.type === 'character') {
			// Image preview
			const previewBox = document.createElement('div')
			previewBox.className = 'prop-asset-preview'

			const img = document.createElement('img')
			img.src = asset.dataUrl ?? asset.path
			img.alt = asset.name ?? asset.id
			img.title = 'Click to enlarge'

			img.addEventListener('load', () => {
				const w = img.naturalWidth
				const h = img.naturalHeight
				const sizeBytes = asset.dataUrl
					? Math.round((asset.dataUrl.length - asset.dataUrl.indexOf(',') - 1) * 3 / 4)
					: null
				const sizeStr = sizeBytes != null ? this.#formatFileSize(sizeBytes) : ''
				const dimLabel = `${w} \u00D7 ${h}` + (sizeStr ? ` \u2022 ${sizeStr}` : '')
				this.#addReadonly('Dimensions', dimLabel)
			})

			// Click to open full preview modal via the asset manager event
			img.addEventListener('click', () => {
				this.#state.emit('assetPreviewRequested', asset.id)
			})

			previewBox.appendChild(img)
			this.#contentEl.appendChild(previewBox)
		} else if (asset.type === 'music' || asset.type === 'sound') {
			// Audio player (compact for narrow panel)
			this.#stopPropAudio()

			const player = document.createElement('div')
			player.className = 'audio-player-compact'

			const audio = new Audio(asset.dataUrl ?? asset.path)
			this.#propAudio = audio

			const playBtn = document.createElement('button')
			playBtn.textContent = '\u25B6'
			playBtn.title = 'Play'
			playBtn.addEventListener('click', () => {
				if (audio.paused) {
					audio.play()
					playBtn.textContent = '\u275A\u275A'
					playBtn.title = 'Pause'
				} else {
					audio.pause()
					playBtn.textContent = '\u25B6'
					playBtn.title = 'Play'
				}
			})

			const seekBar = document.createElement('input')
			seekBar.type = 'range'
			seekBar.min = '0'
			seekBar.max = '100'
			seekBar.value = '0'
			seekBar.step = '0.1'
			seekBar.addEventListener('input', () => {
				if (audio.duration) {
					audio.currentTime = (parseFloat(seekBar.value) / 100) * audio.duration
				}
			})

			const timeLabel = document.createElement('span')
			timeLabel.className = 'audio-time'
			timeLabel.textContent = '0:00 / 0:00'

			audio.addEventListener('timeupdate', () => {
				if (audio.duration) {
					seekBar.value = String((audio.currentTime / audio.duration) * 100)
					timeLabel.textContent = `${this.#formatTime(audio.currentTime)} / ${this.#formatTime(audio.duration)}`
				}
			})

			audio.addEventListener('ended', () => {
				playBtn.textContent = '\u25B6'
				playBtn.title = 'Play'
				seekBar.value = '0'
			})

			audio.addEventListener('loadedmetadata', () => {
				timeLabel.textContent = `0:00 / ${this.#formatTime(audio.duration)}`
			})

			player.appendChild(playBtn)
			player.appendChild(seekBar)
			player.appendChild(timeLabel)
			this.#contentEl.appendChild(player)
		}
	}

	#stopPropAudio() {
		if (this.#propAudio) {
			this.#propAudio.pause()
			this.#propAudio.src = ''
			this.#propAudio = null
		}
	}

	#formatTime(seconds) {
		if (!isFinite(seconds)) return '0:00'
		const m = Math.floor(seconds / 60)
		const s = Math.floor(seconds % 60)
		return `${m}:${s.toString().padStart(2, '0')}`
	}

	#formatFileSize(bytes) {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	// --- UI helpers ---

	#addGroup(label, type, value, onChange, attrs = {}) {
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

		this.#contentEl.appendChild(group)
	}

	#addSelect(label, currentValue, options, onChange) {
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

		this.#contentEl.appendChild(group)
	}

	#addCheckbox(label, checked, onChange) {
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

		this.#contentEl.appendChild(group)
	}

	#addReadonly(label, value) {
		const group = document.createElement('div')
		group.className = 'prop-group'

		const lbl = document.createElement('label')
		lbl.textContent = label
		group.appendChild(lbl)

		const span = document.createElement('div')
		span.textContent = value
		span.style.cssText = 'font-size: 13px; color: var(--text-secondary); padding: 4px 0;'
		group.appendChild(span)

		this.#contentEl.appendChild(group)
	}

	#addRow(fields) {
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

		this.#contentEl.appendChild(row)
	}
}
