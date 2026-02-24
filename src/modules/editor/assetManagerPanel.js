export class AssetManagerPanel {
	#state = null
	#gridEl = null
	#fileInput = null
	#selectedAssetId = null

	constructor(state) {
		this.#state = state
		this.#gridEl = document.getElementById('asset-grid')
		this.#fileInput = document.getElementById('file-input-asset')

		document.getElementById('btn-add-asset').addEventListener('click', () => {
			this.#fileInput.click()
		})

		this.#fileInput.addEventListener('change', (e) => this.#handleFiles(e.target.files))

		// Listen for state changes
		this.#state.on('assetsChanged', () => this.render())
		this.#state.on('projectChanged', () => this.render())

		// Enable drag from asset grid
		this.#gridEl.addEventListener('dragstart', (e) => this.#onDragStart(e))

		this.render()
	}

	get selectedAssetId() {
		return this.#selectedAssetId
	}

	render() {
		this.#gridEl.innerHTML = ''
		const assets = this.#state.assets

		for (const asset of assets) {
			const item = document.createElement('div')
			item.className = 'asset-item' + (asset.id === this.#selectedAssetId ? ' selected' : '')
			item.draggable = true
			item.dataset.assetId = asset.id
			item.dataset.assetType = asset.type

			if (asset.type === 'background' || asset.type === 'character') {
				const img = document.createElement('img')
				img.src = asset.dataUrl ?? asset.path
				img.alt = asset.name ?? asset.id
				item.appendChild(img)
			} else {
				const icon = document.createElement('span')
				icon.className = 'asset-type-icon'
				icon.textContent = asset.type === 'music' ? '\u266B' : '\u266A'
				item.appendChild(icon)
			}

			const label = document.createElement('span')
			label.className = 'asset-label'
			label.textContent = asset.name ?? asset.id
			label.title = `${asset.name ?? asset.id} (${asset.type})`
			item.appendChild(label)

			item.addEventListener('click', () => {
				this.#selectedAssetId = asset.id
				this.#state.selectElement(null) // deselect canvas elements
				this.render()
			})

			item.addEventListener('contextmenu', (e) => {
				e.preventDefault()
				this.#showAssetContextMenu(e, asset)
			})

			this.#gridEl.appendChild(item)
		}
	}

	#handleFiles(files) {
		if (!files || files.length === 0) return

		for (const file of files) {
			const reader = new FileReader()
			reader.onload = (e) => {
				const dataUrl = e.target.result
				const type = this.#inferAssetType(file)
				const name = file.name.replace(/\.[^.]+$/, '')

				this.#state.addAsset({
					type,
					path: file.name,
					dataUrl,
					name
				})
			}
			reader.readAsDataURL(file)
		}

		// Reset file input so same file can be selected again
		this.#fileInput.value = ''
	}

	#inferAssetType(file) {
		if (file.type.startsWith('image/')) {
			// Heuristic: wider images are backgrounds, taller ones are characters
			// Default to character since that's the more common drag-drop use case
			return 'character'
		}
		if (file.type.startsWith('audio/')) {
			return 'music'
		}
		return 'character'
	}

	#onDragStart(e) {
		const item = e.target.closest('.asset-item')
		if (!item) return

		const assetId = item.dataset.assetId
		const assetType = item.dataset.assetType
		e.dataTransfer.setData('application/ekaku-asset', JSON.stringify({ assetId, assetType }))
		e.dataTransfer.effectAllowed = 'copy'
	}

	#showAssetContextMenu(event, asset) {
		// Remove any existing menu
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
			min-width: 140px;
		`

		const types = ['background', 'character', 'music', 'sound']
		for (const type of types) {
			const opt = document.createElement('div')
			opt.textContent = (asset.type === type ? '\u2713 ' : '  ') + `Set as ${type}`
			opt.style.cssText = `
				padding: 6px 16px;
				cursor: pointer;
				font-size: 13px;
				color: var(--text-primary);
			`
			opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--bg-hover)' })
			opt.addEventListener('mouseleave', () => { opt.style.background = 'transparent' })
			opt.addEventListener('click', () => {
				this.#state.updateAsset(asset.id, { type })
				menu.remove()
			})
			menu.appendChild(opt)
		}

		// Separator
		const sep = document.createElement('div')
		sep.style.cssText = 'height: 1px; background: var(--border-color); margin: 4px 0;'
		menu.appendChild(sep)

		// Rename
		const renameOpt = document.createElement('div')
		renameOpt.textContent = 'Rename'
		renameOpt.style.cssText = `padding: 6px 16px; cursor: pointer; font-size: 13px; color: var(--text-primary);`
		renameOpt.addEventListener('mouseenter', () => { renameOpt.style.background = 'var(--bg-hover)' })
		renameOpt.addEventListener('mouseleave', () => { renameOpt.style.background = 'transparent' })
		renameOpt.addEventListener('click', () => {
			const newName = prompt('Rename asset:', asset.name ?? asset.id)
			if (newName) this.#state.updateAsset(asset.id, { name: newName })
			menu.remove()
		})
		menu.appendChild(renameOpt)

		// Delete
		const deleteOpt = document.createElement('div')
		deleteOpt.textContent = 'Delete'
		deleteOpt.style.cssText = `padding: 6px 16px; cursor: pointer; font-size: 13px; color: var(--danger);`
		deleteOpt.addEventListener('mouseenter', () => { deleteOpt.style.background = 'var(--bg-hover)' })
		deleteOpt.addEventListener('mouseleave', () => { deleteOpt.style.background = 'transparent' })
		deleteOpt.addEventListener('click', () => {
			this.#state.removeAsset(asset.id)
			menu.remove()
		})
		menu.appendChild(deleteOpt)

		document.body.appendChild(menu)

		// Close on click outside
		const closeMenu = (e) => {
			if (!menu.contains(e.target)) {
				menu.remove()
				document.removeEventListener('click', closeMenu)
			}
		}
		setTimeout(() => document.addEventListener('click', closeMenu), 0)
	}
}
