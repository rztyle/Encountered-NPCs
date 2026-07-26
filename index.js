const MODULE_ID = 'encountered_npcs';
const STORAGE_VERSION = 1;
const STORAGE_KEY = `${MODULE_ID}_storage_v${STORAGE_VERSION}`;

let initialized = false;
let activeCharacterId = null;

function getContext() {
    return globalThis.SillyTavern?.getContext?.();
}

function notify(type, message) {
    const toast = globalThis.toastr;
    if (toast && typeof toast[type] === 'function') {
        toast[type](message);
        return;
    }
    console[type === 'error' ? 'error' : 'log'](`[Encountered NPCs] ${message}`);
}

function newId() {
    return globalThis.crypto?.randomUUID?.()
        ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyCharacter() {
    return {
        id: newId(),
        status: '',
        name: '',
        relationship: '',
        age: '',
        sex: '',
        summary: '',
        notes: '',
    };
}

function normalizeCharacter(value = {}) {
    return {
        ...emptyCharacter(),
        ...value,
        id: value.id || newId(),
    };
}

function getChatStorageKey() {
    const context = getContext();
    if (!context) return 'no-chat';

    const metadataId =
        context.chatMetadata?.chat_id
        ?? context.chatMetadata?.chatId
        ?? context.chatId
        ?? context.chat_id;

    if (metadataId) return `chat:${metadataId}`;

    if (context.groupId !== null && context.groupId !== undefined) {
        return `group:${context.groupId}`;
    }

    if (context.characterId !== null && context.characterId !== undefined) {
        const character = context.characters?.[context.characterId];
        const characterKey = character?.avatar || character?.name || context.characterId;
        return `character:${characterKey}`;
    }

    return 'no-chat';
}

function readStore() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.error('[Encountered NPCs] Failed to read storage.', error);
        return {};
    }
}

function writeStore(store) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
        console.error('[Encountered NPCs] Failed to write storage.', error);
        notify('error', 'Could not save character data.');
    }
}

function getCharacters() {
    const store = readStore();
    const characters = store[getChatStorageKey()];
    return Array.isArray(characters) ? characters.map(normalizeCharacter) : [];
}

function setCharacters(characters) {
    const store = readStore();
    store[getChatStorageKey()] = characters;
    writeStore(store);
}

function escapeHtml(value = '') {
    const element = document.createElement('div');
    element.textContent = String(value);
    return element.innerHTML;
}

function injectUi() {
    if (document.getElementById('enpc-panel')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <button id="enpc-launcher" class="enpc-launcher" type="button"
                title="Encountered NPCs" aria-label="Open Encountered NPCs">
            <i class="fa-solid fa-address-book" aria-hidden="true"></i>
        </button>

        <aside id="enpc-panel" class="enpc-panel" aria-hidden="true">
            <header class="enpc-header">
                <strong>Encountered NPCs</strong>
                <button id="enpc-close-panel" class="enpc-icon-button" type="button" aria-label="Close">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </header>

            <div class="enpc-toolbar">
                <input id="enpc-search" type="search" placeholder="Search characters…" autocomplete="off">
                <button id="enpc-add" type="button" title="Add character">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i><span>Add</span>
                </button>
                <button id="enpc-scan" type="button" title="Scan loaded chat">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>Scan Chat</span>
                </button>
            </div>

            <div id="enpc-list" class="enpc-list"></div>
            <div id="enpc-empty" class="enpc-empty">No characters saved for this chat.</div>
        </aside>

        <div id="enpc-editor-backdrop" class="enpc-backdrop" hidden>
            <form id="enpc-editor" class="enpc-modal">
                <header class="enpc-modal-header">
                    <strong id="enpc-editor-title">Add Character</strong>
                    <button class="enpc-icon-button" data-enpc-close-editor type="button" aria-label="Close">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </header>

                <div class="enpc-form-grid">
                    <label class="enpc-status-field">
                        Status
                        <input name="status" maxlength="12" placeholder="❤️">
                    </label>

                    <label class="enpc-name-field">
                        Name
                        <input name="name" required maxlength="100">
                    </label>

                    <label>
                        Relationship
                        <input name="relationship" maxlength="100" placeholder="Friend, rival, teacher…">
                    </label>

                    <label>
                        Age
                        <input name="age" maxlength="40" placeholder="Unknown">
                    </label>

                    <label>
                        Sex
                        <select name="sex">
                            <option value="">Unknown</option>
                            <option value="Female">Female</option>
                            <option value="Male">Male</option>
                            <option value="Nonbinary">Nonbinary</option>
                            <option value="Other">Other</option>
                        </select>
                    </label>

                    <label class="enpc-wide">
                        Summary <small>your input only</small>
                        <textarea name="summary" rows="3" maxlength="500"></textarea>
                    </label>

                    <label class="enpc-wide">
                        Notes <small>your input only</small>
                        <textarea name="notes" rows="5" maxlength="4000"></textarea>
                    </label>
                </div>

                <footer class="enpc-modal-footer">
                    <button id="enpc-delete" class="enpc-danger" type="button">Delete</button>
                    <span class="enpc-spacer"></span>
                    <button data-enpc-close-editor type="button">Cancel</button>
                    <button class="enpc-primary" type="submit">Save</button>
                </footer>
            </form>
        </div>

        <div id="enpc-scan-backdrop" class="enpc-backdrop" hidden>
            <section class="enpc-modal enpc-scan-modal">
                <header class="enpc-modal-header">
                    <div>
                        <strong>Scan Chat</strong>
                        <small>Local guesses from messages currently loaded in this chat.</small>
                    </div>
                    <button class="enpc-icon-button" data-enpc-close-scan type="button" aria-label="Close">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </header>

                <div id="enpc-scan-results" class="enpc-scan-results"></div>

                <footer class="enpc-modal-footer">
                    <span class="enpc-spacer"></span>
                    <button data-enpc-close-scan type="button">Cancel</button>
                    <button id="enpc-import" class="enpc-primary" type="button">Import Selected</button>
                </footer>
            </section>
        </div>
    `);

    bindUi();
    renderCharacters();
}

function bindUi() {
    document.getElementById('enpc-launcher')?.addEventListener('click', openPanel);
    document.getElementById('enpc-close-panel')?.addEventListener('click', closePanel);
    document.getElementById('enpc-add')?.addEventListener('click', () => openEditor());
    document.getElementById('enpc-scan')?.addEventListener('click', scanChat);
    document.getElementById('enpc-search')?.addEventListener('input', renderCharacters);
    document.getElementById('enpc-editor')?.addEventListener('submit', saveEditor);
    document.getElementById('enpc-delete')?.addEventListener('click', deleteCharacter);
    document.getElementById('enpc-import')?.addEventListener('click', importSelected);

    document.querySelectorAll('[data-enpc-close-editor]')
        .forEach(button => button.addEventListener('click', closeEditor));

    document.querySelectorAll('[data-enpc-close-scan]')
        .forEach(button => button.addEventListener('click', closeScan));

    document.getElementById('enpc-editor-backdrop')?.addEventListener('click', event => {
        if (event.target === event.currentTarget) closeEditor();
    });

    document.getElementById('enpc-scan-backdrop')?.addEventListener('click', event => {
        if (event.target === event.currentTarget) closeScan();
    });
}

function bindSillyTavernEvents() {
    const context = getContext();
    if (!context?.eventSource || !context?.event_types) return;

    const refresh = () => {
        if (document.getElementById('enpc-panel')?.classList.contains('open')) {
            renderCharacters();
        }
    };

    const eventNames = [
        'CHAT_CHANGED',
        'GROUP_UPDATED',
        'CHARACTER_DELETED',
        'MESSAGE_DELETED',
        'MESSAGE_EDITED',
    ];

    for (const eventName of eventNames) {
        const eventType = context.event_types[eventName];
        if (eventType) context.eventSource.on(eventType, refresh);
    }
}

function openPanel() {
    const panel = document.getElementById('enpc-panel');
    panel?.classList.add('open');
    panel?.setAttribute('aria-hidden', 'false');
    renderCharacters();
}

function closePanel() {
    const panel = document.getElementById('enpc-panel');
    panel?.classList.remove('open');
    panel?.setAttribute('aria-hidden', 'true');
}

function renderCharacters() {
    const list = document.getElementById('enpc-list');
    const empty = document.getElementById('enpc-empty');
    if (!list || !empty) return;

    const query = (document.getElementById('enpc-search')?.value || '').trim().toLowerCase();

    const characters = getCharacters()
        .filter(character => {
            if (!query) return true;
            return [
                character.name,
                character.relationship,
                character.age,
                character.sex,
                character.summary,
                character.notes,
            ].some(value => String(value || '').toLowerCase().includes(query));
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    empty.hidden = characters.length > 0;

    list.innerHTML = characters.map(character => `
        <button class="enpc-card" type="button" data-id="${escapeHtml(character.id)}">
            <span class="enpc-status">${escapeHtml(character.status || '•')}</span>
            <span class="enpc-card-body">
                <strong>${escapeHtml(character.name || 'Unnamed')}</strong>
                <small>${escapeHtml(
                    [character.relationship, character.sex, character.age]
                        .filter(Boolean)
                        .join(' · ') || 'No details'
                )}</small>
                ${character.summary
                    ? `<span class="enpc-summary">${escapeHtml(character.summary)}</span>`
                    : ''}
            </span>
            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
    `).join('');

    list.querySelectorAll('.enpc-card').forEach(card => {
        card.addEventListener('click', () => openEditor(card.dataset.id));
    });
}

function openEditor(id = null) {
    activeCharacterId = id;

    const form = document.getElementById('enpc-editor');
    if (!form) return;

    const character = id
        ? getCharacters().find(item => item.id === id)
        : emptyCharacter();

    form.reset();

    for (const [field, value] of Object.entries(character || {})) {
        if (form.elements[field]) form.elements[field].value = value ?? '';
    }

    document.getElementById('enpc-editor-title').textContent =
        id ? 'Edit Character' : 'Add Character';

    document.getElementById('enpc-delete').hidden = !id;
    document.getElementById('enpc-editor-backdrop').hidden = false;

    requestAnimationFrame(() => form.elements.name?.focus());
}

function closeEditor() {
    document.getElementById('enpc-editor-backdrop').hidden = true;
    activeCharacterId = null;
}

function saveEditor(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);
    const characters = getCharacters();
    const existingIndex = activeCharacterId
        ? characters.findIndex(character => character.id === activeCharacterId)
        : -1;

    const original = existingIndex >= 0 ? characters[existingIndex] : emptyCharacter();

    const character = normalizeCharacter({
        ...original,
        status: String(data.get('status') || '').trim(),
        name: String(data.get('name') || '').trim(),
        relationship: String(data.get('relationship') || '').trim(),
        age: String(data.get('age') || '').trim(),
        sex: String(data.get('sex') || '').trim(),
        summary: String(data.get('summary') || '').trim(),
        notes: String(data.get('notes') || '').trim(),
    });

    if (!character.name) {
        notify('warning', 'Character name is required.');
        return;
    }

    if (existingIndex >= 0) characters[existingIndex] = character;
    else characters.push(character);

    setCharacters(characters);
    closeEditor();
    renderCharacters();
    notify('success', 'Character saved.');
}

function deleteCharacter() {
    if (!activeCharacterId) return;
    if (!globalThis.confirm('Delete this character?')) return;

    setCharacters(getCharacters().filter(character => character.id !== activeCharacterId));
    closeEditor();
    renderCharacters();
    notify('success', 'Character deleted.');
}

function getLoadedMessages() {
    const context = getContext();

    if (Array.isArray(context?.chat) && context.chat.length > 0) {
        return context.chat.map((message, index) => ({
            index,
            speaker: String(message?.name || '').trim(),
            text: String(message?.mes || '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim(),
            isUser: Boolean(message?.is_user),
        }));
    }

    return [...document.querySelectorAll('#chat .mes')].map((element, index) => ({
        index,
        speaker: String(
            element.getAttribute('ch_name')
            || element.querySelector('.name_text')?.textContent
            || ''
        ).trim(),
        text: String(element.querySelector('.mes_text')?.textContent || '').trim(),
        isUser: element.getAttribute('is_user') === 'true',
    }));
}

function scanChat() {
    const messages = getLoadedMessages();

    if (messages.length === 0) {
        notify('warning', 'No loaded chat messages were found.');
        return;
    }

    const results = detectCharacters(messages);
    renderScanResults(results);
    document.getElementById('enpc-scan-backdrop').hidden = false;
}

function closeScan() {
    document.getElementById('enpc-scan-backdrop').hidden = true;
}

function cleanName(name) {
    return String(name || '')
        .replace(/^[\s"'“”‘’.,:;!?()[\]{}]+|[\s"'“”‘’.,:;!?()[\]{}]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isLikelyName(name) {
    if (!name || name.length < 2 || name.length > 50) return false;

    const blocked = /^(the|this|that|there|they|she|he|her|his|my|your|our|their|what|when|where|why|how|yes|no|unknown|user|assistant|system|narrator|you)$/i;
    if (blocked.test(name)) return false;
    if (/^\d+$/.test(name)) return false;

    return /^[\p{L}][\p{L}\p{M}'’\- ]+$/u.test(name);
}

function countMatches(text, regex) {
    return (text.match(regex) || []).length;
}

function inferCharacter(name, allText) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const windows = [];
    const contextPattern = new RegExp(`.{0,180}\\b${escaped}\\b.{0,180}`, 'giu');

    let match;
    while ((match = contextPattern.exec(allText)) && windows.length < 20) {
        windows.push(match[0]);
    }

    const nearby = windows.join(' ');

    let age = '';
    const agePatterns = [
        new RegExp(`\\b${escaped}\\b.{0,60}\\b(?:is|was|aged?)\\s+(\\d{1,3})\\b`, 'i'),
        new RegExp(`\\b(\\d{1,3})[- ]year[- ]old\\b.{0,60}\\b${escaped}\\b`, 'i'),
        new RegExp(`\\b${escaped}\\b.{0,60}\\b(\\d{1,3})[- ]year[- ]old\\b`, 'i'),
    ];

    for (const pattern of agePatterns) {
        const ageMatch = nearby.match(pattern);
        if (!ageMatch) continue;

        const number = Number(ageMatch[1]);
        if (number >= 1 && number <= 999) age = String(number);
        break;
    }

    const maleScore = countMatches(
        nearby,
        /\b(he|him|his|man|boy|male|father|brother|son|husband|king|prince|uncle)\b/gi,
    );

    const femaleScore = countMatches(
        nearby,
        /\b(she|her|hers|woman|girl|female|mother|sister|daughter|wife|queen|princess|aunt)\b/gi,
    );

    let sex = '';
    if (femaleScore >= maleScore + 2) sex = 'Female';
    else if (maleScore >= femaleScore + 2) sex = 'Male';

    const relationshipRules = [
        ['Childhood Friend', /\bchildhood friend\b/i],
        ['Best Friend', /\bbest friend\b/i],
        ['Friend', /\bfriend\b/i],
        ['Rival', /\brival\b/i],
        ['Enemy', /\b(enemy|foe|antagonist)\b/i],
        ['Teacher', /\b(teacher|professor|instructor|mentor)\b/i],
        ['Boss', /\b(boss|manager|supervisor)\b/i],
        ['Coworker', /\b(coworker|colleague)\b/i],
        ['Classmate', /\bclassmate\b/i],
        ['Sister', /\bsister\b/i],
        ['Brother', /\bbrother\b/i],
        ['Mother', /\bmother\b/i],
        ['Father', /\bfather\b/i],
        ['Aunt', /\baunt\b/i],
        ['Uncle', /\buncle\b/i],
        ['Cousin', /\bcousin\b/i],
        ['Daughter', /\bdaughter\b/i],
        ['Son', /\bson\b/i],
        ['Wife', /\bwife\b/i],
        ['Husband', /\bhusband\b/i],
        ['Fiancée', /\bfianc(?:e|ée)\b/i],
        ['Girlfriend', /\bgirlfriend\b/i],
        ['Boyfriend', /\bboyfriend\b/i],
        ['Stranger', /\bstranger\b/i],
    ];

    let relationship = '';
    for (const [label, pattern] of relationshipRules) {
        if (pattern.test(nearby)) {
            relationship = label;
            break;
        }
    }

    return { relationship, age, sex };
}

function detectCharacters(messages) {
    const allText = messages.map(message => message.text).join('\n');
    const existingNames = new Set(getCharacters().map(character => character.name.toLowerCase()));
    const candidates = new Map();

    function addCandidate(rawName, source = 'text') {
        const name = cleanName(rawName);
        if (!isLikelyName(name)) return;

        const key = name.toLowerCase();

        if (!candidates.has(key)) {
            candidates.set(key, {
                name,
                mentions: 0,
                isSpeaker: false,
            });
        }

        const candidate = candidates.get(key);
        candidate.mentions += 1;
        if (source === 'speaker') candidate.isSpeaker = true;
    }

    for (const message of messages) {
        if (
            message.speaker
            && !message.isUser
            && !/^(assistant|system|narrator|you)$/i.test(message.speaker)
        ) {
            addCandidate(message.speaker, 'speaker');
        }

        const patterns = [
            /\b(?:Mr|Mrs|Ms|Miss|Dr|Professor|Teacher|Captain|Lady|Lord|Prince|Princess|King|Queen|Emperor|Empress|Aunt|Uncle|Sister|Brother)\.?\s+([A-Z][A-Za-z'’-]{1,24}(?:\s+[A-Z][A-Za-z'’-]{1,24})?)/g,
            /\b([A-Z][A-Za-z'’-]{2,24}(?:\s+[A-Z][A-Za-z'’-]{2,24})?)\s+(?:said|asked|replied|whispered|shouted|smiled|laughed|nodded|entered|looked|walked)\b/g,
            /["“]([A-Z][A-Za-z'’-]{2,24})[,"”]/g,
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(message.text))) {
                addCandidate(match[1]);
            }
        }
    }

    return [...candidates.values()]
        .filter(candidate => candidate.isSpeaker || candidate.mentions >= 2)
        .map(candidate => ({
            ...candidate,
            ...inferCharacter(candidate.name, allText),
            alreadySaved: existingNames.has(candidate.name.toLowerCase()),
        }))
        .sort((a, b) =>
            Number(b.isSpeaker) - Number(a.isSpeaker)
            || b.mentions - a.mentions
            || a.name.localeCompare(b.name)
        )
        .slice(0, 50);
}

function renderScanResults(results) {
    const container = document.getElementById('enpc-scan-results');
    const importButton = document.getElementById('enpc-import');
    if (!container || !importButton) return;

    if (results.length === 0) {
        container.innerHTML = `
            <div class="enpc-empty">
                No likely character names were found. Load more chat messages or add the character manually.
            </div>
        `;
        container.dataset.results = '[]';
        importButton.disabled = true;
        return;
    }

    importButton.disabled = false;
    container.dataset.results = JSON.stringify(results);

    container.innerHTML = results.map((result, index) => `
        <label class="enpc-scan-item ${result.alreadySaved ? 'is-saved' : ''}">
            <input type="checkbox"
                   data-index="${index}"
                   ${result.alreadySaved ? 'disabled' : 'checked'}>
            <span>
                <strong>${escapeHtml(result.name)}</strong>
                <small>${escapeHtml([
                    result.relationship || 'Relationship unknown',
                    result.sex || 'Sex unknown',
                    result.age ? `Age ${result.age}` : 'Age unknown',
                ].join(' · '))}</small>
                <em>${result.alreadySaved
                    ? 'Already saved'
                    : `${result.mentions} mention${result.mentions === 1 ? '' : 's'}`}
                </em>
            </span>
        </label>
    `).join('');
}

function importSelected() {
    const container = document.getElementById('enpc-scan-results');
    if (!container) return;

    const results = JSON.parse(container.dataset.results || '[]');

    const selected = [...container.querySelectorAll('input[type="checkbox"]:checked')]
        .map(input => results[Number(input.dataset.index)])
        .filter(Boolean);

    if (selected.length === 0) {
        notify('warning', 'Select at least one character.');
        return;
    }

    const characters = getCharacters();
    const existingNames = new Set(characters.map(character => character.name.toLowerCase()));
    let imported = 0;

    for (const result of selected) {
        const key = result.name.toLowerCase();
        if (existingNames.has(key)) continue;

        characters.push({
            ...emptyCharacter(),
            name: result.name,
            relationship: result.relationship || '',
            age: result.age || '',
            sex: result.sex || '',
            status: '',
            summary: '',
            notes: '',
        });

        existingNames.add(key);
        imported += 1;
    }

    setCharacters(characters);
    closeScan();
    renderCharacters();
    notify('success', `Imported ${imported} character${imported === 1 ? '' : 's'}.`);
}

function initialize() {
    if (initialized) return;
    initialized = true;

    injectUi();
    bindSillyTavernEvents();

    console.info('[Encountered NPCs] v2.2.1 loaded.');
}

function registerInitialization() {
    const context = getContext();

    if (!context?.eventSource || !context?.event_types?.APP_READY) {
        console.error('[Encountered NPCs] SillyTavern context was unavailable.');
        return;
    }

    context.eventSource.on(context.event_types.APP_READY, initialize);
}

registerInitialization();
