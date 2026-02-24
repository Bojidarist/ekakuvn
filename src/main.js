import { Ekakuvn } from './modules/ekakuvn.js'

const game = new Ekakuvn()

// Check for a script URL passed as a query parameter (used by editor preview)
const params = new URLSearchParams(window.location.search)
const scriptUrl = params.get('script') || 'docs/example-script.json'

fetch(scriptUrl)
	.then(res => res.json())
	.then(async script => {
		await game.loadScript(script)
		await game.start()
	})
	.catch(err => {
		console.error('Failed to load script:', err)
	})
