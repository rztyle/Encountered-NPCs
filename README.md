# Encountered NPCs for SillyTavern

A compact universal NPC tracker displaying only:

**Status · Name · Relationship**

## Version 0.2.0

- Fixed manual Add and Save using dependable browser-local storage.
- Added draggable title bar.
- Added resizable panel.
- Remembers panel position and size.
- Added a reset-position button.
- Made model output parsing tolerate JSON, fenced JSON, and simple text rows.
- Automatic analysis is manual by default to avoid repeated errors and extra generations.
- Keeps separate NPC data for each chat.

## Install

In SillyTavern:

1. Open **Extensions**.
2. Choose **Install Extension**.
3. Paste:

   `https://github.com/rztyle/Encountered-NPCs`

4. Install and hard-refresh the page.

## Update an existing local clone

Replace `index.js`, `style.css`, `manifest.json`, and `README.md`, then run:

```bash
git add .
git commit -m "Fix saving, parsing, and add movable panel"
git push
```

In SillyTavern, open Extensions and select **Update** for Encountered NPCs, then hard-refresh.

## Usage

- Drag the title bar to move the panel.
- Drag the lower-right edge to resize it.
- Press **＋** to manually add an NPC.
- Click an NPC row to edit, lock, or delete it.
- Use **Analyze now** for model-assisted detection.
- Press **⌖** to reset panel position and size.

## Storage

Version 0.2.0 uses browser `localStorage`, separated by chat. This fixes the save failure seen with chat metadata on some SillyTavern builds. Browser storage means the list is tied to that browser/profile unless exported in a later version.
