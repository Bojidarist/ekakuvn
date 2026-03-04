import { EkakuConfig } from '../ekakuConfig.js'
import { migrateProject } from './projectMigration.js'
import { assetDB } from '../shared/assetDB.js'

export class ProjectPersistence {
	#config = null

	constructor() {
		this.#config = new EkakuConfig('ekaku-editor')
	}

	/**
	 * Auto-save the project to localStorage.
	 * dataUrl fields are stripped before saving to stay within localStorage limits.
	 * The actual binary data lives in IndexedDB (see assetDB).
	 */
	autoSave(project) {
		const slim = structuredClone(project)
		for (const asset of slim.assets) {
			asset.dataUrl = null
		}
		this.#config.set('project', slim)
	}

	/**
	 * Clear the persisted project from localStorage.
	 * Called before loading a new project to avoid stale data conflicts.
	 */
	clearStorage() {
		this.#config.set('project', null)
	}

	/**
	 * Synchronously check if there is a saved project (without hydrating assets).
	 * Used during editor init to decide whether to show the restore prompt.
	 */
	hasSavedProject() {
		return !!this.#config.get('project')
	}

	/**
	 * Restore the saved project and re-hydrate asset dataUrls from IndexedDB.
	 * If a saved asset already has a dataUrl embedded (old format / imported file),
	 * it is migrated into IndexedDB and the slim version is re-saved.
	 * @returns {Promise<object|null>}
	 */
	async tryRestoreAsync() {
		const saved = this.#config.get('project')
		if (!saved) return null

		try {
			migrateProject(saved)
		} catch {
			return null
		}

		// Re-hydrate dataUrls from IndexedDB; migrate any embedded ones
		let needsResave = false
		for (const asset of saved.assets) {
			if (asset.dataUrl) {
				// Old format: embedded dataUrl present — migrate to IndexedDB
				await assetDB.putDataUrl(asset.id, asset.dataUrl)
				needsResave = true
				// Keep in-memory for immediate use, autoSave will strip it
			} else {
				asset.dataUrl = await assetDB.get(asset.id) ?? null
			}
		}

		if (needsResave) {
			// Strip dataUrls now that they're in IDB
			this.autoSave(saved)
		}

		return saved
	}
}
