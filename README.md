# Encountered NPCs for SillyTavern

A compact universal character tracker for SillyTavern.

## Layout

**Status · Name · Relationship · Summary**

Example:

```text
😊  Bai Lian   Friend   Playful fox princess who trusts Yuan.
👑  Aunt Yue   Aunt     Yuan's protective aunt and guardian.
🎓  Mu Xian    Master   Sword master of the Azure Dragon Sect.
```

## Version 1.0.2

- Fixed the SillyTavern quiet-generation call for older and current client versions.
- The prompt is now passed as a string instead of an options object.
- Fixed analysis parsing for local roleplay models.
- Added structured-output support when the selected API supports it.
- Added an automatic second attempt using a simple pipe-delimited format.
- Added support for JSON, markdown tables, pipe rows, tab rows, and labeled text.
- Prevents duplicate failure notifications.
- Rewritten character storage and UI logic.
- Added a working Summary field.
- Added Summary to the main table.
- Added Summary to the Add/Edit window.
- Search checks Name, Relationship, and Summary.
- AI analysis requests structured JSON with summaries.
- Existing v0.2/v0.3 local data is migrated automatically.
- Keeps draggable, resizable, remembered panel position.
- Keeps support for plain HTTP SillyTavern installations.

## Install or update

Install from:

`https://github.com/rztyle/Encountered-NPCs`

After updating the GitHub repository, use SillyTavern's extension Update button and hard-refresh with `Ctrl + Shift + R`.

## Stored character format

```json
{
  "name": "Bai Lian",
  "status": "😊",
  "relationship": "Friend",
  "summary": "Playful fox princess who trusts Yuan.",
  "locked": false
}
```
