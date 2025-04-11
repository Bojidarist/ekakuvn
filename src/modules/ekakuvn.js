import { EkakuvnCanvas } from "./canvas.js";

export class Ekakuvn {
	constructor(options = {}) {
		let width = options["width"] || 1280
		let height = options["height"] || 720
		this.options = {
			width: width,
			height: height,
			canvas: options["canvas"] || new EkakuvnCanvas(width, height)
		};
	}

	create(elementSelector) {
		this.options.canvas.create(elementSelector);
	}

	setBackground(src) {
		this.options.canvas.setBackground(src);
	}
}

