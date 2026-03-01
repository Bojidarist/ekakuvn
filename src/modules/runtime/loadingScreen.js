export class LoadingScreen {
	#renderer = null
	#themeManager = null
	#script = null

	constructor({ renderer, themeManager, script }) {
		this.#renderer = renderer
		this.#themeManager = themeManager
		this.#script = script
	}

	draw(progress) {
		const w = this.#renderer.width
		const h = this.#renderer.height
		const ld = this.#themeManager.loading
		const tm = this.#themeManager

		this.#renderer.clear()
		this.#renderer.drawRect(0, 0, w, h, { fill: tm.colors.background })

		// Title
		this.#renderer.drawText(this.#script.meta?.title ?? 'Loading...', w / 2, h / 2 - 60, {
			font: tm.font(ld.titleFont, ld.titleSize, true),
			color: tm.color(ld.titleColor, 'primary'),
			align: 'center'
		})

		// Progress bar background
		const barW = ld.barWidth
		const barH = ld.barHeight
		const barX = (w - barW) / 2
		const barY = h / 2

		this.#renderer.drawRect(barX, barY, barW, barH, {
			fill: ld.barTrackColor,
			radius: ld.barRadius
		})

		// Progress bar fill
		this.#renderer.drawRect(barX, barY, barW * progress.progress, barH, {
			fill: tm.color(ld.barFillColor, 'accent'),
			radius: ld.barRadius
		})

		// Progress text
		this.#renderer.drawText(`${progress.loaded} / ${progress.total}`, w / 2, barY + 30, {
			font: tm.font(ld.progressFont, ld.progressSize),
			color: tm.color(ld.progressColor, 'textSecondary'),
			align: 'center'
		})
	}
}
