/**
 * Node type metadata and summary text generation for timeline nodes.
 * Stateless — all functions take the node and state as parameters.
 */

/** Node type metadata for rendering (label, color, icon). */
export const nodeTypes = {
	dialogue: { label: 'text', color: '#6b7280', icon: '\uD83D\uDCAC' },
	showCharacter: { label: 'char', color: '#991b1b', icon: '\uD83E\uDDCD' },
	hideCharacter: { label: 'char', color: '#7f1d1d', icon: '\uD83D\uDEAA' },
	expression: { label: 'expr', color: '#b91c1c', icon: '\uD83C\uDFAD' },
	background: { label: 'bg', color: '#5b2130', icon: '\uD83C\uDF04' },
	music: { label: 'music', color: '#1e40af', icon: '\uD83C\uDFB5' },
	sound: { label: 'sfx', color: '#1e3a8a', icon: '\uD83D\uDD0A' },
	wait: { label: 'wait', color: '#6b21a8', icon: '\u23F3' },
	choice: { label: 'choice', color: '#0d9488', icon: '\u2934' }
}

/** Ordered list of element types for the elements panel. */
export const elementOrder = ['dialogue', 'showCharacter', 'hideCharacter', 'expression', 'background', 'music', 'sound', 'wait', 'choice']

/**
 * Get a human-readable type name for display.
 * @param {string} type - Node type key
 * @returns {string}
 */
export function friendlyTypeName(type) {
	const names = {
		dialogue: 'Dialogue',
		showCharacter: 'Show Character',
		hideCharacter: 'Hide Character',
		expression: 'Expression',
		background: 'Background',
		music: 'Music',
		sound: 'Sound FX',
		wait: 'Wait',
		choice: 'Choice'
	}
	return names[type] ?? type
}

/**
 * Generate a short summary string for a timeline node.
 * @param {object} node - The timeline node
 * @param {object} state - EditorState instance (for asset lookups)
 * @returns {string}
 */
export function getNodeSummary(node, state) {
	const d = node.data
	switch (node.type) {
		case 'dialogue': {
			const speaker = d.speaker || '(narrator)'
			const text = d.text ? (d.text.length > 40 ? d.text.slice(0, 40) + '...' : d.text) : '(empty)'
			return `${speaker}: ${text}`
		}
		case 'showCharacter':
			return `${d.name || '?'} (show)`
		case 'hideCharacter':
			return `${d.name || '?'} (hide)`
		case 'expression':
			return `${d.name || '?'} \u2192 ${d.expression || '?'}`
		case 'background': {
			const asset = d.assetId ? state.assets.find(a => a.id === d.assetId) : null
			return asset ? (asset.name || asset.id) : '(none)'
		}
		case 'music': {
			if (d.action === 'stop') return 'Stop music'
			const asset = d.assetId ? state.assets.find(a => a.id === d.assetId) : null
			return asset ? (asset.name || asset.id) : '(none)'
		}
		case 'sound': {
			const asset = d.assetId ? state.assets.find(a => a.id === d.assetId) : null
			return asset ? (asset.name || asset.id) : '(none)'
		}
		case 'wait':
			return `Wait ${d.duration ?? 0}ms`
		case 'choice':
			return `${d.choices?.length ?? 0} choice(s)`
		default:
			return node.type
	}
}
