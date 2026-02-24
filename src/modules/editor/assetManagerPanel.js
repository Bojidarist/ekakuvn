export class AssetManagerPanel {
	#state = null
	#containerEl = null
	#gridEl = null
	#breadcrumbEl = null
	#searchEl = null
	#searchInput = null
	#fileInput = null
	#selectedAssetId = null
	#currentFolderId = null
	#searchQuery = ''
	#editingId = null
	#activeAudio = null
	#activeOverlay = null

	constructor(state) {
		this.#state = state
		this.#containerEl = document.getElementById('asset-panel')
		this.#gridEl = document.getElementById('asset-grid')
		this.#fileInput = document.getElementById('file-input-asset')

		// Create search bar
		this.#searchEl = document.createElement('div')
		this.#searchEl.className = 'asset-search'
		this.#searchInput = document.createElement('input')
		this.#searchInput.type = 'text'
		this.#searchInput.placeholder = 'Search assets\u2026'
		this.#searchInput.addEventListener('input', () => {
			this.#searchQuery = this.#searchInput.value
			this.render()
		})
		this.#searchEl.appendChild(this.#searchInput)

		const clearBtn = document.createElement('button')
		clearBtn.className = 'search-clear'
		clearBtn.textContent = '\u00D7'
		clearBtn.title = 'Clear search'
		clearBtn.addEventListener('click', () => {
			this.#searchQuery = ''
			this.#searchInput.value = ''
			this.render()
		})
		this.#searchEl.appendChild(clearBtn)
		this.#containerEl.insertBefore(this.#searchEl, this.#gridEl)

		// Create breadcrumb bar
		this.#breadcrumbEl = document.createElement('div')
		this.#breadcrumbEl.className = 'asset-breadcrumb'
		this.#containerEl.insertBefore(this.#breadcrumbEl, this.#gridEl)

		document.getElementById('btn-add-asset').addEventListener('click', () => {
			this.#fileInput.click()
		})

		document.getElementById('btn-add-folder').addEventListener('click', () => {
			const folder = this.#state.addFolder('New Folder', this.#currentFolderId)
			if (folder) {
				this.#startEditing(folder.id, 'folder')
			}
		})

		this.#fileInput.addEventListener('change', (e) => this.#handleFiles(e.target.files))

		// Listen for state changes
		this.#state.on('assetsChanged', () => this.render())
		this.#state.on('foldersChanged', () => this.render())
		this.#state.on('projectChanged', () => {
			this.#currentFolderId = null
			this.#searchQuery = ''
			this.#searchInput.value = ''
			this.#selectedAssetId = null
			this.#stopAudio()
			this.#state.emit('assetSelectionChanged', null)
			this.render()
		})

		// Handle preview request from properties panel
		this.#state.on('assetPreviewRequested', (assetId) => {
			const asset = this.#state.assets.find(a => a.id === assetId)
			if (asset && (asset.type === 'background' || asset.type === 'character')) {
				this.#showImagePreview(asset)
			}
		})

		// Enable drag from asset grid
		this.#gridEl.addEventListener('dragstart', (e) => this.#onDragStart(e))

		// Enable drop onto grid for moving assets into folders
		this.#gridEl.addEventListener('dragover', (e) => {
			const data = e.dataTransfer.types
			if (data.includes('application/ekaku-asset-move') || data.includes('application/ekaku-folder-move')) {
				e.preventDefault()
				e.dataTransfer.dropEffect = 'move'
			}
		})
		this.#gridEl.addEventListener('drop', (e) => this.#onGridDrop(e))

		this.render()
	}

	get selectedAssetId() {
		return this.#selectedAssetId
	}

	get currentFolderId() {
		return this.#currentFolderId
	}

	render() {
		const isSearching = this.#searchQuery.trim().length > 0
		this.#breadcrumbEl.style.display = isSearching ? 'none' : ''
		if (!isSearching) {
			this.#renderBreadcrumb()
		}
		this.#renderGrid()
	}

	#renderBreadcrumb() {
		this.#breadcrumbEl.innerHTML = ''

		// Root
		const rootSpan = document.createElement('span')
		rootSpan.className = 'breadcrumb-item' + (this.#currentFolderId === null ? ' active' : '')
		rootSpan.textContent = 'Root'
		rootSpan.addEventListener('click', () => {
			this.#currentFolderId = null
			this.render()
		})
		// Drop target on breadcrumb
		rootSpan.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.dataTransfer.dropEffect = 'move'
			rootSpan.classList.add('drop-target')
		})
		rootSpan.addEventListener('dragleave', () => rootSpan.classList.remove('drop-target'))
		rootSpan.addEventListener('drop', (e) => {
			rootSpan.classList.remove('drop-target')
			this.#handleBreadcrumbDrop(e, null)
		})
		this.#breadcrumbEl.appendChild(rootSpan)

		// Path segments
		const path = this.#state.getFolderPath(this.#currentFolderId)
		for (const folder of path) {
			const sep = document.createElement('span')
			sep.className = 'breadcrumb-sep'
			sep.textContent = '\u203A'
			this.#breadcrumbEl.appendChild(sep)

			const item = document.createElement('span')
			item.className = 'breadcrumb-item' + (folder.id === this.#currentFolderId ? ' active' : '')
			item.textContent = folder.name
			item.addEventListener('click', () => {
				this.#currentFolderId = folder.id
				this.render()
			})
			// Drop target on breadcrumb segment
			item.addEventListener('dragover', (e) => {
				e.preventDefault()
				e.dataTransfer.dropEffect = 'move'
				item.classList.add('drop-target')
			})
			item.addEventListener('dragleave', () => item.classList.remove('drop-target'))
			item.addEventListener('drop', (e) => {
				item.classList.remove('drop-target')
				this.#handleBreadcrumbDrop(e, folder.id)
			})
			this.#breadcrumbEl.appendChild(item)
		}
	}

	#renderGrid() {
		this.#gridEl.innerHTML = ''

		const isSearching = this.#searchQuery.trim().length > 0

		if (isSearching) {
			// Search mode: show matching assets from ALL folders in flat list
			const query = this.#searchQuery.trim().toLowerCase()
			const matchingAssets = this.#state.assets.filter(a =>
				(a.name ?? a.id).toLowerCase().includes(query)
			)

			for (const asset of matchingAssets) {
				this.#renderAssetItem(asset, true)
			}

			if (matchingAssets.length === 0) {
				const empty = document.createElement('div')
				empty.className = 'asset-empty'
				empty.textContent = 'No matching assets'
				this.#gridEl.appendChild(empty)
			}
			return
		}

		// Normal folder navigation mode
		const subfolders = this.#state.getSubfolders(this.#currentFolderId)
		for (const folder of subfolders) {
			this.#renderFolderItem(folder)
		}

		const assets = this.#state.getAssetsInFolder(this.#currentFolderId)
		for (const asset of assets) {
			this.#renderAssetItem(asset, false)
		}

		if (subfolders.length === 0 && assets.length === 0) {
			const empty = document.createElement('div')
			empty.className = 'asset-empty'
			empty.textContent = 'Empty folder'
			this.#gridEl.appendChild(empty)
		}
	}

	#renderFolderItem(folder) {
		const item = document.createElement('div')
		item.className = 'asset-item folder-item'
		item.dataset.folderId = folder.id
		item.draggable = true

		const icon = document.createElement('span')
		icon.className = 'asset-type-icon folder-icon'
		icon.textContent = '\uD83D\uDCC1'
		item.appendChild(icon)

		if (this.#editingId === folder.id) {
			// Inline edit mode
			const input = this.#createInlineInput(folder.name, (newName) => {
				if (newName && newName !== folder.name) {
					this.#state.renameFolder(folder.id, newName)
				}
				this.#editingId = null
				this.render()
			})
			item.appendChild(input)
			// Stop click from navigating while editing
			item.addEventListener('click', (e) => e.stopPropagation())
		} else {
			const label = document.createElement('span')
			label.className = 'asset-label'
			label.textContent = folder.name
			label.title = folder.name
			item.appendChild(label)

			// Double-click label to rename
			label.addEventListener('dblclick', (e) => {
				e.stopPropagation()
				this.#startEditing(folder.id, 'folder')
			})

			// Single click to navigate into folder
			item.addEventListener('click', () => {
				this.#currentFolderId = folder.id
				this.#selectedAssetId = null
				this.#state.emit('assetSelectionChanged', null)
				this.render()
			})
		}

		// Context menu
		item.addEventListener('contextmenu', (e) => {
			e.preventDefault()
			this.#showFolderContextMenu(e, folder)
		})

		// Drag folder
		item.addEventListener('dragstart', (e) => {
			e.dataTransfer.setData('application/ekaku-folder-move', JSON.stringify({ folderId: folder.id }))
			e.dataTransfer.effectAllowed = 'move'
		})

		// Drop asset/folder onto this folder
		item.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.dataTransfer.dropEffect = 'move'
			item.classList.add('drop-target')
		})
		item.addEventListener('dragleave', () => item.classList.remove('drop-target'))
		item.addEventListener('drop', (e) => {
			e.preventDefault()
			e.stopPropagation()
			item.classList.remove('drop-target')

			const assetData = e.dataTransfer.getData('application/ekaku-asset-move')
			if (assetData) {
				try {
					const { assetId } = JSON.parse(assetData)
					this.#state.moveAssetToFolder(assetId, folder.id)
				} catch { /* ignore */ }
				return
			}

			const folderData = e.dataTransfer.getData('application/ekaku-folder-move')
			if (folderData) {
				try {
					const { folderId } = JSON.parse(folderData)
					if (folderId !== folder.id) {
						this.#state.moveFolderToFolder(folderId, folder.id)
					}
				} catch { /* ignore */ }
			}
		})

		this.#gridEl.appendChild(item)
	}

	#renderAssetItem(asset, showFolderPath) {
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

		// Show folder path in search results
		if (showFolderPath && asset.folderId) {
			const pathLabel = document.createElement('span')
			pathLabel.className = 'asset-label-path'
			const folderPath = this.#state.getFolderPath(asset.folderId)
			pathLabel.textContent = folderPath.map(f => f.name).join(' / ')
			pathLabel.title = pathLabel.textContent
			item.appendChild(pathLabel)
		}

		if (this.#editingId === asset.id) {
			// Inline edit mode
			const input = this.#createInlineInput(asset.name ?? asset.id, (newName) => {
				if (newName && newName !== (asset.name ?? asset.id)) {
					this.#state.updateAsset(asset.id, { name: newName })
				}
				this.#editingId = null
				this.render()
			})
			item.appendChild(input)
		} else {
			const label = document.createElement('span')
			label.className = 'asset-label'

			// Highlight matching text in search mode
			if (showFolderPath && this.#searchQuery.trim()) {
				this.#highlightLabel(label, asset.name ?? asset.id, this.#searchQuery.trim())
			} else {
				label.textContent = asset.name ?? asset.id
			}
			label.title = `${asset.name ?? asset.id} (${asset.type})`
			item.appendChild(label)

			// Double-click label to rename
			label.addEventListener('dblclick', (e) => {
				e.stopPropagation()
				this.#startEditing(asset.id, 'asset')
			})
		}

		item.addEventListener('click', () => {
			this.#selectedAssetId = asset.id
			this.#state.selectElement(null)
			this.#state.emit('assetSelectionChanged', asset.id)
			this.render()
		})

		// Double-click to preview
		item.addEventListener('dblclick', (e) => {
			e.stopPropagation()
			if (asset.type === 'background' || asset.type === 'character') {
				this.#showImagePreview(asset)
			} else if (asset.type === 'music' || asset.type === 'sound') {
				this.#showAudioPreview(asset)
			}
		})

		item.addEventListener('contextmenu', (e) => {
			e.preventDefault()
			this.#showAssetContextMenu(e, asset)
		})

		this.#gridEl.appendChild(item)
	}

	#handleFiles(files) {
		if (!files || files.length === 0) return

		for (const file of files) {
			const reader = new FileReader()
			reader.onload = async (e) => {
				const dataUrl = e.target.result
				const name = file.name.replace(/\.[^.]+$/, '')
				const type = await this.#inferAssetType(file, dataUrl)

				this.#state.addAsset({
					type,
					path: file.name,
					dataUrl,
					name,
					folderId: this.#currentFolderId
				})
			}
			reader.readAsDataURL(file)
		}

		// Reset file input so same file can be selected again
		this.#fileInput.value = ''
	}

	async #inferAssetType(file, dataUrl) {
		// Filename-based hints take priority
		const nameLower = file.name.toLowerCase()
		if (/(?:^|[_\-. ])(?:bg|background|backdrop|scene)(?:[_\-. ]|$)/.test(nameLower)) {
			return 'background'
		}
		if (/(?:^|[_\-. ])(?:char|sprite|character|avatar)(?:[_\-. ]|$)/.test(nameLower)) {
			return 'character'
		}

		if (file.type.startsWith('image/')) {
			// Dimension-based heuristic: landscape images >= 960px wide are backgrounds
			try {
				const { width, height } = await this.#getImageDimensions(dataUrl)
				if (width >= height && width >= 960) {
					return 'background'
				}
			} catch {
				// Fall through to default
			}
			return 'character'
		}
		if (file.type.startsWith('audio/')) {
			return 'music'
		}
		return 'character'
	}

	#getImageDimensions(dataUrl) {
		return new Promise((resolve, reject) => {
			const img = new Image()
			img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
			img.onerror = reject
			img.src = dataUrl
		})
	}

	#onDragStart(e) {
		const item = e.target.closest('.asset-item')
		if (!item) return

		// Folder drag is handled separately in renderFolderItem
		if (item.classList.contains('folder-item')) return

		const assetId = item.dataset.assetId
		const assetType = item.dataset.assetType

		// Set both move and copy data — copy for canvas drops, move for folder drops
		e.dataTransfer.setData('application/ekaku-asset', JSON.stringify({ assetId, assetType }))
		e.dataTransfer.setData('application/ekaku-asset-move', JSON.stringify({ assetId }))
		e.dataTransfer.effectAllowed = 'copyMove'
	}

	#onGridDrop(e) {
		// Handle dropping an asset onto the grid background (move to current folder)
		const assetData = e.dataTransfer.getData('application/ekaku-asset-move')
		if (assetData) {
			try {
				const { assetId } = JSON.parse(assetData)
				this.#state.moveAssetToFolder(assetId, this.#currentFolderId)
			} catch { /* ignore */ }
			return
		}

		const folderData = e.dataTransfer.getData('application/ekaku-folder-move')
		if (folderData) {
			try {
				const { folderId } = JSON.parse(folderData)
				this.#state.moveFolderToFolder(folderId, this.#currentFolderId)
			} catch { /* ignore */ }
		}
	}

	#handleBreadcrumbDrop(e, targetFolderId) {
		e.preventDefault()
		e.stopPropagation()

		const assetData = e.dataTransfer.getData('application/ekaku-asset-move')
		if (assetData) {
			try {
				const { assetId } = JSON.parse(assetData)
				this.#state.moveAssetToFolder(assetId, targetFolderId)
			} catch { /* ignore */ }
			return
		}

		const folderData = e.dataTransfer.getData('application/ekaku-folder-move')
		if (folderData) {
			try {
				const { folderId } = JSON.parse(folderData)
				this.#state.moveFolderToFolder(folderId, targetFolderId)
			} catch { /* ignore */ }
		}
	}

	#showFolderContextMenu(event, folder) {
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

		// Rename
		const renameOpt = this.#createMenuOption('Rename', () => {
			menu.remove()
			this.#startEditing(folder.id, 'folder')
		})
		menu.appendChild(renameOpt)

		// Delete
		const deleteOpt = this.#createMenuOption('Delete', () => {
			if (confirm(`Delete folder "${folder.name}"? Assets inside will be moved to the parent folder.`)) {
				this.#state.removeFolder(folder.id)
			}
			menu.remove()
		}, 'var(--danger)')
		menu.appendChild(deleteOpt)

		document.body.appendChild(menu)
		this.#autoCloseMenu(menu)
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
			const opt = this.#createMenuOption(
				(asset.type === type ? '\u2713 ' : '  ') + `Set as ${type}`,
				() => {
					this.#state.updateAsset(asset.id, { type })
					menu.remove()
				}
			)
			menu.appendChild(opt)
		}

		// Separator
		const sep = document.createElement('div')
		sep.style.cssText = 'height: 1px; background: var(--border-color); margin: 4px 0;'
		menu.appendChild(sep)

		// Move to folder submenu
		const folders = this.#state.folders
		if (folders.length > 0) {
			const moveLabel = this.#createMenuOption('Move to...', null)
			moveLabel.style.color = 'var(--text-secondary)'
			moveLabel.style.cursor = 'default'
			moveLabel.style.fontSize = '11px'
			moveLabel.style.textTransform = 'uppercase'
			moveLabel.style.letterSpacing = '0.5px'
			menu.appendChild(moveLabel)

			// Root option
			if (asset.folderId !== null) {
				const rootOpt = this.#createMenuOption('  Root', () => {
					this.#state.moveAssetToFolder(asset.id, null)
					menu.remove()
				})
				menu.appendChild(rootOpt)
			}

			for (const folder of folders) {
				if (folder.id === asset.folderId) continue
				const folderOpt = this.#createMenuOption(`  ${folder.name}`, () => {
					this.#state.moveAssetToFolder(asset.id, folder.id)
					menu.remove()
				})
				menu.appendChild(folderOpt)
			}

			const sep2 = document.createElement('div')
			sep2.style.cssText = 'height: 1px; background: var(--border-color); margin: 4px 0;'
			menu.appendChild(sep2)
		}

		// Rename
		const renameOpt = this.#createMenuOption('Rename', () => {
			menu.remove()
			this.#startEditing(asset.id, 'asset')
		})
		menu.appendChild(renameOpt)

		// Delete
		const deleteOpt = this.#createMenuOption('Delete', () => {
			this.#state.removeAsset(asset.id)
			menu.remove()
		}, 'var(--danger)')
		menu.appendChild(deleteOpt)

		document.body.appendChild(menu)
		this.#autoCloseMenu(menu)
	}

	#createMenuOption(text, onClick, color) {
		const opt = document.createElement('div')
		opt.textContent = text
		opt.style.cssText = `
			padding: 6px 16px;
			cursor: pointer;
			font-size: 13px;
			color: ${color ?? 'var(--text-primary)'};
		`
		opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--bg-hover)' })
		opt.addEventListener('mouseleave', () => { opt.style.background = 'transparent' })
		if (onClick) opt.addEventListener('click', onClick)
		return opt
	}

	#autoCloseMenu(menu) {
		const closeMenu = (e) => {
			if (!menu.contains(e.target)) {
				menu.remove()
				document.removeEventListener('click', closeMenu)
			}
		}
		setTimeout(() => document.addEventListener('click', closeMenu), 0)
	}

	// --- Inline editing ---

	#startEditing(id, kind) {
		this.#editingId = id
		this.render()
		// Focus the input after render
		const input = this.#gridEl.querySelector('.asset-label-edit')
		if (input) {
			input.focus()
			input.select()
		}
	}

	#createInlineInput(currentName, onCommit) {
		const input = document.createElement('input')
		input.type = 'text'
		input.className = 'asset-label-edit'
		input.value = currentName

		let committed = false
		const commit = () => {
			if (committed) return
			committed = true
			const val = input.value.trim()
			onCommit(val || null)
		}

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault()
				commit()
			} else if (e.key === 'Escape') {
				e.preventDefault()
				committed = true
				this.#editingId = null
				this.render()
			}
			e.stopPropagation()
		})
		input.addEventListener('blur', commit)
		input.addEventListener('click', (e) => e.stopPropagation())
		input.addEventListener('dblclick', (e) => e.stopPropagation())

		return input
	}

	#highlightLabel(labelEl, name, query) {
		const lower = name.toLowerCase()
		const qLower = query.toLowerCase()
		const idx = lower.indexOf(qLower)
		if (idx < 0) {
			labelEl.textContent = name
			return
		}

		const before = name.slice(0, idx)
		const match = name.slice(idx, idx + query.length)
		const after = name.slice(idx + query.length)

		if (before) labelEl.appendChild(document.createTextNode(before))

		const mark = document.createElement('mark')
		mark.style.cssText = 'background: var(--accent-dim); color: var(--accent); border-radius: 2px;'
		mark.textContent = match
		labelEl.appendChild(mark)

		if (after) labelEl.appendChild(document.createTextNode(after))
	}

	// --- Preview ---

	#showImagePreview(asset) {
		this.#closePreview()

		const overlay = document.createElement('div')
		overlay.className = 'preview-overlay'

		const modal = document.createElement('div')
		modal.className = 'preview-modal'

		const img = document.createElement('img')
		img.src = asset.dataUrl ?? asset.path
		img.alt = asset.name ?? asset.id

		const title = document.createElement('div')
		title.className = 'preview-modal-title'
		title.textContent = asset.name ?? asset.id

		const meta = document.createElement('div')
		meta.className = 'preview-modal-meta'
		meta.textContent = 'Loading...'

		// Load dimensions and compute approximate file size
		img.addEventListener('load', () => {
			const w = img.naturalWidth
			const h = img.naturalHeight
			const sizeBytes = asset.dataUrl
				? Math.round((asset.dataUrl.length - asset.dataUrl.indexOf(',') - 1) * 3 / 4)
				: null
			const sizeStr = sizeBytes != null ? this.#formatFileSize(sizeBytes) : 'unknown size'
			meta.textContent = `${w} \u00D7 ${h} \u2022 ${asset.type} \u2022 ${sizeStr}`
		})

		const closeBtn = document.createElement('button')
		closeBtn.className = 'preview-modal-close'
		closeBtn.textContent = '\u00D7'
		closeBtn.addEventListener('click', () => this.#closePreview())

		modal.appendChild(img)
		modal.appendChild(title)
		modal.appendChild(meta)
		overlay.appendChild(modal)
		overlay.appendChild(closeBtn)

		// Close on click outside modal
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) this.#closePreview()
		})

		// Close on Escape
		const onKey = (e) => {
			if (e.key === 'Escape') {
				this.#closePreview()
				document.removeEventListener('keydown', onKey)
			}
		}
		document.addEventListener('keydown', onKey)

		document.body.appendChild(overlay)
		this.#activeOverlay = { overlay, onKey }
	}

	#showAudioPreview(asset) {
		this.#closePreview()
		this.#stopAudio()

		const overlay = document.createElement('div')
		overlay.className = 'preview-overlay'

		const modal = document.createElement('div')
		modal.className = 'preview-modal'

		const title = document.createElement('div')
		title.className = 'preview-modal-title'
		title.textContent = asset.name ?? asset.id

		const meta = document.createElement('div')
		meta.className = 'preview-modal-meta'
		meta.textContent = asset.type

		const player = this.#createAudioPlayer(asset)

		const closeBtn = document.createElement('button')
		closeBtn.className = 'preview-modal-close'
		closeBtn.textContent = '\u00D7'
		closeBtn.addEventListener('click', () => this.#closePreview())

		modal.appendChild(title)
		modal.appendChild(meta)
		modal.appendChild(player)
		overlay.appendChild(modal)
		overlay.appendChild(closeBtn)

		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) this.#closePreview()
		})

		const onKey = (e) => {
			if (e.key === 'Escape') {
				this.#closePreview()
				document.removeEventListener('keydown', onKey)
			}
		}
		document.addEventListener('keydown', onKey)

		document.body.appendChild(overlay)
		this.#activeOverlay = { overlay, onKey }
	}

	#createAudioPlayer(asset) {
		const container = document.createElement('div')
		container.className = 'audio-player'

		const audio = new Audio(asset.dataUrl ?? asset.path)
		this.#activeAudio = audio

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

		container.appendChild(playBtn)
		container.appendChild(seekBar)
		container.appendChild(timeLabel)

		return container
	}

	#closePreview() {
		if (this.#activeOverlay) {
			this.#activeOverlay.overlay.remove()
			if (this.#activeOverlay.onKey) {
				document.removeEventListener('keydown', this.#activeOverlay.onKey)
			}
			this.#activeOverlay = null
		}
		this.#stopAudio()
	}

	#stopAudio() {
		if (this.#activeAudio) {
			this.#activeAudio.pause()
			this.#activeAudio.src = ''
			this.#activeAudio = null
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
}
