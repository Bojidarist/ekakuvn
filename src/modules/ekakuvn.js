import { EkakuRuntime } from './runtime/runtime.js'

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

	async loadScript(script) {
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
