/**
 * Custom modal system replacing browser alert/prompt/confirm dialogs.
 * Matches the editor's dark theme using CSS variables.
 *
 * Usage:
 *   import { EditorModal } from './editorModal.js'
 *
 *   await EditorModal.alert('Something happened.')
 *   const ok = await EditorModal.confirm('Are you sure?')
 *   const name = await EditorModal.prompt('Enter name:', 'default')
 */
export class EditorModal {
	/**
	 * Show an alert dialog with a message and OK button.
	 * @param {string} message
	 * @returns {Promise<void>}
	 */
	static alert(message) {
		return new Promise((resolve) => {
			const { overlay, modal } = EditorModal.#createBase()

			const body = document.createElement('div')
			body.className = 'editor-modal-body'
			body.textContent = message
			modal.appendChild(body)

			const footer = document.createElement('div')
			footer.className = 'editor-modal-footer'

			const okBtn = document.createElement('button')
			okBtn.className = 'editor-modal-btn editor-modal-btn-primary'
			okBtn.textContent = 'OK'
			footer.appendChild(okBtn)
			modal.appendChild(footer)

			const close = () => {
				document.removeEventListener('keydown', onKey)
				overlay.remove()
				resolve()
			}

			const onKey = (e) => {
				if (e.key === 'Enter' || e.key === 'Escape') {
					e.preventDefault()
					e.stopPropagation()
					close()
				}
			}

			okBtn.addEventListener('click', close)
			overlay.addEventListener('click', (e) => {
				if (e.target === overlay) close()
			})
			document.addEventListener('keydown', onKey, true)

			document.body.appendChild(overlay)
			okBtn.focus()
		})
	}

	/**
	 * Show a confirm dialog with a message, OK and Cancel buttons.
	 * @param {string} message
	 * @returns {Promise<boolean>}
	 */
	static confirm(message) {
		return new Promise((resolve) => {
			const { overlay, modal } = EditorModal.#createBase()

			const body = document.createElement('div')
			body.className = 'editor-modal-body'
			body.textContent = message
			modal.appendChild(body)

			const footer = document.createElement('div')
			footer.className = 'editor-modal-footer'

			const cancelBtn = document.createElement('button')
			cancelBtn.className = 'editor-modal-btn'
			cancelBtn.textContent = 'Cancel'
			footer.appendChild(cancelBtn)

			const okBtn = document.createElement('button')
			okBtn.className = 'editor-modal-btn editor-modal-btn-primary'
			okBtn.textContent = 'OK'
			footer.appendChild(okBtn)
			modal.appendChild(footer)

			const close = (result) => {
				document.removeEventListener('keydown', onKey)
				overlay.remove()
				resolve(result)
			}

			const onKey = (e) => {
				if (e.key === 'Enter') {
					e.preventDefault()
					e.stopPropagation()
					close(true)
				} else if (e.key === 'Escape') {
					e.preventDefault()
					e.stopPropagation()
					close(false)
				}
			}

			okBtn.addEventListener('click', () => close(true))
			cancelBtn.addEventListener('click', () => close(false))
			overlay.addEventListener('click', (e) => {
				if (e.target === overlay) close(false)
			})
			document.addEventListener('keydown', onKey, true)

			document.body.appendChild(overlay)
			okBtn.focus()
		})
	}

	/**
	 * Show a prompt dialog with a message, input field, OK and Cancel buttons.
	 * @param {string} message
	 * @param {string} [defaultValue='']
	 * @returns {Promise<string|null>} The entered value, or null if cancelled.
	 */
	static prompt(message, defaultValue = '') {
		return new Promise((resolve) => {
			const { overlay, modal } = EditorModal.#createBase()

			const body = document.createElement('div')
			body.className = 'editor-modal-body'

			const label = document.createElement('div')
			label.className = 'editor-modal-label'
			label.textContent = message
			body.appendChild(label)

			const input = document.createElement('input')
			input.type = 'text'
			input.className = 'editor-modal-input'
			input.value = defaultValue
			body.appendChild(input)

			modal.appendChild(body)

			const footer = document.createElement('div')
			footer.className = 'editor-modal-footer'

			const cancelBtn = document.createElement('button')
			cancelBtn.className = 'editor-modal-btn'
			cancelBtn.textContent = 'Cancel'
			footer.appendChild(cancelBtn)

			const okBtn = document.createElement('button')
			okBtn.className = 'editor-modal-btn editor-modal-btn-primary'
			okBtn.textContent = 'OK'
			footer.appendChild(okBtn)
			modal.appendChild(footer)

			const close = (result) => {
				document.removeEventListener('keydown', onKey)
				overlay.remove()
				resolve(result)
			}

			const onKey = (e) => {
				if (e.key === 'Enter') {
					e.preventDefault()
					e.stopPropagation()
					close(input.value)
				} else if (e.key === 'Escape') {
					e.preventDefault()
					e.stopPropagation()
					close(null)
				}
			}

			okBtn.addEventListener('click', () => close(input.value))
			cancelBtn.addEventListener('click', () => close(null))
			overlay.addEventListener('click', (e) => {
				if (e.target === overlay) close(null)
			})
			document.addEventListener('keydown', onKey, true)

			document.body.appendChild(overlay)
			input.focus()
			input.select()
		})
	}

	// --- Private ---

	static #createBase() {
		const overlay = document.createElement('div')
		overlay.className = 'editor-modal-overlay'

		const modal = document.createElement('div')
		modal.className = 'editor-modal'
		overlay.appendChild(modal)

		return { overlay, modal }
	}
}
