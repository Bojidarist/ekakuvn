export function createContextMenu(event, items, options = {}) {
	const existing = document.querySelector('.context-menu')
	if (existing) existing.remove()

	const minWidth = options.minWidth ?? '160px'

	const menu = document.createElement('div')
	menu.className = 'context-menu'
	menu.style.cssText = `
		position: fixed;
		left: ${event.clientX}px;
		top: ${event.clientY}px;
		background: var(--bg-panel);
		border: 1px solid var(--border-color);
		border-radius: var(--radius);
		padding: 4px 0;
		z-index: 1000;
		min-width: ${minWidth};
	`

	for (const item of items) {
		if (item.separator) {
			menu.appendChild(createMenuSeparator())
			continue
		}
		if (item.element) {
			menu.appendChild(item.element)
			continue
		}
		const color = item.danger ? 'var(--danger)' : undefined
		const opt = createMenuOption(item.label, () => {
			item.action()
			menu.remove()
		}, color)
		menu.appendChild(opt)
	}

	document.body.appendChild(menu)
	autoCloseMenu(menu)
	return menu
}

export function createMenuOption(text, onClick, color) {
	const opt = document.createElement('div')
	opt.textContent = text
	opt.style.cssText = `
		padding: 6px 16px;
		cursor: pointer;
		font-size: 13px;
		color: ${color ?? 'var(--text-primary)'};
	`
	opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--bg-hover)' })
	opt.addEventListener('mouseleave', () => { opt.style.background = 'transparent' })
	if (onClick) opt.addEventListener('click', onClick)
	return opt
}

export function createMenuSeparator() {
	const sep = document.createElement('div')
	sep.style.cssText = 'height: 1px; background: var(--border-color); margin: 4px 0;'
	return sep
}

export function createMenuContainer(event, options = {}) {
	const existing = document.querySelector('.context-menu')
	if (existing) existing.remove()

	const minWidth = options.minWidth ?? '140px'

	const menu = document.createElement('div')
	menu.className = 'context-menu'
	menu.style.cssText = `
		position: fixed;
		left: ${event.clientX}px;
		top: ${event.clientY}px;
		background: var(--bg-panel);
		border: 1px solid var(--border-color);
		border-radius: var(--radius);
		padding: 4px 0;
		z-index: 1000;
		min-width: ${minWidth};
	`
	return menu
}

export function autoCloseMenu(menu) {
	const closeMenu = (e) => {
		if (!menu.contains(e.target)) {
			menu.remove()
			document.removeEventListener('click', closeMenu)
		}
	}
	setTimeout(() => document.addEventListener('click', closeMenu), 0)
}
