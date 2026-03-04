import { EditorModal } from './editorModal.js'
import { createContextMenu } from '../shared/contextMenu.js'

export class SceneManagerPanel {
	#state = null
	#listEl = null
	#searchInput = null
	#searchClearBtn = null
	#searchQuery = ''

	// Track the element currently showing a drop indicator so we can clear it
	#dropIndicatorEl = null
	#dropIndicatorClass = null

	constructor(state) {
		this.#state = state
		this.#listEl = document.getElementById('scene-list')
		this.#searchInput = document.getElementById('scene-search-input')
		this.#searchClearBtn = document.getElementById('scene-search-clear')

		document.getElementById('btn-add-scene').addEventListener('click', () => {
			const scene = this.#state.addScene()
			this.#state.selectScene(scene.id)
		})

		document.getElementById('btn-add-section').addEventListener('click', async () => {
			const name = await EditorModal.prompt('Section name:')
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
		this.#dropIndicatorEl = null
		this.#dropIndicatorClass = null
		this.#listEl.innerHTML = ''
		const currentId = this.#state.currentSceneId

		if (this.#searchQuery) {
			this.#renderSearchResults(currentId)
		} else {
			this.#renderSection(null, currentId, 0)
		}
	}

	// --- Drop indicator helpers ---

	#setDropIndicator(el, cls) {
		if (this.#dropIndicatorEl === el && this.#dropIndicatorClass === cls) return
		this.#clearDropIndicator()
		el.classList.add(cls)
		this.#dropIndicatorEl = el
		this.#dropIndicatorClass = cls
	}

	#clearDropIndicator() {
		if (this.#dropIndicatorEl && this.#dropIndicatorClass) {
			this.#dropIndicatorEl.classList.remove(this.#dropIndicatorClass)
		}
		this.#dropIndicatorEl = null
		this.#dropIndicatorClass = null
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

	// --- Drag-over helpers: determine before/after based on cursor position ---

	#getInsertPosition(e, el) {
		const rect = el.getBoundingClientRect()
		const midY = rect.top + rect.height / 2
		return e.clientY < midY ? 'before' : 'after'
	}

	// Attach reorder drag-over/dragleave/drop to an item row.
	// onDrop(position, dragData) is called with 'before'|'after' and the parsed drag payload.
	#attachReorderDrop(el, onDrop) {
		el.addEventListener('dragover', (e) => {
			// Only accept scene or scene-section drags
			e.preventDefault()
			e.dataTransfer.dropEffect = 'move'
			const pos = this.#getInsertPosition(e, el)
			this.#setDropIndicator(el, pos === 'before' ? 'drag-insert-before' : 'drag-insert-after')
		})

		el.addEventListener('dragleave', (e) => {
			// Only clear if we're leaving the element itself (not moving to a child)
			if (!el.contains(e.relatedTarget)) {
				this.#clearDropIndicator()
			}
		})

		el.addEventListener('drop', (e) => {
			e.preventDefault()
			const pos = this.#getInsertPosition(e, el)
			this.#clearDropIndicator()
			try {
				const data = JSON.parse(e.dataTransfer.getData('text/plain'))
				onDrop(pos, data)
			} catch {
				// Invalid drag data
			}
		})
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
		addSubBtn.addEventListener('click', async (e) => {
			e.stopPropagation()
			const name = await EditorModal.prompt('Sub-section name:')
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
		header.addEventListener('dblclick', async (e) => {
			e.stopPropagation()
			const newName = await EditorModal.prompt('Rename section:', section.name)
			if (newName && newName !== section.name) {
				this.#state.renameSceneSection(section.id, newName)
			}
		})

		// Context menu
		header.addEventListener('contextmenu', (e) => {
			e.preventDefault()
			this.#showSectionContextMenu(e, section)
		})

		// Drag the section itself
		header.draggable = true
		header.addEventListener('dragstart', (e) => {
			e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'scene-section', sectionId: section.id }))
			e.dataTransfer.effectAllowed = 'move'
			// Small delay so the drag image doesn't show the indicator
			setTimeout(() => header.classList.remove('drag-insert-before', 'drag-insert-after'), 0)
		})

		// Reorder drop: insert before/after this section header
		this.#attachReorderDrop(header, (pos, data) => {
			if (data.type === 'scene-section' && data.sectionId !== section.id) {
				// Reorder or re-parent the dragged section relative to this one
				const allSections = this.#state.sceneSections
				const fromIdx = allSections.findIndex(s => s.id === data.sectionId)
				let toIdx = allSections.findIndex(s => s.id === section.id)
				if (fromIdx === -1 || toIdx === -1) return

				// Re-parent to same parent as target, then reorder
				const targetParentId = section.parentId ?? null
				this.#state.moveSceneSectionToSection(data.sectionId, targetParentId)

				// Recompute indices after re-parent (state re-renders, so read fresh)
				const updatedSections = this.#state.sceneSections
				const newFrom = updatedSections.findIndex(s => s.id === data.sectionId)
				let newTo = updatedSections.findIndex(s => s.id === section.id)
				if (newFrom === -1 || newTo === -1) return
				if (pos === 'after') newTo += 1
				if (newFrom !== newTo) {
					this.#state.reorderSceneSection(newFrom, newTo)
				}
			} else if (data.type === 'scene') {
				// Drop a scene before/after this section — move into same parent section
				const targetSectionId = section.parentId ?? null
				this.#state.moveSceneToSection(data.sceneId, targetSectionId)
				// Reorder the scene to appear before/after the first scene in the target section
				const scenes = this.#state.scenes
				const fromIdx = scenes.findIndex(s => s.id === data.sceneId)
				// Find the first scene in this section and insert before it
				const firstSceneInSection = scenes.find(s => (s.sectionId ?? null) === targetSectionId)
				let toIdx = firstSceneInSection ? scenes.findIndex(s => s.id === firstSceneInSection.id) : scenes.length
				if (fromIdx !== -1 && fromIdx !== toIdx) {
					this.#state.reorderScenes(fromIdx, toIdx)
				}
			}
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
			setTimeout(() => li.classList.remove('drag-insert-before', 'drag-insert-after'), 0)
		})

		// Reorder drop: insert before/after this scene
		this.#attachReorderDrop(li, (pos, data) => {
			if (data.type === 'scene' && data.sceneId !== scene.id) {
				const scenes = this.#state.scenes
				const fromIdx = scenes.findIndex(s => s.id === data.sceneId)
				let toIdx = scenes.findIndex(s => s.id === scene.id)
				if (fromIdx === -1 || toIdx === -1) return

				// Move to the same section as target
				const targetSectionId = scene.sectionId ?? null
				this.#state.moveSceneToSection(data.sceneId, targetSectionId)

				// Recompute indices after section move
				const updatedScenes = this.#state.scenes
				const newFrom = updatedScenes.findIndex(s => s.id === data.sceneId)
				let newTo = updatedScenes.findIndex(s => s.id === scene.id)
				if (newFrom === -1 || newTo === -1) return
				if (pos === 'after') newTo += 1
				if (newFrom !== newTo) {
					this.#state.reorderScenes(newFrom, newTo)
				}
			} else if (data.type === 'scene-section') {
				// Drop a section before/after this scene — re-parent section to same parent as scene's section
				const targetParentId = scene.sectionId ?? null
				this.#state.moveSceneSectionToSection(data.sectionId, targetParentId)
			}
		})

		return li
	}

	// --- Context menus ---

	#showContextMenu(event, scene) {
		createContextMenu(event, [
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
				action: async () => {
					const newId = await EditorModal.prompt('Rename scene:', scene.id)
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
		])
	}

	#showSectionContextMenu(event, section) {
		createContextMenu(event, [
			{
				label: 'Rename',
				action: async () => {
					const newName = await EditorModal.prompt('Rename section:', section.name)
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
				action: async () => {
					const name = await EditorModal.prompt('Sub-section name:')
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
		])
	}
}
