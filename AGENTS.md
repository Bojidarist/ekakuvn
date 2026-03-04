# Agent Guidelines for ekakuvn

This document provides guidelines for AI coding agents working in the ekakuvn repository.

## Project Overview

**ekakuvn** is a vanilla JavaScript visual novel engine for the browser. It has two main parts:

- **Runtime**: Plays `.evn` scripts in a browser page using HTML5 Canvas
- **Editor**: A full visual editor for creating `.evn` projects

No build system, no transpilation, no frameworks. Code runs directly in the browser as native ES6 modules.

## Project Structure

```
ekakuvn/
├── src/
│   ├── index.html          # Runtime player entry point
│   ├── main.js             # Runtime bootstrap
│   ├── css/
│   ├── editor/             # Editor entry point + styles
│   └── modules/
│       ├── ekakuvn.js      # Public API facade
│       ├── ekakuConfig.js  # localStorage config wrapper
│       ├── runtime/        # All runtime playback modules
│       ├── editor/         # All editor UI modules
│       └── shared/         # Utilities shared by both sides
```

Read the actual source files to understand the current module layout before adding or moving code. The structure can change.

## Running the Application

No install step required. Serve `src/` with any HTTP server:

```bash
python3 -m http.server 8000 --directory src
```

- Runtime: `http://localhost:8000`
- Editor: `http://localhost:8000/editor/`

## Testing & Linting

No test framework or linter is configured. Manual browser testing is the only form of verification. When making changes:

1. Open the editor and verify the affected feature works
2. Open the runtime with a test script and verify playback

## Code Style

### Language & Modules
- Vanilla JavaScript (ES6+), no TypeScript
- Native ES6 modules — always include `.js` extension in imports
- Named exports for classes; group external imports before internal ones

### Formatting
- **Indentation**: Tabs (not spaces)
- **Quotes**: Single quotes
- **Semicolons**: Omit for new code
- **Braces**: K&R style (opening brace on the same line)
- **Blank lines**: One blank line between methods

### Naming
- Classes: `PascalCase`
- Variables and functions: `camelCase`
- Private fields and methods: `#prefix` (ES2022 private fields)
- Constants: `camelCase` (not `SCREAMING_SNAKE_CASE`)

### Class Structure Order
1. Public fields
2. Private fields (`#`)
3. Constructor
4. Public methods
5. Private methods (`#`)

### General Practices
- Use `const` by default; `let` only when reassignment is needed; never `var`
- Use ES2022 private fields (`#`) for encapsulation — not closure tricks or `_` conventions
- Support method chaining by returning `this` from mutating public methods
- Use `Object.assign` for concisely initializing DOM elements or plain objects
- Prefer empty `catch {}` with a safe fallback over logging or re-throwing when failure is expected and recoverable
- Write self-documenting code through clear naming; add comments only for non-obvious logic
- Keep modules focused on a single responsibility; avoid god objects

## Architecture Principles

- **No framework**: Do not add React, Vue, or any UI framework
- **Browser-native**: Avoid dependencies that require a build step; vendor small libs into `src/modules/shared/vendor/` if absolutely needed
- **Separation of concerns**: The runtime and editor are independent; shared utilities live in `modules/shared/`
- **Event-driven state**: UI panels subscribe to state change events rather than polling or directly coupling to each other
- **Undo safety**: Any mutation to editor state must go through the central state manager so undo snapshots are captured

## Storage Layers

There are three storage layers in use — understand which is appropriate before adding persistence:

| Layer | Used for |
|---|---|
| IndexedDB | Large binary asset blobs |
| localStorage | Project structure, config, save slots |
| In-memory Blob URLs | Asset display; stripped before saving |

## Git Conventions

### Commit Messages
- Imperative mood, capitalize first word, no trailing period
- Good: `Add transition effect to scene controller`
- Bad: `added transition`, `Add transition.`

### Commit Scope
- One logical change per commit
- Keep refactoring and feature work in separate commits

## Files to Never Commit
- `node_modules/`
- `.DS_Store`
- Editor config dirs (`.vscode/`, `.idea/`)
- Build artifacts
