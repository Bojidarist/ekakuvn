/**
 * Promise wrappers around fflate's streaming Zip / async unzip.
 *
 * zipAsync uses the fflate streaming Zip class so that each file's bytes are
 * passed to the browser's Blob constructor in chunks rather than accumulated
 * in a single Uint8Array.  This avoids needing a contiguous heap allocation
 * for the entire archive (important when assets include large video files).
 *
 * unzipAsync uses fflate's worker-based async unzip to avoid blocking the
 * main thread when decompressing project archives on import.
 */

import { Zip, ZipPassThrough, unzip } from './vendor/fflate.esm.js'

/**
 * Create a ZIP archive from a map of path → Uint8Array entries.
 * Binary media entries are stored uncompressed (level 0).
 * Output chunks are accumulated in a Blob rather than a Uint8Array to avoid
 * one large contiguous heap allocation.
 *
 * @param {Record<string, Uint8Array>} files  Map of archive path to file bytes
 * @returns {Promise<Blob>}  The ZIP archive as a Blob
 */
export function zipAsync(files) {
	return new Promise((resolve, reject) => {
		const chunks = []
		const zipper = new Zip((err, chunk, final) => {
			if (err) {
				reject(err)
				return
			}
			chunks.push(chunk)
			if (final) {
				resolve(new Blob(chunks, { type: 'application/zip' }))
			}
		})

		const entries = Object.entries(files)
		let i = 0

		function addNext() {
			if (i >= entries.length) {
				zipper.end()
				return
			}
			const [path, data] = entries[i++]
			// Use ZipPassThrough (store, no compression) for all files.
			// JSON is small enough that skipping deflate is fine; binary media
			// files (mp4, jpg, etc.) are already compressed and deflating them
			// would be slow with negligible gain.
			const file = new ZipPassThrough(path)
			zipper.add(file)
			file.push(data, true)
			// Process entries sequentially to keep memory low
			addNext()
		}

		addNext()
	})
}

/**
 * Extract all entries from a ZIP archive.
 *
 * @param {Uint8Array} data  Raw ZIP bytes
 * @returns {Promise<Record<string, Uint8Array>>}  Map of path → file bytes
 */
export function unzipAsync(data) {
	return new Promise((resolve, reject) => {
		unzip(data, (err, files) => {
			if (err) reject(err)
			else resolve(files)
		})
	})
}
