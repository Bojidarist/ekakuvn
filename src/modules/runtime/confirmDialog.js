export class ConfirmDialog {
	#renderer = null
	#themeManager = null

	constructor({ renderer, themeManager }) {
		this.#renderer = renderer
		this.#themeManager = themeManager
	}

	handleClick(x, y) {
		const w = this.#renderer.width
		const h = this.#renderer.height
		const centerX = w / 2
		const cf = this.#themeManager.confirm
		const btnW = cf.buttonWidth
		const btnH = cf.buttonHeight
		const btnY = h / 2 + 20

		// Yes button
		if (x >= centerX - btnW - 10 && x <= centerX - 10 && y >= btnY && y <= btnY + btnH) {
			return 'confirm'
		}

		// No button
		if (x >= centerX + 10 && x <= centerX + btnW + 10 && y >= btnY && y <= btnY + btnH) {
			return 'cancel'
		}

		return null
	}

	draw(renderer) {
		const w = renderer.width
		const h = renderer.height
		const centerX = w / 2
		const cf = this.#themeManager.confirm
		const tm = this.#themeManager

		renderer.drawRect(centerX - cf.width / 2, h / 2 - cf.height / 2 + 10, cf.width, cf.height, {
			fill: cf.bgColor,
			stroke: cf.strokeColor,
			radius: cf.radius
		})

		renderer.drawText('Overwrite existing save?', centerX, h / 2 - 30, {
			font: tm.font(cf.textFont, cf.textSize),
			color: tm.color(cf.textColor, 'primary'),
			align: 'center'
		})

		const btnW = cf.buttonWidth
		const btnH = cf.buttonHeight
		const btnY = h / 2 + 20

		// Yes
		renderer.drawRect(centerX - btnW - 10, btnY, btnW, btnH, {
			fill: cf.confirmFill,
			stroke: cf.confirmStroke,
			radius: cf.buttonRadius
		})
		renderer.drawText('Yes, overwrite', centerX - btnW / 2 - 10, btnY + 14, {
			font: tm.font(cf.buttonFont, cf.buttonSize),
			color: tm.color(null, 'primary'),
			align: 'center'
		})

		// No
		renderer.drawRect(centerX + 10, btnY, btnW, btnH, {
			fill: cf.cancelFill,
			stroke: cf.cancelStroke,
			radius: cf.buttonRadius
		})
		renderer.drawText('Cancel', centerX + btnW / 2 + 10, btnY + 14, {
			font: tm.font(cf.buttonFont, cf.buttonSize),
			color: tm.color(null, 'primary'),
			align: 'center'
		})
	}
}
