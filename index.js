const EXTENSION_ID = 'encountered_npcs_og';
const STORAGE_KEY = `${EXTENSION_ID}_data`;
let started = false;

function context() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function chatKey() {
    const ctx = context();
    if (!ctx) return 'default';

    if (ctx.groupId !== null && ctx.groupId !== undefined) {
        return `group:${ctx.groupId}`;
    }

    if (ctx.characterId !== null && ctx.characterId !== undefined) {
        const character = ctx.characters?.[ctx.characterId];
        return `character:${character?.avatar || character?.name || ctx.characterId}`;
    }

    return 'default';
}

function readAll() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

function readEntries() {
    const all = readAll();
    return Array.isArray(all[chatKey()]) ? all[chatKey()] : [];
}

function saveEntries(entries) {
    const all = readAll();
    all[chatKey()] = entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function escapeHtml(value = '') {
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
}

function makeId() {
    return globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toast(message, type = 'success') {
    if (globalThis.toastr?.[type]) globalThis.toastr[type](message);
    else console.log(`[Encountered NPCs] ${message}`);
}

function addUi() {
    if (document.getElementById('enpc-og-button')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <button id="enpc-og-button" title="Encountered NPCs" type="button">
            <i class="fa-solid fa-address-book"></i>
        </button>

        <section id="enpc-og-panel" aria-hidden="true">
            <header>
                <strong>Encountered NPCs</strong>
                <button id="enpc-og-close" type="button">×</button>
            </header>

            <div class="enpc-og-tools">
                <input id="enpc-og-search" type="search" placeholder="Search">
                <button id="enpc-og-add" type="button">Add</button>
                <button id="enpc-og-scan" type="button">Scan Chat</button>
            </div>

            <div id="enpc-og-list"></div>
        </section>

        <div id="enpc-og-modal" hidden>
            <form id="enpc-og-form">
                <h3 id="enpc-og-title">Add Character</h3>

                <label>
                    Status
                    <input name="status" maxlength="20" placeholder="Alive, Missing, ❤️">
                </label>

                <label>
                    Name
                    <input name="name" maxlength="100" required>
                </label>

                <label>
                    Relationship
                    <input name="relationship" maxlength="100" placeholder="Friend, rival, sister...">
                </label>

                <div class="enpc-og-actions">
                    <button id="enpc-og-delete" type="button">Delete</button>
                    <span></span>
                    <button id="enpc-og-cancel" type="button">Cancel</button>
                    <button type="submit">Save</button>
                </div>
            </form>
        </div>

        <div id="enpc-og-scan-modal" hidden>
            <div class="enpc-og-scan-box">
                <h3>Scan Local Chat</h3>
                <p>Review names before importing.</p>
                <div id="enpc-og-scan-results"></div>
                <div class="enpc-og-actions">
                    <span></span>
                    <button id="enpc-og-scan-cancel" type="button">Cancel</button>
                    <button id="enpc-og-import" type="button">Import Selected</button>
                </div>
            </div>
        </div>
    `);

    document.getElementById('enpc-og-button').addEventListener('click', openPanel);
    document.getElementById('enpc-og-close').addEventListener('click', closePanel);
    document.getElementById('enpc-og-add').addEventListener('click', () => openEditor());
    document.getElementById('enpc-og-search').addEventListener('input', render);
    document.getElementById('enpc-og-form').addEventListener('submit', saveForm);
    document.getElementById('enpc-og-cancel').addEventListener('click', closeEditor);
    document.getElementById('enpc-og-delete').addEventListener('click', deleteEntry);
    document.getElementById('enpc-og-scan').addEventListener('click', scanChat);
    document.getElementById('enpc-og-scan-cancel').addEventListener('click', closeScan);
    document.getElementById('enpc-og-import').addEventListener('click', importSelected);

    const ctx = context();
    if (ctx?.eventSource && ctx?.event_types?.CHAT_CHANGED) {
        ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, render);
    }

    render();
    console.info('[Encountered NPCs OG] loaded');
}

function openPanel() {
    const panel = document.getElementById('enpc-og-panel');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    render();
}

function closePanel() {
    const panel = document.getElementById('enpc-og-panel');
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
}

let editingId = null;

function openEditor(id = null) {
    editingId = id;
    const form = document.getElementById('enpc-og-form');
    const entry = id ? readEntries().find(item => item.id === id) : null;

    form.reset();
    form.elements.status.value = entry?.status || '';
    form.elements.name.value = entry?.name || '';
    form.elements.relationship.value = entry?.relationship || '';

    document.getElementById('enpc-og-title').textContent =
        entry ? 'Edit Character' : 'Add Character';
    document.getElementById('enpc-og-delete').hidden = !entry;
    document.getElementById('enpc-og-modal').hidden = false;
}

function closeEditor() {
    document.getElementById('enpc-og-modal').hidden = true;
    editingId = null;
}

function saveForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    if (!name) return;

    const entries = readEntries();
    const data = {
        id: editingId || makeId(),
        status: form.elements.status.value.trim(),
        name,
        relationship: form.elements.relationship.value.trim()
    };

    const index = entries.findIndex(item => item.id === editingId);
    if (index >= 0) entries[index] = data;
    else entries.push(data);

    saveEntries(entries);
    closeEditor();
    render();
    toast('Character saved.');
}

function deleteEntry() {
    if (!editingId || !confirm('Delete this character?')) return;
    saveEntries(readEntries().filter(item => item.id !== editingId));
    closeEditor();
    render();
}

function render() {
    const list = document.getElementById('enpc-og-list');
    if (!list) return;

    const query = document.getElementById('enpc-og-search')?.value.trim().toLowerCase() || '';
    const entries = readEntries()
        .filter(item => !query || [item.name, item.status, item.relationship]
            .some(value => String(value || '').toLowerCase().includes(query)))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (!entries.length) {
        list.innerHTML = '<div class="enpc-og-empty">No characters saved for this chat.</div>';
        return;
    }

    list.innerHTML = entries.map(item => `
        <button class="enpc-og-card" type="button" data-id="${escapeHtml(item.id)}">
            <span class="enpc-og-status">${escapeHtml(item.status || '•')}</span>
            <span>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.relationship || 'Relationship unknown')}</small>
            </span>
        </button>
    `).join('');

    list.querySelectorAll('.enpc-og-card').forEach(button => {
        button.addEventListener('click', () => openEditor(button.dataset.id));
    });
}

function loadedMessages() {
    const ctx = context();

    if (Array.isArray(ctx?.chat)) {
        return ctx.chat.map(message => ({
            name: String(message?.name || '').trim(),
            text: String(message?.mes || '').replace(/<[^>]+>/g, ' ').trim(),
            isUser: Boolean(message?.is_user)
        }));
    }

    return [...document.querySelectorAll('#chat .mes')].map(element => ({
        name: String(
            element.getAttribute('ch_name')
            || element.querySelector('.name_text')?.textContent
            || ''
        ).trim(),
        text: String(element.querySelector('.mes_text')?.textContent || '').trim(),
        isUser: element.getAttribute('is_user') === 'true'
    }));
}

function validName(name) {
    if (!name || name.length < 2 || name.length > 50) return false;
    if (/^(user|assistant|system|narrator|you|the|this|that|she|he|they)$/i.test(name)) return false;
    return /^[\p{L}][\p{L}\p{M}'’ -]+$/u.test(name);
}

function inferRelationship(name, text) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`.{0,150}\\b${escaped}\\b.{0,150}`, 'i'));
    const nearby = match?.[0] || '';

    const rules = [
        ['Best Friend', /\bbest friend\b/i],
        ['Friend', /\bfriend\b/i],
        ['Rival', /\brival\b/i],
        ['Enemy', /\benemy\b/i],
        ['Teacher', /\b(teacher|mentor|professor)\b/i],
        ['Boss', /\b(boss|manager)\b/i],
        ['Classmate', /\bclassmate\b/i],
        ['Coworker', /\b(coworker|colleague)\b/i],
        ['Sister', /\bsister\b/i],
        ['Brother', /\bbrother\b/i],
        ['Mother', /\bmother\b/i],
        ['Father', /\bfather\b/i],
        ['Girlfriend', /\bgirlfriend\b/i],
        ['Boyfriend', /\bboyfriend\b/i],
        ['Wife', /\bwife\b/i],
        ['Husband', /\bhusband\b/i]
    ];

    return rules.find(([, regex]) => regex.test(nearby))?.[0] || '';
}

function scanChat() {
    const messages = loadedMessages();
    if (!messages.length) {
        toast('No loaded messages found.', 'warning');
        return;
    }

    const names = new Map();
    const fullText = messages.map(message => message.text).join('\n');

    for (const message of messages) {
        if (!message.isUser && validName(message.name)) {
            names.set(message.name.toLowerCase(), message.name);
        }

        const patterns = [
            /\b([A-Z][A-Za-z'’-]{2,24})\s+(?:said|asked|replied|whispered|shouted|smiled|nodded)\b/g,
            /\b(?:Mr|Mrs|Ms|Miss|Dr|Lady|Lord|Prince|Princess)\.?\s+([A-Z][A-Za-z'’-]{2,24})\b/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(message.text))) {
                if (validName(match[1])) names.set(match[1].toLowerCase(), match[1]);
            }
        }
    }

    const existing = new Set(readEntries().map(item => item.name.toLowerCase()));
    const results = [...names.values()]
        .filter(name => !existing.has(name.toLowerCase()))
        .map(name => ({
            name,
            relationship: inferRelationship(name, fullText)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const box = document.getElementById('enpc-og-scan-results');
    box.dataset.results = JSON.stringify(results);

    box.innerHTML = results.length
        ? results.map((item, index) => `
            <label class="enpc-og-result">
                <input type="checkbox" data-index="${index}" checked>
                <span>
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${escapeHtml(item.relationship || 'Relationship unknown')}</small>
                </span>
            </label>
        `).join('')
        : '<div class="enpc-og-empty">No new names found.</div>';

    document.getElementById('enpc-og-import').disabled = !results.length;
    document.getElementById('enpc-og-scan-modal').hidden = false;
}

function closeScan() {
    document.getElementById('enpc-og-scan-modal').hidden = true;
}

function importSelected() {
    const box = document.getElementById('enpc-og-scan-results');
    const results = JSON.parse(box.dataset.results || '[]');
    const entries = readEntries();

    for (const checkbox of box.querySelectorAll('input[type="checkbox"]:checked')) {
        const result = results[Number(checkbox.dataset.index)];
        if (!result) continue;

        entries.push({
            id: makeId(),
            status: '',
            name: result.name,
            relationship: result.relationship || ''
        });
    }

    saveEntries(entries);
    closeScan();
    render();
    toast('Selected characters imported.');
}

export function onActivate() {
    if (started) return;
    started = true;
    addUi();
}
