# Agent Guidelines for ekakuvn

This document provides guidelines for AI coding agents working in the ekakuvn repository.

## Project Overview

**ekakuvn** is a JavaScript-based visual novel/game engine that runs in the browser. It uses vanilla JavaScript with ES6+ modules and HTML5 Canvas for rendering.

## Project Structure

```
ekakuvn/
├── src/
│   ├── index.html          # Main HTML entry point
│   ├── main.js             # Application entry point
│   └── modules/
│       ├── ekakuvn.js      # Main game engine class
│       ├── canvas.js       # Canvas rendering logic
│       └── ekakuConfig.js  # Configuration management (localStorage)
```

## Build, Lint, and Test Commands

This project currently has **no build system** - it uses native ES6 modules loaded directly in the browser.

### Running the Application
- Open `src/index.html` in a browser, or
- Use a local development server:
  ```bash
  python3 -m http.server 8000 --directory src
  # Then navigate to http://localhost:8000
  ```

### Testing
- **No test framework is currently configured**
- To add tests, consider using Vitest or Jest
- Manual testing is done by opening index.html in a browser

### Linting
- **No linter is currently configured**
- To add linting, consider ESLint with standard or airbnb config

## Code Style Guidelines

### Language & Modules
- **Language**: Vanilla JavaScript (ES6+)
- **Module System**: ES6 modules (`import`/`export`)
- **Target**: Modern browsers with native ES6 module support
- **No TypeScript**: This is a pure JavaScript project

### Import Conventions
```javascript
// Always include .js extension in imports
import { Ekakuvn } from './modules/ekakuvn.js'
import { EkakuvnCanvas } from './canvas.js'

// Use named exports for classes
export class Ekakuvn { }

// Group imports: external libraries first, then internal modules
```

### Formatting
- **Indentation**: Tabs (not spaces) - this is critical
- **Line endings**: LF (Unix style)
- **Quotes**: Single quotes for strings
- **Semicolons**: Optional but used inconsistently - prefer omitting them for new code
- **Braces**: K&R style (opening brace on same line)
- **Blank lines**: Single blank line between methods

### Naming Conventions
```javascript
// Classes: PascalCase
class Ekakuvn { }
class EkakuvnCanvas { }
class EkakuConfig { }

// Variables/functions: camelCase
const mainSelector = '#ekakuvn-main'
function setBackground(src) { }

// Private fields: # prefix (ES2022 private fields)
#config = {}
#load() { }
#save() { }

// Constants: camelCase (not SCREAMING_SNAKE_CASE)
const storageKey = 'ekakuConfig'
```

### Class Structure
```javascript
export class Example {
	// 1. Public fields first
	options = {
		width: 1280,
		height: 720
	}

	// 2. Private fields (with # prefix)
	#config = {}

	// 3. Constructor
	constructor(options) {
		this.options = { ...this.options, ...options }
	}

	// 4. Public methods
	publicMethod() { }

	// 5. Private methods (with # prefix)
	#privateMethod() { }
}
```

### Object Creation Patterns
```javascript
// Prefer Object.assign for creating and assigning properties
const canvas = Object.assign(document.createElement('canvas'), {
	width: this.options.width,
	height: this.options.height
})

const background = Object.assign(new Image(), {
	width: this.options.width,
	height: this.options.height,
	src: src,
	onload: () => ctx.drawImage(background, 0, 0, width, height)
})
```

### Variable Declarations
- Use `const` by default
- Use `let` when reassignment is needed
- Never use `var`

### Error Handling
```javascript
// Use try-catch for operations that may fail
try {
	this.#config = JSON.parse(localStorage.getItem(this.storageKey)) || {}
} catch {
	// Empty catch with fallback (no error parameter needed if unused)
	this.#config = {}
}
```

### Method Chaining
```javascript
// Support method chaining by returning `this`
setBackground(src) {
	this.canvas.setBackground(src)
	return this
}
```

### Comments
- Minimal comments in existing code
- Code should be self-documenting through clear naming
- Add comments only when logic is non-obvious

## Git Conventions

### Commit Messages
```
# Style: Imperative mood, capitalize first word, no period
Format config code
Remove commented return in config code
Create EkakuConfig class

# NOT:
# - "Formatted config code" (past tense)
# - "format config code" (lowercase)
# - "Format config code." (period at end)
```

### Commit Scope
- Keep commits focused on single changes
- Refactoring and feature work should be separate commits

## Important Architectural Notes

1. **Canvas Management**: The EkakuvnCanvas class handles all canvas rendering and DOM manipulation
2. **Configuration**: EkakuConfig uses localStorage for persistent configuration storage
3. **No Framework**: This is intentionally a vanilla JS project - do not add React, Vue, etc.
4. **Browser-Native**: Code runs directly in the browser without transpilation
5. **Private Fields**: Use modern JavaScript private fields (`#`) for encapsulation

## When Adding New Features

1. Create new modules in `src/modules/` if needed
2. Follow the existing class-based architecture
3. Use ES6 private fields (`#`) for internal state
4. Support method chaining where appropriate
5. Keep the API simple and intuitive
6. Manually test in a browser before committing

## Files to Never Commit
- `node_modules/` (if added)
- `.DS_Store`
- Editor-specific files (`.vscode/`, `.idea/`)
- Build artifacts (if build system is added later)
