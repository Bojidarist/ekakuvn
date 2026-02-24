import { EkakuConfig } from '../ekakuConfig.js'

export class EditorState {
	#project = null
	#currentSceneId = null
	#selectedElementId = null
	#undoStack = []
	#redoStack = []
	#maxHistory = 50
	#config = null
	#listeners = new Map()

	constructor() {
		this.#config = new EkakuConfig('ekaku-editor')
		this.#initProject()
	}

	// --- Project data ---

	get project() {
		return this.#project
	}

	get currentSceneId() {
		return this.#currentSceneId
	}

	get currentScene() {
		if (!this.#currentSceneId) return null
		return this.#project.scenes.find(s => s.id === this.#currentSceneId) ?? null
	}

	get selectedElementId() {
		return this.#selectedElementId
	}

	get scenes() {
		return this.#project.scenes
	}

	get assets() {
		return this.#project.assets
	}

	// --- Event system ---

	on(event, listener) {
		if (!this.#listeners.has(event)) {
			this.#listeners.set(event, [])
		}
		this.#listeners.get(event).push(listener)
	}

	off(event, listener) {
		const arr = this.#listeners.get(event)
		if (!arr) return
		const idx = arr.indexOf(listener)
		if (idx >= 0) arr.splice(idx, 1)
	}

	#emit(event, data) {
		const arr = this.#listeners.get(event)
		if (arr) {
			for (const fn of arr) fn(data)
		}
	}

	// --- Project management ---

	newProject() {
		this.#pushUndo()
		this.#initProject()
		this.#emit('projectChanged', this.#project)
	}

	loadProject(projectData) {
		this.#pushUndo()
		this.#project = structuredClone(projectData)

		// Ensure mainMenu exists for editor compatibility
		if (!this.#project.meta.mainMenu) {
			this.#project.meta.mainMenu = { background: null, title: null }
		}

		this.#currentSceneId = this.#project.startScene ?? this.#project.scenes[0]?.id ?? null
		this.#selectedElementId = null
		this.#undoStack = []
		this.#redoStack = []
		this.#autoSave()
		this.#emit('projectChanged', this.#project)
		this.#emit('sceneChanged', this.#currentSceneId)
	}

	// --- Meta ---

	updateMeta(key, value) {
		this.#pushUndo()
		this.#project.meta[key] = value
		this.#autoSave()
		this.#emit('metaChanged', this.#project.meta)
	}

	// --- Scenes ---

	addScene(id) {
		this.#pushUndo()
		const scene = {
			id: id ?? this.#generateId('scene'),
			background: null,
			music: null,
			characters: [],
			dialogue: [],
			choices: null,
			next: null
		}
		this.#project.scenes.push(scene)

		if (!this.#project.startScene) {
			this.#project.startScene = scene.id
		}

		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
		return scene
	}

	deleteScene(sceneId) {
		this.#pushUndo()
		this.#project.scenes = this.#project.scenes.filter(s => s.id !== sceneId)

		if (this.#project.startScene === sceneId) {
			this.#project.startScene = this.#project.scenes[0]?.id ?? null
		}

		if (this.#currentSceneId === sceneId) {
			this.#currentSceneId = this.#project.scenes[0]?.id ?? null
			this.#emit('sceneChanged', this.#currentSceneId)
		}

		// Clean up references to deleted scene
		for (const scene of this.#project.scenes) {
			if (scene.next === sceneId) scene.next = null
			if (scene.choices) {
				scene.choices = scene.choices.filter(c => c.targetSceneId !== sceneId)
				if (scene.choices.length === 0) scene.choices = null
			}
		}

		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
	}

	duplicateScene(sceneId) {
		const source = this.#project.scenes.find(s => s.id === sceneId)
		if (!source) return null

		this.#pushUndo()
		const copy = structuredClone(source)
		copy.id = this.#generateId('scene')
		this.#project.scenes.push(copy)
		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
		return copy
	}

	reorderScenes(fromIndex, toIndex) {
		this.#pushUndo()
		const [moved] = this.#project.scenes.splice(fromIndex, 1)
		this.#project.scenes.splice(toIndex, 0, moved)
		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
	}

	selectScene(sceneId) {
		this.#currentSceneId = sceneId
		this.#selectedElementId = null
		this.#emit('sceneChanged', sceneId)
		this.#emit('selectionChanged', null)
	}

	updateScene(sceneId, key, value) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		scene[key] = value
		this.#autoSave()
		this.#emit('sceneUpdated', { sceneId, key, value })
	}

	// --- Characters ---

	addCharacter(sceneId, charData) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return null

		this.#pushUndo()
		const character = {
			id: this.#generateId('char'),
			assetId: charData.assetId,
			position: charData.position ?? { x: 0.5, y: 0.5 },
			scale: charData.scale ?? 1.0,
			flipped: charData.flipped ?? false
		}
		scene.characters.push(character)
		this.#autoSave()
		this.#emit('sceneUpdated', { sceneId, key: 'characters' })
		return character
	}

	removeCharacter(sceneId, characterId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		scene.characters = scene.characters.filter(c => c.id !== characterId)

		if (this.#selectedElementId === characterId) {
			this.#selectedElementId = null
			this.#emit('selectionChanged', null)
		}

		this.#autoSave()
		this.#emit('sceneUpdated', { sceneId, key: 'characters' })
	}

	updateCharacter(sceneId, characterId, updates) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		const character = scene.characters.find(c => c.id === characterId)
		if (!character) return

		this.#pushUndo()
		Object.assign(character, updates)
		this.#autoSave()
		this.#emit('sceneUpdated', { sceneId, key: 'characters' })
	}

	selectElement(elementId) {
		this.#selectedElementId = elementId
		this.#emit('selectionChanged', elementId)
	}

	// --- Dialogue ---

	addDialogue(sceneId, entry) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		scene.dialogue.push({
			speaker: entry.speaker ?? null,
			text: entry.text ?? '',
			expression: entry.expression ?? null,
			voiceAssetId: entry.voiceAssetId ?? null
		})
		this.#autoSave()
		this.#emit('dialogueChanged', sceneId)
	}

	updateDialogue(sceneId, index, updates) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene || !scene.dialogue[index]) return

		this.#pushUndo()
		Object.assign(scene.dialogue[index], updates)
		this.#autoSave()
		this.#emit('dialogueChanged', sceneId)
	}

	removeDialogue(sceneId, index) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		scene.dialogue.splice(index, 1)
		this.#autoSave()
		this.#emit('dialogueChanged', sceneId)
	}

	reorderDialogue(sceneId, fromIndex, toIndex) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		const [moved] = scene.dialogue.splice(fromIndex, 1)
		scene.dialogue.splice(toIndex, 0, moved)
		this.#autoSave()
		this.#emit('dialogueChanged', sceneId)
	}

	// --- Choices ---

	addChoice(sceneId, choice) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		if (!scene.choices) scene.choices = []
		scene.choices.push({
			text: choice.text ?? '',
			targetSceneId: choice.targetSceneId ?? null
		})
		scene.next = null // choices and next are mutually exclusive
		this.#autoSave()
		this.#emit('dialogueChanged', sceneId)
	}

	updateChoice(sceneId, index, updates) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene || !scene.choices || !scene.choices[index]) return

		this.#pushUndo()
		Object.assign(scene.choices[index], updates)
		this.#autoSave()
		this.#emit('dialogueChanged', sceneId)
	}

	removeChoice(sceneId, index) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene || !scene.choices) return

		this.#pushUndo()
		scene.choices.splice(index, 1)
		if (scene.choices.length === 0) scene.choices = null
		this.#autoSave()
		this.#emit('dialogueChanged', sceneId)
	}

	// --- Assets ---

	addAsset(asset) {
		this.#pushUndo()
		const entry = {
			id: asset.id ?? this.#generateId('asset'),
			type: asset.type,
			path: asset.path,
			dataUrl: asset.dataUrl ?? null,
			name: asset.name ?? asset.id
		}
		this.#project.assets.push(entry)
		this.#autoSave()
		this.#emit('assetsChanged', this.#project.assets)
		return entry
	}

	removeAsset(assetId) {
		this.#pushUndo()
		this.#project.assets = this.#project.assets.filter(a => a.id !== assetId)

		// Clean up references
		for (const scene of this.#project.scenes) {
			if (scene.background === assetId) scene.background = null
			if (scene.music?.assetId === assetId) scene.music = null
			scene.characters = scene.characters.filter(c => c.assetId !== assetId)
		}

		this.#autoSave()
		this.#emit('assetsChanged', this.#project.assets)
	}

	updateAsset(assetId, updates) {
		const asset = this.#project.assets.find(a => a.id === assetId)
		if (!asset) return

		this.#pushUndo()
		Object.assign(asset, updates)
		this.#autoSave()
		this.#emit('assetsChanged', this.#project.assets)
	}

	getAssetsByType(type) {
		return this.#project.assets.filter(a => a.type === type)
	}

	// --- Undo / Redo ---

	undo() {
		if (this.#undoStack.length === 0) return

		this.#redoStack.push(structuredClone(this.#project))
		this.#project = this.#undoStack.pop()
		this.#autoSave()
		this.#emit('projectChanged', this.#project)
	}

	redo() {
		if (this.#redoStack.length === 0) return

		this.#undoStack.push(structuredClone(this.#project))
		this.#project = this.#redoStack.pop()
		this.#autoSave()
		this.#emit('projectChanged', this.#project)
	}

	get canUndo() {
		return this.#undoStack.length > 0
	}

	get canRedo() {
		return this.#redoStack.length > 0
	}

	// --- Serialization ---

	toScript() {
		// Convert editor project to runtime script format
		const script = structuredClone(this.#project)

		// Remove editor-only fields
		for (const asset of script.assets) {
			delete asset.name
			// If asset uses dataUrl, keep path pointing to it
		}

		// Remove character editor IDs (runtime doesn't need them)
		for (const scene of script.scenes) {
			scene.characters = scene.characters.map(c => ({
				assetId: c.assetId,
				position: c.position,
				scale: c.scale,
				flipped: c.flipped
			}))
		}

		// Clean up mainMenu -- only include if it has non-null values
		if (script.meta.mainMenu) {
			const mm = script.meta.mainMenu
			if (!mm.background && !mm.title) {
				delete script.meta.mainMenu
			}
		}

		return script
	}

	// --- Persistence ---

	tryRestoreFromAutoSave() {
		const saved = this.#config.get('project')
		if (saved) {
			try {
				this.#project = saved
				// Ensure mainMenu exists for backward compatibility
				if (!this.#project.meta.mainMenu) {
					this.#project.meta.mainMenu = { background: null, title: null }
				}
				this.#currentSceneId = this.#project.startScene ?? this.#project.scenes[0]?.id ?? null
				return true
			} catch {
				// Fall through to default
			}
		}
		return false
	}

	// --- Private ---

	#initProject() {
		this.#project = {
			meta: {
				title: 'Untitled Project',
				author: '',
				version: '1.0.0',
				resolution: { width: 1280, height: 720 },
				mainMenu: {
					background: null,
					title: null
				}
			},
			assets: [],
			startScene: null,
			scenes: []
		}

		this.#currentSceneId = null
		this.#selectedElementId = null
		this.#undoStack = []
		this.#redoStack = []
	}

	#pushUndo() {
		this.#undoStack.push(structuredClone(this.#project))
		if (this.#undoStack.length > this.#maxHistory) {
			this.#undoStack.shift()
		}
		this.#redoStack = []
	}

	#autoSave() {
		this.#config.set('project', this.#project)
	}

	#generateId(prefix) {
		return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
	}
}
