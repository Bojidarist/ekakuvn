import { generateId } from '../shared/utils.js'

export class TimelineDataManager {
	#project = null
	#emit = null

	#nodeDefaults = {
		dialogue: { auto: false, data: { speaker: null, text: '', voiceAssetId: null } },
		showCharacter: { auto: true, data: { assetId: null, position: { x: 0.5, y: 0.8 }, scale: 1.0, flipped: false, enterAnimation: { type: 'none', duration: 0.4, delay: 0 }, name: '', expressions: {} } },
		hideCharacter: { auto: true, data: { name: '' } },
		expression: { auto: true, data: { name: '', expression: '', expressionAssetId: null } },
		background: { auto: true, data: { assetId: null } },
		music: { auto: true, data: { assetId: null, loop: true, action: 'play' } },
		sound: { auto: true, data: { assetId: null } },
		wait: { auto: true, data: { duration: 1000 } },
		choice: { auto: false, data: { choices: [{ text: '', targetSceneId: null }] } },
		video: { auto: false, data: { assetId: null, loop: false, volume: 1.0 } }
	}

	constructor(emit) {
		this.#emit = emit
	}

	setProject(project) {
		this.#project = project
	}

	#findScene(sceneId) {
		return this.#project.scenes.find(s => s.id === sceneId) ?? null
	}

	addTimelineNode(sceneId, node, insertIndex) {
		const scene = this.#findScene(sceneId)
		if (!scene) return null

		const defaults = this.#nodeDefaults[node.type]
		if (!defaults) return null

		const entry = {
			id: generateId('node'),
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

		this.#emit('timelineChanged', sceneId)
		return entry
	}

	updateTimelineNode(sceneId, nodeId, updates) {
		const scene = this.#findScene(sceneId)
		if (!scene) return

		const node = scene.timeline.find(n => n.id === nodeId)
		if (!node) return

		if (updates.auto !== undefined) node.auto = updates.auto
		if (updates.delay !== undefined) node.delay = updates.delay
		if (updates.data) {
			Object.assign(node.data, updates.data)
		}
		this.#emit('timelineChanged', sceneId)
	}

	removeTimelineNode(sceneId, nodeId) {
		const scene = this.#findScene(sceneId)
		if (!scene) return

		scene.timeline = scene.timeline.filter(n => n.id !== nodeId)
		this.#emit('timelineChanged', sceneId)
		return nodeId
	}

	reorderTimelineNode(sceneId, fromIndex, toIndex) {
		const scene = this.#findScene(sceneId)
		if (!scene) return

		const [moved] = scene.timeline.splice(fromIndex, 1)
		const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
		scene.timeline.splice(adjustedIndex, 0, moved)
		this.#emit('timelineChanged', sceneId)
	}

	duplicateTimelineNode(sceneId, nodeId) {
		const scene = this.#findScene(sceneId)
		if (!scene) return null

		const source = scene.timeline.find(n => n.id === nodeId)
		if (!source) return null

		const copy = structuredClone(source)
		copy.id = generateId('node')

		const idx = scene.timeline.indexOf(source)
		scene.timeline.splice(idx + 1, 0, copy)

		this.#emit('timelineChanged', sceneId)
		return copy
	}

	getTimelineNode(sceneId, nodeId) {
		const scene = this.#findScene(sceneId)
		if (!scene) return null
		return scene.timeline.find(n => n.id === nodeId) ?? null
	}

	// --- Timeline State Computation ---

	getActiveCharacters(sceneId, upToNodeIndex) {
		const scene = this.#findScene(sceneId)
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
		const scene = this.#findScene(sceneId)
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

	// --- Expressions ---

	getSceneExpressions(sceneId) {
		const scene = this.#findScene(sceneId)
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
		const scene = this.#findScene(sceneId)
		if (!scene) return []

		const node = scene.timeline.find(n => n.id === nodeId)
		if (!node || node.type !== 'showCharacter' || !node.data.expressions) return []
		return Object.keys(node.data.expressions).sort()
	}

	addCharacterExpression(sceneId, nodeId, name, assetId) {
		const scene = this.#findScene(sceneId)
		if (!scene) return

		const node = scene.timeline.find(n => n.id === nodeId)
		if (!node || node.type !== 'showCharacter') return

		if (!node.data.expressions) node.data.expressions = {}
		node.data.expressions[name] = assetId
		this.#emit('timelineChanged', sceneId)
	}

	removeCharacterExpression(sceneId, nodeId, name) {
		const scene = this.#findScene(sceneId)
		if (!scene) return

		const node = scene.timeline.find(n => n.id === nodeId)
		if (!node || node.type !== 'showCharacter' || !node.data.expressions) return

		delete node.data.expressions[name]
		this.#emit('timelineChanged', sceneId)
	}

	// --- Choices ---

	addChoice(sceneId, choice) {
		const scene = this.#findScene(sceneId)
		if (!scene) return

		if (!scene.choices) scene.choices = []
		scene.choices.push({
			text: choice.text ?? '',
			targetSceneId: choice.targetSceneId ?? null
		})
		scene.next = null
		this.#emit('timelineChanged', sceneId)
	}

	updateChoice(sceneId, index, updates) {
		const scene = this.#findScene(sceneId)
		if (!scene || !scene.choices || !scene.choices[index]) return

		Object.assign(scene.choices[index], updates)
		this.#emit('timelineChanged', sceneId)
	}

	removeChoice(sceneId, index) {
		const scene = this.#findScene(sceneId)
		if (!scene || !scene.choices) return

		scene.choices.splice(index, 1)
		if (scene.choices.length === 0) scene.choices = null
		this.#emit('timelineChanged', sceneId)
	}
}
