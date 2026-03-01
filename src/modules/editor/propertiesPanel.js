import { formatFileSize } from '../shared/utils.js'
import { createAudioPlayer } from '../shared/audioPlayerBuilder.js'
import { addGroup, addSelect, addCheckbox, addReadonly, addRow } from './properties/formControls.js'
import { renderTimelineNodeProps } from './properties/nodeRenderers.js'
import { ThemeEditor } from './properties/themeEditor.js'

export class PropertiesPanel {
	#state = null
	#contentEl = null
	#selectedAssetId = null
	#propAudio = null
	#themeEditor = null

	constructor(state) {
		this.#state = state
		this.#contentEl = document.getElementById('properties-content')
		this.#themeEditor = new ThemeEditor(state)

		this.#state.on('selectionChanged', () => {
			// When a timeline node is selected on canvas, clear asset selection display
			if (this.#state.selectedElementId) {
				this.#selectedAssetId = null
			}
			this.render()
		})
		this.#state.on('sceneChanged', () => this.render())
		this.#state.on('sceneUpdated', () => this.render())
		this.#state.on('timelineChanged', () => this.render())
		this.#state.on('projectChanged', () => {
			this.#selectedAssetId = null
			this.#stopPropAudio()
			this.render()
		})
		this.#state.on('assetSelectionChanged', (assetId) => {
			this.#stopPropAudio()
			this.#selectedAssetId = assetId
			this.render()
		})
		this.#state.on('assetsChanged', () => {
			// Re-render if the selected asset was removed
			if (this.#selectedAssetId) {
				const asset = this.#state.assets.find(a => a.id === this.#selectedAssetId)
				if (!asset) {
					this.#selectedAssetId = null
					this.#stopPropAudio()
				}
			}
			this.render()
		})

		this.render()
	}

	openThemeEditor() {
		this.#themeEditor.open()
	}

	render() {
		this.#contentEl.innerHTML = ''

		const selectedId = this.#state.selectedElementId
		const scene = this.#state.currentScene

		if (selectedId && scene) {
			const node = this.#state.getTimelineNode(scene.id, selectedId)
			if (node) {
				renderTimelineNodeProps(this.#contentEl, node, scene, this.#state)
				return
			}
		}

		// Show asset preview if an asset is selected in the grid
		if (this.#selectedAssetId) {
			const asset = this.#state.assets.find(a => a.id === this.#selectedAssetId)
			if (asset) {
				this.#renderAssetPreview(asset)
				return
			}
		}

		if (scene) {
			this.#renderSceneProps(scene)
			return
		}

		this.#renderProjectProps()
	}

	#renderProjectProps() {
		const meta = this.#state.project.meta

		addGroup(this.#contentEl, 'Title', 'text', meta.title, (val) => {
			this.#state.updateMeta('title', val)
		})

		addGroup(this.#contentEl, 'Author', 'text', meta.author, (val) => {
			this.#state.updateMeta('author', val)
		})

		addRow(this.#contentEl, [
			{ label: 'Width', type: 'number', value: meta.resolution.width, onChange: (val) => {
				meta.resolution.width = parseInt(val) || 1280
			}},
			{ label: 'Height', type: 'number', value: meta.resolution.height, onChange: (val) => {
				meta.resolution.height = parseInt(val) || 720
			}}
		])

		// --- Title Screen / Main Menu ---
		const divider = document.createElement('hr')
		divider.className = 'props-divider'
		this.#contentEl.appendChild(divider)

		const menuHeader = document.createElement('h4')
		menuHeader.textContent = 'Title Screen'
		menuHeader.className = 'props-section-header'
		this.#contentEl.appendChild(menuHeader)

		const mainMenu = meta.mainMenu ?? { background: null, title: null }

		// Title screen title override
		addGroup(this.#contentEl, 'Display title', 'text', mainMenu.title ?? '', (val) => {
			if (!meta.mainMenu) meta.mainMenu = { background: null, title: null }
			meta.mainMenu.title = val || null
			this.#state.updateMeta('mainMenu', meta.mainMenu)
		})

		// Title screen background (show all image assets)
		const backgrounds = this.#state.getImageAssets()
		addSelect(this.#contentEl, 'Background', mainMenu.background ?? '', backgrounds, (val) => {
			if (!meta.mainMenu) meta.mainMenu = { background: null, title: null }
			meta.mainMenu.background = val || null
			this.#state.updateMeta('mainMenu', meta.mainMenu)
		})

		const hint = document.createElement('div')
		hint.textContent = 'The title screen is shown before gameplay starts. If no background is set, a solid color is used.'
		hint.className = 'props-hint'
		this.#contentEl.appendChild(hint)

		// --- Theme ---
		this.#renderThemeSection(meta)
	}

	#renderThemeSection(meta) {
		const divider = document.createElement('hr')
		divider.className = 'props-divider'
		this.#contentEl.appendChild(divider)

		const header = document.createElement('h4')
		header.textContent = 'Theme'
		header.className = 'props-section-header'
		header.style.marginBottom = '8px'
		this.#contentEl.appendChild(header)

		const themeHint = document.createElement('div')
		themeHint.textContent = 'Customize how the game looks at runtime: colors, fonts, dialogue box, menus, and more.'
		themeHint.className = 'props-hint'
		themeHint.style.marginBottom = '12px'
		this.#contentEl.appendChild(themeHint)

		// Show current theme status
		const theme = meta.theme
		const status = document.createElement('div')
		status.className = 'props-status-text'
		if (theme && Object.keys(theme).length > 0) {
			const count = this.#countThemeOverrides(theme)
			status.textContent = `${count} custom override${count !== 1 ? 's' : ''} set`
			status.style.color = 'var(--accent)'
		} else {
			status.textContent = 'Using default theme'
		}
		this.#contentEl.appendChild(status)

		const editBtn = document.createElement('button')
		editBtn.textContent = 'Edit Theme\u2026'
		editBtn.className = 'props-full-btn'
		editBtn.addEventListener('click', () => this.openThemeEditor())
		this.#contentEl.appendChild(editBtn)
	}

	#countThemeOverrides(obj) {
		let count = 0
		for (const val of Object.values(obj)) {
			if (val && typeof val === 'object' && !Array.isArray(val)) {
				count += this.#countThemeOverrides(val)
			} else {
				count++
			}
		}
		return count
	}

	#renderSceneProps(scene) {
		const header = document.createElement('h4')
		header.textContent = 'Scene: ' + scene.id
		header.className = 'props-section-header'
		this.#contentEl.appendChild(header)

		// Transition settings
		const transitionHeader = document.createElement('h4')
		transitionHeader.textContent = 'Transition In'
		transitionHeader.className = 'props-sub-header'
		this.#contentEl.appendChild(transitionHeader)

		const transitionTypes = [
			{ id: 'fade', name: 'Fade (through black)' },
			{ id: 'dissolve', name: 'Dissolve (crossfade)' },
			{ id: 'slideLeft', name: 'Slide left' },
			{ id: 'slideRight', name: 'Slide right' },
			{ id: 'slideUp', name: 'Slide up' },
			{ id: 'slideDown', name: 'Slide down' },
			{ id: 'none', name: 'None (instant)' }
		]

		const currentTransition = scene.transition ?? { type: 'fade', duration: 0.5 }
		addSelect(this.#contentEl, 'Type', currentTransition.type, transitionTypes, (val) => {
			this.#state.updateScene(scene.id, 'transition', {
				type: val || 'fade',
				duration: currentTransition.duration ?? 0.5
			})
		})

		addGroup(this.#contentEl, 'Duration (s)', 'number', currentTransition.duration ?? 0.5, (val) => {
			this.#state.updateScene(scene.id, 'transition', {
				type: currentTransition.type ?? 'fade',
				duration: parseFloat(val) || 0.5
			})
		}, { step: '0.1', min: '0.1', max: '3' })

		// Next scene
		const flowDivider = document.createElement('hr')
		flowDivider.className = 'props-divider-sm'
		this.#contentEl.appendChild(flowDivider)

		const flowHeader = document.createElement('h4')
		flowHeader.textContent = 'Flow'
		flowHeader.className = 'props-sub-header'
		this.#contentEl.appendChild(flowHeader)

		const allScenes = this.#state.scenes.filter(s => s.id !== scene.id)
		addSelect(this.#contentEl, 'Next scene', scene.next ?? '', allScenes.map(s => ({ id: s.id, name: s.id })), (val) => {
			this.#state.updateScene(scene.id, 'next', val || null)
			if (val) {
				this.#state.updateScene(scene.id, 'choices', null)
			}
		})

		// Start scene checkbox
		addCheckbox(this.#contentEl, 'Start scene', this.#state.project.startScene === scene.id, (val) => {
			if (val) {
				this.#state.project.startScene = scene.id
			}
		})

		const hint = document.createElement('div')
		hint.textContent = 'Background, music, and characters are now managed via timeline nodes.'
		hint.className = 'props-hint-sm'
		hint.style.marginTop = '12px'
		this.#contentEl.appendChild(hint)
	}

	// --- Asset preview ---

	#renderAssetPreview(asset) {
		const header = document.createElement('h4')
		header.textContent = 'Asset'
		header.className = 'props-section-header'
		this.#contentEl.appendChild(header)

		addReadonly(this.#contentEl, 'Name', asset.name ?? asset.id)
		addReadonly(this.#contentEl, 'Type', asset.type)

		if (asset.type === 'background' || asset.type === 'character') {
			// Image preview
			const previewBox = document.createElement('div')
			previewBox.className = 'prop-asset-preview'

			const img = document.createElement('img')
			img.src = asset.dataUrl ?? asset.path
			img.alt = asset.name ?? asset.id
			img.title = 'Click to enlarge'

			img.addEventListener('load', () => {
				const w = img.naturalWidth
				const h = img.naturalHeight
				const sizeBytes = asset.dataUrl
					? Math.round((asset.dataUrl.length - asset.dataUrl.indexOf(',') - 1) * 3 / 4)
					: null
				const sizeStr = sizeBytes != null ? formatFileSize(sizeBytes) : ''
				const dimLabel = `${w} \u00D7 ${h}` + (sizeStr ? ` \u2022 ${sizeStr}` : '')
				addReadonly(this.#contentEl, 'Dimensions', dimLabel)
			})

			// Click to open full preview modal via the asset manager event
			img.addEventListener('click', () => {
				this.#state.emit('assetPreviewRequested', asset.id)
			})

			previewBox.appendChild(img)
			this.#contentEl.appendChild(previewBox)
		} else if (asset.type === 'music' || asset.type === 'sound') {
			// Audio player (compact for narrow panel)
			this.#stopPropAudio()

			const { container: player, audio } = createAudioPlayer(asset, { className: 'audio-player-compact' })
			this.#propAudio = audio
			this.#contentEl.appendChild(player)
		}
	}

	#stopPropAudio() {
		if (this.#propAudio) {
			this.#propAudio.pause()
			this.#propAudio.src = ''
			this.#propAudio = null
		}
	}
}
