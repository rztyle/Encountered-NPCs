# Encountered NPCs for SillyTavern

A compact universal NPC tracker with four simple columns:

**Status · Name · Relationship · Summary**

## Version 0.3.0

- Added a short Summary field.
- Main panel now shows Status, Name, Relationship, and Summary.
- Add/Edit window includes Summary.
- Search now includes summaries.
- Model analysis now requests short summaries.
- Fallback chat scanning creates a basic summary when the model returns no usable list.
- Keeps the draggable and resizable panel from v0.2.x.
- Keeps the plain-HTTP save fix.

## Install

In SillyTavern:

1. Open **Extensions**.
2. Choose **Install Extension**.
3. Paste:

   `https://github.com/rztyle/Encountered-NPCs`

4. Install and hard-refresh.

## Update your Git repository

Replace the files in your local repository, then run:

```fish
cd ~/Projects/Encountered-NPCs
git add .
git commit -m "Add NPC summary column"
git push
```

Then in SillyTavern click **Update** for Encountered NPCs and hard-refresh with `Ctrl + Shift + R`.

## Usage

- Drag the title bar to move the panel.
- Resize from the lower-right edge.
- Press **＋** to add an NPC.
- Click a row to edit Status, Name, Relationship, Summary, or Lock.
- Press **Analyze now** to scan the roleplay.
- Press **⌖** to reset panel position and size.

## Data format

Each NPC stores:

```json
{
  "name": "Bai Lian",
  "status": "😊",
  "relationship": "Friend",
  "summary": "Playful fox princess who trusts Yuan.",
  "locked": false
}
```

Summary is limited to 120 characters.
