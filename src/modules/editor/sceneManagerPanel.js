export class SceneManagerPanel {
	#state = null
	#listEl = null
	#searchInput = null
	#searchClearBtn = null
	#searchQuery = ''

	constructor(state) {
		this.#state = state
		this.#listEl = document.getElementById('scene-list')
		this.#searchInput = document.getElementById('scene-search-input')
		this.#searchClearBtn = document.getElementById('scene-search-clear')

		document.getElementById('btn-add-scene').addEventListener('click', () => {
			const scene = this.#state.addScene()
			this.#state.selectScene(scene.id)
		})

		document.getElementById('btn-add-section').addEventListener('click', () => {
			const name = prompt('Section name:')
			if (name) {
				this.#state.addSceneSection(name)
			}
		})

		this.#searchInput.addEventListener('input', () => {
			this.#searchQuery = this.#searchInput.value.trim().toLowerCase()
			this.#searchClearBtn.style.display = this.#searchQuery ? 'block' : 'none'
			this.render()
		})

		this.#searchClearBtn.addEventListener('click', () => {
			this.#searchInput.value = ''
			this.#searchQuery = ''
			this.#searchClearBtn.style.display = 'none'
			this.render()
		})

		this.#searchClearBtn.style.display = 'none'

		this.#state.on('scenesChanged', () => this.render())
		this.#state.on('sceneChanged', () => this.render())
		this.#state.on('projectChanged', () => this.render())

		this.render()
	}

	render() {
		this.#listEl.innerHTML = ''
		const currentId = this.#state.currentSceneId

		if (this.#searchQuery) {
			this.#renderSearchResults(currentId)
		} else {
			this.#renderSection(null, currentId, 0)
		}
	}

	// --- Search mode ---

	#renderSearchResults(currentId) {
		const scenes = this.#state.scenes.filter(s =>
			s.id.toLowerCase().includes(this.#searchQuery)
		)

		if (scenes.length === 0) {
			const empty = document.createElement('li')
			empty.className = 'scene-empty'
			empty.textContent = 'No scenes found'
			this.#listEl.appendChild(empty)
			return
		}

		for (const scene of scenes) {
			const li = this.#renderSceneItem(scene, currentId)
			this.#listEl.appendChild(li)
		}
	}

	// --- Recursive section rendering ---

	#renderSection(sectionId, currentId, depth) {
		// Render sub-sections at this level
		const subSections = this.#state.getSubSections(sectionId)
		for (const section of subSections) {
			this.#renderSectionItem(section, currentId, depth)
		}

		// Render scenes at this level
		const scenes = this.#state.getScenesInSection(sectionId)
		for (const scene of scenes) {
			const li = this.#renderSceneItem(scene, currentId, depth)
			this.#listEl.appendChild(li)
		}
	}

	#renderSectionItem(section, currentId, depth) {
		const header = document.createElement('li')
		header.className = 'scene-section-header'
		header.style.paddingLeft = `${12 + depth * 16}px`
		header.dataset.sectionId = section.id

		const arrow = document.createElement('span')
		arrow.className = 'section-arrow'
		arrow.textContent = section.collapsed ? '\u25B6' : '\u25BC'

		const label = document.createElement('span')
		label.className = 'section-label'
		label.textContent = section.name

		const actions = document.createElement('span')
		actions.className = 'section-actions'

		const addSceneBtn = document.createElement('button')
		addSceneBtn.textContent = '+'
		addSceneBtn.title = 'Add scene to this section'
		addSceneBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			const scene = this.#state.addScene(undefined, section.id)
			this.#state.selectScene(scene.id)
		})

		const addSubBtn = document.createElement('button')
		addSubBtn.textContent = '\uD83D\uDCC2'
		addSubBtn.title = 'Add sub-section'
		addSubBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			const name = prompt('Sub-section name:')
			if (name) {
				this.#state.addSceneSection(name, section.id)
			}
		})

		const delBtn = document.createElement('button')
		delBtn.textContent = '\u2715'
		delBtn.title = 'Delete section'
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#state.removeSceneSection(section.id)
		})

		actions.appendChild(addSceneBtn)
		actions.appendChild(addSubBtn)
		actions.appendChild(delBtn)

		header.appendChild(arrow)
		header.appendChild(label)
		header.appendChild(actions)

		// Click to toggle collapse
		header.addEventListener('click', () => {
			this.#state.toggleSceneSection(section.id)
		})

		// Double-click to rename
		header.addEventListener('dblclick', (e) => {
			e.stopPropagation()
			const newName = prompt('Rename section:', section.name)
			if (newName && newName !== section.name) {
				this.#state.renameSceneSection(section.id, newName)
			}
		})

		// Context menu
		header.addEventListener('contextmenu', (e) => {
			e.preventDefault()
			this.#showSectionContextMenu(e, section)
		})

		// Drop zone for scenes/sections being dragged into this section
		header.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.dataTransfer.dropEffect = 'move'
			header.classList.add('drop-target')
		})
		header.addEventListener('dragleave', () => {
			header.classList.remove('drop-target')
		})
		header.addEventListener('drop', (e) => {
			e.preventDefault()
			header.classList.remove('drop-target')
			try {
				const data = JSON.parse(e.dataTransfer.getData('text/plain'))
				if (data.type === 'scene') {
					this.#state.moveSceneToSection(data.sceneId, section.id)
				} else if (data.type === 'scene-section' && data.sectionId !== section.id) {
					this.#state.moveSceneSectionToSection(data.sectionId, section.id)
				}
			} catch {
				// Not a valid drag
			}
		})

		// Drag the section itself
		header.draggable = true
		header.addEventListener('dragstart', (e) => {
			e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'scene-section', sectionId: section.id }))
			e.dataTransfer.effectAllowed = 'move'
		})

		this.#listEl.appendChild(header)

		// Render children if not collapsed
		if (!section.collapsed) {
			this.#renderSection(section.id, currentId, depth + 1)
		}
	}

	#renderSceneItem(scene, currentId, depth = 0) {
		const li = document.createElement('li')
		li.className = scene.id === currentId ? 'active' : ''
		li.dataset.sceneId = scene.id
		if (depth > 0) {
			li.style.paddingLeft = `${12 + depth * 16}px`
		}

		const label = document.createElement('span')
		label.className = 'scene-label'
		label.textContent = scene.id
		if (scene.id === this.#state.project.startScene) {
			label.textContent += ' \u2605'
		}

		const actions = document.createElement('span')
		actions.className = 'scene-actions'

		const dupBtn = document.createElement('button')
		dupBtn.textContent = '\u2398'
		dupBtn.title = 'Duplicate'
		dupBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#state.duplicateScene(scene.id)
		})

		const delBtn = document.createElement('button')
		delBtn.textContent = '\u2715'
		delBtn.title = 'Delete'
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			if (this.#state.scenes.length <= 1) return
			this.#state.deleteScene(scene.id)
		})

		actions.appendChild(dupBtn)
		actions.appendChild(delBtn)

		li.appendChild(label)
		li.appendChild(actions)

		li.addEventListener('click', () => {
			this.#state.selectScene(scene.id)
		})

		li.addEventListener('contextmenu', (e) => {
			e.preventDefault()
			this.#showContextMenu(e, scene)
		})

		// Drag reorder / move to section
		li.draggable = true
		li.addEventListener('dragstart', (e) => {
			e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'scene', sceneId: scene.id }))
			e.dataTransfer.effectAllowed = 'move'
		})

		return li
	}

	// --- Context menus ---

	#showContextMenu(event, scene) {
		const existing = document.querySelector('.context-menu')
		if (existing) existing.remove()

		const menu = document.createElement('div')
		menu.className = 'context-menu'
		menu.style.cssText = `
			position: fixed;
			left: ${event.clientX}px;
			top: ${event.clientY}px;
			background: var(--bg-panel);
			border: 1px solid var(--border-color);
			border-radius: var(--radius);
			padding: 4px 0;
			z-index: 1000;
			min-width: 160px;
		`

		const items = [
			{
				label: 'Set as start scene',
				action: () => {
					this.#state.updateMeta('startScene', null)
					this.#state.project.startScene = scene.id
					this.render()
				}
			},
			{
				label: 'Rename',
				action: () => {
					const newId = prompt('Rename scene:', scene.id)
					if (newId && newId !== scene.id) {
						const oldId = scene.id
						for (const s of this.#state.scenes) {
							if (s.next === oldId) s.next = newId
							if (s.choices) {
								for (const c of s.choices) {
									if (c.targetSceneId === oldId) c.targetSceneId = newId
								}
							}
						}
						if (this.#state.project.startScene === oldId) {
							this.#state.project.startScene = newId
						}
						scene.id = newId
						this.#state.selectScene(newId)
					}
				}
			},
			{
				label: 'Duplicate',
				action: () => this.#state.duplicateScene(scene.id)
			},
			{
				label: 'Move to root',
				action: () => {
					this.#state.moveSceneToSection(scene.id, null)
				}
			},
			{
				label: 'Delete',
				danger: true,
				action: () => {
					if (this.#state.scenes.length <= 1) return
					this.#state.deleteScene(scene.id)
				}
			}
		]

		for (const item of items) {
			const opt = document.createElement('div')
			opt.textContent = item.label
			opt.style.cssText = `
				padding: 6px 16px;
				cursor: pointer;
				font-size: 13px;
				color: ${item.danger ? 'var(--danger)' : 'var(--text-primary)'};
			`
			opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--bg-hover)' })
			opt.addEventListener('mouseleave', () => { opt.style.background = 'transparent' })
			opt.addEventListener('click', () => {
				item.action()
				menu.remove()
			})
			menu.appendChild(opt)
		}

		document.body.appendChild(menu)

		const closeMenu = (e) => {
			if (!menu.contains(e.target)) {
				menu.remove()
				document.removeEventListener('click', closeMenu)
			}
		}
		setTimeout(() => document.addEventListener('click', closeMenu), 0)
	}

	#showSectionContextMenu(event, section) {
		const existing = document.querySelector('.context-menu')
		if (existing) existing.remove()

		const menu = document.createElement('div')
		menu.className = 'context-menu'
		menu.style.cssText = `
			position: fixed;
			left: ${event.clientX}px;
			top: ${event.clientY}px;
			background: var(--bg-panel);
			border: 1px solid var(--border-color);
			border-radius: var(--radius);
			padding: 4px 0;
			z-index: 1000;
			min-width: 160px;
		`

		const items = [
			{
				label: 'Rename',
				action: () => {
					const newName = prompt('Rename section:', section.name)
					if (newName && newName !== section.name) {
						this.#state.renameSceneSection(section.id, newName)
					}
				}
			},
			{
				label: 'Add scene here',
				action: () => {
					const scene = this.#state.addScene(undefined, section.id)
					this.#state.selectScene(scene.id)
				}
			},
			{
				label: 'Add sub-section',
				action: () => {
					const name = prompt('Sub-section name:')
					if (name) {
						this.#state.addSceneSection(name, section.id)
					}
				}
			},
			{
				label: 'Move to root',
				action: () => {
					this.#state.moveSceneSectionToSection(section.id, null)
				}
			},
			{
				label: 'Delete section',
				danger: true,
				action: () => {
					this.#state.removeSceneSection(section.id)
				}
			}
		]

		for (const item of items) {
			const opt = document.createElement('div')
			opt.textContent = item.label
			opt.style.cssText = `
				padding: 6px 16px;
				cursor: pointer;
				font-size: 13px;
				color: ${item.danger ? 'var(--danger)' : 'var(--text-primary)'};
			`
			opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--bg-hover)' })
			opt.addEventListener('mouseleave', () => { opt.style.background = 'transparent' })
			opt.addEventListener('click', () => {
				item.action()
				menu.remove()
			})
			menu.appendChild(opt)
		}

		document.body.appendChild(menu)

		const closeMenu = (e) => {
			if (!menu.contains(e.target)) {
				menu.remove()
				document.removeEventListener('click', closeMenu)
			}
		}
		setTimeout(() => document.addEventListener('click', closeMenu), 0)
	}
}
