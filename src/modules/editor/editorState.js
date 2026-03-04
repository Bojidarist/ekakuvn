import { SceneDataManager } from './sceneDataManager.js'
import { AssetDataManager } from './assetDataManager.js'
import { TimelineDataManager } from './timelineDataManager.js'
import { UndoManager } from './undoManager.js'
import { ProjectPersistence } from './projectPersistence.js'
import { migrateProject } from './projectMigration.js'

export class EditorState {
	#project = null
	#currentSceneId = null
	#selectedElementId = null
	#listeners = new Map()

	#sceneManager = null
	#assetManager = null
	#timelineManager = null
	#undoManager = null
	#persistence = null

	constructor() {
		const emit = this.#emit.bind(this)
		this.#sceneManager = new SceneDataManager(emit)
		this.#assetManager = new AssetDataManager(emit)
		this.#timelineManager = new TimelineDataManager(emit)
		this.#undoManager = new UndoManager()
		this.#persistence = new ProjectPersistence()
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

	emit(event, data) {
		this.#emit(event, data)
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
		migrateProject(this.#project)

		this.#syncManagers()
		this.#currentSceneId = this.#project.startScene ?? this.#project.scenes[0]?.id ?? null
		this.#selectedElementId = null
		this.#undoManager.reset()
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

	// --- Scenes (delegated to SceneDataManager) ---

	addScene(id, sectionId = null) {
		this.#pushUndo()
		const scene = this.#sceneManager.addScene(id, sectionId)
		this.#autoSave()
		return scene
	}

	deleteScene(sceneId) {
		this.#pushUndo()
		const newCurrentId = this.#sceneManager.deleteScene(sceneId)

		if (this.#currentSceneId === sceneId) {
			this.#currentSceneId = newCurrentId
			this.#emit('sceneChanged', this.#currentSceneId)
		}

		this.#autoSave()
	}

	duplicateScene(sceneId) {
		this.#pushUndo()
		const copy = this.#sceneManager.duplicateScene(sceneId)
		this.#autoSave()
		return copy
	}

	reorderScenes(fromIndex, toIndex) {
		this.#pushUndo()
		this.#sceneManager.reorderScenes(fromIndex, toIndex)
		this.#autoSave()
	}

	selectScene(sceneId) {
		this.#currentSceneId = sceneId
		this.#selectedElementId = null
		this.#emit('sceneChanged', sceneId)
		this.#emit('selectionChanged', null)
	}

	updateScene(sceneId, key, value) {
		this.#pushUndo()
		this.#sceneManager.updateScene(sceneId, key, value)
		this.#autoSave()
	}

	moveSceneToSection(sceneId, sectionId) {
		this.#pushUndo()
		this.#sceneManager.moveSceneToSection(sceneId, sectionId)
		this.#autoSave()
	}

	// --- Scene Sections ---

	get sceneSections() {
		return this.#sceneManager.sceneSections
	}

	addSceneSection(name, parentId = null) {
		this.#pushUndo()
		const section = this.#sceneManager.addSceneSection(name, parentId)
		this.#autoSave()
		return section
	}

	removeSceneSection(sectionId) {
		this.#pushUndo()
		this.#sceneManager.removeSceneSection(sectionId)
		this.#autoSave()
	}

	renameSceneSection(sectionId, name) {
		this.#pushUndo()
		this.#sceneManager.renameSceneSection(sectionId, name)
		this.#autoSave()
	}

	toggleSceneSection(sectionId) {
		this.#sceneManager.toggleSceneSection(sectionId)
		this.#autoSave()
	}

	moveSceneSectionToSection(sectionId, targetParentId) {
		this.#pushUndo()
		this.#sceneManager.moveSceneSectionToSection(sectionId, targetParentId)
		this.#autoSave()
	}

	reorderSceneSection(fromIndex, toIndex) {
		this.#pushUndo()
		this.#sceneManager.reorderSceneSection(fromIndex, toIndex)
		this.#autoSave()
	}

	getScenesInSection(sectionId) {
		return this.#sceneManager.getScenesInSection(sectionId)
	}

	getSubSections(parentId) {
		return this.#sceneManager.getSubSections(parentId)
	}

	// --- Timeline Nodes (delegated to TimelineDataManager) ---

	addTimelineNode(sceneId, node, insertIndex) {
		this.#pushUndo()
		const entry = this.#timelineManager.addTimelineNode(sceneId, node, insertIndex)
		this.#autoSave()
		return entry
	}

	updateTimelineNode(sceneId, nodeId, updates) {
		this.#pushUndo()
		this.#timelineManager.updateTimelineNode(sceneId, nodeId, updates)
		this.#autoSave()
	}

	removeTimelineNode(sceneId, nodeId) {
		this.#pushUndo()
		const removedId = this.#timelineManager.removeTimelineNode(sceneId, nodeId)

		if (this.#selectedElementId === removedId) {
			this.#selectedElementId = null
			this.#emit('selectionChanged', null)
		}

		this.#autoSave()
	}

	reorderTimelineNode(sceneId, fromIndex, toIndex) {
		this.#pushUndo()
		this.#timelineManager.reorderTimelineNode(sceneId, fromIndex, toIndex)
		this.#autoSave()
	}

	duplicateTimelineNode(sceneId, nodeId) {
		this.#pushUndo()
		const copy = this.#timelineManager.duplicateTimelineNode(sceneId, nodeId)
		this.#autoSave()
		return copy
	}

	getTimelineNode(sceneId, nodeId) {
		return this.#timelineManager.getTimelineNode(sceneId, nodeId)
	}

	selectElement(elementId) {
		this.#selectedElementId = elementId
		this.#emit('selectionChanged', elementId)
	}

	// --- Timeline State Computation ---

	getActiveCharacters(sceneId, upToNodeIndex) {
		return this.#timelineManager.getActiveCharacters(sceneId, upToNodeIndex)
	}

	getActiveBackground(sceneId, upToNodeIndex) {
		return this.#timelineManager.getActiveBackground(sceneId, upToNodeIndex)
	}

	// --- Expressions ---

	getSceneExpressions(sceneId) {
		return this.#timelineManager.getSceneExpressions(sceneId)
	}

	getCharacterExpressions(sceneId, nodeId) {
		return this.#timelineManager.getCharacterExpressions(sceneId, nodeId)
	}

	addCharacterExpression(sceneId, nodeId, name, assetId) {
		this.#pushUndo()
		this.#timelineManager.addCharacterExpression(sceneId, nodeId, name, assetId)
		this.#autoSave()
	}

	removeCharacterExpression(sceneId, nodeId, name) {
		this.#pushUndo()
		this.#timelineManager.removeCharacterExpression(sceneId, nodeId, name)
		this.#autoSave()
	}

	// --- Choices ---

	addChoice(sceneId, choice) {
		this.#pushUndo()
		this.#timelineManager.addChoice(sceneId, choice)
		this.#autoSave()
	}

	updateChoice(sceneId, index, updates) {
		this.#pushUndo()
		this.#timelineManager.updateChoice(sceneId, index, updates)
		this.#autoSave()
	}

	removeChoice(sceneId, index) {
		this.#pushUndo()
		this.#timelineManager.removeChoice(sceneId, index)
		this.#autoSave()
	}

	// --- Assets (delegated to AssetDataManager) ---

	addAsset(asset) {
		this.#pushUndo()
		const entry = this.#assetManager.addAsset(asset)
		this.#autoSave()
		return entry
	}

	removeAsset(assetId) {
		this.#pushUndo()
		this.#assetManager.removeAsset(assetId)
		this.#autoSave()
	}

	updateAsset(assetId, updates) {
		this.#pushUndo()
		this.#assetManager.updateAsset(assetId, updates)
		this.#autoSave()
	}

	getAssetsByType(type) {
		return this.#assetManager.getAssetsByType(type)
	}

	getImageAssets() {
		return this.#assetManager.getImageAssets()
	}

	// --- Folders ---

	get folders() {
		return this.#assetManager.folders
	}

	addFolder(name, parentId = null) {
		this.#pushUndo()
		const folder = this.#assetManager.addFolder(name, parentId)
		this.#autoSave()
		return folder
	}

	removeFolder(folderId) {
		this.#pushUndo()
		this.#assetManager.removeFolder(folderId)
		this.#autoSave()
	}

	renameFolder(folderId, name) {
		this.#pushUndo()
		this.#assetManager.renameFolder(folderId, name)
		this.#autoSave()
	}

	moveAssetToFolder(assetId, folderId) {
		this.#pushUndo()
		this.#assetManager.moveAssetToFolder(assetId, folderId)
		this.#autoSave()
	}

	moveFolderToFolder(folderId, targetParentId) {
		this.#pushUndo()
		this.#assetManager.moveFolderToFolder(folderId, targetParentId)
		this.#autoSave()
	}

	getAssetsInFolder(folderId) {
		return this.#assetManager.getAssetsInFolder(folderId)
	}

	getSubfolders(parentId) {
		return this.#assetManager.getSubfolders(parentId)
	}

	getFolderPath(folderId) {
		return this.#assetManager.getFolderPath(folderId)
	}

	// --- Undo / Redo ---

	undo() {
		const restored = this.#undoManager.undo(this.#project)
		if (!restored) return

		this.#project = restored
		this.#syncManagers()
		this.#autoSave()
		this.#emit('projectChanged', this.#project)
	}

	redo() {
		const restored = this.#undoManager.redo(this.#project)
		if (!restored) return

		this.#project = restored
		this.#syncManagers()
		this.#autoSave()
		this.#emit('projectChanged', this.#project)
	}

	get canUndo() {
		return this.#undoManager.canUndo
	}

	get canRedo() {
		return this.#undoManager.canRedo
	}

	// --- Serialization ---

	toScript() {
		// Convert editor project to runtime script format
		const script = structuredClone(this.#project)

		// Remove editor-only fields
		for (const asset of script.assets) {
			delete asset.name
			delete asset.folderId
		}

		// Remove folders (editor-only organization)
		delete script.folders

		// Remove sceneSections (editor-only organization)
		delete script.sceneSections

		// Remove sectionId from scenes (editor-only field)
		for (const scene of script.scenes) {
			delete scene.sectionId
		}

		// Serialize timeline nodes: flatten data into node, strip id
		for (const scene of script.scenes) {
			scene.timeline = scene.timeline.map(node => {
				const exported = {
					type: node.type,
					auto: node.auto,
					delay: node.delay,
					...node.data
				}

				// Strip expressions from showCharacter if empty
				if (node.type === 'showCharacter') {
					if (exported.expressions && Object.keys(exported.expressions).length === 0) {
						delete exported.expressions
					}
					// Only include enterAnimation if not 'none'
					if (exported.enterAnimation && exported.enterAnimation.type === 'none') {
						delete exported.enterAnimation
					}
				}

				return exported
			})
		}

		// Clean up mainMenu -- only include if it has non-null values
		if (script.meta.mainMenu) {
			const mm = script.meta.mainMenu
			if (!mm.background && !mm.title) {
				delete script.meta.mainMenu
			}
		}

		// Clean up theme -- only include if non-null (partial overrides present)
		if (!script.meta.theme || (typeof script.meta.theme === 'object' && Object.keys(script.meta.theme).length === 0)) {
			delete script.meta.theme
		}

		return script
	}

	// --- Persistence ---

	tryRestoreFromAutoSave() {
		const saved = this.#persistence.tryRestore()
		if (saved) {
			this.#project = saved
			this.#syncManagers()
			this.#currentSceneId = this.#project.startScene ?? this.#project.scenes[0]?.id ?? null
			return true
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
				},
				theme: null
			},
			assets: [],
			folders: [],
			sceneSections: [],
			startScene: null,
			scenes: []
		}

		this.#currentSceneId = null
		this.#selectedElementId = null
		this.#undoManager.reset()
		this.#syncManagers()
	}

	#syncManagers() {
		this.#sceneManager.setProject(this.#project)
		this.#assetManager.setProject(this.#project)
		this.#timelineManager.setProject(this.#project)
	}

	#pushUndo() {
		this.#undoManager.pushUndo(structuredClone(this.#project))
	}

	#autoSave() {
		this.#persistence.autoSave(this.#project)
	}
}
