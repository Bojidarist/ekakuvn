import { EkakuvnCanvas } from './canvas.js'

export class Ekakuvn {
	options = {
		mainSelector: '#ekakuvn-main',
		width: 1280,
		height: 720
	}

	constructor(options) {
		this.options = { ...this.options, ...options }
		this.canvas = new EkakuvnCanvas(this.options.mainSelector, this.options.width, this.options.height)
	}

	setBackground(src) {
		this.canvas.setBackground(src)
		return this
	}
}
