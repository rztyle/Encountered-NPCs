
# Encountered NPCs for SillyTavern

A compact, universal NPC relationship tracker.

The panel intentionally shows only:

**Status · Name · Relationship**

Example:

- ❤️ Bai Lian — Romance
- 😊 Ling Xi — Friend
- 👑 Mei — Mother
- 🎓 Mu Xian — Master
- ⚔️ Zhao Tian — Enemy

## Features

- Compact floating right-side panel
- One row per encountered NPC
- Per-chat storage using SillyTavern chat metadata
- Automatic relationship updates using a quiet background LLM analysis
- Manual Add / Edit / Delete
- Relationship lock to stop automatic changes
- Search
- Import/export JSON
- Mobile-friendly collapsed mode

## Installation

### Recommended: Git repository

1. Put these files in a GitHub repository.
2. In SillyTavern open **Extensions → Install Extension**.
3. Paste the repository URL.
4. Reload SillyTavern.

### Manual server-wide install

Copy the `Encountered-NPCs` folder into:

`SillyTavern/public/scripts/extensions/third-party/`

Then restart or reload SillyTavern.

For newer user-scoped installations, SillyTavern may store installed extensions beneath the user's data directory instead. Installing through the Extensions menu is preferred.

## Automatic analysis

Automatic analysis is enabled by default. After an AI reply, the extension makes one quiet background generation and asks the current model to return a JSON NPC list.

Use the gear button to:

- disable automatic analysis
- analyze every 1, 2, 3, 5, or 10 replies
- change how many recent messages are examined

The **Analyze now** button runs it manually.

## Important behavior

- Only named NPCs encountered in the story should be added.
- The relationship changes only when the recent story clearly supports it.
- Locked rows cannot be changed by automatic analysis.
- Automatic quality depends on the connected model.
- The extension does not require a server plugin.

## Version

0.1.0 MVP
