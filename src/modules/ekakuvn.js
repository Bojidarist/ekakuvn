import { EkakuRuntime } from './runtime/runtime.js'
import { readAsJson } from './shared/compression.js'

export { EkakuRuntime }

export class Ekakuvn {
	#runtime = null

	options = {
		mainSelector: '#ekakuvn-main',
		width: 1280,
		height: 720
	}

	constructor(options) {
		this.options = { ...this.options, ...options }
	}

	async loadScript(urlOrScript) {
		let script = urlOrScript
		if (typeof urlOrScript === 'string') {
			const res = await fetch(urlOrScript)
			const buffer = await res.arrayBuffer()
			const json = await readAsJson(buffer)
			script = JSON.parse(json)
		}
		this.#runtime = new EkakuRuntime(this.options.mainSelector, script)
		return this
	}

	async start() {
		if (!this.#runtime) throw new Error('Ekakuvn: call loadScript() before start()')
		await this.#runtime.start()
		return this
	}

	get runtime() {
		return this.#runtime
	}
}
