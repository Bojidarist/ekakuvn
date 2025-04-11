export class EkakuvnCanvas {
	constructor(width, height) {
		this.options = {
			width: width,
			height: height
		};
	}

	create(elementSelector) {
		this.currentParentElement = document.querySelector(elementSelector);
		this.currentParentElement.innerHTML = "";
		this.currentParentElement.innerHTML = `<canvas width=${this.options.width} height=${this.options.height}></canvas>`
		this.currentElement = this.currentParentElement.querySelector("canvas");
	}

	setBackground(src) {
		let ctx = this.currentElement.getContext("2d");
		let background = new Image();
		background.src = src;
		let width = this.options.width;
		let height = this.options.height;
		background.width = this.options.width;
		background.height = this.options.height;
		background.onload = function() {
			ctx.drawImage(background, 0, 0, width, height);
		}
	}
}

