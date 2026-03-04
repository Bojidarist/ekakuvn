# ekakuvn

A visual novel engine built with vanilla JavaScript and HTML5 Canvas. Create visual novels in a browser-based editor and play them with a standalone runtime — no build tools, no frameworks, no dependencies.

## Quick Start

Serve the `src/` directory with any HTTP server:

```bash
python3 -m http.server 8000 --directory src
```

- **Runtime (player)**: http://localhost:8000
- **Editor**: http://localhost:8000/editor/

## Architecture

ekakuvn has three parts:

1. **Script format** — A `.evn` file (gzip-compressed JSON) that describes an entire visual novel (metadata, assets, scenes, timeline).
2. **Runtime** — A standalone module that takes a script and plays the visual novel on an HTML5 Canvas.
3. **Editor** — A browser-based tool for visually authoring scenes, importing assets, writing dialogue, and exporting scripts.

```
Editor  -->  .evn script  -->  Runtime
```

## Runtime

### Embedding in your own page

```html
<div id="game"></div>
<script type="module">
  import { Ekakuvn } from './modules/ekakuvn.js'

  const game = new Ekakuvn({ mainSelector: '#game' })
  await game.loadScript(script) // plain JSON object
  await game.start()
</script>
```

### Title Screen

When a game starts, a title screen is shown before gameplay begins. The title screen displays:

- The game title (from `meta.title`, or `meta.mainMenu.title` if set)
- The author name (if set)
- **New Game** — Start the game from the beginning
- **Load Game** — Shown only if save data exists; opens the save slot menu
- **Settings** — Volume controls (Master, Music, SFX)

The title screen background uses the asset specified in `meta.mainMenu.background`. If none is set, a solid dark background is used.

When the game ends (no more scenes), the player is returned to the title screen.

### Player Controls

| Action | Input |
|---|---|
| Advance dialogue | Click, Space, or Enter |
| Skip typewriter effect | Click, Space, or Enter (while text is typing) |
| Select a choice | Click on the choice |
| Open / close in-game menu | M |
| Toggle fullscreen | F |

### In-Game Menu

Press `M` during gameplay to open the menu. The menu provides:

- **Resume** — Return to the game
- **Save Game** — Save to one of 3 slots
- **Load Game** — Load from a previously saved slot
- **Settings** — Volume controls (Master, Music, SFX)
- **Title Screen** — Auto-saves and returns to the title screen

Saving to an occupied slot prompts for confirmation before overwriting.

### Auto-Save

The runtime automatically saves progress:

- On every scene transition
- When the browser tab loses focus
- Before the page unloads

When returning to a game that has saves, the "Load Game" button appears on the title screen.

## Editor

Open `http://localhost:8000/editor/` in a browser. The editor has four panels:

### Layout

- **Left sidebar** — Scene list (top) and asset library (bottom)
- **Center** — Canvas preview of the current scene
- **Right sidebar** — Properties inspector
- **Bottom** — Timeline editor

### Workflow

1. **Import assets** — Click the `+` button in the Assets panel to import image, audio, and video files. Each asset is assigned a type (background, character, music, sound, video).

2. **Create scenes** — Click `+` in the Scenes panel to add scenes. Scenes can be organized into collapsible sections.

3. **Build the timeline** — Each scene has a timeline of nodes that execute in order. Node types include: `background`, `showCharacter`, `hideCharacter`, `expression`, `dialogue`, `choice`, `music`, `sound`, `video`, `effect`, `wait`, and `toggleDialogue`.

4. **Place characters** — Drag character assets from the library onto the canvas. Select characters on the canvas to move, scale, or flip them.

5. **Connect scenes** — Linear scenes transition to a `next` scene. Choice nodes branch to different target scenes.

6. **Preview** — Click Preview to open the runtime player in a new tab with your current project.

7. **Export** — Click Export to download the project as a `.evn` runtime file, or save the full editable project as a `.ekaku-project.evn` archive.

8. **Import** — Click Open to load an existing `.ekaku-project.evn` back into the editor.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+S | Save / Export |
| Ctrl+O | Open / Import |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Delete / Backspace | Remove selected character |

### Auto-Save

The editor auto-saves project state to localStorage. When reopening the editor, your last project is restored automatically. Assets are stored in IndexedDB.

## Dialogue Markup

Dialogue text supports inline rich text markup:

| Syntax | Effect |
|---|---|
| `*bold text*` | Bold |
| `_italic text_` | Italic |
| `{#ff0000}red text{/}` | Color (any CSS hex color) |

## Themes

The runtime appearance is fully customizable via a `theme` object in `meta`. Partial theme objects are deep-merged onto the built-in defaults, so you only need to specify the values you want to override. The theme covers the dialogue box, title screen, menus, loading screen, and settings UI.

## Browser Requirements

Modern browsers with support for:

- ES6 modules
- HTML5 Canvas
- Web Audio API
- IndexedDB
- CompressionStream / DecompressionStream
- Private class fields (`#`)
- `localStorage`
