# Encountered NPCs for SillyTavern

## Version 2.1.0

- Removed all model and API calls from scanning.
- **Scan Chat** reads only the current chat already loaded in SillyTavern.
- Finds likely NPC names from speaker names and repeated proper-name patterns.
- Review names before saving.
- Imported characters start with an Unknown relationship and blank summary so you can edit them.
- Notes are never overwritten.

The local scanner does not contact OpenAI, your selected model, or any external API.
