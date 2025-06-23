export class EkakuvnCanvas {
	constructor(selector, width, height) {
		this.options = {
			width: width,
			height: height
		}

		this.canvas = Object.assign(document.createElement('canvas'), {
			width: this.options.width,
			height: this.options.height
		})

		this.currentParentElement = document.querySelector(selector)
		this.currentParentElement.appendChild(this.canvas)
	}

	setBackground(src) {
		let ctx = this.canvas.getContext('2d')
		let background = Object.assign(new Image(), {
			width: this.options.width,
			height: this.options.height,
			src: src,
			onload: () => ctx.drawImage(background, 0, 0, this.options.width, this.options.height)
		})
	}
}
