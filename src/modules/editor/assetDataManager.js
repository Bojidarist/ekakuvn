import { generateId } from '../shared/utils.js'

export class AssetDataManager {
	#project = null
	#emit = null

	constructor(emit) {
		this.#emit = emit
	}

	setProject(project) {
		this.#project = project
	}

	get assets() {
		return this.#project.assets
	}

	get folders() {
		return this.#project.folders
	}

	// --- Assets ---

	addAsset(asset) {
		const entry = {
			id: asset.id ?? generateId('asset'),
			type: asset.type,
			path: asset.path,
			dataUrl: asset.dataUrl ?? null,
			name: asset.name ?? asset.id,
			folderId: asset.folderId ?? null
		}
		this.#project.assets.push(entry)
		this.#emit('assetsChanged', this.#project.assets)
		return entry
	}

	removeAsset(assetId) {
		this.#project.assets = this.#project.assets.filter(a => a.id !== assetId)

		// Clean up timeline node references to deleted asset
		for (const scene of this.#project.scenes) {
			scene.timeline = scene.timeline.filter(node => {
				if (node.type === 'background' && node.data.assetId === assetId) return false
				if (node.type === 'music' && node.data.assetId === assetId) return false
				if (node.type === 'sound' && node.data.assetId === assetId) return false
				if (node.type === 'showCharacter' && node.data.assetId === assetId) return false
				if (node.type === 'video' && node.data.assetId === assetId) return false
				return true
			})

			// Clean up expression references within remaining showCharacter nodes
			for (const node of scene.timeline) {
				if (node.type === 'showCharacter' && node.data.expressions) {
					for (const [name, exprAssetId] of Object.entries(node.data.expressions)) {
						if (exprAssetId === assetId) {
							delete node.data.expressions[name]
						}
					}
				}
			}
		}

		this.#emit('assetsChanged', this.#project.assets)
	}

	updateAsset(assetId, updates) {
		const asset = this.#project.assets.find(a => a.id === assetId)
		if (!asset) return

		Object.assign(asset, updates)
		this.#emit('assetsChanged', this.#project.assets)
	}

	getAssetsByType(type) {
		return this.#project.assets.filter(a => a.type === type)
	}

	getImageAssets() {
		return this.#project.assets.filter(a => a.type === 'background' || a.type === 'character')
	}

	// --- Folders ---

	addFolder(name, parentId = null) {
		const folder = {
			id: generateId('folder'),
			name,
			parentId
		}
		this.#project.folders.push(folder)
		this.#emit('foldersChanged', this.#project.folders)
		return folder
	}

	removeFolder(folderId) {
		// Collect all descendant folder IDs
		const toRemove = new Set()
		const collect = (id) => {
			toRemove.add(id)
			for (const f of this.#project.folders) {
				if (f.parentId === id) collect(f.id)
			}
		}
		collect(folderId)

		// Move assets in deleted folders to parent of deleted folder
		const deletedFolder = this.#project.folders.find(f => f.id === folderId)
		const reparentTo = deletedFolder?.parentId ?? null
		for (const asset of this.#project.assets) {
			if (asset.folderId && toRemove.has(asset.folderId)) {
				asset.folderId = reparentTo
			}
		}

		this.#project.folders = this.#project.folders.filter(f => !toRemove.has(f.id))
		this.#emit('foldersChanged', this.#project.folders)
		this.#emit('assetsChanged', this.#project.assets)
	}

	renameFolder(folderId, name) {
		const folder = this.#project.folders.find(f => f.id === folderId)
		if (!folder) return

		folder.name = name
		this.#emit('foldersChanged', this.#project.folders)
	}

	moveAssetToFolder(assetId, folderId) {
		const asset = this.#project.assets.find(a => a.id === assetId)
		if (!asset) return

		asset.folderId = folderId
		this.#emit('assetsChanged', this.#project.assets)
	}

	moveFolderToFolder(folderId, targetParentId) {
		const folder = this.#project.folders.find(f => f.id === folderId)
		if (!folder) return

		// Prevent moving a folder into itself or its descendants
		let check = targetParentId
		while (check) {
			if (check === folderId) return
			const parent = this.#project.folders.find(f => f.id === check)
			check = parent?.parentId ?? null
		}

		folder.parentId = targetParentId
		this.#emit('foldersChanged', this.#project.folders)
	}

	getAssetsInFolder(folderId) {
		return this.#project.assets.filter(a => (a.folderId ?? null) === folderId)
	}

	getSubfolders(parentId) {
		return this.#project.folders.filter(f => (f.parentId ?? null) === parentId)
	}

	getFolderPath(folderId) {
		const path = []
		let current = folderId
		while (current) {
			const folder = this.#project.folders.find(f => f.id === current)
			if (!folder) break
			path.unshift(folder)
			current = folder.parentId
		}
		return path
	}
}
