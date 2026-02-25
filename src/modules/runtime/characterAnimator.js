/**
 * CharacterAnimator handles enter/exit animations for characters within scenes.
 * It works by providing animated override values that the character renderer uses
 * instead of the static scene data during animations.
 */
export class CharacterAnimator {
	#animations = new Map() // assetId -> { type, progress, duration, ... }

	// Easing: smooth ease-out for entrances, ease-in for exits
	static #easeOut(t) {
		return 1 - Math.pow(1 - t, 3)
	}

	static #easeIn(t) {
		return t * t * t
	}

	/**
	 * Queue enter animations for characters in a scene.
	 * @param {Array} characters - Array of character data from the scene
	 * @param {object} options - Default animation config if character lacks its own
	 */
	animateEnter(characters, options = {}) {
		this.#animations.clear()

		for (const char of characters) {
			const anim = char.enterAnimation ?? options.defaultEnter ?? null
			if (!anim || anim.type === 'none') continue

			this.#animations.set(char.assetId + ':' + (char.id ?? ''), {
				type: anim.type,
				duration: anim.duration ?? 0.4,
				delay: anim.delay ?? 0,
				progress: 0,
				elapsed: 0,
				entering: true,
				// Store the target (final) position for sliding calculations
				targetX: char.position.x,
				targetY: char.position.y,
				targetAlpha: 1
			})
		}
	}

	/**
	 * Update all active animations.
	 * @param {number} dt - Delta time in seconds
	 */
	update(dt) {
		if (this.#animations.size === 0) return

		for (const [key, anim] of this.#animations) {
			anim.elapsed += dt

			// Handle delay
			if (anim.elapsed < anim.delay) continue

			const activeTime = anim.elapsed - anim.delay
			anim.progress = Math.min(1, activeTime / anim.duration)

			if (anim.progress >= 1) {
				this.#animations.delete(key)
			}
		}
	}

	/**
	 * Get the animated transform for a character.
	 * Returns null if no animation is active for this character.
	 * @param {object} charData - Character data from scene
	 * @returns {{ offsetX: number, offsetY: number, alpha: number } | null}
	 */
	getTransform(charData) {
		const key = charData.assetId + ':' + (charData.id ?? '')
		const anim = this.#animations.get(key)
		if (!anim) return null

		const eased = anim.entering
			? CharacterAnimator.#easeOut(anim.progress)
			: CharacterAnimator.#easeIn(anim.progress)

		switch (anim.type) {
			case 'fadeIn':
				return { offsetX: 0, offsetY: 0, alpha: eased }

			case 'slideLeft':
				// Slide in from the left side of the screen
				return { offsetX: -(1 - eased) * 0.5, offsetY: 0, alpha: 1 }

			case 'slideRight':
				// Slide in from the right side of the screen
				return { offsetX: (1 - eased) * 0.5, offsetY: 0, alpha: 1 }

			case 'slideUp':
				// Slide in from below
				return { offsetX: 0, offsetY: (1 - eased) * 0.3, alpha: 1 }

			case 'slideDown':
				// Slide in from above
				return { offsetX: 0, offsetY: -(1 - eased) * 0.3, alpha: 1 }

			case 'slideLeftFade':
				return { offsetX: -(1 - eased) * 0.5, offsetY: 0, alpha: eased }

			case 'slideRightFade':
				return { offsetX: (1 - eased) * 0.5, offsetY: 0, alpha: eased }

			default:
				return null
		}
	}

	/**
	 * Check if any animations are currently playing.
	 */
	get isAnimating() {
		return this.#animations.size > 0
	}

	/**
	 * Immediately complete all active animations.
	 */
	skipAll() {
		this.#animations.clear()
	}
}
