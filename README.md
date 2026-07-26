# Encountered NPCs

A lightweight, mobile-first character tracker for SillyTavern.

## What it does

- Keeps a separate character list for each chat.
- Works on phone, tablet, and desktop.
- Lets the user enter Status, Summary, and Notes.
- Scans the currently loaded chat for likely character names.
- Makes simple local guesses for Relationship, Age, and Sex.
- Shows scan results for review before importing.
- Makes no API calls and never scans automatically.

## Scanner behavior

The scanner uses basic browser-side text rules. It checks:

- SillyTavern message speaker names.
- Repeated names near dialogue or action words.
- Explicit ages such as `Alice is 18` or `18-year-old Alice`.
- Nearby pronouns and family/role words.
- Common relationship words such as friend, rival, teacher, sister, boss, and classmate.

When information is not clear, the field remains blank/Unknown. It does not invent missing details.

The scanner never writes Summary, Notes, or Status.

## Installation

In SillyTavern:

1. Open **Extensions**.
2. Choose **Install Extension**.
3. Enter:

   `https://github.com/rztyle/Encountered-NPCs`

For manual testing, copy this folder into:

`SillyTavern/data/<user>/extensions/Encountered-NPCs`

or install it for all users under SillyTavern's third-party extensions directory.

Restart or reload SillyTavern.

## Testing

1. Open a chat that contains several named characters.
2. Tap the address-book button.
3. Tap **Scan Chat**.
4. Review the names and inferred details.
5. Import selected characters.
6. Open a character and add your Summary and Notes.

## Privacy

All data stays in the browser's local storage. There are no network requests from this extension.

## Version

2.2.0
