export class SceneManagerPanel {
	#state = null
	#listEl = null

	constructor(state) {
		this.#state = state
		this.#listEl = document.getElementById('scene-list')

		document.getElementById('btn-add-scene').addEventListener('click', () => {
			const scene = this.#state.addScene()
			this.#state.selectScene(scene.id)
		})

		this.#state.on('scenesChanged', () => this.render())
		this.#state.on('sceneChanged', () => this.render())
		this.#state.on('projectChanged', () => this.render())

		this.render()
	}

	render() {
		this.#listEl.innerHTML = ''
		const scenes = this.#state.scenes
		const currentId = this.#state.currentSceneId

		for (let i = 0; i < scenes.length; i++) {
			const scene = scenes[i]
			const li = document.createElement('li')
			li.className = scene.id === currentId ? 'active' : ''
			li.dataset.sceneId = scene.id

			const label = document.createElement('span')
			label.className = 'scene-label'
			label.textContent = scene.id
			if (scene.id === this.#state.project.startScene) {
				label.textContent += ' \u2605' // star for start scene
			}

			const actions = document.createElement('span')
			actions.className = 'scene-actions'

			const dupBtn = document.createElement('button')
			dupBtn.textContent = '\u2398' // duplicate icon
			dupBtn.title = 'Duplicate'
			dupBtn.addEventListener('click', (e) => {
				e.stopPropagation()
				this.#state.duplicateScene(scene.id)
			})

			const delBtn = document.createElement('button')
			delBtn.textContent = '\u2715' // x icon
			delBtn.title = 'Delete'
			delBtn.addEventListener('click', (e) => {
				e.stopPropagation()
				if (scenes.length <= 1) return
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

			// Drag reorder support
			li.draggable = true
			li.addEventListener('dragstart', (e) => {
				e.dataTransfer.setData('text/plain', String(i))
				e.dataTransfer.effectAllowed = 'move'
			})
			li.addEventListener('dragover', (e) => {
				e.preventDefault()
				e.dataTransfer.dropEffect = 'move'
				li.style.borderTop = '2px solid var(--accent)'
			})
			li.addEventListener('dragleave', () => {
				li.style.borderTop = ''
			})
			li.addEventListener('drop', (e) => {
				e.preventDefault()
				li.style.borderTop = ''
				const fromIndex = parseInt(e.dataTransfer.getData('text/plain'))
				if (!isNaN(fromIndex) && fromIndex !== i) {
					this.#state.reorderScenes(fromIndex, i)
				}
			})

			this.#listEl.appendChild(li)
		}
	}

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
						// Update all references
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
}
