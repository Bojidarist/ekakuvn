import { formatTime } from './utils.js'

export function createAudioPlayer(asset, options = {}) {
	const className = options.className ?? 'audio-player'

	const container = document.createElement('div')
	container.className = className

	const audio = new Audio(asset.dataUrl ?? asset.path)

	const playBtn = document.createElement('button')
	playBtn.textContent = '\u25B6'
	playBtn.title = 'Play'
	playBtn.addEventListener('click', () => {
		if (audio.paused) {
			audio.play()
			playBtn.textContent = '\u275A\u275A'
			playBtn.title = 'Pause'
		} else {
			audio.pause()
			playBtn.textContent = '\u25B6'
			playBtn.title = 'Play'
		}
	})

	const seekBar = document.createElement('input')
	seekBar.type = 'range'
	seekBar.min = '0'
	seekBar.max = '100'
	seekBar.value = '0'
	seekBar.step = '0.1'
	seekBar.addEventListener('input', () => {
		if (audio.duration) {
			audio.currentTime = (parseFloat(seekBar.value) / 100) * audio.duration
		}
	})

	const timeLabel = document.createElement('span')
	timeLabel.className = 'audio-time'
	timeLabel.textContent = '0:00 / 0:00'

	audio.addEventListener('timeupdate', () => {
		if (audio.duration) {
			seekBar.value = String((audio.currentTime / audio.duration) * 100)
			timeLabel.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`
		}
	})

	audio.addEventListener('ended', () => {
		playBtn.textContent = '\u25B6'
		playBtn.title = 'Play'
		seekBar.value = '0'
	})

	audio.addEventListener('loadedmetadata', () => {
		timeLabel.textContent = `0:00 / ${formatTime(audio.duration)}`
	})

	container.appendChild(playBtn)
	container.appendChild(seekBar)
	container.appendChild(timeLabel)

	return { container, audio }
}
