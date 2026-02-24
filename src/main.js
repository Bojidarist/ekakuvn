import { Ekakuvn } from './modules/ekakuvn.js'

const game = new Ekakuvn()

// Check for a script URL passed as a query parameter (used by editor preview)
const params = new URLSearchParams(window.location.search)
const scriptUrl = params.get('script') || 'docs/example-script.json'

async function loadScript(url) {
	const res = await fetch(url)
	const buffer = await res.arrayBuffer()
	const bytes = new Uint8Array(buffer, 0, 2)
	const isGzipped = bytes[0] === 0x1f && bytes[1] === 0x8b

	let json
	if (isGzipped) {
		const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
		const reader = stream.getReader()
		const chunks = []
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			chunks.push(value)
		}
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
		const result = new Uint8Array(totalLength)
		let offset = 0
		for (const chunk of chunks) {
			result.set(chunk, offset)
			offset += chunk.length
		}
		json = new TextDecoder().decode(result)
	} else {
		json = new TextDecoder().decode(buffer)
	}

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
