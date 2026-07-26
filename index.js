const ENPC = (() => {
    'use strict';

    const MODULE = 'encountered_npcs';
    const STORAGE_KEY = `${MODULE}_v2`;
    let panel;
    let editor;
    let scanDialog;
    let selectedId = null;

    const emptyCharacter = () => ({
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        status: '',
        name: '',
        relationship: '',
        age: '',
        sex: '',
        summary: '',
        notes: '',
    });

    function context() {
        return globalThis.SillyTavern?.getContext?.() || {};
    }

    function toast(type, message) {
        const t = globalThis.toastr;
        if (t?.[type]) t[type](message);
        else console[type === 'error' ? 'error' : 'log'](`[Encountered NPCs] ${message}`);
    }

    function chatKey() {
        const ctx = context();
        const direct = ctx.chatId || ctx.chat_id || ctx.chatMetadata?.chat_id || ctx.chatMetadata?.chatId;
        if (direct) return `chat:${direct}`;
        if (ctx.groupId != null) return `group:${ctx.groupId}`;
        if (ctx.characterId != null) {
            const c = ctx.characters?.[ctx.characterId];
            return `character:${c?.avatar || c?.name || ctx.characterId}`;
        }
        return `page:${location.pathname}`;
    }

    function loadAll() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    function loadCharacters() {
        const all = loadAll();
        const list = all[chatKey()];
        return Array.isArray(list) ? list.map(normalizeCharacter) : [];
    }

    function normalizeCharacter(value) {
        return {
            ...emptyCharacter(),
            ...(value || {}),
            id: value?.id || emptyCharacter().id,
        };
    }

    function saveCharacters(characters) {
        const all = loadAll();
        all[chatKey()] = characters;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }

    function escapeHtml(value = '') {
        const node = document.createElement('div');
        node.textContent = String(value);
        return node.innerHTML;
    }

    function createUi() {
        if (document.getElementById('enpc-root')) return;

        document.body.insertAdjacentHTML('beforeend', `
            <button id="enpc-open" class="enpc-floating" type="button" title="Encountered NPCs" aria-label="Open Encountered NPCs">
                <i class="fa-solid fa-address-book"></i>
            </button>

            <section id="enpc-root" class="enpc-panel" aria-hidden="true">
                <header class="enpc-header">
                    <strong>Encountered NPCs</strong>
                    <button id="enpc-close" class="enpc-icon-btn" type="button" aria-label="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </header>

                <div class="enpc-toolbar">
                    <input id="enpc-search" type="search" placeholder="Search characters…" autocomplete="off">
                    <button id="enpc-add" type="button"><i class="fa-solid fa-plus"></i><span>Add</span></button>
                    <button id="enpc-scan" type="button"><i class="fa-solid fa-magnifying-glass"></i><span>Scan Chat</span></button>
                </div>

                <div id="enpc-list" class="enpc-list"></div>
                <div id="enpc-empty" class="enpc-empty">No characters saved for this chat.</div>
            </section>

            <div id="enpc-editor-backdrop" class="enpc-backdrop" hidden>
                <form id="enpc-editor" class="enpc-modal">
                    <header>
                        <strong id="enpc-editor-title">Add Character</strong>
                        <button class="enpc-icon-btn" data-close-editor type="button" aria-label="Close">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </header>

                    <div class="enpc-form-grid">
                        <label class="enpc-status-field">Status
                            <input name="status" maxlength="12" placeholder="❤️">
                        </label>
                        <label class="enpc-name-field">Name
                            <input name="name" required maxlength="100">
                        </label>
                        <label>Relationship
                            <input name="relationship" maxlength="100" placeholder="Friend, rival, teacher…">
                        </label>
                        <label>Age
                            <input name="age" maxlength="40" placeholder="Unknown">
                        </label>
                        <label>Sex
                            <select name="sex">
                                <option value="">Unknown</option>
                                <option>Female</option>
                                <option>Male</option>
                                <option>Nonbinary</option>
                                <option>Other</option>
                            </select>
                        </label>
                        <label class="enpc-wide">Summary <span class="enpc-user-only">your input only</span>
                            <textarea name="summary" rows="2" maxlength="500"></textarea>
                        </label>
                        <label class="enpc-wide">Notes <span class="enpc-user-only">your input only</span>
                            <textarea name="notes" rows="5" maxlength="4000"></textarea>
                        </label>
                    </div>

                    <footer>
                        <button id="enpc-delete" class="enpc-danger" type="button">Delete</button>
                        <span class="enpc-spacer"></span>
                        <button data-close-editor type="button">Cancel</button>
                        <button class="enpc-primary" type="submit">Save</button>
                    </footer>
                </form>
            </div>

            <div id="enpc-scan-backdrop" class="enpc-backdrop" hidden>
                <section id="enpc-scan-dialog" class="enpc-modal enpc-scan-modal">
                    <header>
                        <div>
                            <strong>Scan Chat</strong>
                            <small>Simple guesses from the chat currently loaded on screen.</small>
                        </div>
                        <button class="enpc-icon-btn" data-close-scan type="button" aria-label="Close">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </header>
                    <div id="enpc-scan-results" class="enpc-scan-results"></div>
                    <footer>
                        <button data-close-scan type="button">Cancel</button>
                        <button id="enpc-import" class="enpc-primary" type="button">Import Selected</button>
                    </footer>
                </section>
            </div>
        `);

        panel = document.getElementById('enpc-root');
        editor = document.getElementById('enpc-editor');
        scanDialog = document.getElementById('enpc-scan-dialog');

        document.getElementById('enpc-open').addEventListener('click', openPanel);
        document.getElementById('enpc-close').addEventListener('click', closePanel);
        document.getElementById('enpc-add').addEventListener('click', () => openEditor());
        document.getElementById('enpc-scan').addEventListener('click', scanChat);
        document.getElementById('enpc-search').addEventListener('input', renderList);
        editor.addEventListener('submit', saveEditor);
        document.getElementById('enpc-delete').addEventListener('click', deleteSelected);
        document.querySelectorAll('[data-close-editor]').forEach(x => x.addEventListener('click', closeEditor));
        document.querySelectorAll('[data-close-scan]').forEach(x => x.addEventListener('click', closeScan));
        document.getElementById('enpc-import').addEventListener('click', importSelected);

        document.getElementById('enpc-editor-backdrop').addEventListener('click', e => {
            if (e.target === e.currentTarget) closeEditor();
        });
        document.getElementById('enpc-scan-backdrop').addEventListener('click', e => {
            if (e.target === e.currentTarget) closeScan();
        });

        subscribeToChatChanges();
        renderList();
    }

    function openPanel() {
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        renderList();
    }

    function closePanel() {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
    }

    function renderList() {
        if (!panel) return;
        const query = (document.getElementById('enpc-search')?.value || '').trim().toLowerCase();
        const characters = loadCharacters()
            .filter(c => !query || [c.name, c.relationship, c.summary, c.notes, c.age, c.sex]
                .some(v => String(v || '').toLowerCase().includes(query)))
            .sort((a, b) => a.name.localeCompare(b.name));

        const list = document.getElementById('enpc-list');
        const empty = document.getElementById('enpc-empty');
        empty.hidden = characters.length > 0;
        list.innerHTML = characters.map(c => `
            <button class="enpc-card" type="button" data-id="${escapeHtml(c.id)}">
                <span class="enpc-status">${escapeHtml(c.status || '•')}</span>
                <span class="enpc-card-main">
                    <strong>${escapeHtml(c.name || 'Unnamed')}</strong>
                    <small>${escapeHtml([c.relationship, c.sex, c.age].filter(Boolean).join(' · ') || 'No details')}</small>
                    ${c.summary ? `<span class="enpc-summary">${escapeHtml(c.summary)}</span>` : ''}
                </span>
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        `).join('');

        list.querySelectorAll('.enpc-card').forEach(card => {
            card.addEventListener('click', () => openEditor(card.dataset.id));
        });
    }

    function openEditor(id = null) {
        selectedId = id;
        const characters = loadCharacters();
        const character = id ? characters.find(c => c.id === id) : emptyCharacter();

        editor.reset();
        for (const [key, value] of Object.entries(character || {})) {
            if (editor.elements[key]) editor.elements[key].value = value ?? '';
        }

        document.getElementById('enpc-editor-title').textContent = id ? 'Edit Character' : 'Add Character';
        document.getElementById('enpc-delete').hidden = !id;
        document.getElementById('enpc-editor-backdrop').hidden = false;
        setTimeout(() => editor.elements.name.focus(), 0);
    }

    function closeEditor() {
        document.getElementById('enpc-editor-backdrop').hidden = true;
        selectedId = null;
    }

    function saveEditor(event) {
        event.preventDefault();
        const form = new FormData(editor);
        const characters = loadCharacters();
        const existingIndex = selectedId ? characters.findIndex(c => c.id === selectedId) : -1;
        const base = existingIndex >= 0 ? characters[existingIndex] : emptyCharacter();

        const updated = normalizeCharacter({
            ...base,
            status: String(form.get('status') || '').trim(),
            name: String(form.get('name') || '').trim(),
            relationship: String(form.get('relationship') || '').trim(),
            age: String(form.get('age') || '').trim(),
            sex: String(form.get('sex') || '').trim(),
            summary: String(form.get('summary') || '').trim(),
            notes: String(form.get('notes') || '').trim(),
        });

        if (!updated.name) return;

        if (existingIndex >= 0) characters[existingIndex] = updated;
        else characters.push(updated);

        saveCharacters(characters);
        closeEditor();
        renderList();
        toast('success', 'Character saved.');
    }

    function deleteSelected() {
        if (!selectedId) return;
        if (!confirm('Delete this character?')) return;
        const characters = loadCharacters().filter(c => c.id !== selectedId);
        saveCharacters(characters);
        closeEditor();
        renderList();
        toast('success', 'Character deleted.');
    }

    function getLoadedChatMessages() {
        const ctx = context();
        if (Array.isArray(ctx.chat) && ctx.chat.length) {
            return ctx.chat.map((m, index) => ({
                index,
                speaker: String(m?.name || '').trim(),
                text: String(m?.mes || m?.message || '').replace(/<[^>]*>/g, ' ').trim(),
                isUser: Boolean(m?.is_user),
            }));
        }

        return [...document.querySelectorAll('#chat .mes')].map((node, index) => ({
            index,
            speaker: (node.getAttribute('ch_name') || node.querySelector('.name_text')?.textContent || '').trim(),
            text: (node.querySelector('.mes_text')?.textContent || '').trim(),
            isUser: node.getAttribute('is_user') === 'true',
        }));
    }

    function scanChat() {
        const messages = getLoadedChatMessages();
        if (!messages.length) {
            toast('warning', 'No loaded chat messages were found.');
            return;
        }

        const results = detectCharacters(messages);
        renderScanResults(results);
        document.getElementById('enpc-scan-backdrop').hidden = false;
    }

    function closeScan() {
        document.getElementById('enpc-scan-backdrop').hidden = true;
    }

    function detectCharacters(messages) {
        const joined = messages.map(m => m.text).join('\n');
        const current = loadCharacters();
        const knownNames = new Set(current.map(c => c.name.toLowerCase()));
        const candidates = new Map();

        function addCandidate(name, source = 'text') {
            name = cleanName(name);
            if (!isLikelyName(name)) return;
            const key = name.toLowerCase();
            if (!candidates.has(key)) candidates.set(key, { name, mentions: 0, speaker: false });
            const item = candidates.get(key);
            item.mentions += 1;
            if (source === 'speaker') item.speaker = true;
        }

        for (const message of messages) {
            if (message.speaker && !message.isUser && !/^(assistant|system|narrator|you)$/i.test(message.speaker)) {
                addCandidate(message.speaker, 'speaker');
            }

            const text = message.text;
            const patterns = [
                /\b(?:Mr|Mrs|Ms|Miss|Dr|Professor|Teacher|Captain|Lady|Lord|Prince|Princess|King|Queen|Emperor|Empress|Aunt|Uncle|Sister|Brother)\.?\s+([A-Z][A-Za-z'’-]{1,24}(?:\s+[A-Z][A-Za-z'’-]{1,24})?)/g,
                /\b([A-Z][A-Za-z'’-]{2,24}(?:\s+[A-Z][A-Za-z'’-]{2,24})?)\s+(?:said|asked|replied|whispered|shouted|smiled|laughed|nodded|entered|looked|walked)\b/g,
                /["“]([A-Z][A-Za-z'’-]{2,24})[,"”]/g,
            ];

            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(text))) addCandidate(match[1]);
            }
        }

        return [...candidates.values()]
            .filter(c => c.speaker || c.mentions >= 2)
            .map(c => {
                const profile = inferProfile(c.name, joined);
                return {
                    ...c,
                    ...profile,
                    exists: knownNames.has(c.name.toLowerCase()),
                    selected: !knownNames.has(c.name.toLowerCase()),
                };
            })
            .sort((a, b) => Number(b.speaker) - Number(a.speaker) || b.mentions - a.mentions || a.name.localeCompare(b.name))
            .slice(0, 50);
    }

    function cleanName(name) {
        return String(name || '')
            .replace(/^[\s"'“”‘’.,:;!?()[\]{}]+|[\s"'“”‘’.,:;!?()[\]{}]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isLikelyName(name) {
        if (!name || name.length < 2 || name.length > 50) return false;
        if (/^(The|This|That|There|They|She|He|Her|His|My|Your|Our|Their|What|When|Where|Why|How|Yes|No|Unknown|User|Assistant|System|Narrator)$/i.test(name)) return false;
        if (/^\d+$/.test(name)) return false;
        return /^[\p{L}][\p{L}\p{M}'’\- ]+$/u.test(name);
    }

    function inferProfile(name, fullText) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const windows = [];
        const re = new RegExp(`.{0,180}\\b${escaped}\\b.{0,180}`, 'giu');
        let match;
        while ((match = re.exec(fullText)) && windows.length < 20) windows.push(match[0]);
        const text = windows.join(' ');

        let age = '';
        const agePatterns = [
            new RegExp(`\\b${escaped}\\b.{0,60}\\b(?:is|was|aged?)\\s+(\\d{1,3})\\b`, 'i'),
            new RegExp(`\\b(\\d{1,3})[- ]year[- ]old\\b.{0,60}\\b${escaped}\\b`, 'i'),
            new RegExp(`\\b${escaped}\\b.{0,60}\\b(\\d{1,3})[- ]year[- ]old\\b`, 'i'),
        ];
        for (const pattern of agePatterns) {
            const ageMatch = text.match(pattern);
            if (ageMatch) {
                const n = Number(ageMatch[1]);
                if (n >= 1 && n <= 999) age = String(n);
                break;
            }
        }

        let sex = '';
        const maleScore = countMatches(text, /\b(he|him|his|man|boy|male|father|brother|son|husband|king|prince|uncle)\b/gi);
        const femaleScore = countMatches(text, /\b(she|her|hers|woman|girl|female|mother|sister|daughter|wife|queen|princess|aunt)\b/gi);
        if (femaleScore >= maleScore + 2) sex = 'Female';
        else if (maleScore >= femaleScore + 2) sex = 'Male';

        let relationship = '';
        const relations = [
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
        for (const [label, pattern] of relations) {
            if (pattern.test(text)) {
                relationship = label;
                break;
            }
        }

        return { relationship, age, sex };
    }

    function countMatches(text, pattern) {
        return (text.match(pattern) || []).length;
    }

    function renderScanResults(results) {
        const container = document.getElementById('enpc-scan-results');
        if (!results.length) {
            container.innerHTML = `<div class="enpc-empty">No likely character names were found. Add characters manually or load more chat messages.</div>`;
            document.getElementById('enpc-import').disabled = true;
            return;
        }

        document.getElementById('enpc-import').disabled = false;
        container.innerHTML = results.map((r, index) => `
            <label class="enpc-scan-item ${r.exists ? 'exists' : ''}">
                <input type="checkbox" data-scan-index="${index}" ${r.selected ? 'checked' : ''} ${r.exists ? 'disabled' : ''}>
                <span>
                    <strong>${escapeHtml(r.name)}</strong>
                    <small>${escapeHtml([
                        r.relationship || 'Relationship unknown',
                        r.sex || 'Sex unknown',
                        r.age ? `Age ${r.age}` : 'Age unknown'
                    ].join(' · '))}</small>
                    <em>${r.exists ? 'Already saved' : `${r.mentions} mention${r.mentions === 1 ? '' : 's'}`}</em>
                </span>
            </label>
        `).join('');

        container.dataset.results = JSON.stringify(results);
    }

    function importSelected() {
        const container = document.getElementById('enpc-scan-results');
        const results = JSON.parse(container.dataset.results || '[]');
        const checked = [...container.querySelectorAll('input[type="checkbox"]:checked')]
            .map(box => results[Number(box.dataset.scanIndex)])
            .filter(Boolean);

        if (!checked.length) {
            toast('warning', 'Select at least one character.');
            return;
        }

        const characters = loadCharacters();
        const existing = new Set(characters.map(c => c.name.toLowerCase()));

        for (const result of checked) {
            if (existing.has(result.name.toLowerCase())) continue;
            characters.push({
                ...emptyCharacter(),
                name: result.name,
                relationship: result.relationship || '',
                age: result.age || '',
                sex: result.sex || '',
                summary: '',
                notes: '',
                status: '',
            });
            existing.add(result.name.toLowerCase());
        }

        saveCharacters(characters);
        closeScan();
        renderList();
        toast('success', `Imported ${checked.length} character${checked.length === 1 ? '' : 's'}.`);
    }

    function subscribeToChatChanges() {
        const ctx = context();
        const source = ctx.eventSource;
        const types = ctx.event_types;
        if (!source || !types) return;

        const rerender = () => {
            if (panel?.classList.contains('open')) renderList();
        };

        for (const eventName of ['CHAT_CHANGED', 'GROUP_UPDATED', 'CHARACTER_DELETED']) {
            if (types[eventName]) source.on(types[eventName], rerender);
        }
    }

    function init() {
        createUi();
        console.log('[Encountered NPCs] v2.2.0 loaded');
    }

    return { init };
})();

function startEncounteredNpcs() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ENPC.init(), { once: true });
    } else {
        ENPC.init();
    }
}

startEncounteredNpcs();
