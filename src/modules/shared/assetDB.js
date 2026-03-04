/**
 * IndexedDB wrapper for persistent asset binary storage.
 *
 * Assets are stored as Blobs (raw binary) keyed by asset ID.
 * Blobs bypass the structured-clone string size limit (~1 GB) that would
 * otherwise be hit by large base64 data URLs for video files.
 *
 * Database: ekaku-assets  v1
 * Object store: assets  (keyPath: 'id')
 *   { id: string, blob: Blob, mimeType: string }
 */

const DB_NAME = 'ekaku-assets'
const DB_VERSION = 1
const STORE_NAME = 'assets'

class AssetDB {
	#db = null
	#openPromise = null

	/**
	 * Open (or reuse) the IndexedDB connection.
	 * Safe to call multiple times — returns the same promise after first call.
	 * @returns {Promise<void>}
	 */
	open() {
		if (this.#openPromise) return this.#openPromise

		this.#openPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION)

			request.onupgradeneeded = (event) => {
				const db = event.target.result
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: 'id' })
				}
			}

			request.onsuccess = (event) => {
				this.#db = event.target.result
				resolve()
			}

			request.onerror = (event) => {
				reject(new Error(`AssetDB: failed to open IndexedDB — ${event.target.error}`))
			}
		})

		return this.#openPromise
	}

	/**
	 * Store or update an asset from a File or Blob.
	 * Blobs avoid the structured-clone string size limit that affects large videos.
	 * @param {string} id - Asset ID
	 * @param {Blob} blob - File or Blob object
	 * @returns {Promise<void>}
	 */
	async put(id, blob) {
		await this.open()
		return new Promise((resolve, reject) => {
			const tx = this.#db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			const request = store.put({ id, blob, mimeType: blob.type })
			request.onsuccess = () => resolve()
			request.onerror = (event) => reject(new Error(`AssetDB.put: ${event.target.error}`))
		})
	}

	/**
	 * Store an asset from a base64 data URL (e.g. when migrating old projects).
	 * Converts the data URL to a Blob before storing.
	 * @param {string} id - Asset ID
	 * @param {string} dataUrl - Base64 data URL
	 * @returns {Promise<void>}
	 */
	async putDataUrl(id, dataUrl) {
		const blob = dataUrlToBlob(dataUrl)
		return this.put(id, blob)
	}

	/**
	 * Retrieve an asset as a blob URL (blob: scheme), or null if not found.
	 * Blob URLs are safe for any file size and work directly as src for
	 * <img>, <video>, <audio> elements.
	 *
	 * NOTE: The returned URL is created with URL.createObjectURL and is
	 * valid for the lifetime of the page.  Callers that only need a
	 * temporary URL should revoke it with URL.revokeObjectURL when done.
	 * @param {string} id - Asset ID
	 * @returns {Promise<string|null>}
	 */
	async get(id) {
		const blob = await this.getBlob(id)
		if (!blob) return null
		return URL.createObjectURL(blob)
	}

	/**
	 * Retrieve an asset as a base64 data URL, or null if not found.
	 * WARNING: This reads the entire file into memory as a base64 string.
	 * Only use this for export where a self-contained data URL is required.
	 * For displaying assets, use get() (blob URL) instead.
	 * @param {string} id - Asset ID
	 * @returns {Promise<string|null>}
	 */
	async getDataUrl(id) {
		const blob = await this.getBlob(id)
		if (!blob) return null
		return blobToDataUrl(blob)
	}

	/**
	 * Retrieve an asset as a raw Blob, or null if not found.
	 * @param {string} id - Asset ID
	 * @returns {Promise<Blob|null>}
	 */
	async getBlob(id) {
		await this.open()
		const entry = await new Promise((resolve, reject) => {
			const tx = this.#db.transaction(STORE_NAME, 'readonly')
			const store = tx.objectStore(STORE_NAME)
			const request = store.get(id)
			request.onsuccess = (event) => resolve(event.target.result ?? null)
			request.onerror = (event) => reject(new Error(`AssetDB.get: ${event.target.error}`))
		})
		if (!entry) return null
		// If the stored blob has no MIME type (some browsers/OS omit it), re-wrap it
		// using the mimeType field we saved alongside the blob so media elements can
		// play it correctly.
		if (!entry.blob.type && entry.mimeType) {
			return new Blob([entry.blob], { type: entry.mimeType })
		}
		return entry.blob
	}

	/**
	 * Delete an asset's binary data by ID.
	 * @param {string} id - Asset ID
	 * @returns {Promise<void>}
	 */
	async delete(id) {
		await this.open()
		return new Promise((resolve, reject) => {
			const tx = this.#db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			const request = store.delete(id)
			request.onsuccess = () => resolve()
			request.onerror = (event) => reject(new Error(`AssetDB.delete: ${event.target.error}`))
		})
	}

	/**
	 * Delete multiple assets' binary data.
	 * @param {string[]} ids - Array of asset IDs
	 * @returns {Promise<void>}
	 */
	async deleteMany(ids) {
		if (!ids || ids.length === 0) return
		await this.open()
		return new Promise((resolve, reject) => {
			const tx = this.#db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			let pending = ids.length
			let failed = false

			for (const id of ids) {
				const request = store.delete(id)
				request.onsuccess = () => {
					pending--
					if (pending === 0 && !failed) resolve()
				}
				request.onerror = (event) => {
					if (!failed) {
						failed = true
						reject(new Error(`AssetDB.deleteMany: ${event.target.error}`))
					}
				}
			}
		})
	}

	/**
	 * Delete all assets from IndexedDB.
	 * Used when opening or creating a new project to avoid stale data conflicts.
	 * @returns {Promise<void>}
	 */
	async clearAll() {
		await this.open()
		return new Promise((resolve, reject) => {
			const tx = this.#db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			const request = store.clear()
			request.onsuccess = () => resolve()
			request.onerror = (event) => reject(new Error(`AssetDB.clearAll: ${event.target.error}`))
		})
	}

	/**
	 * Uses navigator.storage.estimate() when available.
	 * @returns {Promise<{ used: number, quota: number }>}
	 */
	async getUsage() {
		try {
			if (navigator.storage && navigator.storage.estimate) {
				const estimate = await navigator.storage.estimate()
				return {
					used: estimate.usage ?? 0,
					quota: estimate.quota ?? 0
				}
			}
		} catch {
			// API unavailable or permission denied
		}
		return { used: 0, quota: 0 }
	}
}

// --- Helpers ---

/**
 * Convert a base64 data URL to a Blob without loading the entire string
 * into a JS string-based data structure larger than needed.
 */
function dataUrlToBlob(dataUrl) {
	const [header, base64] = dataUrl.split(',', 2)
	const mimeType = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream'
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return new Blob([bytes], { type: mimeType })
}

/**
 * Convert a Blob to a base64 data URL.
 */
function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = (e) => resolve(e.target.result)
		reader.onerror = () => reject(new Error('AssetDB: failed to read blob as data URL'))
		reader.readAsDataURL(blob)
	})
}

export const assetDB = new AssetDB()
