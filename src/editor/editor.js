import { EditorState } from '../modules/editor/editorState.js'
import { EditorCanvas } from '../modules/editor/editorCanvas.js'
import { AssetManagerPanel } from '../modules/editor/assetManagerPanel.js'
import { SceneManagerPanel } from '../modules/editor/sceneManagerPanel.js'
import { PropertiesPanel } from '../modules/editor/propertiesPanel.js'
import { DialogueEditor } from '../modules/editor/dialogueEditor.js'
import { ScriptSerializer } from '../modules/editor/scriptSerializer.js'

// --- Initialize state ---

const state = new EditorState()

// Try to restore from auto-save, otherwise start fresh
if (!state.tryRestoreFromAutoSave()) {
	// Create a default first scene so the editor isn't empty
	const scene = state.addScene('scene-intro')
	state.selectScene(scene.id)
}

// If restored but no scene is selected, select the first one
if (!state.currentSceneId && state.scenes.length > 0) {
	state.selectScene(state.scenes[0].id)
}

// --- Initialize panels ---

const editorCanvas = new EditorCanvas(state)
const assetManager = new AssetManagerPanel(state)
const sceneManager = new SceneManagerPanel(state)
const propertiesPanel = new PropertiesPanel(state)
const dialogueEditor = new DialogueEditor(state)
const serializer = new ScriptSerializer(state)

// --- Toolbar buttons ---

document.getElementById('btn-new').addEventListener('click', () => {
	if (!confirm('Start a new project? Unsaved changes will be lost.')) return
	state.newProject()
	const scene = state.addScene('scene-intro')
	state.selectScene(scene.id)
})

document.getElementById('btn-open').addEventListener('click', () => {
	serializer.openImportDialog()
})

document.getElementById('btn-save').addEventListener('click', (e) => {
	if (e.shiftKey) {
		// Shift+click exports full editor project
		serializer.exportProjectToFile()
	} else {
		serializer.exportToFile()
	}
})

document.getElementById('btn-preview').addEventListener('click', () => {
	// Export script to a data URL and open the runtime player in a new tab
	const script = state.toScript()
	const json = JSON.stringify(script)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)

	// Open runtime index.html with the script URL as a query parameter
	const previewUrl = '../index.html?script=' + encodeURIComponent(url)
	window.open(previewUrl, '_blank')
})

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
	// Ignore shortcuts when typing in inputs
	const tag = e.target.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

	const ctrl = e.ctrlKey || e.metaKey

	if (ctrl && e.key === 'z' && !e.shiftKey) {
		e.preventDefault()
		state.undo()
	} else if (ctrl && e.key === 'z' && e.shiftKey) {
		e.preventDefault()
		state.redo()
	} else if (ctrl && e.key === 'y') {
		e.preventDefault()
		state.redo()
	} else if (ctrl && e.key === 's') {
		e.preventDefault()
		serializer.exportToFile()
	} else if (ctrl && e.key === 'o') {
		e.preventDefault()
		serializer.openImportDialog()
	} else if (e.key === 'Delete' || e.key === 'Backspace') {
		// Delete selected character
		const selectedId = state.selectedElementId
		const scene = state.currentScene
		if (selectedId && scene) {
			const char = scene.characters.find(c => c.id === selectedId)
			if (char) {
				e.preventDefault()
				state.removeCharacter(scene.id, char.id)
			}
		}
	}
})
