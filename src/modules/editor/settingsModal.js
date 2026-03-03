import { ThemeEditor } from './properties/themeEditor.js'
import { addGroup, addSelect, addCheckbox, addRow } from './properties/formControls.js'

export class SettingsModal {
	#state = null
	#overlay = null
	#activeTab = 'project'
	#contentArea = null
	#themeEditor = null
	#resetBtn = null

	constructor(state) {
		this.#state = state
		this.#themeEditor = new ThemeEditor(state)
	}

	get isOpen() {
		return this.#overlay !== null
	}

	open(tab = 'project') {
		if (this.#overlay) return

		this.#activeTab = tab

		const overlay = document.createElement('div')
		overlay.className = 'settings-overlay'

		const modal = document.createElement('div')
		modal.className = 'settings-modal'
		modal.addEventListener('click', (e) => e.stopPropagation())

		// --- Header ---
		const header = document.createElement('div')
		header.className = 'settings-header'

		const title = document.createElement('h3')
		title.textContent = 'Settings'
		header.appendChild(title)

		const closeBtn = document.createElement('button')
		closeBtn.className = 'settings-close'
		closeBtn.textContent = '\u2715'
		closeBtn.title = 'Close'
		closeBtn.addEventListener('click', () => this.close())
		header.appendChild(closeBtn)

		modal.appendChild(header)

		// --- Body (sidebar + content) ---
		const body = document.createElement('div')
		body.className = 'settings-body'

		// Sidebar
		const sidebar = document.createElement('nav')
		sidebar.className = 'settings-sidebar'
		this.#buildSidebar(sidebar)
		body.appendChild(sidebar)

		// Content area
		const contentArea = document.createElement('div')
		contentArea.className = 'settings-content'
		this.#contentArea = contentArea
		body.appendChild(contentArea)

		modal.appendChild(body)

		// --- Footer ---
		const footer = document.createElement('div')
		footer.className = 'settings-footer'

		const resetBtn = document.createElement('button')
		resetBtn.textContent = 'Reset Theme to Defaults'
		resetBtn.className = 'settings-reset'
		resetBtn.addEventListener('click', () => {
			this.#state.updateMeta('theme', null)
			this.#renderContent()
		})
		this.#resetBtn = resetBtn
		footer.appendChild(resetBtn)

		const doneBtn = document.createElement('button')
		doneBtn.textContent = 'Done'
		doneBtn.className = 'settings-done'
		doneBtn.addEventListener('click', () => this.close())
		footer.appendChild(doneBtn)

		modal.appendChild(footer)

		overlay.appendChild(modal)

		// Close on backdrop click
		overlay.addEventListener('click', () => this.close())

		// Close on Escape
		const onKey = (e) => {
			if (e.key === 'Escape') this.close()
		}
		document.addEventListener('keydown', onKey)

		this.#overlay = { overlay, onKey }
		document.body.appendChild(overlay)

		// Render initial tab content
		this.#renderContent()
	}

	close() {
		if (!this.#overlay) return
		document.removeEventListener('keydown', this.#overlay.onKey)
		this.#overlay.overlay.remove()
		this.#overlay = null
		this.#contentArea = null
		this.#resetBtn = null
	}

	// --- Private ---

	#buildSidebar(sidebar) {
		// Project section
		const projectLabel = document.createElement('div')
		projectLabel.className = 'settings-sidebar-label'
		projectLabel.textContent = 'Project'
		sidebar.appendChild(projectLabel)

		this.#addTab(sidebar, 'project', '\u{1F4C4}', 'Project')

		// Appearance section
		const appearanceLabel = document.createElement('div')
		appearanceLabel.className = 'settings-sidebar-label'
		appearanceLabel.textContent = 'Appearance'
		sidebar.appendChild(appearanceLabel)

		this.#addTab(sidebar, 'theme', '\u{1F3A8}', 'Theme')
	}

	#addTab(sidebar, id, icon, label) {
		const tab = document.createElement('button')
		tab.className = 'settings-tab' + (this.#activeTab === id ? ' active' : '')
		tab.dataset.tab = id

		const iconEl = document.createElement('span')
		iconEl.className = 'settings-tab-icon'
		iconEl.textContent = icon
		tab.appendChild(iconEl)

		const labelEl = document.createElement('span')
		labelEl.textContent = label
		tab.appendChild(labelEl)

		tab.addEventListener('click', () => this.#switchTab(id))
		sidebar.appendChild(tab)
	}

	#switchTab(tab) {
		if (this.#activeTab === tab) return
		this.#activeTab = tab

		// Update active class on all tabs
		if (this.#overlay) {
			const tabs = this.#overlay.overlay.querySelectorAll('.settings-tab')
			for (const t of tabs) {
				t.classList.toggle('active', t.dataset.tab === tab)
			}
		}

		this.#renderContent()
	}

	#renderContent() {
		if (!this.#contentArea) return

		this.#contentArea.innerHTML = ''

		if (this.#activeTab === 'project') {
			this.#renderProjectTab()
		} else if (this.#activeTab === 'theme') {
			this.#renderThemeTab()
		}

		// Show reset button only on theme tab
		if (this.#resetBtn) {
			this.#resetBtn.style.visibility = this.#activeTab === 'theme' ? 'visible' : 'hidden'
		}
	}

	#renderProjectTab() {
		const inner = document.createElement('div')
		inner.className = 'settings-content-inner'

		const sectionTitle = document.createElement('h4')
		sectionTitle.className = 'settings-section-title'
		sectionTitle.textContent = 'Project'
		inner.appendChild(sectionTitle)

		const meta = this.#state.project.meta

		addGroup(inner, 'Title', 'text', meta.title, (val) => {
			this.#state.updateMeta('title', val)
		})

		addGroup(inner, 'Author', 'text', meta.author, (val) => {
			this.#state.updateMeta('author', val)
		})

		addGroup(inner, 'Version', 'text', meta.version, (val) => {
			this.#state.updateMeta('version', val)
		})

		addRow(inner, [
			{ label: 'Width', type: 'number', value: meta.resolution.width, onChange: (val) => {
				meta.resolution.width = parseInt(val) || 1280
			}},
			{ label: 'Height', type: 'number', value: meta.resolution.height, onChange: (val) => {
				meta.resolution.height = parseInt(val) || 720
			}}
		])

		// --- Title Screen / Main Menu ---
		const divider = document.createElement('hr')
		divider.className = 'settings-divider'
		inner.appendChild(divider)

		const menuTitle = document.createElement('h4')
		menuTitle.className = 'settings-section-title'
		menuTitle.textContent = 'Title Screen'
		inner.appendChild(menuTitle)

		const mainMenu = meta.mainMenu ?? { background: null, title: null }

		addGroup(inner, 'Display title', 'text', mainMenu.title ?? '', (val) => {
			if (!meta.mainMenu) meta.mainMenu = { background: null, title: null }
			meta.mainMenu.title = val || null
			this.#state.updateMeta('mainMenu', meta.mainMenu)
		})

		const backgrounds = this.#state.getImageAssets()
		addSelect(inner, 'Background', mainMenu.background ?? '', backgrounds, (val) => {
			if (!meta.mainMenu) meta.mainMenu = { background: null, title: null }
			meta.mainMenu.background = val || null
			this.#state.updateMeta('mainMenu', meta.mainMenu)
		})

		const hint = document.createElement('div')
		hint.textContent = 'The title screen is shown before gameplay starts. If no background is set, a solid color is used.'
		hint.className = 'props-hint'
		inner.appendChild(hint)

		this.#contentArea.appendChild(inner)
	}

	#renderThemeTab() {
		const inner = document.createElement('div')
		inner.className = 'settings-content-inner'

		const sectionTitle = document.createElement('h4')
		sectionTitle.className = 'settings-section-title'
		sectionTitle.textContent = 'Theme'
		inner.appendChild(sectionTitle)

		const hint = document.createElement('div')
		hint.textContent = 'Customize how the game looks at runtime: colors, fonts, dialogue box, menus, and more.'
		hint.className = 'props-hint'
		hint.style.marginBottom = '16px'
		inner.appendChild(hint)

		this.#themeEditor.buildContent(inner)

		this.#contentArea.appendChild(inner)
	}
}
