/**
 * Asset file import logic: reading files, inferring asset types,
 * and drag-and-drop handlers for moving assets/folders.
 */

/**
 * Process selected files and add them as assets to the state.
 */
export function handleFiles(files, state, currentFolderId, fileInput) {
	if (!files || files.length === 0) return

	for (const file of files) {
		const reader = new FileReader()
		reader.onload = async (e) => {
			const dataUrl = e.target.result
			const name = file.name.replace(/\.[^.]+$/, '')
			const type = await inferAssetType(file, dataUrl)

			state.addAsset({
				type,
				path: file.name,
				dataUrl,
				name,
				folderId: currentFolderId
			})
		}
		reader.readAsDataURL(file)
	}

	// Reset file input so same file can be selected again
	fileInput.value = ''
}

/**
 * Infer the asset type from file name patterns and image dimensions.
 */
export async function inferAssetType(file, dataUrl) {
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
			const { width, height } = await getImageDimensions(dataUrl)
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
	if (file.type.startsWith('video/')) {
		return 'video'
	}
	return 'character'
}

/**
 * Get the natural dimensions of an image from a data URL.
 */
function getImageDimensions(dataUrl) {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
		img.onerror = reject
		img.src = dataUrl
	})
}

/**
 * Handle dragstart on an asset grid item (not folders).
 */
export function onAssetDragStart(e) {
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

/**
 * Handle dropping an asset onto the grid background (move to current folder).
 */
export function onGridDrop(e, state, currentFolderId) {
	const assetData = e.dataTransfer.getData('application/ekaku-asset-move')
	if (assetData) {
		try {
			const { assetId } = JSON.parse(assetData)
			state.moveAssetToFolder(assetId, currentFolderId)
		} catch { /* ignore */ }
		return
	}

	const folderData = e.dataTransfer.getData('application/ekaku-folder-move')
	if (folderData) {
		try {
			const { folderId } = JSON.parse(folderData)
			state.moveFolderToFolder(folderId, currentFolderId)
		} catch { /* ignore */ }
	}
}

/**
 * Handle dropping an asset/folder onto a breadcrumb segment.
 */
export function handleBreadcrumbDrop(e, state, targetFolderId) {
	e.preventDefault()
	e.stopPropagation()

	const assetData = e.dataTransfer.getData('application/ekaku-asset-move')
	if (assetData) {
		try {
			const { assetId } = JSON.parse(assetData)
			state.moveAssetToFolder(assetId, targetFolderId)
		} catch { /* ignore */ }
		return
	}

	const folderData = e.dataTransfer.getData('application/ekaku-folder-move')
	if (folderData) {
		try {
			const { folderId } = JSON.parse(folderData)
			state.moveFolderToFolder(folderId, targetFolderId)
		} catch { /* ignore */ }
	}
}
