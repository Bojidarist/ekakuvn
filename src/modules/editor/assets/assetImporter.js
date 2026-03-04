/**
 * Asset file import logic: reading files, inferring asset types,
 * and drag-and-drop handlers for moving assets/folders.
 */

import { assetDB } from '../../shared/assetDB.js'
import { spinner } from '../loadingSpinner.js'

/**
 * Process selected files and add them as assets to the state.
 * Binary data is stored in IndexedDB; only metadata is kept in the project JSON.
 *
 * For image files a FileReader is used to obtain a dataUrl for dimension
 * inference and in-memory thumbnail use.  For audio/video the FileReader is
 * skipped entirely — reading a 1+ GB file as base64 can exhaust memory and
 * silently abort.  Instead the raw File is stored in IDB and a blob URL is
 * created for in-memory use.
 */
export function handleFiles(files, state, currentFolderId, fileInput) {
	if (!files || files.length === 0) return

	for (const file of files) {
		if (file.type.startsWith('image/')) {
			// Images: read as dataUrl for dimension inference + thumbnail
			const reader = new FileReader()
			reader.onload = async (e) => {
				await spinner.wrap('Importing asset…', async () => {
					const dataUrl = e.target.result
					const name = file.name.replace(/\.[^.]+$/, '')
					const type = await inferAssetType(file, dataUrl)

					const asset = state.addAsset({
						type,
						path: file.name,
						dataUrl: null,
						name,
						folderId: currentFolderId
					})

					// Store raw File (Blob) in IndexedDB — avoids structured-clone limit
					await assetDB.put(asset.id, file)

					// Cache dataUrl in-memory for canvas/thumbnails; stripped from localStorage
					state.updateAssetInMemory(asset.id, { dataUrl })
				})
			}
			reader.readAsDataURL(file)
		} else {
			// Audio / video: skip FileReader to avoid loading large files into memory
			;(async () => {
				await spinner.wrap('Importing asset…', async () => {
					const name = file.name.replace(/\.[^.]+$/, '')
					const type = await inferAssetType(file, null)

					const asset = state.addAsset({
						type,
						path: file.name,
						dataUrl: null,
						name,
						folderId: currentFolderId
					})

					// Store raw File (Blob) in IndexedDB
					await assetDB.put(asset.id, file)

					// Create a blob URL for in-memory use (canvas, preview)
					const blobUrl = URL.createObjectURL(file)
					state.updateAssetInMemory(asset.id, { dataUrl: blobUrl })
				})
			})()
		}
	}

	// Reset file input so same file can be selected again
	fileInput.value = ''
}

/**
 * Infer the asset type from file name patterns and image dimensions.
 * @param {File} file
 * @param {string|null} dataUrl - Base64 data URL; may be null for non-image files.
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
		if (dataUrl) {
			try {
				const { width, height } = await getImageDimensions(dataUrl)
				if (width >= height && width >= 960) {
					return 'background'
				}
			} catch {
				// Fall through to default
			}
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
