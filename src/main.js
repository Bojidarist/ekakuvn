import { Ekakuvn } from './modules/ekakuvn.js'
import { readAsJson } from './modules/shared/compression.js'

const game = new Ekakuvn()

// Check for a script URL passed as a query parameter (used by editor preview)
const params = new URLSearchParams(window.location.search)
const scriptUrl = params.get('script') || 'docs/example-script.json'

async function loadScript(url) {
	const res = await fetch(url)
	const buffer = await res.arrayBuffer()
	const json = await readAsJson(buffer)
	return JSON.parse(json)
}

loadScript(scriptUrl)
	.then(async script => {
		await game.loadScript(script)
		await game.start()
	})
	.catch(err => {
		console.error('Failed to load script:', err)
	})
