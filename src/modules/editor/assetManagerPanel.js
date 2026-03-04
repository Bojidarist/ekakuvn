import { createMenuContainer, createMenuOption, createMenuSeparator, autoCloseMenu } from '../shared/contextMenu.js'
import { handleFiles, onAssetDragStart, onGridDrop } from './assets/assetImporter.js'
import { AssetPreview } from './assets/assetPreview.js'
import { renderBreadcrumb, renderFolderItem, createInlineInput, highlightLabel } from './assets/folderNavigation.js'
import { assetDB } from '../shared/assetDB.js'
import { formatFileSize } from '../shared/utils.js'

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
	#preview = null
	#usageBarEl = null
	#usageFillEl = null
	#usageLabelEl = null

	constructor(state) {
		this.#state = state
		this.#containerEl = document.getElementById('asset-panel')
		this.#gridEl = document.getElementById('asset-grid')
		this.#fileInput = document.getElementById('file-input-asset')
		this.#preview = new AssetPreview()

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
				this.#startEditing(folder.id)
			}
		})

		this.#fileInput.addEventListener('change', (e) => {
			handleFiles(e.target.files, this.#state, this.#currentFolderId, this.#fileInput)
		})

		// Listen for state changes
		this.#state.on('assetsChanged', () => {
			this.render()
		})
		this.#state.on('foldersChanged', () => this.render())
		this.#state.on('projectChanged', () => {
			this.#currentFolderId = null
			this.#searchQuery = ''
			this.#searchInput.value = ''
			this.#selectedAssetId = null
			this.#preview.close()
			this.#state.emit('assetSelectionChanged', null)
			this.render()
		})

		// Handle preview request from properties panel
		this.#state.on('assetPreviewRequested', (assetId) => {
			const asset = this.#state.assets.find(a => a.id === assetId)
			if (asset && (asset.type === 'background' || asset.type === 'character')) {
				this.#preview.showImage(asset)
			} else if (asset && asset.type === 'video') {
				this.#preview.showVideo(asset)
			}
		})

		// Enable drag from asset grid
		this.#gridEl.addEventListener('dragstart', (e) => onAssetDragStart(e))

		// Enable drop onto grid for moving assets into folders
		this.#gridEl.addEventListener('dragover', (e) => {
			const data = e.dataTransfer.types
			if (data.includes('application/ekaku-asset-move') || data.includes('application/ekaku-folder-move')) {
				e.preventDefault()
				e.dataTransfer.dropEffect = 'move'
			}
		})
		this.#gridEl.addEventListener('drop', (e) => {
			onGridDrop(e, this.#state, this.#currentFolderId)
		})

		// Build usage bar (appended after the grid)
		this.#usageBarEl = document.createElement('div')
		this.#usageBarEl.className = 'asset-usage-bar'

		const track = document.createElement('div')
		track.className = 'asset-usage-track'

		this.#usageFillEl = document.createElement('div')
		this.#usageFillEl.className = 'asset-usage-fill'
		track.appendChild(this.#usageFillEl)

		this.#usageLabelEl = document.createElement('span')
		this.#usageLabelEl.className = 'asset-usage-label'
		this.#usageLabelEl.textContent = 'Storage: \u2026'

		this.#usageBarEl.appendChild(track)
		this.#usageBarEl.appendChild(this.#usageLabelEl)
		this.#containerEl.appendChild(this.#usageBarEl)

		this.#updateUsageBar()
		setInterval(() => this.#updateUsageBar(), 5000)

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
			renderBreadcrumb(this.#breadcrumbEl, this.#state, this.#currentFolderId, (folderId) => {
				this.#currentFolderId = folderId
				this.render()
			})
		}
		this.#renderGrid()
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
		const callbacks = this.#getFolderCallbacks()

		const subfolders = this.#state.getSubfolders(this.#currentFolderId)
		for (const folder of subfolders) {
			renderFolderItem(this.#gridEl, folder, this.#state, callbacks)
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

	#getFolderCallbacks() {
		return {
			editingId: this.#editingId,
			onNavigate: (folderId) => {
				this.#currentFolderId = folderId
				this.#selectedAssetId = null
				this.#state.emit('assetSelectionChanged', null)
				this.render()
			},
			onStartEditing: (id) => this.#startEditing(id),
			clearEditing: () => { this.#editingId = null },
			onRender: () => this.render()
		}
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
			if (asset.type === 'music') icon.textContent = '\u266B'
			else if (asset.type === 'sound') icon.textContent = '\u266A'
			else if (asset.type === 'video') icon.textContent = '\u25B6'
			else icon.textContent = '\u2753'
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
			const callbacks = this.#getFolderCallbacks()
			const input = createInlineInput(asset.name ?? asset.id, (newName) => {
				if (newName && newName !== (asset.name ?? asset.id)) {
					this.#state.updateAsset(asset.id, { name: newName })
				}
				this.#editingId = null
				this.render()
			}, callbacks)
			item.appendChild(input)
		} else {
			const label = document.createElement('span')
			label.className = 'asset-label'

			// Highlight matching text in search mode
			if (showFolderPath && this.#searchQuery.trim()) {
				highlightLabel(label, asset.name ?? asset.id, this.#searchQuery.trim())
			} else {
				label.textContent = asset.name ?? asset.id
			}
			label.title = `${asset.name ?? asset.id} (${asset.type})`
			item.appendChild(label)

			// Double-click label to rename
			label.addEventListener('dblclick', (e) => {
				e.stopPropagation()
				this.#startEditing(asset.id)
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
				this.#preview.showImage(asset)
			} else if (asset.type === 'music' || asset.type === 'sound') {
				this.#preview.showAudio(asset)
			} else if (asset.type === 'video') {
				this.#preview.showVideo(asset)
			}
		})

		item.addEventListener('contextmenu', (e) => {
			e.preventDefault()
			this.#showAssetContextMenu(e, asset)
		})

		this.#gridEl.appendChild(item)
	}

	#showAssetContextMenu(event, asset) {
		const menu = createMenuContainer(event)

		const types = ['background', 'character', 'music', 'sound', 'video']
		for (const type of types) {
			const opt = createMenuOption(
				(asset.type === type ? '\u2713 ' : '  ') + `Set as ${type}`,
				() => {
					this.#state.updateAsset(asset.id, { type })
					menu.remove()
				}
			)
			menu.appendChild(opt)
		}

		// Separator
		menu.appendChild(createMenuSeparator())

		// Move to folder submenu
		const folders = this.#state.folders
		if (folders.length > 0) {
			const moveLabel = createMenuOption('Move to...', null)
			moveLabel.className = 'context-menu-section-label'
			menu.appendChild(moveLabel)

			// Root option
			if (asset.folderId !== null) {
				const rootOpt = createMenuOption('  Root', () => {
					this.#state.moveAssetToFolder(asset.id, null)
					menu.remove()
				})
				menu.appendChild(rootOpt)
			}

			for (const folder of folders) {
				if (folder.id === asset.folderId) continue
				const folderOpt = createMenuOption(`  ${folder.name}`, () => {
					this.#state.moveAssetToFolder(asset.id, folder.id)
					menu.remove()
				})
				menu.appendChild(folderOpt)
			}

			menu.appendChild(createMenuSeparator())
		}

		// Rename
		const renameOpt = createMenuOption('Rename', () => {
			menu.remove()
			this.#startEditing(asset.id)
		})
		menu.appendChild(renameOpt)

		// Delete
		const deleteOpt = createMenuOption('Delete', () => {
			this.#state.removeAsset(asset.id)
			menu.remove()
		}, 'var(--danger)')
		menu.appendChild(deleteOpt)

		document.body.appendChild(menu)
		autoCloseMenu(menu)
	}

	#startEditing(id) {
		this.#editingId = id
		this.render()
		// Focus the input after render
		const input = this.#gridEl.querySelector('.asset-label-edit')
		if (input) {
			input.focus()
			input.select()
		}
	}

	async #updateUsageBar() {
		const { used, quota } = await assetDB.getUsage()
		if (!this.#usageFillEl || !this.#usageLabelEl) return

		if (quota > 0) {
			const pct = Math.min(100, (used / quota) * 100)
			this.#usageFillEl.style.width = pct + '%'
			this.#usageFillEl.classList.toggle('near-full', pct > 85)
			this.#usageLabelEl.textContent = `Storage: ${formatFileSize(used)} / ${formatFileSize(quota)}`
		} else {
			this.#usageFillEl.style.width = '0%'
			this.#usageLabelEl.textContent = `Storage: ${formatFileSize(used)}`
		}
	}
}
