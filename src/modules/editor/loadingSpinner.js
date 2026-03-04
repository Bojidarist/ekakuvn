/**
 * Loading spinner overlay for the editor.
 *
 * Shows a full-screen spinner with an optional message while async operations
 * (save, export, asset import) are running.  Supports nesting — the overlay
 * stays visible until all callers have called hide().
 *
 * Usage:
 *   import { spinner } from './loadingSpinner.js'
 *   spinner.show('Saving…')
 *   try { await someAsyncOperation() } finally { spinner.hide() }
 */

class LoadingSpinner {
	#el = null
	#msgEl = null
	#depth = 0

	constructor() {
		this.#el = document.createElement('div')
		this.#el.id = 'loading-spinner-overlay'
		this.#el.setAttribute('aria-busy', 'true')
		this.#el.setAttribute('role', 'status')
		this.#el.innerHTML = `
			<div class="loading-spinner-box">
				<div class="loading-spinner-ring"></div>
				<div class="loading-spinner-msg"></div>
			</div>
		`
		this.#msgEl = this.#el.querySelector('.loading-spinner-msg')
		// Hidden by default; inserted lazily on first show
	}

	/**
	 * Show the spinner overlay.  If already visible, increments the depth
	 * counter (nesting support) and updates the message if provided.
	 * @param {string} [message] - Optional label shown below the spinner ring
	 */
	show(message = '') {
		this.#depth++
		if (this.#msgEl) {
			this.#msgEl.textContent = message
		}
		if (!this.#el.isConnected) {
			document.body.appendChild(this.#el)
		}
		this.#el.classList.remove('loading-spinner-hidden')
	}

	/**
	 * Hide the spinner overlay.  With nested show() calls the overlay stays
	 * visible until the depth counter reaches zero.
	 */
	hide() {
		this.#depth = Math.max(0, this.#depth - 1)
		if (this.#depth === 0) {
			this.#el.classList.add('loading-spinner-hidden')
		}
	}

	/**
	 * Run an async function wrapped in show/hide.
	 * The spinner is always hidden even if the function throws.
	 * @template T
	 * @param {string} message
	 * @param {() => Promise<T>} fn
	 * @returns {Promise<T>}
	 */
	async wrap(message, fn) {
		this.show(message)
		try {
			return await fn()
		} finally {
			this.hide()
		}
	}
}

export const spinner = new LoadingSpinner()
