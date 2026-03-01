/**
 * Folder navigation: breadcrumb rendering with drag-drop targets,
 * and folder item rendering with inline editing.
 */
import { EditorModal } from '../editorModal.js'
import { createMenuContainer, createMenuOption, autoCloseMenu } from '../../shared/contextMenu.js'
import { handleBreadcrumbDrop } from './assetImporter.js'

/**
 * Render the breadcrumb navigation bar for folder hierarchy.
 */
export function renderBreadcrumb(breadcrumbEl, state, currentFolderId, onNavigate) {
	breadcrumbEl.innerHTML = ''

	// Root
	const rootSpan = document.createElement('span')
	rootSpan.className = 'breadcrumb-item' + (currentFolderId === null ? ' active' : '')
	rootSpan.textContent = 'Root'
	rootSpan.addEventListener('click', () => onNavigate(null))
	// Drop target on breadcrumb
	rootSpan.addEventListener('dragover', (e) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		rootSpan.classList.add('drop-target')
	})
	rootSpan.addEventListener('dragleave', () => rootSpan.classList.remove('drop-target'))
	rootSpan.addEventListener('drop', (e) => {
		rootSpan.classList.remove('drop-target')
		handleBreadcrumbDrop(e, state, null)
	})
	breadcrumbEl.appendChild(rootSpan)

	// Path segments
	const path = state.getFolderPath(currentFolderId)
	for (const folder of path) {
		const sep = document.createElement('span')
		sep.className = 'breadcrumb-sep'
		sep.textContent = '\u203A'
		breadcrumbEl.appendChild(sep)

		const item = document.createElement('span')
		item.className = 'breadcrumb-item' + (folder.id === currentFolderId ? ' active' : '')
		item.textContent = folder.name
		item.addEventListener('click', () => onNavigate(folder.id))
		// Drop target on breadcrumb segment
		item.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.dataTransfer.dropEffect = 'move'
			item.classList.add('drop-target')
		})
		item.addEventListener('dragleave', () => item.classList.remove('drop-target'))
		item.addEventListener('drop', (e) => {
			item.classList.remove('drop-target')
			handleBreadcrumbDrop(e, state, folder.id)
		})
		breadcrumbEl.appendChild(item)
	}
}

/**
 * Render a single folder item in the asset grid.
 */
export function renderFolderItem(gridEl, folder, state, callbacks) {
	const { onNavigate, onStartEditing, editingId, onRender } = callbacks

	const item = document.createElement('div')
	item.className = 'asset-item folder-item'
	item.dataset.folderId = folder.id
	item.draggable = true

	const icon = document.createElement('span')
	icon.className = 'asset-type-icon folder-icon'
	icon.textContent = '\uD83D\uDCC1'
	item.appendChild(icon)

	if (editingId === folder.id) {
		// Inline edit mode
		const input = createInlineInput(folder.name, (newName) => {
			if (newName && newName !== folder.name) {
				state.renameFolder(folder.id, newName)
			}
			callbacks.clearEditing()
			onRender()
		}, callbacks)
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
			onStartEditing(folder.id)
		})

		// Single click to navigate into folder
		item.addEventListener('click', () => {
			onNavigate(folder.id)
		})
	}

	// Context menu
	item.addEventListener('contextmenu', (e) => {
		e.preventDefault()
		showFolderContextMenu(e, folder, state, onStartEditing)
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
				state.moveAssetToFolder(assetId, folder.id)
			} catch { /* ignore */ }
			return
		}

		const folderData = e.dataTransfer.getData('application/ekaku-folder-move')
		if (folderData) {
			try {
				const { folderId } = JSON.parse(folderData)
				if (folderId !== folder.id) {
					state.moveFolderToFolder(folderId, folder.id)
				}
			} catch { /* ignore */ }
		}
	})

	gridEl.appendChild(item)
}

/**
 * Create an inline text input for renaming an asset or folder.
 */
export function createInlineInput(currentName, onCommit, callbacks) {
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
			callbacks.clearEditing()
			callbacks.onRender()
		}
		e.stopPropagation()
	})
	input.addEventListener('blur', commit)
	input.addEventListener('click', (e) => e.stopPropagation())
	input.addEventListener('dblclick', (e) => e.stopPropagation())

	return input
}

/**
 * Show a context menu for a folder item.
 */
function showFolderContextMenu(event, folder, state, onStartEditing) {
	const menu = createMenuContainer(event)

	// Rename
	const renameOpt = createMenuOption('Rename', () => {
		menu.remove()
		onStartEditing(folder.id)
	})
	menu.appendChild(renameOpt)

	// Delete
	const deleteOpt = createMenuOption('Delete', async () => {
		if (await EditorModal.confirm(`Delete folder "${folder.name}"? Assets inside will be moved to the parent folder.`)) {
			state.removeFolder(folder.id)
		}
		menu.remove()
	}, 'var(--danger)')
	menu.appendChild(deleteOpt)

	document.body.appendChild(menu)
	autoCloseMenu(menu)
}

/**
 * Highlight matching text in a label element during search.
 */
export function highlightLabel(labelEl, name, query) {
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
	mark.className = 'search-highlight'
	mark.textContent = match
	labelEl.appendChild(mark)

	if (after) labelEl.appendChild(document.createTextNode(after))
}
