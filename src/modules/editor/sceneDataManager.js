import { generateId } from '../shared/utils.js'

export class SceneDataManager {
	#project = null
	#emit = null

	constructor(emit) {
		this.#emit = emit
	}

	setProject(project) {
		this.#project = project
	}

	get scenes() {
		return this.#project.scenes
	}

	get sceneSections() {
		return this.#project.sceneSections ?? []
	}

	findScene(sceneId) {
		return this.#project.scenes.find(s => s.id === sceneId) ?? null
	}

	addScene(id, sectionId = null) {
		const scene = {
			id: id ?? generateId('scene'),
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

		this.#emit('scenesChanged', this.#project.scenes)
		return scene
	}

	deleteScene(sceneId) {
		this.#project.scenes = this.#project.scenes.filter(s => s.id !== sceneId)

		if (this.#project.startScene === sceneId) {
			this.#project.startScene = this.#project.scenes[0]?.id ?? null
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

		this.#emit('scenesChanged', this.#project.scenes)

		// Return the new current scene or null
		return this.#project.scenes[0]?.id ?? null
	}

	duplicateScene(sceneId) {
		const source = this.#project.scenes.find(s => s.id === sceneId)
		if (!source) return null

		const copy = structuredClone(source)
		copy.id = generateId('scene')
		this.#project.scenes.push(copy)
		this.#emit('scenesChanged', this.#project.scenes)
		return copy
	}

	reorderScenes(fromIndex, toIndex) {
		const [moved] = this.#project.scenes.splice(fromIndex, 1)
		const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
		this.#project.scenes.splice(adjustedIndex, 0, moved)
		this.#emit('scenesChanged', this.#project.scenes)
	}

	updateScene(sceneId, key, value) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		scene[key] = value
		this.#emit('sceneUpdated', { sceneId, key, value })
	}

	moveSceneToSection(sceneId, sectionId) {
		const scene = this.#project.scenes.find(s => s.id === sceneId)
		if (!scene) return

		scene.sectionId = sectionId
		this.#emit('scenesChanged', this.#project.scenes)
	}

	// --- Scene Sections ---

	addSceneSection(name, parentId = null) {
		if (!this.#project.sceneSections) this.#project.sceneSections = []
		const section = {
			id: generateId('section'),
			name,
			parentId,
			collapsed: false
		}
		this.#project.sceneSections.push(section)
		this.#emit('scenesChanged', this.#project.scenes)
		return section
	}

	removeSceneSection(sectionId) {
		if (!this.#project.sceneSections) return

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
		this.#emit('scenesChanged', this.#project.scenes)
	}

	renameSceneSection(sectionId, name) {
		if (!this.#project.sceneSections) return
		const section = this.#project.sceneSections.find(s => s.id === sectionId)
		if (!section) return

		section.name = name
		this.#emit('scenesChanged', this.#project.scenes)
	}

	toggleSceneSection(sectionId) {
		if (!this.#project.sceneSections) return
		const section = this.#project.sceneSections.find(s => s.id === sectionId)
		if (!section) return

		section.collapsed = !section.collapsed
		this.#emit('scenesChanged', this.#project.scenes)
	}

	reorderSceneSection(fromIndex, toIndex) {
		if (!this.#project.sceneSections) return
		const [moved] = this.#project.sceneSections.splice(fromIndex, 1)
		const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
		this.#project.sceneSections.splice(adjustedIndex, 0, moved)
		this.#emit('scenesChanged', this.#project.scenes)
	}

	moveSceneSectionToSection(sectionId, targetParentId) {		if (!this.#project.sceneSections) return
		const section = this.#project.sceneSections.find(s => s.id === sectionId)
		if (!section) return

		// Prevent moving a section into itself or its descendants
		let check = targetParentId
		while (check) {
			if (check === sectionId) return
			const parent = this.#project.sceneSections.find(s => s.id === check)
			check = parent?.parentId ?? null
		}

		section.parentId = targetParentId
		this.#emit('scenesChanged', this.#project.scenes)
	}

	getScenesInSection(sectionId) {
		return this.#project.scenes.filter(s => (s.sectionId ?? null) === sectionId)
	}

	getSubSections(parentId) {
		if (!this.#project.sceneSections) return []
		return this.#project.sceneSections.filter(s => (s.parentId ?? null) === parentId)
	}
}
