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

		// Ensure mainMenu exists for editor compatibility
		if (!this.#project.meta.mainMenu) {
			this.#project.meta.mainMenu = { background: null, title: null }
		}

		// Ensure folders array exists for backward compatibility
		if (!this.#project.folders) {
			this.#project.folders = []
		}

		// Ensure sceneSections array exists for backward compatibility
		if (!this.#project.sceneSections) {
			this.#project.sceneSections = []
		}

		// Ensure scenes have sectionId for backward compatibility
		for (const scene of this.#project.scenes) {
			if (scene.sectionId === undefined) {
				scene.sectionId = null
			}
		}

		// Ensure theme field exists (null = use defaults)
		if (this.#project.meta.theme === undefined) {
			this.#project.meta.theme = null
		}

		// Migrate old-format scenes to timeline format
		for (const scene of this.#project.scenes) {
			this.#migrateScene(scene)
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

	addScene(id, sectionId = null) {
		this.#pushUndo()
		const scene = {
			id: id ?? this.#generateId('scene'),
			sectionId: sectionId,
			timeline: [],
			choices: null,
			next: null,
			transition: { type: 'fade', duration: 0.5 }
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
			// Clean up choice nodes in timeline that reference deleted scene
			for (const node of scene.timeline) {
				if (node.type === 'choice' && node.data.choices) {
					node.data.choices = node.data.choices.filter(c => c.targetSceneId !== sceneId)
					if (node.data.choices.length === 0) {
						node.data.choices = [{ text: '', targetSceneId: null }]
					}
				}
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

	moveSceneToSection(sceneId, sectionId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		scene.sectionId = sectionId
		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
	}

	// --- Scene Sections ---

	get sceneSections() {
		return this.#project.sceneSections ?? []
	}

	addSceneSection(name, parentId = null) {
		this.#pushUndo()
		if (!this.#project.sceneSections) this.#project.sceneSections = []
		const section = {
			id: this.#generateId('section'),
			name,
			parentId,
			collapsed: false
		}
		this.#project.sceneSections.push(section)
		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
		return section
	}

	removeSceneSection(sectionId) {
		if (!this.#project.sceneSections) return

		this.#pushUndo()

		// Collect all descendant section IDs
		const toRemove = new Set()
		const collect = (id) => {
			toRemove.add(id)
			for (const s of this.#project.sceneSections) {
				if (s.parentId === id) collect(s.id)
			}
		}
		collect(sectionId)

		// Move scenes in deleted sections to the parent of the deleted section
		const deletedSection = this.#project.sceneSections.find(s => s.id === sectionId)
		const reparentTo = deletedSection?.parentId ?? null
		for (const scene of this.#project.scenes) {
			if (scene.sectionId && toRemove.has(scene.sectionId)) {
				scene.sectionId = reparentTo
			}
		}

		this.#project.sceneSections = this.#project.sceneSections.filter(s => !toRemove.has(s.id))
		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
	}

	renameSceneSection(sectionId, name) {
		if (!this.#project.sceneSections) return
		const section = this.#project.sceneSections.find(s => s.id === sectionId)
		if (!section) return

		this.#pushUndo()
		section.name = name
		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
	}

	toggleSceneSection(sectionId) {
		if (!this.#project.sceneSections) return
		const section = this.#project.sceneSections.find(s => s.id === sectionId)
		if (!section) return

		section.collapsed = !section.collapsed
		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
	}

	moveSceneSectionToSection(sectionId, targetParentId) {
		if (!this.#project.sceneSections) return
		const section = this.#project.sceneSections.find(s => s.id === sectionId)
		if (!section) return

		// Prevent moving a section into itself or its descendants
		let check = targetParentId
		while (check) {
			if (check === sectionId) return
			const parent = this.#project.sceneSections.find(s => s.id === check)
			check = parent?.parentId ?? null
		}

		this.#pushUndo()
		section.parentId = targetParentId
		this.#autoSave()
		this.#emit('scenesChanged', this.#project.scenes)
	}

	getScenesInSection(sectionId) {
		return this.#project.scenes.filter(s => (s.sectionId ?? null) === sectionId)
	}

	getSubSections(parentId) {
		if (!this.#project.sceneSections) return []
		return this.#project.sceneSections.filter(s => (s.parentId ?? null) === parentId)
	}

	// --- Timeline Nodes ---

	#nodeDefaults = {
		dialogue: { auto: false, data: { speaker: null, text: '', voiceAssetId: null } },
		showCharacter: { auto: true, data: { assetId: null, position: { x: 0.5, y: 0.8 }, scale: 1.0, flipped: false, enterAnimation: { type: 'none', duration: 0.4, delay: 0 }, name: '', expressions: {} } },
		hideCharacter: { auto: true, data: { name: '' } },
		expression: { auto: true, data: { name: '', expression: '', expressionAssetId: null } },
		background: { auto: true, data: { assetId: null } },
		music: { auto: true, data: { assetId: null, loop: true, action: 'play' } },
		sound: { auto: true, data: { assetId: null } },
		wait: { auto: true, data: { duration: 1000 } },
		choice: { auto: false, data: { choices: [{ text: '', targetSceneId: null }] } }
	}

	addTimelineNode(sceneId, node, insertIndex) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return null

		const defaults = this.#nodeDefaults[node.type]
		if (!defaults) return null

		this.#pushUndo()
		const entry = {
			id: this.#generateId('node'),
			type: node.type,
			auto: node.auto ?? defaults.auto,
			delay: node.delay ?? 0,
			data: structuredClone(node.data ?? defaults.data)
		}

		if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= scene.timeline.length) {
			scene.timeline.splice(insertIndex, 0, entry)
		} else {
			scene.timeline.push(entry)
		}

		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
		return entry
	}

	updateTimelineNode(sceneId, nodeId, updates) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		const node = scene.timeline.find(n => n.id === nodeId)
		if (!node) return

		this.#pushUndo()
		if (updates.auto !== undefined) node.auto = updates.auto
		if (updates.delay !== undefined) node.delay = updates.delay
		if (updates.data) {
			Object.assign(node.data, updates.data)
		}
		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
	}

	removeTimelineNode(sceneId, nodeId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		scene.timeline = scene.timeline.filter(n => n.id !== nodeId)

		if (this.#selectedElementId === nodeId) {
			this.#selectedElementId = null
			this.#emit('selectionChanged', null)
		}

		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
	}

	reorderTimelineNode(sceneId, fromIndex, toIndex) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		const [moved] = scene.timeline.splice(fromIndex, 1)
		scene.timeline.splice(toIndex, 0, moved)
		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
	}

	duplicateTimelineNode(sceneId, nodeId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return null

		const source = scene.timeline.find(n => n.id === nodeId)
		if (!source) return null

		this.#pushUndo()
		const copy = structuredClone(source)
		copy.id = this.#generateId('node')

		const idx = scene.timeline.indexOf(source)
		scene.timeline.splice(idx + 1, 0, copy)

		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
		return copy
	}

	getTimelineNode(sceneId, nodeId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return null
		return scene.timeline.find(n => n.id === nodeId) ?? null
	}

	selectElement(elementId) {
		this.#selectedElementId = elementId
		this.#emit('selectionChanged', elementId)
	}

	// --- Timeline State Computation ---

	getActiveCharacters(sceneId, upToNodeIndex) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return new Map()

		const chars = new Map()
		const limit = upToNodeIndex !== undefined ? upToNodeIndex + 1 : scene.timeline.length

		for (let i = 0; i < limit && i < scene.timeline.length; i++) {
			const node = scene.timeline[i]
			if (node.type === 'showCharacter') {
				chars.set(node.id, {
					nodeId: node.id,
					name: node.data.name,
					assetId: node.data.assetId,
					position: { ...node.data.position },
					scale: node.data.scale,
					flipped: node.data.flipped,
					enterAnimation: node.data.enterAnimation ? { ...node.data.enterAnimation } : null,
					expressions: node.data.expressions ? { ...node.data.expressions } : {},
					currentExpression: null
				})
			} else if (node.type === 'hideCharacter') {
				for (const [id, char] of chars) {
					if (char.name === node.data.name) chars.delete(id)
				}
			} else if (node.type === 'expression') {
				for (const [, char] of chars) {
					if (char.name === node.data.name) {
						char.currentExpression = node.data.expression
					}
				}
			}
		}

		return chars
	}

	getActiveBackground(sceneId, upToNodeIndex) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return null

		const limit = upToNodeIndex !== undefined ? upToNodeIndex + 1 : scene.timeline.length
		let bgAssetId = null

		for (let i = 0; i < limit && i < scene.timeline.length; i++) {
			const node = scene.timeline[i]
			if (node.type === 'background') {
				bgAssetId = node.data.assetId
			}
		}

		return bgAssetId
	}

	// --- Expressions (timeline-aware) ---

	getSceneExpressions(sceneId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return []

		const expressions = new Set()
		for (const node of scene.timeline) {
			if (node.type === 'showCharacter' && node.data.expressions) {
				for (const name of Object.keys(node.data.expressions)) {
					expressions.add(name)
				}
			}
		}
		return [...expressions].sort()
	}

	getCharacterExpressions(sceneId, nodeId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return []

		const node = scene.timeline.find(n => n.id === nodeId)
		if (!node || node.type !== 'showCharacter' || !node.data.expressions) return []
		return Object.keys(node.data.expressions).sort()
	}

	addCharacterExpression(sceneId, nodeId, name, assetId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		const node = scene.timeline.find(n => n.id === nodeId)
		if (!node || node.type !== 'showCharacter') return

		this.#pushUndo()
		if (!node.data.expressions) node.data.expressions = {}
		node.data.expressions[name] = assetId
		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
	}

	removeCharacterExpression(sceneId, nodeId, name) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		const node = scene.timeline.find(n => n.id === nodeId)
		if (!node || node.type !== 'showCharacter' || !node.data.expressions) return

		this.#pushUndo()
		delete node.data.expressions[name]
		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
	}

	// --- Choices (scene-level, for end-of-timeline branching) ---

	addChoice(sceneId, choice) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		this.#pushUndo()
		if (!scene.choices) scene.choices = []
		scene.choices.push({
			text: choice.text ?? '',
			targetSceneId: choice.targetSceneId ?? null
		})
		scene.next = null
		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
	}

	updateChoice(sceneId, index, updates) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene || !scene.choices || !scene.choices[index]) return

		this.#pushUndo()
		Object.assign(scene.choices[index], updates)
		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
	}

	removeChoice(sceneId, index) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene || !scene.choices) return

		this.#pushUndo()
		scene.choices.splice(index, 1)
		if (scene.choices.length === 0) scene.choices = null
		this.#autoSave()
		this.#emit('timelineChanged', sceneId)
	}

	// --- Assets ---

	addAsset(asset) {
		this.#pushUndo()
		const entry = {
			id: asset.id ?? this.#generateId('asset'),
			type: asset.type,
			path: asset.path,
			dataUrl: asset.dataUrl ?? null,
			name: asset.name ?? asset.id,
			folderId: asset.folderId ?? null
		}
		this.#project.assets.push(entry)
		this.#autoSave()
		this.#emit('assetsChanged', this.#project.assets)
		return entry
	}

	removeAsset(assetId) {
		this.#pushUndo()
		this.#project.assets = this.#project.assets.filter(a => a.id !== assetId)

		// Clean up timeline node references to deleted asset
		for (const scene of this.#project.scenes) {
			scene.timeline = scene.timeline.filter(node => {
				if (node.type === 'background' && node.data.assetId === assetId) return false
				if (node.type === 'music' && node.data.assetId === assetId) return false
				if (node.type === 'sound' && node.data.assetId === assetId) return false
				if (node.type === 'showCharacter' && node.data.assetId === assetId) return false
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

	getImageAssets() {
		return this.#project.assets.filter(a => a.type === 'background' || a.type === 'character')
	}

	// --- Folders ---

	get folders() {
		return this.#project.folders
	}

	addFolder(name, parentId = null) {
		this.#pushUndo()
		const folder = {
			id: this.#generateId('folder'),
			name,
			parentId
		}
		this.#project.folders.push(folder)
		this.#autoSave()
		this.#emit('foldersChanged', this.#project.folders)
		return folder
	}

	removeFolder(folderId) {
		this.#pushUndo()

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
		this.#autoSave()
		this.#emit('foldersChanged', this.#project.folders)
		this.#emit('assetsChanged', this.#project.assets)
	}

	renameFolder(folderId, name) {
		const folder = this.#project.folders.find(f => f.id === folderId)
		if (!folder) return

		this.#pushUndo()
		folder.name = name
		this.#autoSave()
		this.#emit('foldersChanged', this.#project.folders)
	}

	moveAssetToFolder(assetId, folderId) {
		const asset = this.#project.assets.find(a => a.id === assetId)
		if (!asset) return

		this.#pushUndo()
		asset.folderId = folderId
		this.#autoSave()
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

		this.#pushUndo()
		folder.parentId = targetParentId
		this.#autoSave()
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

			// If scene has choices at scene level, keep them; choice nodes in timeline are self-contained
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
		const saved = this.#config.get('project')
		if (saved) {
			try {
				this.#project = saved
				// Ensure mainMenu exists for backward compatibility
				if (!this.#project.meta.mainMenu) {
					this.#project.meta.mainMenu = { background: null, title: null }
				}
				// Ensure folders array exists for backward compatibility
				if (!this.#project.folders) {
					this.#project.folders = []
				}
				// Ensure sceneSections array exists for backward compatibility
				if (!this.#project.sceneSections) {
					this.#project.sceneSections = []
				}
				// Ensure scenes have sectionId for backward compatibility
				for (const scene of this.#project.scenes) {
					if (scene.sectionId === undefined) {
						scene.sectionId = null
					}
				}
				// Ensure theme field exists (null = use defaults)
				if (this.#project.meta.theme === undefined) {
					this.#project.meta.theme = null
				}
				// Migrate old-format scenes to timeline format
				for (const scene of this.#project.scenes) {
					this.#migrateScene(scene)
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

	#migrateScene(scene) {
		// Only migrate if scene has old format (dialogue array instead of timeline)
		if (scene.timeline) return
		if (!Array.isArray(scene.dialogue)) return

		const timeline = []
		const genId = () => this.#generateId('node')

		// 1. Background node
		if (scene.background) {
			timeline.push({
				id: genId(),
				type: 'background',
				auto: true,
				delay: 0,
				data: { assetId: scene.background }
			})
		}

		// 2. Music node
		if (scene.music) {
			timeline.push({
				id: genId(),
				type: 'music',
				auto: true,
				delay: 0,
				data: {
					assetId: scene.music.assetId ?? scene.music,
					loop: scene.music.loop ?? true,
					action: 'play'
				}
			})
		}

		// 3. Character nodes
		if (Array.isArray(scene.characters)) {
			for (const char of scene.characters) {
				timeline.push({
					id: genId(),
					type: 'showCharacter',
					auto: true,
					delay: 0,
					data: {
						assetId: char.assetId,
						position: char.position ?? { x: 0.5, y: 0.8 },
						scale: char.scale ?? 1.0,
						flipped: char.flipped ?? false,
						enterAnimation: char.enterAnimation ?? { type: 'none', duration: 0.4, delay: 0 },
						name: char.name ?? '',
						expressions: char.expressions ?? {}
					}
				})
			}
		}

		// 4. Dialogue lines (with expression nodes inserted before if present)
		for (const line of scene.dialogue) {
			if (line.expression) {
				timeline.push({
					id: genId(),
					type: 'expression',
					auto: true,
					delay: 0,
					data: {
						name: line.speaker ?? '',
						expression: line.expression,
						expressionAssetId: null
					}
				})
			}

			timeline.push({
				id: genId(),
				type: 'dialogue',
				auto: false,
				delay: 0,
				data: {
					speaker: line.speaker ?? null,
					text: line.text ?? '',
					voiceAssetId: line.voiceAssetId ?? null
				}
			})
		}

		// 5. Choices (convert scene-level choices to choice node)
		if (Array.isArray(scene.choices) && scene.choices.length > 0) {
			timeline.push({
				id: genId(),
				type: 'choice',
				auto: false,
				delay: 0,
				data: {
					choices: scene.choices.map(c => ({
						text: c.text ?? '',
						targetSceneId: c.targetSceneId ?? null
					}))
				}
			})
			scene.choices = null
		}

		// Apply migration
		scene.timeline = timeline
		delete scene.background
		delete scene.music
		delete scene.characters
		delete scene.dialogue
	}
}
