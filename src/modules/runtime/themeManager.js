/**
 * ThemeManager - Manages custom UI themes for the Runtime.
 *
 * The theme object controls all visual aspects of the runtime UI:
 * dialogue box, title screen, menus, loading screen, and global colors/fonts.
 *
 * Users provide a partial theme in `script.meta.theme` and ThemeManager
 * deep-merges it with the default theme, so only overridden values change.
 */
export class ThemeManager {
	#theme = null

	/**
	 * The complete default theme. Every visual property used in the runtime
	 * is declared here. Partial user themes are merged on top of this.
	 */
	static defaultTheme = {
		// --- Global palette ---
		colors: {
			primary: '#ffffff',
			accent: '#ffcc00',
			background: '#1a1a2e',
			overlay: 'rgba(0, 0, 0, 0.7)',
			dimOverlay: 'rgba(0, 0, 0, 0.4)',
			textSecondary: 'rgba(255, 255, 255, 0.6)',
			textMuted: 'rgba(255, 255, 255, 0.3)',
			textDisabled: 'rgba(255, 255, 255, 0.4)',
			textHint: 'rgba(255, 255, 255, 0.5)'
		},

		// --- Font family (applied to all fonts unless individually overridden) ---
		fontFamily: 'sans-serif',

		// --- Dialogue box ---
		dialogue: {
			boxHeight: 180,
			boxMargin: 20,
			boxPadding: 20,
			boxColor: 'rgba(0, 0, 0, 0.75)',
			boxRadius: 12,
			speakerFont: null,    // auto-built from fontFamily if null
			speakerColor: null,   // defaults to colors.accent
			speakerSize: 22,
			textFont: null,       // auto-built from fontFamily if null
			textColor: null,      // defaults to colors.primary
			textSize: 20,
			textLineHeight: 28,
			choiceFont: null,     // auto-built from fontFamily if null
			choiceColor: null,    // defaults to colors.primary
			choiceHoverColor: null, // defaults to colors.accent
			choiceSize: 20,
			choiceBgColor: 'rgba(255, 255, 255, 0.1)',
			choiceHoverBgColor: 'rgba(255, 204, 0, 0.2)',
			choiceStrokeColor: 'rgba(255, 255, 255, 0.3)',
			choiceRadius: 8,
			choicePadding: 12,
			choiceSpacing: 8,
			choiceWidth: 400,
			choiceHeight: 44,
			advanceIndicator: true,
			typewriterSpeed: 30
		},

		// --- Title screen ---
		titleScreen: {
			titleSize: 48,
			titleFont: null,        // auto-built from fontFamily if null
			titleColor: null,       // defaults to colors.primary
			titleShadow: { color: 'rgba(0, 0, 0, 0.6)', blur: 8, offsetX: 0, offsetY: 3 },
			subtitleSize: 20,
			subtitleFont: null,
			subtitleColor: null,    // defaults to colors.textSecondary
			buttonWidth: 280,
			buttonHeight: 50,
			buttonSpacing: 16,
			buttonRadius: 10,
			buttonFont: null,       // auto-built from fontFamily if null
			buttonSize: 22,
			buttonColor: null,      // defaults to colors.primary
			buttonHoverColor: null, // defaults to colors.accent
			buttonFill: 'rgba(255, 255, 255, 0.07)',
			buttonHoverFill: 'rgba(255, 255, 255, 0.15)',
			buttonStroke: 'rgba(255, 255, 255, 0.2)',
			buttonHoverStroke: 'rgba(255, 204, 0, 0.6)',
			versionColor: null     // defaults to colors.textMuted
		},

		// --- In-game menu ---
		menu: {
			titleSize: 36,
			titleFont: null,
			titleColor: null,       // defaults to colors.primary
			buttonWidth: 240,
			buttonHeight: 44,
			buttonSpacing: 56,
			buttonRadius: 8,
			buttonFont: null,
			buttonSize: 20,
			buttonColor: null,      // defaults to colors.primary
			buttonFill: 'rgba(255, 255, 255, 0.1)',
			buttonStroke: 'rgba(255, 255, 255, 0.3)',
			hintColor: null         // defaults to colors.textHint
		},

		// --- Save/Load menu ---
		saves: {
			headerSize: 30,
			headerFont: null,
			headerColor: null,      // defaults to colors.primary
			slotWidth: 360,
			slotHeight: 50,
			slotSpacing: 60,
			slotRadius: 8,
			slotFont: null,
			slotSize: 18,
			slotDateSize: 13,
			slotFill: 'rgba(255, 255, 255, 0.08)',
			slotStroke: 'rgba(255, 255, 255, 0.2)',
			slotOccupiedFill: 'rgba(100, 200, 100, 0.15)',
			slotOccupiedStroke: 'rgba(100, 200, 100, 0.4)',
			slotEmptyColor: null,   // defaults to colors.textDisabled
			backWidth: 120,
			backHeight: 44,
			backFont: null,
			backSize: 18
		},

		// --- Settings menu ---
		settings: {
			headerSize: 30,
			headerFont: null,
			headerColor: null,      // defaults to colors.primary
			labelFont: null,
			labelSize: 16,
			labelColor: 'rgba(255, 255, 255, 0.7)',
			valueColor: null,       // defaults to colors.accent
			sliderWidth: 300,
			sliderHeight: 8,
			sliderRadius: 4,
			sliderTrackColor: 'rgba(255, 255, 255, 0.15)',
			sliderFillColor: null,  // defaults to colors.accent
			sliderHandleColor: null, // defaults to colors.primary
			sliderHandleWidth: 12,
			sliderHandleRadius: 6,
			backWidth: 120,
			backHeight: 44,
			backFont: null,
			backSize: 18
		},

		// --- Confirm dialog ---
		confirm: {
			width: 400,
			height: 140,
			radius: 12,
			bgColor: 'rgba(30, 30, 50, 0.95)',
			strokeColor: 'rgba(255, 200, 0, 0.5)',
			textFont: null,
			textSize: 20,
			textColor: null,       // defaults to colors.primary
			buttonWidth: 140,
			buttonHeight: 44,
			buttonRadius: 8,
			buttonFont: null,
			buttonSize: 16,
			confirmFill: 'rgba(200, 80, 80, 0.3)',
			confirmStroke: 'rgba(200, 80, 80, 0.6)',
			cancelFill: 'rgba(255, 255, 255, 0.1)',
			cancelStroke: 'rgba(255, 255, 255, 0.3)'
		},

		// --- Loading screen ---
		loading: {
			titleSize: 32,
			titleFont: null,
			titleColor: null,       // defaults to colors.primary
			barWidth: 300,
			barHeight: 12,
			barRadius: 6,
			barTrackColor: 'rgba(255, 255, 255, 0.1)',
			barFillColor: null,     // defaults to colors.accent
			progressFont: null,
			progressSize: 16,
			progressColor: null     // defaults to colors.textSecondary
		}
	}

	constructor(themeOverrides = null) {
		this.#theme = ThemeManager.deepMerge(
			structuredClone(ThemeManager.defaultTheme),
			themeOverrides ?? {}
		)
	}

	/**
	 * Get the full resolved theme object.
	 */
	get theme() {
		return this.#theme
	}

	/**
	 * Shorthand accessors for major sections.
	 */
	get colors() { return this.#theme.colors }
	get fontFamily() { return this.#theme.fontFamily }
	get dialogue() { return this.#theme.dialogue }
	get titleScreen() { return this.#theme.titleScreen }
	get menu() { return this.#theme.menu }
	get saves() { return this.#theme.saves }
	get settings() { return this.#theme.settings }
	get confirm() { return this.#theme.confirm }
	get loading() { return this.#theme.loading }

	/**
	 * Build a CSS font string, falling back to the global fontFamily.
	 * @param {string|null} fontOverride - Explicit font string (e.g. 'bold 22px Georgia'). If set, used as-is.
	 * @param {number} size - Font size in pixels.
	 * @param {boolean} bold - Whether to prepend 'bold'.
	 * @returns {string}
	 */
	font(fontOverride, size, bold = false) {
		if (fontOverride) return fontOverride
		const weight = bold ? 'bold ' : ''
		return `${weight}${size}px ${this.#theme.fontFamily}`
	}

	/**
	 * Resolve a color value, falling back to a default from the palette.
	 * @param {string|null} value - The theme value (may be null).
	 * @param {string} fallbackKey - Key in colors, e.g. 'accent' or 'primary'.
	 * @returns {string}
	 */
	color(value, fallbackKey) {
		return value ?? this.#theme.colors[fallbackKey] ?? '#ffffff'
	}

	/**
	 * Deep merge source into target. Only merges plain objects; arrays and
	 * primitives from source replace target values.
	 */
	static deepMerge(target, source) {
		if (!source || typeof source !== 'object') return target
		if (!target || typeof target !== 'object') return source

		for (const key of Object.keys(source)) {
			const srcVal = source[key]
			const tgtVal = target[key]

			if (
				srcVal !== null &&
				typeof srcVal === 'object' &&
				!Array.isArray(srcVal) &&
				tgtVal !== null &&
				typeof tgtVal === 'object' &&
				!Array.isArray(tgtVal)
			) {
				target[key] = ThemeManager.deepMerge(tgtVal, srcVal)
			} else {
				target[key] = srcVal
			}
		}

		return target
	}
}
