/**
 * Per-node-type property renderers for the properties panel.
 * Each renderer builds the UI for editing a specific timeline node type.
 */
import { addGroup, addSelect, addCheckbox, addReadonly, addRow } from './formControls.js'

/**
 * Render properties for a timeline node, dispatching to type-specific renderers.
 * Appends common auto/delay fields and a delete button.
 */
export function renderTimelineNodeProps(container, node, scene, state) {
	switch (node.type) {
		case 'showCharacter':
			renderShowCharacterNodeProps(container, node, scene, state)
			break
		case 'hideCharacter':
			renderHideCharacterNodeProps(container, node, scene, state)
			break
		case 'dialogue':
			renderDialogueNodeProps(container, node, scene, state)
			break
		case 'expression':
			renderExpressionNodeProps(container, node, scene, state)
			break
		case 'background':
			renderBackgroundNodeProps(container, node, scene, state)
			break
		case 'music':
			renderMusicNodeProps(container, node, scene, state)
			break
		case 'sound':
			renderSoundNodeProps(container, node, scene, state)
			break
		case 'wait':
			renderWaitNodeProps(container, node, scene, state)
			break
		case 'choice':
			renderChoiceNodeProps(container, node, scene, state)
			break
		case 'video':
			renderVideoNodeProps(container, node, scene, state)
			break
		case 'toggleDialogue':
			renderToggleDialogueNodeProps(container, node, scene, state)
			break
		case 'effect':
			renderEffectNodeProps(container, node, scene, state)
			break
		default:
			addReadonly(container, 'Type', node.type)
			break
	}

	// Common: auto / delay
	const commonDivider = document.createElement('hr')
	commonDivider.className = 'props-divider-sm'
	container.appendChild(commonDivider)

	addCheckbox(container, 'Auto-advance', node.auto ?? false, (val) => {
		state.updateTimelineNode(scene.id, node.id, { auto: val })
	})

	addGroup(container, 'Delay (ms)', 'number', node.delay ?? 0, (val) => {
		state.updateTimelineNode(scene.id, node.id, { delay: parseInt(val) || 0 })
	}, { step: '100', min: '0' })

	// Delete button
	const delBtn = document.createElement('button')
	delBtn.textContent = 'Remove node'
	delBtn.className = 'props-delete-btn'
	delBtn.addEventListener('click', () => {
		state.removeTimelineNode(scene.id, node.id)
	})
	container.appendChild(delBtn)
}

function renderShowCharacterNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Show Character'
	header.className = 'props-section-header'
	container.appendChild(header)

	const data = node.data

	// Character name
	addGroup(container, 'Name', 'text', data.name ?? '', (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { name: val } })
	})

	// Asset info
	const asset = state.assets.find(a => a.id === data.assetId)
	if (asset) {
		addReadonly(container, 'Asset', asset.name ?? asset.id)
	}

	// Asset picker
	const charAssets = state.getAssetsByType('character')
	addSelect(container, 'Character asset', data.assetId ?? '', charAssets, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
	})

	// Position
	addRow(container, [
		{ label: 'X', type: 'number', value: Math.round((data.position?.x ?? 0.5) * 100) / 100, step: '0.01', onChange: (val) => {
			state.updateTimelineNode(scene.id, node.id, {
				data: { position: { ...(data.position ?? { x: 0.5, y: 0.8 }), x: parseFloat(val) || 0 } }
			})
		}},
		{ label: 'Y', type: 'number', value: Math.round((data.position?.y ?? 0.8) * 100) / 100, step: '0.01', onChange: (val) => {
			state.updateTimelineNode(scene.id, node.id, {
				data: { position: { ...(data.position ?? { x: 0.5, y: 0.8 }), y: parseFloat(val) || 0 } }
			})
		}}
	])

	// Scale
	addGroup(container, 'Scale', 'number', data.scale ?? 1.0, (val) => {
		state.updateTimelineNode(scene.id, node.id, {
			data: { scale: parseFloat(val) || 1.0 }
		})
	}, { step: '0.1', min: '0.1', max: '5' })

	// Flip
	addCheckbox(container, 'Flip horizontal', data.flipped ?? false, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { flipped: val } })
	})

	// Enter animation settings
	const animDivider = document.createElement('hr')
	animDivider.className = 'props-divider-sm'
	container.appendChild(animDivider)

	const animHeader = document.createElement('h4')
	animHeader.textContent = 'Enter Animation'
	animHeader.className = 'props-sub-header'
	container.appendChild(animHeader)

	const animTypes = [
		{ id: 'none', name: 'None (instant)' },
		{ id: 'fadeIn', name: 'Fade in' },
		{ id: 'slideLeft', name: 'Slide from left' },
		{ id: 'slideRight', name: 'Slide from right' },
		{ id: 'slideUp', name: 'Slide from below' },
		{ id: 'slideDown', name: 'Slide from above' },
		{ id: 'slideLeftFade', name: 'Slide left + fade' },
		{ id: 'slideRightFade', name: 'Slide right + fade' }
	]

	const currentAnim = data.enterAnimation ?? { type: 'none', duration: 0.4 }
	addSelect(container, 'Type', currentAnim.type, animTypes, (val) => {
		state.updateTimelineNode(scene.id, node.id, {
			data: {
				enterAnimation: {
					type: val || 'none',
					duration: currentAnim.duration ?? 0.4,
					delay: currentAnim.delay ?? 0
				}
			}
		})
	})

	if (currentAnim.type !== 'none') {
		addGroup(container, 'Duration (s)', 'number', currentAnim.duration ?? 0.4, (val) => {
			state.updateTimelineNode(scene.id, node.id, {
				data: {
					enterAnimation: {
						...currentAnim,
						duration: parseFloat(val) || 0.4
					}
				}
			})
		}, { step: '0.05', min: '0.1', max: '3' })

		addGroup(container, 'Delay (s)', 'number', currentAnim.delay ?? 0, (val) => {
			state.updateTimelineNode(scene.id, node.id, {
				data: {
					enterAnimation: {
						...currentAnim,
						delay: parseFloat(val) || 0
					}
				}
			})
		}, { step: '0.05', min: '0', max: '5' })
	}

	// Expressions section
	const exprDivider = document.createElement('hr')
	exprDivider.className = 'props-divider-sm'
	container.appendChild(exprDivider)

	const exprHeader = document.createElement('h4')
	exprHeader.textContent = 'Expressions'
	exprHeader.className = 'props-sub-header'
	container.appendChild(exprHeader)

	const exprHint = document.createElement('div')
	exprHint.textContent = 'Map expression names to character image assets. Use these in dialogue lines to swap the displayed sprite.'
	exprHint.className = 'props-hint-sm'
	exprHint.style.marginBottom = '8px'
	container.appendChild(exprHint)

	// List existing expressions
	const expressions = data.expressions ?? {}

	for (const [name, exprAssetId] of Object.entries(expressions)) {
		const exprRow = document.createElement('div')
		exprRow.className = 'expr-row'

		const nameSpan = document.createElement('span')
		nameSpan.textContent = name
		nameSpan.className = 'expr-name'

		const exprAsset = charAssets.find(a => a.id === exprAssetId)
		const assetSpan = document.createElement('span')
		assetSpan.textContent = exprAsset ? (exprAsset.name ?? exprAsset.id) : '(missing)'
		assetSpan.className = 'expr-asset'
		if (!exprAsset) assetSpan.style.color = 'var(--danger)'

		const removeBtn = document.createElement('button')
		removeBtn.textContent = '\u2715'
		removeBtn.title = 'Remove expression'
		removeBtn.className = 'expr-remove-btn'
		removeBtn.addEventListener('click', () => {
			state.removeCharacterExpression(scene.id, node.id, name)
		})

		exprRow.appendChild(nameSpan)
		exprRow.appendChild(assetSpan)
		exprRow.appendChild(removeBtn)
		container.appendChild(exprRow)
	}

	// Add new expression form
	const addExprRow = document.createElement('div')
	addExprRow.className = 'props-flex-row'
	addExprRow.style.marginTop = '4px'

	const nameInput = document.createElement('input')
	nameInput.type = 'text'
	nameInput.placeholder = 'Name (e.g. happy)'
	nameInput.className = 'props-inline-input'
	nameInput.style.width = '90px'

	const assetSelect = document.createElement('select')
	assetSelect.className = 'props-inline-select'

	const exprEmptyOpt = document.createElement('option')
	exprEmptyOpt.value = ''
	exprEmptyOpt.textContent = '(select asset)'
	assetSelect.appendChild(exprEmptyOpt)

	for (const a of charAssets) {
		const opt = document.createElement('option')
		opt.value = a.id
		opt.textContent = a.name ?? a.id
		assetSelect.appendChild(opt)
	}

	const addExprBtn = document.createElement('button')
	addExprBtn.textContent = '+'
	addExprBtn.title = 'Add expression'
	addExprBtn.style.cssText = 'padding: 3px 8px; font-size: 12px;'
	addExprBtn.addEventListener('click', () => {
		const exprName = nameInput.value.trim().toLowerCase()
		const exprAssetVal = assetSelect.value
		if (!exprName || !exprAssetVal) return
		state.addCharacterExpression(scene.id, node.id, exprName, exprAssetVal)
	})

	addExprRow.appendChild(nameInput)
	addExprRow.appendChild(assetSelect)
	addExprRow.appendChild(addExprBtn)
	container.appendChild(addExprRow)
}

function renderHideCharacterNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Hide Character'
	header.className = 'props-section-header'
	container.appendChild(header)

	addGroup(container, 'Character name', 'text', node.data.name ?? '', (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { name: val } })
	})
}

function renderDialogueNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Dialogue'
	header.className = 'props-section-header'
	container.appendChild(header)

	addGroup(container, 'Speaker', 'text', node.data.speaker ?? '', (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { speaker: val || null } })
	})

	// Text area (multi-line)
	const textGroup = document.createElement('div')
	textGroup.className = 'prop-group'

	const textLabel = document.createElement('label')
	textLabel.textContent = 'Text'
	textGroup.appendChild(textLabel)

	const textArea = document.createElement('textarea')
	textArea.value = node.data.text ?? ''
	textArea.rows = 3
	textArea.className = 'props-inline-input'
	textArea.style.cssText = 'width: 100%; resize: vertical; font-size: 13px; padding: 6px; font-family: inherit;'
	textArea.addEventListener('change', () => {
		state.updateTimelineNode(scene.id, node.id, { data: { text: textArea.value } })
	})
	textGroup.appendChild(textArea)
	container.appendChild(textGroup)

	// Voice asset
	const soundAssets = state.getAssetsByType('sound')
	addSelect(container, 'Voice clip', node.data.voiceAssetId ?? '', soundAssets, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { voiceAssetId: val || null } })
	})
}

function renderExpressionNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Expression'
	header.className = 'props-section-header'
	container.appendChild(header)

	addGroup(container, 'Character name', 'text', node.data.name ?? '', (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { name: val } })
	})

	addGroup(container, 'Expression', 'text', node.data.expression ?? '', (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { expression: val } })
	})

	// Expression asset override (optional)
	const charAssets = state.getAssetsByType('character')
	addSelect(container, 'Asset override', node.data.expressionAssetId ?? '', charAssets, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { expressionAssetId: val || null } })
	})

	const hint = document.createElement('div')
	hint.textContent = 'Changes the expression on an already-visible character. The expression name must match one defined on the showCharacter node, or use the asset override.'
	hint.className = 'props-hint-sm'
	hint.style.marginTop = '8px'
	container.appendChild(hint)
}

function renderBackgroundNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Background'
	header.className = 'props-section-header'
	container.appendChild(header)

	const imageAssets = state.getImageAssets()
	addSelect(container, 'Image', node.data.assetId ?? '', imageAssets, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
	})
}

function renderMusicNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Music'
	header.className = 'props-section-header'
	container.appendChild(header)

	const actions = [
		{ id: 'play', name: 'Play' },
		{ id: 'stop', name: 'Stop' }
	]
	addSelect(container, 'Action', node.data.action ?? 'play', actions, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { action: val } })
	})

	if ((node.data.action ?? 'play') === 'play') {
		const musicAssets = state.getAssetsByType('music')
		addSelect(container, 'Track', node.data.assetId ?? '', musicAssets, (val) => {
			state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
		})

		addCheckbox(container, 'Loop', node.data.loop ?? true, (val) => {
			state.updateTimelineNode(scene.id, node.id, { data: { loop: val } })
		})
	}
}

function renderSoundNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Sound Effect'
	header.className = 'props-section-header'
	container.appendChild(header)

	const soundAssets = state.getAssetsByType('sound')
	addSelect(container, 'Audio', node.data.assetId ?? '', soundAssets, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
	})
}

function renderWaitNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Wait'
	header.className = 'props-section-header'
	container.appendChild(header)

	addGroup(container, 'Duration (ms)', 'number', node.data.duration ?? 1000, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { duration: parseInt(val) || 1000 } })
	}, { step: '100', min: '0' })
}

function renderChoiceNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Choice'
	header.className = 'props-section-header'
	container.appendChild(header)

	const choices = node.data.choices ?? []
	const allScenes = state.scenes

	for (let i = 0; i < choices.length; i++) {
		const choice = choices[i]
		const choiceRow = document.createElement('div')
		choiceRow.className = 'choice-card'

		const choiceLabel = document.createElement('div')
		choiceLabel.textContent = `Choice ${i + 1}`
		choiceLabel.className = 'choice-label'
		choiceRow.appendChild(choiceLabel)

		// Choice text
		const textInput = document.createElement('input')
		textInput.type = 'text'
		textInput.value = choice.text ?? ''
		textInput.placeholder = 'Choice text'
		textInput.className = 'props-inline-input'
		textInput.style.cssText = 'width: 100%; padding: 4px 6px; margin-bottom: 4px; box-sizing: border-box;'
		const idx = i
		textInput.addEventListener('change', () => {
			const updated = [...(node.data.choices ?? [])]
			updated[idx] = { ...updated[idx], text: textInput.value }
			state.updateTimelineNode(scene.id, node.id, { data: { choices: updated } })
		})
		choiceRow.appendChild(textInput)

		// Target scene
		const sceneSelect = document.createElement('select')
		sceneSelect.className = 'props-inline-input'
		sceneSelect.style.cssText = 'width: 100%; padding: 4px 6px; margin-bottom: 4px; box-sizing: border-box;'

		const emptyOpt = document.createElement('option')
		emptyOpt.value = ''
		emptyOpt.textContent = '(no target)'
		sceneSelect.appendChild(emptyOpt)

		for (const s of allScenes) {
			const opt = document.createElement('option')
			opt.value = s.id
			opt.textContent = s.id
			if (s.id === choice.targetSceneId) opt.selected = true
			sceneSelect.appendChild(opt)
		}

		sceneSelect.addEventListener('change', () => {
			const updated = [...(node.data.choices ?? [])]
			updated[idx] = { ...updated[idx], targetSceneId: sceneSelect.value || null }
			state.updateTimelineNode(scene.id, node.id, { data: { choices: updated } })
		})
		choiceRow.appendChild(sceneSelect)

		// Remove choice button
		const removeChoiceBtn = document.createElement('button')
		removeChoiceBtn.textContent = 'Remove'
		removeChoiceBtn.className = 'choice-remove-btn'
		removeChoiceBtn.addEventListener('click', () => {
			const updated = [...(node.data.choices ?? [])]
			updated.splice(idx, 1)
			state.updateTimelineNode(scene.id, node.id, { data: { choices: updated } })
		})
		choiceRow.appendChild(removeChoiceBtn)

		container.appendChild(choiceRow)
	}

	// Add choice button
	const addChoiceBtn = document.createElement('button')
	addChoiceBtn.textContent = '+ Add choice'
	addChoiceBtn.className = 'props-add-choice-btn'
	addChoiceBtn.addEventListener('click', () => {
		const updated = [...(node.data.choices ?? []), { text: '', targetSceneId: null }]
		state.updateTimelineNode(scene.id, node.id, { data: { choices: updated } })
	})
	container.appendChild(addChoiceBtn)
}

function renderVideoNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Video'
	header.className = 'props-section-header'
	container.appendChild(header)

	const videoAssets = state.getAssetsByType('video')
	addSelect(container, 'Video asset', node.data.assetId ?? '', videoAssets, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { assetId: val || null } })
	})

	addCheckbox(container, 'Loop', node.data.loop ?? false, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { loop: val } })
	})

	addGroup(container, 'Volume', 'number', node.data.volume ?? 1.0, (val) => {
		const clamped = Math.min(1, Math.max(0, parseFloat(val) || 1.0))
		state.updateTimelineNode(scene.id, node.id, { data: { volume: clamped } })
	}, { step: '0.1', min: '0', max: '1' })

	const hint = document.createElement('div')
	hint.textContent = 'Plays a video fullscreen. When auto-advance is off, the timeline waits until the video ends before continuing.'
	hint.className = 'props-hint-sm'
	hint.style.marginTop = '8px'
	container.appendChild(hint)
}

function renderToggleDialogueNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'ToggleDialogue'
	header.className = 'props-section-header'
	container.appendChild(header)

	const actions = [
		{ id: 'true', name: 'Show' },
		{ id: 'false', name: 'Hide' }
	]
	addSelect(container, 'Dialogue box', String(node.data.show ?? true), actions, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { show: val === 'true' } })
	})
}

function renderEffectNodeProps(container, node, scene, state) {
	const header = document.createElement('h4')
	header.textContent = 'Effect'
	header.className = 'props-section-header'
	container.appendChild(header)

	const effectTypes = [
		{ id: 'reset', name: 'Reset all effects' },
		{ id: 'negate', name: 'Negate (invert)' },
		{ id: 'grayscale', name: 'Grayscale' },
		{ id: 'sepia', name: 'Sepia' },
		{ id: 'blur', name: 'Blur' },
		{ id: 'brightness', name: 'Brightness' },
		{ id: 'contrast', name: 'Contrast' },
		{ id: 'saturate', name: 'Saturate' },
		{ id: 'hue', name: 'Hue rotate' },
		{ id: 'shake', name: 'Shake' },
		{ id: 'sway', name: 'Sway' },
		{ id: 'bounce', name: 'Bounce' },
		{ id: 'tilt', name: 'Tilt' },
		{ id: 'zoom-pulse', name: 'Zoom pulse' },
		{ id: 'flash', name: 'Flash' }
	]

	const currentType = node.data.effectType ?? 'reset'
	addSelect(container, 'Effect type', currentType, effectTypes, (val) => {
		state.updateTimelineNode(scene.id, node.id, { data: { effectType: val } })
	})

	const colorAmountTypes = ['blur', 'brightness', 'contrast', 'saturate', 'hue']
	const animTypes = ['shake', 'sway', 'bounce', 'tilt', 'zoom-pulse']

	if (colorAmountTypes.includes(currentType)) {
		const placeholder = currentType === 'blur' ? 'px' : currentType === 'hue' ? 'deg' : '%'
		addGroup(container, `Amount (${placeholder})`, 'number', node.data.amount ?? '', (val) => {
			state.updateTimelineNode(scene.id, node.id, { data: { amount: parseFloat(val) || null } })
		}, { step: '1' })
	}

	if (animTypes.includes(currentType)) {
		addRow(container, [
			{ label: 'Intensity', type: 'number', value: node.data.intensity ?? 8, step: '1', min: '0', onChange: (val) => {
				state.updateTimelineNode(scene.id, node.id, { data: { intensity: parseFloat(val) || 8 } })
			}},
			{ label: 'Duration (ms)', type: 'number', value: node.data.duration ?? 500, step: '50', min: '0', onChange: (val) => {
				state.updateTimelineNode(scene.id, node.id, { data: { duration: parseInt(val) || 500 } })
			}}
		])

		if (['sway', 'bounce', 'tilt', 'zoom-pulse'].includes(currentType)) {
			addGroup(container, 'Frequency (Hz)', 'number', node.data.frequency ?? 2, (val) => {
				state.updateTimelineNode(scene.id, node.id, { data: { frequency: parseFloat(val) || 2 } })
			}, { step: '0.5', min: '0.1' })
		}
	}

	if (currentType === 'flash') {
		addRow(container, [
			{ label: 'Color', type: 'color', value: node.data.color ?? '#ffffff', onChange: (val) => {
				state.updateTimelineNode(scene.id, node.id, { data: { color: val } })
			}},
			{ label: 'Duration (ms)', type: 'number', value: node.data.duration ?? 300, step: '50', min: '0', onChange: (val) => {
				state.updateTimelineNode(scene.id, node.id, { data: { duration: parseInt(val) || 300 } })
			}}
		])
	}
}
