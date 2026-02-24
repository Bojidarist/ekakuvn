export class PropertiesPanel {
	#state = null
	#contentEl = null
	#selectedAssetId = null
	#propAudio = null

	constructor(state) {
		this.#state = state
		this.#contentEl = document.getElementById('properties-content')

		this.#state.on('selectionChanged', () => {
			// When a character is selected on canvas, clear asset selection display
			if (this.#state.selectedElementId) {
				this.#selectedAssetId = null
			}
			this.render()
		})
		this.#state.on('sceneChanged', () => this.render())
		this.#state.on('sceneUpdated', () => this.render())
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

	render() {
		this.#contentEl.innerHTML = ''

		const selectedId = this.#state.selectedElementId
		const scene = this.#state.currentScene

		if (selectedId && scene) {
			const char = scene.characters.find(c => c.id === selectedId)
			if (char) {
				this.#renderCharacterProps(char, scene)
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

		this.#addGroup('Title', 'text', meta.title, (val) => {
			this.#state.updateMeta('title', val)
		})

		this.#addGroup('Author', 'text', meta.author, (val) => {
			this.#state.updateMeta('author', val)
		})

		this.#addRow([
			{ label: 'Width', type: 'number', value: meta.resolution.width, onChange: (val) => {
				meta.resolution.width = parseInt(val) || 1280
			}},
			{ label: 'Height', type: 'number', value: meta.resolution.height, onChange: (val) => {
				meta.resolution.height = parseInt(val) || 720
			}}
		])

		// --- Title Screen / Main Menu ---
		const divider = document.createElement('hr')
		divider.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 16px 0;'
		this.#contentEl.appendChild(divider)

		const menuHeader = document.createElement('h4')
		menuHeader.textContent = 'Title Screen'
		menuHeader.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(menuHeader)

		const mainMenu = meta.mainMenu ?? { background: null, title: null }

		// Title screen title override
		this.#addGroup('Display title', 'text', mainMenu.title ?? '', (val) => {
			if (!meta.mainMenu) meta.mainMenu = { background: null, title: null }
			meta.mainMenu.title = val || null
			this.#state.updateMeta('mainMenu', meta.mainMenu)
		})

		// Title screen background (show all image assets)
		const backgrounds = this.#state.getImageAssets()
		this.#addSelect('Background', mainMenu.background ?? '', backgrounds, (val) => {
			if (!meta.mainMenu) meta.mainMenu = { background: null, title: null }
			meta.mainMenu.background = val || null
			this.#state.updateMeta('mainMenu', meta.mainMenu)
		})

		const hint = document.createElement('div')
		hint.textContent = 'The title screen is shown before gameplay starts. If no background is set, a solid color is used.'
		hint.style.cssText = 'font-size: 12px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4;'
		this.#contentEl.appendChild(hint)
	}

	#renderSceneProps(scene) {
		const header = document.createElement('h4')
		header.textContent = 'Scene: ' + scene.id
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		// Background picker (show all image assets, not just those typed as 'background')
		const imageAssets = this.#state.getImageAssets()
		this.#addSelect('Background', scene.background, imageAssets, (val) => {
			this.#state.updateScene(scene.id, 'background', val || null)
		})

		// Music picker
		const musicAssets = this.#state.getAssetsByType('music')
		const musicId = scene.music?.assetId ?? ''
		this.#addSelect('Music', musicId, musicAssets, (val) => {
			if (val) {
				this.#state.updateScene(scene.id, 'music', { assetId: val, loop: true })
			} else {
				this.#state.updateScene(scene.id, 'music', null)
			}
		})

		// Music loop toggle
		if (scene.music) {
			this.#addCheckbox('Loop music', scene.music.loop ?? true, (val) => {
				this.#state.updateScene(scene.id, 'music', { ...scene.music, loop: val })
			})
		}

		// Next scene
		const allScenes = this.#state.scenes.filter(s => s.id !== scene.id)
		this.#addSelect('Next scene', scene.next ?? '', allScenes.map(s => ({ id: s.id, name: s.id })), (val) => {
			this.#state.updateScene(scene.id, 'next', val || null)
			if (val) {
				this.#state.updateScene(scene.id, 'choices', null)
			}
		})

		// Start scene checkbox
		this.#addCheckbox('Start scene', this.#state.project.startScene === scene.id, (val) => {
			if (val) {
				this.#state.project.startScene = scene.id
			}
		})
	}

	#renderCharacterProps(char, scene) {
		const header = document.createElement('h4')
		header.textContent = 'Character'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		// Asset info
		const asset = this.#state.assets.find(a => a.id === char.assetId)
		if (asset) {
			this.#addReadonly('Asset', asset.name ?? asset.id)
		}

		// Position
		this.#addRow([
			{ label: 'X', type: 'number', value: Math.round(char.position.x * 100) / 100, step: '0.01', onChange: (val) => {
				this.#state.updateCharacter(scene.id, char.id, {
					position: { ...char.position, x: parseFloat(val) || 0 }
				})
			}},
			{ label: 'Y', type: 'number', value: Math.round(char.position.y * 100) / 100, step: '0.01', onChange: (val) => {
				this.#state.updateCharacter(scene.id, char.id, {
					position: { ...char.position, y: parseFloat(val) || 0 }
				})
			}}
		])

		// Scale
		this.#addGroup('Scale', 'number', char.scale ?? 1.0, (val) => {
			this.#state.updateCharacter(scene.id, char.id, {
				scale: parseFloat(val) || 1.0
			})
		}, { step: '0.1', min: '0.1', max: '5' })

		// Flip
		this.#addCheckbox('Flip horizontal', char.flipped ?? false, (val) => {
			this.#state.updateCharacter(scene.id, char.id, { flipped: val })
		})

		// Delete button
		const delBtn = document.createElement('button')
		delBtn.textContent = 'Remove character'
		delBtn.style.cssText = 'margin-top: 16px; width: 100%; color: var(--danger); border-color: var(--danger);'
		delBtn.addEventListener('click', () => {
			this.#state.removeCharacter(scene.id, char.id)
		})
		this.#contentEl.appendChild(delBtn)
	}

	// --- Asset preview ---

	#renderAssetPreview(asset) {
		const header = document.createElement('h4')
		header.textContent = 'Asset'
		header.style.cssText = 'color: var(--accent); margin-bottom: 12px; font-size: 14px;'
		this.#contentEl.appendChild(header)

		this.#addReadonly('Name', asset.name ?? asset.id)
		this.#addReadonly('Type', asset.type)

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
				const sizeStr = sizeBytes != null ? this.#formatFileSize(sizeBytes) : ''
				const dimLabel = `${w} \u00D7 ${h}` + (sizeStr ? ` \u2022 ${sizeStr}` : '')
				this.#addReadonly('Dimensions', dimLabel)
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

			const player = document.createElement('div')
			player.className = 'audio-player-compact'

			const audio = new Audio(asset.dataUrl ?? asset.path)
			this.#propAudio = audio

			const playBtn = document.createElement('button')
			playBtn.textContent = '\u25B6'
			playBtn.title = 'Play'
			playBtn.addEventListener('click', () => {
				if (audio.paused) {
					audio.play()
					playBtn.textContent = '\u275A\u275A'
					playBtn.title = 'Pause'
				} else {
					audio.pause()
					playBtn.textContent = '\u25B6'
					playBtn.title = 'Play'
				}
			})

			const seekBar = document.createElement('input')
			seekBar.type = 'range'
			seekBar.min = '0'
			seekBar.max = '100'
			seekBar.value = '0'
			seekBar.step = '0.1'
			seekBar.addEventListener('input', () => {
				if (audio.duration) {
					audio.currentTime = (parseFloat(seekBar.value) / 100) * audio.duration
				}
			})

			const timeLabel = document.createElement('span')
			timeLabel.className = 'audio-time'
			timeLabel.textContent = '0:00 / 0:00'

			audio.addEventListener('timeupdate', () => {
				if (audio.duration) {
					seekBar.value = String((audio.currentTime / audio.duration) * 100)
					timeLabel.textContent = `${this.#formatTime(audio.currentTime)} / ${this.#formatTime(audio.duration)}`
				}
			})

			audio.addEventListener('ended', () => {
				playBtn.textContent = '\u25B6'
				playBtn.title = 'Play'
				seekBar.value = '0'
			})

			audio.addEventListener('loadedmetadata', () => {
				timeLabel.textContent = `0:00 / ${this.#formatTime(audio.duration)}`
			})

			player.appendChild(playBtn)
			player.appendChild(seekBar)
			player.appendChild(timeLabel)
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

	#formatTime(seconds) {
		if (!isFinite(seconds)) return '0:00'
		const m = Math.floor(seconds / 60)
		const s = Math.floor(seconds % 60)
		return `${m}:${s.toString().padStart(2, '0')}`
	}

	#formatFileSize(bytes) {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	// --- UI helpers ---

	#addGroup(label, type, value, onChange, attrs = {}) {
		const group = document.createElement('div')
		group.className = 'prop-group'

		const lbl = document.createElement('label')
		lbl.textContent = label
		group.appendChild(lbl)

		const input = document.createElement('input')
		input.type = type
		input.value = value ?? ''
		for (const [k, v] of Object.entries(attrs)) {
			input.setAttribute(k, v)
		}
		input.addEventListener('change', () => onChange(input.value))
		group.appendChild(input)

		this.#contentEl.appendChild(group)
	}

	#addSelect(label, currentValue, options, onChange) {
		const group = document.createElement('div')
		group.className = 'prop-group'

		const lbl = document.createElement('label')
		lbl.textContent = label
		group.appendChild(lbl)

		const select = document.createElement('select')
		const emptyOpt = document.createElement('option')
		emptyOpt.value = ''
		emptyOpt.textContent = '(none)'
		select.appendChild(emptyOpt)

		for (const opt of options) {
			const o = document.createElement('option')
			o.value = opt.id
			o.textContent = opt.name ?? opt.id
			if (opt.id === currentValue) o.selected = true
			select.appendChild(o)
		}

		select.addEventListener('change', () => onChange(select.value))
		group.appendChild(select)

		this.#contentEl.appendChild(group)
	}

	#addCheckbox(label, checked, onChange) {
		const group = document.createElement('div')
		group.className = 'prop-group'

		const lbl = document.createElement('label')
		lbl.className = 'checkbox-label'

		const input = document.createElement('input')
		input.type = 'checkbox'
		input.checked = checked
		input.addEventListener('change', () => onChange(input.checked))

		lbl.appendChild(input)
		lbl.appendChild(document.createTextNode(label))
		group.appendChild(lbl)

		this.#contentEl.appendChild(group)
	}

	#addReadonly(label, value) {
		const group = document.createElement('div')
		group.className = 'prop-group'

		const lbl = document.createElement('label')
		lbl.textContent = label
		group.appendChild(lbl)

		const span = document.createElement('div')
		span.textContent = value
		span.style.cssText = 'font-size: 13px; color: var(--text-secondary); padding: 4px 0;'
		group.appendChild(span)

		this.#contentEl.appendChild(group)
	}

	#addRow(fields) {
		const row = document.createElement('div')
		row.className = 'prop-row'

		for (const field of fields) {
			const group = document.createElement('div')
			group.className = 'prop-group'

			const lbl = document.createElement('label')
			lbl.textContent = field.label
			group.appendChild(lbl)

			const input = document.createElement('input')
			input.type = field.type
			input.value = field.value ?? ''
			if (field.step) input.step = field.step
			if (field.min) input.min = field.min
			if (field.max) input.max = field.max
			input.addEventListener('change', () => field.onChange(input.value))
			group.appendChild(input)

			row.appendChild(group)
		}

		this.#contentEl.appendChild(row)
	}
}
