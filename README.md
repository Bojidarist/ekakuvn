# ekakuvn

A visual novel engine built with vanilla JavaScript and HTML5 Canvas. Create visual novels in a browser-based editor and play them with a standalone runtime -- no build tools, no frameworks, no dependencies.

## Quick Start

Serve the `src/` directory with any HTTP server:

```bash
python3 -m http.server 8000 --directory src
```

- **Runtime (player)**: http://localhost:8000
- **Editor**: http://localhost:8000/editor/

## Architecture

ekakuvn has three parts:

1. **Script format** -- A JSON-based `.ekaku.json` file that describes an entire visual novel (metadata, assets, scenes, dialogue, branching).
2. **Runtime** -- A standalone module that takes a script and plays the visual novel on an HTML5 Canvas.
3. **Editor** -- A browser-based tool for visually authoring scenes, importing assets, writing dialogue, and exporting scripts.

```
Editor  -->  .ekaku.json script  -->  Runtime
```

## Runtime

### Embedding in your own page

```html
<div id="game"></div>
<script type="module">
  import { Ekakuvn } from './modules/ekakuvn.js'

  const game = new Ekakuvn({ mainSelector: '#game' })

  const response = await fetch('my-novel.ekaku.json')
  const script = await response.json()

  await game.loadScript(script)
  await game.start()
</script>
```

You can also use `EkakuRuntime` directly for more control:

```js
import { EkakuRuntime } from './modules/runtime/runtime.js'

const runtime = new EkakuRuntime('#game', script)
await runtime.start()

// Save/load
runtime.save('slot1')
runtime.load('slot1')
runtime.listSaves()
runtime.deleteSave('slot1')

// Events
runtime.onSceneChange = (sceneId) => console.log('Scene:', sceneId)
runtime.onEnd = () => console.log('Game ended')

// Lifecycle
runtime.pause()
runtime.resume()
runtime.dispose()
```

### Title Screen

When a game starts, a title screen is shown before gameplay begins. The title screen displays:

- The game title (from `meta.title` or `meta.mainMenu.title` if set)
- The author name (if set)
- **New Game** -- Start the game from the beginning
- **Load Game** -- Shown only if save data exists. Opens the save slot menu.
- **Settings** -- Volume controls (Master, Music, SFX)

The title screen background uses the asset specified in `meta.mainMenu.background`. If none is set, a solid dark background is used.

When the game ends (no more scenes), the player is returned to the title screen.

### Player Controls

| Action | Input |
|---|---|
| Advance dialogue | Click, Space, or Enter |
| Skip typewriter effect | Click, Space, or Enter (while text is typing) |
| Select a choice | Click on the choice |
| Open in-game menu | Escape |
| Close in-game menu | Escape |

### In-Game Menu

Press Escape during gameplay to open the menu. The menu provides:

- **Resume** -- Return to the game
- **Save Game** -- Save to one of 3 slots
- **Load Game** -- Load from a previously saved slot
- **Settings** -- Volume controls (Master, Music, SFX)
- **Title Screen** -- Auto-saves and returns to the title screen

Saving to an occupied slot prompts for confirmation before overwriting.

### Auto-Save

The runtime automatically saves progress:

- On every scene transition
- When the browser tab loses focus
- Before the page unloads

When returning to a game that has saves, the "Load Game" button appears on the title screen.

## Editor

Open `src/editor/index.html` in a browser. The editor has four panels:

### Layout

- **Left sidebar** -- Scene list (top) and asset library (bottom)
- **Center** -- Canvas preview of the current scene
- **Right sidebar** -- Properties inspector
- **Bottom** -- Dialogue editor

### Workflow

1. **Import assets** -- Click the `+` button in the Assets panel to import image and audio files. Each asset is assigned a type (background, character, music, sound).

2. **Create scenes** -- Click `+` in the Scenes panel to add scenes. Click a scene to select it for editing.

3. **Set backgrounds** -- Select a scene, then use the Properties panel to assign a background image from your assets.

4. **Place characters** -- Drag character assets from the library onto the canvas. Select characters on the canvas to move, scale, or flip them. The Properties panel shows position, scale, and flip controls for the selected character.

5. **Write dialogue** -- Use the bottom panel to add dialogue lines. Each line has a speaker name and text. Add choice branches at the end of a scene's dialogue to create branching paths.

6. **Connect scenes** -- Set the `next` scene in the Properties panel for linear progression, or use choices to branch to different scenes.

7. **Export** -- Click Save/Export in the toolbar to download the script as a `.ekaku.json` file.

8. **Import** -- Click Open to load an existing `.ekaku.json` back into the editor.

9. **Preview** -- Click Preview to open the runtime player in a new tab with your current project.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+S | Save/Export |
| Ctrl+O | Open/Import |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Delete / Backspace | Remove selected character |

### Auto-Save

The editor auto-saves project state to localStorage. When reopening the editor, your last project is restored automatically.

## Script Format

Scripts are JSON files with the following structure:

```json
{
  "meta": {
    "title": "My Visual Novel",
    "author": "Author Name",
    "version": "1.0.0",
    "resolution": { "width": 1280, "height": 720 },
    "mainMenu": {
      "background": "bg-title",
      "title": "A Different Title"
    }
  },
  "assets": [
    { "id": "bg-park", "type": "background", "path": "assets/park.png" },
    { "id": "char-hero", "type": "character", "path": "assets/hero.png" },
    { "id": "music-main", "type": "music", "path": "assets/theme.mp3" }
  ],
  "startScene": "scene-1",
  "scenes": [
    {
      "id": "scene-1",
      "background": "bg-park",
      "music": { "assetId": "music-main", "loop": true },
      "characters": [
        {
          "assetId": "char-hero",
          "position": { "x": 0.5, "y": 0.5 },
          "scale": 1.0,
          "flipped": false
        }
      ],
      "dialogue": [
        { "speaker": "Hero", "text": "Hello, world!" },
        { "speaker": null, "text": "Narration text goes here." }
      ],
      "choices": [
        { "text": "Go left", "targetSceneId": "scene-left" },
        { "text": "Go right", "targetSceneId": "scene-right" }
      ],
      "next": null
    }
  ]
}
```

### Key details

- **Asset types**: `background`, `character`, `music`, `sound`
- **Character position**: Normalized 0-1 coordinates. `x: 0` is the left edge, `x: 1` is the right edge. Characters are centered horizontally and bottom-aligned vertically on their position.
- **Scene flow**: A scene either has `choices` (branching) or `next` (linear transition to another scene). If both are null, the game ends after that scene.
- **Music**: If a scene's music matches the currently playing track, it continues without restarting.
- **Speaker**: Set to `null` for narration (no speaker name displayed).
- **Main menu**: `meta.mainMenu` is optional. `background` is an asset ID for the title screen image. `title` overrides the display title shown on the title screen (falls back to `meta.title`).

## Project Structure

```
src/
  index.html                          Runtime demo page
  main.js                             Runtime demo bootstrap
  css/style.css                       Runtime styles
  docs/example-script.json            Example script (4 scenes)
  modules/
    ekakuvn.js                        Facade class
    ekakuConfig.js                    localStorage config
    runtime/
      runtime.js                      EkakuRuntime (orchestrator)
      renderer.js                     Layered canvas renderer
      assetLoader.js                  Image/audio preloader
      audioEngine.js                  Web Audio music/sfx
      dialogueBox.js                  Dialogue display + typewriter
      sceneController.js              Scene graph + progression
      saveManager.js                  Save/load persistence
    editor/
      editorState.js                  Project state + undo/redo
      editorCanvas.js                 Interactive scene canvas
      assetManagerPanel.js            Asset import/library
      sceneManagerPanel.js            Scene list panel
      propertiesPanel.js              Properties inspector
      dialogueEditor.js              Dialogue timeline editor
      scriptSerializer.js            Export/import scripts
  editor/
    index.html                        Editor HTML
    editor.css                        Editor styles
    editor.js                         Editor bootstrap
```

## Browser Requirements

Modern browsers with support for:

- ES6 modules
- HTML5 Canvas
- Web Audio API
- Private class fields (`#`)
- `localStorage`
