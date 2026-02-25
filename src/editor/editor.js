import { EditorState } from '../modules/editor/editorState.js'
import { EditorCanvas } from '../modules/editor/editorCanvas.js'
import { AssetManagerPanel } from '../modules/editor/assetManagerPanel.js'
import { SceneManagerPanel } from '../modules/editor/sceneManagerPanel.js'
import { PropertiesPanel } from '../modules/editor/propertiesPanel.js'
import { DialogueEditor } from '../modules/editor/dialogueEditor.js'
import { ScriptSerializer } from '../modules/editor/scriptSerializer.js'
import { EkakuConfig } from '../modules/ekakuConfig.js'

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
	openPlayPreview()
})

document.getElementById('btn-theme').addEventListener('click', () => {
	propertiesPanel.openThemeEditor()
})

// --- Play Preview (embedded iframe) ---

const previewOverlay = document.getElementById('play-preview')
const previewCloseBtn = document.getElementById('btn-preview-close')
let previewBlobUrl = null
let previewIframe = null

function openPlayPreview() {
	const script = state.toScript()
	const json = JSON.stringify(script)
	const blob = new Blob([json], { type: 'application/json' })
	previewBlobUrl = URL.createObjectURL(blob)

	// Create iframe pointing to the runtime page with the script URL
	previewIframe = document.createElement('iframe')
	previewIframe.className = 'play-preview-frame'
	previewIframe.src = '../index.html?script=' + encodeURIComponent(previewBlobUrl)
	previewIframe.allow = 'autoplay'
	previewOverlay.appendChild(previewIframe)

	previewOverlay.classList.remove('hidden')
}

function closePlayPreview() {
	if (previewOverlay.classList.contains('hidden')) return

	previewOverlay.classList.add('hidden')

	// Remove iframe to stop all audio/video and free resources
	if (previewIframe) {
		previewIframe.src = 'about:blank'
		previewIframe.remove()
		previewIframe = null
	}

	// Revoke blob URL to free memory
	if (previewBlobUrl) {
		URL.revokeObjectURL(previewBlobUrl)
		previewBlobUrl = null
	}
}

previewCloseBtn.addEventListener('click', closePlayPreview)

// --- Textbox preview toggle ---

const editorConfig = new EkakuConfig('ekaku-editor-ui')
const textboxBtn = document.getElementById('btn-toggle-textbox')

// Restore toggle state from config
const textboxVisible = editorConfig.get('textboxPreview') !== false
editorCanvas.textboxVisible = textboxVisible
textboxBtn.classList.toggle('toggle-active', textboxVisible)

textboxBtn.addEventListener('click', () => {
	const newState = !editorCanvas.textboxVisible
	editorCanvas.textboxVisible = newState
	editorConfig.set('textboxPreview', newState)
	textboxBtn.classList.toggle('toggle-active', newState)
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
	} else if (ctrl && e.key === 's' && !e.shiftKey) {
		e.preventDefault()
		serializer.exportToFile()
	} else if (ctrl && e.key === 'S' && e.shiftKey) {
		e.preventDefault()
		serializer.exportProjectToFile()
	} else if (ctrl && e.key === 'o') {
		e.preventDefault()
		serializer.openImportDialog()
	} else if (ctrl && e.key === 'n') {
		e.preventDefault()
		if (confirm('Start a new project? Unsaved changes will be lost.')) {
			state.newProject()
			const scene = state.addScene('scene-intro')
			state.selectScene(scene.id)
		}
	} else if (ctrl && e.key === 'd') {
		e.preventDefault()
		const scene = state.currentScene
		if (scene) {
			const copy = state.duplicateScene(scene.id)
			if (copy) state.selectScene(copy.id)
		}
	} else if (e.key === 'Escape') {
		e.preventDefault()
		// Close preview overlay if open, otherwise deselect
		if (!previewOverlay.classList.contains('hidden')) {
			closePlayPreview()
		} else {
			state.selectElement(null)
		}
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
