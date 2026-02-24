export class SaveManager {
	#storagePrefix = 'ekaku-save'
	#scriptHash = ''

	constructor(scriptHash) {
		this.#scriptHash = scriptHash
	}

	get scriptHash() {
		return this.#scriptHash
	}

	save(slotName, state) {
		const saveData = {
			scriptHash: this.#scriptHash,
			timestamp: new Date().toISOString(),
			slotName,
			currentSceneId: state.currentSceneId,
			dialogueIndex: state.dialogueIndex,
			musicState: state.musicState ?? null,
			flags: state.flags ?? {}
		}

		const key = this.#makeKey(slotName)

		try {
			localStorage.setItem(key, JSON.stringify(saveData))
			return true
		} catch {
			console.warn(`SaveManager: failed to save to slot "${slotName}"`)
			return false
		}
	}

	load(slotName) {
		const key = this.#makeKey(slotName)

		try {
			const raw = localStorage.getItem(key)
			if (!raw) return null

			const data = JSON.parse(raw)

			// Validate script hash
			if (data.scriptHash !== this.#scriptHash) {
				console.warn(`SaveManager: save slot "${slotName}" is from a different script version`)
				return null
			}

			return data
		} catch {
			console.warn(`SaveManager: failed to load slot "${slotName}"`)
			return null
		}
	}

	listSaves() {
		const saves = []
		const prefix = this.#storagePrefix + '-' + this.#scriptHash + '-'

		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)
			if (!key.startsWith(prefix)) continue

			try {
				const data = JSON.parse(localStorage.getItem(key))
				saves.push({
					slotName: data.slotName,
					timestamp: data.timestamp,
					currentSceneId: data.currentSceneId,
					dialogueIndex: data.dialogueIndex
				})
			} catch {
				// Skip corrupted entries
			}
		}

		return saves.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
	}

	deleteSave(slotName) {
		const key = this.#makeKey(slotName)
		localStorage.removeItem(key)
	}

	hasAutoSave() {
		return this.load('auto') !== null
	}

	static computeHash(script) {
		// Simple hash from script JSON for version detection
		const str = JSON.stringify(script)
		let hash = 0
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i)
			hash = ((hash << 5) - hash) + char
			hash = hash & hash // Convert to 32-bit int
		}
		return Math.abs(hash).toString(36)
	}

	#makeKey(slotName) {
		return `${this.#storagePrefix}-${this.#scriptHash}-${slotName}`
	}
}
