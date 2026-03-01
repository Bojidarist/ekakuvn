import { getCanvasPosition } from '../shared/canvasUtils.js'

export class SettingsScreen {
	#renderer = null
	#themeManager = null
	#audioEngine = null
	#draggingSlider = null

	constructor({ renderer, themeManager, audioEngine }) {
		this.#renderer = renderer
		this.#themeManager = themeManager
		this.#audioEngine = audioEngine
	}

	handleClick(x, y) {
		const st = this.#themeManager.settings
		const { sliderX, sliderW, startY, spacing } = this.#getSliderLayout()
		const volumes = this.#getVolumeEntries()

		for (let i = 0; i < volumes.length; i++) {
			const sy = startY + i * spacing
			if (y >= sy && y <= sy + 30 && x >= sliderX && x <= sliderX + sliderW) {
				const val = Math.max(0, Math.min(1, (x - sliderX) / sliderW))
				volumes[i].set(val)
				return null
			}
		}

		// Back button
		const backY = startY + volumes.length * spacing + 30
		const backW = st.backWidth
		const backH = st.backHeight
		const centerX = this.#renderer.width / 2
		const bx = centerX - backW / 2
		if (x >= bx && x <= bx + backW && y >= backY && y <= backY + backH) {
			return 'back'
		}

		return null
	}

	onMousedown(event) {
		const pos = getCanvasPosition(event, this.#renderer.canvas, this.#renderer.width, this.#renderer.height)
		const { sliderX, sliderW, startY, spacing } = this.#getSliderLayout()
		const volumes = this.#getVolumeEntries()

		for (let i = 0; i < volumes.length; i++) {
			const sy = startY + i * spacing
			if (pos.y >= sy - 4 && pos.y <= sy + 30 + 4 && pos.x >= sliderX - 10 && pos.x <= sliderX + sliderW + 10) {
				const val = Math.max(0, Math.min(1, (pos.x - sliderX) / sliderW))
				volumes[i].set(val)
				this.#draggingSlider = { index: i, set: volumes[i].set }
				return
			}
		}
	}

	onMousemove(event) {
		if (!this.#draggingSlider) return

		const pos = getCanvasPosition(event, this.#renderer.canvas, this.#renderer.width, this.#renderer.height)
		const { sliderX, sliderW } = this.#getSliderLayout()
		const val = Math.max(0, Math.min(1, (pos.x - sliderX) / sliderW))
		this.#draggingSlider.set(val)
	}

	onMouseup() {
		this.#draggingSlider = null
	}

	clearDrag() {
		this.#draggingSlider = null
	}

	draw(renderer) {
		const w = renderer.width
		const centerX = w / 2
		const st = this.#themeManager.settings
		const tm = this.#themeManager

		renderer.drawText('Settings', centerX, 160, {
			font: tm.font(st.headerFont, st.headerSize, true),
			color: tm.color(st.headerColor, 'primary'),
			align: 'center'
		})

		const sliderW = st.sliderWidth
		const sliderH = st.sliderHeight
		const sliderX = centerX - sliderW / 2
		const startY = 240
		const spacing = 70

		const volumes = [
			{ label: 'Master Volume', value: this.#audioEngine.volumes.master },
			{ label: 'Music Volume', value: this.#audioEngine.volumes.music },
			{ label: 'SFX Volume', value: this.#audioEngine.volumes.sfx }
		]

		for (let i = 0; i < volumes.length; i++) {
			const sy = startY + i * spacing

			// Label
			renderer.drawText(volumes[i].label, sliderX, sy - 20, {
				font: tm.font(st.labelFont, st.labelSize),
				color: st.labelColor
			})

			// Percentage
			renderer.drawText(Math.round(volumes[i].value * 100) + '%', sliderX + sliderW, sy - 20, {
				font: tm.font(null, st.labelSize),
				color: tm.color(st.valueColor, 'accent'),
				align: 'right'
			})

			// Track background
			renderer.drawRect(sliderX, sy, sliderW, sliderH, {
				fill: st.sliderTrackColor,
				radius: st.sliderRadius
			})

			// Track fill
			renderer.drawRect(sliderX, sy, sliderW * volumes[i].value, sliderH, {
				fill: tm.color(st.sliderFillColor, 'accent'),
				radius: st.sliderRadius
			})

			// Handle
			const handleX = sliderX + sliderW * volumes[i].value
			renderer.drawRect(handleX - st.sliderHandleWidth / 2, sy - 4, st.sliderHandleWidth, sliderH + 8, {
				fill: tm.color(st.sliderHandleColor, 'primary'),
				radius: st.sliderHandleRadius
			})
		}

		// Back button
		const backY = startY + volumes.length * spacing + 30
		const backW = st.backWidth
		renderer.drawRect(centerX - backW / 2, backY, backW, st.backHeight, {
			fill: this.#themeManager.menu.buttonFill,
			stroke: this.#themeManager.menu.buttonStroke,
			radius: this.#themeManager.menu.buttonRadius
		})
		renderer.drawText('Back', centerX, backY + 14, {
			font: tm.font(st.backFont, st.backSize),
			color: tm.color(null, 'primary'),
			align: 'center'
		})
	}

	#getVolumeEntries() {
		return [
			{ label: 'Master', get: () => this.#audioEngine.volumes.master, set: (v) => this.#audioEngine.setMasterVolume(v) },
			{ label: 'Music', get: () => this.#audioEngine.volumes.music, set: (v) => this.#audioEngine.setMusicVolume(v) },
			{ label: 'SFX', get: () => this.#audioEngine.volumes.sfx, set: (v) => this.#audioEngine.setSfxVolume(v) }
		]
	}

	#getSliderLayout() {
		const st = this.#themeManager.settings
		const sliderW = st.sliderWidth
		const sliderX = this.#renderer.width / 2 - sliderW / 2
		return { sliderX, sliderW, startY: 240, spacing: 70 }
	}
}
