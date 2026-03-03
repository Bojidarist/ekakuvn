import { generateId } from '../shared/utils.js'

export function migrateScene(scene) {
	// Only migrate if scene has old format (dialogue array instead of timeline)
	if (scene.timeline) return
	if (!Array.isArray(scene.dialogue)) return

	const timeline = []
	const genId = () => generateId('node')

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

export function migrateProject(project) {
	// Ensure mainMenu exists for backward compatibility
	if (!project.meta.mainMenu) {
		project.meta.mainMenu = { background: null, title: null }
	}

	// Ensure folders array exists for backward compatibility
	if (!project.folders) {
		project.folders = []
	}

	// Ensure sceneSections array exists for backward compatibility
	if (!project.sceneSections) {
		project.sceneSections = []
	}

	// Ensure scenes have sectionId for backward compatibility
	for (const scene of project.scenes) {
		if (scene.sectionId === undefined) {
			scene.sectionId = null
		}
	}

	// Ensure version field exists for backward compatibility
	if (!project.meta.version) {
		project.meta.version = '1.0.0'
	}

	// Ensure theme field exists (null = use defaults)
	if (project.meta.theme === undefined) {
		project.meta.theme = null
	}

	// Migrate old-format scenes to timeline format
	for (const scene of project.scenes) {
		migrateScene(scene)
	}
}
