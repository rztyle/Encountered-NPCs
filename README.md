# Encountered NPCs

A lightweight, mobile-first character tracker for SillyTavern.

## Features

- Separate saved character list for each active chat or group
- Add, edit, delete, and search
- Mobile, tablet, and desktop layout
- Manual local chat scanner
- No model call, API call, background scan, or automatic import
- Review results before importing
- Scanner leaves unclear values blank as **Unknown**
- Scanner never writes Status, Summary, or Notes

## Scanner

The scanner reads `SillyTavern.getContext().chat` from the currently active chat.

It checks:

- Non-user message speaker names
- Repeated capitalized names near dialogue/action words
- Explicit ages such as `Alice is 18` and `18-year-old Alice`
- Nearby pronouns and family-role words
- Common relationship terms such as friend, rival, teacher, sister, boss, and classmate

This is intentionally a simple rule-based scanner. It does not invent missing information.

## Install from GitHub

In SillyTavern:

1. Open **Extensions**
2. Open **Install Extension**
3. Paste:

   `https://github.com/rztyle/Encountered-NPCs`

4. Reload SillyTavern

## Manual development install

Copy or symlink the repository into the current user's extension folder:

```bash
ln -s ~/Projects/Encountered-NPCs \
  ~/SillyTavern/data/default-user/extensions/Encountered-NPCs
```

The actual user folder may differ from `default-user`.

## Test

1. Open a chat with named recurring characters
2. Press the floating address-book button
3. Press **Scan Chat**
4. Review the guesses
5. Import selected characters
6. Open a character and write your own Summary or Notes

## Storage

Data is saved in browser local storage. Nothing is transmitted by this extension.

## Version

2.2.1
