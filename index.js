const MODULE = 'encountered_npcs_v2';
const STORAGE_PREFIX = `${MODULE}:chat:`;
const SETTINGS_KEY = `${MODULE}:settings`;
const VERSION = '2.1.0';

const STATUS_OPTIONS = [
    ['❓', 'Unknown'],
    ['😐', 'Neutral'],
    ['😊', 'Friend'],
    ['🤝', 'Ally'],
    ['❤️', 'Romance'],
    ['👑', 'Family'],
    ['🎓', 'Mentor'],
    ['😠', 'Rival'],
    ['⚔️', 'Enemy'],
    ['💀', 'Dead'],
];

const DEFAULT_SETTINGS = {
    panelOpen: true,
    x: null,
    y: 72,
    width: 700,
    height: 460,
};

let data = blankData();
let currentChatKey = '';
let saveTimer = null;
let scanRunning = false;

function context() {
    return SillyTavern.getContext();
}

function blankData() {
    return { npcs: [], updatedAt: Date.now() };
}

function makeId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map(v => v.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    }

    return `enpc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeText(value, maxLength, fallback = '') {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ');
    return (text || fallback).slice(0, maxLength);
}

function normalizeMultiline(value, maxLength) {
    return String(value ?? '').replace(/\r/g, '').trim().slice(0, maxLength);
}

function normalizeName(value) {
    return normalizeText(value, 80);
}

function normalizeRelationship(value) {
    return normalizeText(value, 80, 'Unknown');
}

function normalizeSummary(value) {
    return normalizeText(value, 220);
}

function inferStatus(status, relationship) {
    const raw = String(status ?? '').trim();
    if (STATUS_OPTIONS.some(([emoji]) => emoji === raw)) return raw;

    const text = `${raw} ${relationship}`.toLowerCase();

    if (/(dead|deceased|killed)/.test(text)) return '💀';
    if (/(enemy|hostile|villain|antagonist)/.test(text)) return '⚔️';
    if (/(rival|competitor)/.test(text)) return '😠';
    if (/(master|mentor|teacher|sensei|shifu)/.test(text)) return '🎓';
    if (/(mother|father|sister|brother|aunt|uncle|cousin|daughter|son|family|wife|husband|spouse)/.test(text)) return '👑';
    if (/(lover|girlfriend|boyfriend|romance|romantic|fianc|crush)/.test(text)) return '❤️';
    if (/(ally|companion|teammate)/.test(text)) return '🤝';
    if (/(friend|friendly|best friend)/.test(text)) return '😊';
    if (/(neutral|acquaintance|stranger|encountered)/.test(text)) return '😐';

    return '❓';
}

function loadSettings() {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getChatKey() {
    const c = context();
    const stable = c.chatId ?? c.chat_id ?? c.chatFile ?? c.chat_file_name;
    if (stable) return String(stable);

    const character = c.characterId ?? c.character_id ?? c.name2 ?? 'character';
    const firstMessage = Array.isArray(c.chat) && c.chat.length
        ? String(c.chat[0]?.mes || '').slice(0, 120)
        : 'empty';

    return `${character}:${firstMessage}`;
}

function storageKey() {
    currentChatKey = getChatKey();
    return STORAGE_PREFIX + encodeURIComponent(currentChatKey);
}

function migrateNpc(npc) {
    const relationship = normalizeRelationship(npc?.relationship);
    return {
        id: npc?.id || makeId(),
        name: normalizeName(npc?.name),
        status: inferStatus(npc?.status, relationship),
        relationship,
        summary: normalizeSummary(npc?.summary),
        notes: normalizeMultiline(npc?.notes, 5000),
        locked: Boolean(npc?.locked),
        createdAt: Number(npc?.createdAt) || Date.now(),
        updatedAt: Number(npc?.updatedAt) || Date.now(),
    };
}

function loadData() {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey()) || 'null');
        if (!parsed || !Array.isArray(parsed.npcs)) return blankData();

        return {
            npcs: parsed.npcs.map(migrateNpc).filter(npc => npc.name),
            updatedAt: Number(parsed.updatedAt) || Date.now(),
        };
    } catch (error) {
        console.error('[Encountered NPCs] Failed to load data:', error);
        return blankData();
    }
}

function persistData() {
    data.updatedAt = Date.now();
    localStorage.setItem(storageKey(), JSON.stringify(data));
}

function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
}

function findNpcByName(name) {
    const key = normalizeName(name).toLocaleLowerCase();
    return data.npcs.find(npc => npc.name.toLocaleLowerCase() === key);
}

function statusOptions(selected) {
    return STATUS_OPTIONS.map(([emoji, label]) =>
        `<option value="${emoji}" ${emoji === selected ? 'selected' : ''}>${emoji} ${escapeHtml(label)}</option>`
    ).join('');
}

function render() {
    const list = document.querySelector('#enpc-list');
    const count = document.querySelector('#enpc-count');
    if (!list || !count) return;

    count.textContent = String(data.npcs.length);

    const query = normalizeText(document.querySelector('#enpc-search')?.value, 200).toLowerCase();
    const rows = [...data.npcs]
        .filter(npc => {
            if (!query) return true;
            return npc.name.toLowerCase().includes(query)
                || npc.relationship.toLowerCase().includes(query)
                || npc.summary.toLowerCase().includes(query)
                || npc.notes.toLowerCase().includes(query);
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    if (!rows.length) {
        list.innerHTML = '<div class="enpc-empty">No characters found.</div>';
        return;
    }

    list.innerHTML = rows.map(npc => `
        <button class="enpc-row" data-id="${escapeHtml(npc.id)}" type="button">
            <span class="enpc-status">${escapeHtml(npc.status)}</span>
            <span class="enpc-name" title="${escapeHtml(npc.name)}">${escapeHtml(npc.name)}</span>
            <span class="enpc-relationship" title="${escapeHtml(npc.relationship)}">${escapeHtml(npc.relationship)}</span>
            <span class="enpc-summary" title="${escapeHtml(npc.summary)}">${escapeHtml(npc.summary || '—')}</span>
            ${npc.locked ? '<span class="enpc-lock" title="Locked from scan updates">🔒</span>' : '<span></span>'}
        </button>
    `).join('');

    list.querySelectorAll('.enpc-row').forEach(row => {
        row.addEventListener('click', () => openEditor(row.dataset.id));
    });
}

function openEditor(id = null) {
    const npc = id ? data.npcs.find(item => item.id === id) : null;
    const overlay = document.createElement('div');
    overlay.className = 'enpc-overlay';

    overlay.innerHTML = `
        <form class="enpc-modal">
            <h3>${npc ? 'Edit Character' : 'Add Character'}</h3>

            <label for="enpc-name-input">Name</label>
            <input id="enpc-name-input" type="text" maxlength="80" value="${escapeHtml(npc?.name || '')}" required>

            <label for="enpc-status-input">Status</label>
            <select id="enpc-status-input">${statusOptions(npc?.status || '❓')}</select>

            <label for="enpc-relationship-input">Relationship</label>
            <input id="enpc-relationship-input" type="text" maxlength="80"
                   value="${escapeHtml(npc?.relationship || 'Unknown')}" required>

            <label for="enpc-summary-input">Summary</label>
            <textarea id="enpc-summary-input" maxlength="220" rows="3"
                      placeholder="Short description of this character">${escapeHtml(npc?.summary || '')}</textarea>

            <label for="enpc-notes-input">Your Notes</label>
            <textarea id="enpc-notes-input" maxlength="5000" rows="7"
                      placeholder="Anything you want to remember. Scan never overwrites this field.">${escapeHtml(npc?.notes || '')}</textarea>

            <label class="enpc-check">
                <input id="enpc-lock-input" type="checkbox" ${npc?.locked ? 'checked' : ''}>
                Lock status, relationship, and summary from scan updates
            </label>

            <div class="enpc-actions">
                ${npc ? '<button id="enpc-delete" type="button" class="menu_button redWarningBG">Delete</button>' : '<span></span>'}
                <span></span>
                <button id="enpc-cancel" type="button" class="menu_button">Cancel</button>
                <button type="submit" class="menu_button">Save</button>
            </div>
        </form>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const form = overlay.querySelector('form');

    overlay.querySelector('#enpc-cancel').addEventListener('click', close);
    overlay.addEventListener('mousedown', event => {
        if (event.target === overlay) close();
    });

    form.addEventListener('submit', event => {
        event.preventDefault();

        try {
            const name = normalizeName(overlay.querySelector('#enpc-name-input').value);
            const relationship = normalizeRelationship(overlay.querySelector('#enpc-relationship-input').value);
            const summary = normalizeSummary(overlay.querySelector('#enpc-summary-input').value);
            const notes = normalizeMultiline(overlay.querySelector('#enpc-notes-input').value, 5000);
            const status = overlay.querySelector('#enpc-status-input').value;
            const locked = overlay.querySelector('#enpc-lock-input').checked;

            if (!name) {
                toastr.warning('Enter a character name.');
                return;
            }

            const duplicate = findNpcByName(name);
            if (duplicate && duplicate !== npc) {
                toastr.warning('A character with that name already exists.');
                return;
            }

            if (npc) {
                npc.name = name;
                npc.status = status;
                npc.relationship = relationship;
                npc.summary = summary;
                npc.notes = notes;
                npc.locked = locked;
                npc.updatedAt = Date.now();
            } else {
                data.npcs.push({
                    id: makeId(),
                    name,
                    status,
                    relationship,
                    summary,
                    notes,
                    locked,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            }

            persistData();
            render();
            toastr.success('Character saved.');
            close();
        } catch (error) {
            console.error('[Encountered NPCs] Save failed:', error);
            toastr.error(`Save failed: ${error.message}`);
        }
    });

    overlay.querySelector('#enpc-delete')?.addEventListener('click', () => {
        data.npcs = data.npcs.filter(item => item.id !== npc.id);
        persistData();
        render();
        toastr.success('Character deleted.');
        close();
    });

    setTimeout(() => overlay.querySelector('#enpc-name-input')?.focus(), 0);
}

function getChatText() {
    const c = context();
    const messages = Array.isArray(c.chat) ? c.chat : [];

    return messages
        .filter(message => message && message.mes)
        .map(message => {
            const speaker = message.is_user ? (c.name1 || 'User') : (message.name || c.name2 || 'Character');
            const text = String(message.mes)
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            return `${speaker}: ${text}`;
        })
        .join('\n')
        .slice(-45000);
}

function localScanNpcs() {
    const c = context();
    const messages = Array.isArray(c.chat) ? c.chat : [];
    const excluded = new Set([
        normalizeName(c.name1).toLowerCase(), normalizeName(c.name2).toLowerCase(),
        'user','assistant','system','narrator','you','i','he','she','they','we'
    ].filter(Boolean));
    const counts = new Map();
    const displayNames = new Map();
    const addCandidate = (rawName, weight = 1) => {
        const name = normalizeName(rawName).replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9'’ -]+$/, '').trim();
        if (!name || name.length < 2 || name.length > 60) return;
        const key = name.toLowerCase();
        if (excluded.has(key)) return;
        const words = name.split(/\\s+/);
        if (words.length > 4 || /^\\d+$/.test(name) || /[<>={}\\[\\]\\\\]/.test(name)) return;
        const blocked = new Set(['The','This','That','These','Those','Chapter','Scene','Later','Morning','Evening','Night','Today','Tomorrow','Yesterday','Unknown','Friend','Enemy','Master','Aunt','Uncle','Mother','Father','Sister','Brother','Lady','Lord','Miss','Mister']);
        if (words.length === 1 && blocked.has(words[0])) return;
        counts.set(key,(counts.get(key)||0)+weight);
        if (!displayNames.has(key) || weight > 1) displayNames.set(key,name);
    };
    for (const message of messages) {
        if (!message || message.is_user) continue;
        const speaker = normalizeName(message.name);
        if (speaker && speaker.toLowerCase() !== normalizeName(c.name2).toLowerCase()) addCandidate(speaker,5);
    }
    const text = getChatText();
    const patterns = [
        /\\b(?:Aunt|Uncle|Lady|Lord|Master|Teacher|Doctor|Dr|Professor|Captain|General|Princess|Prince|Queen|King|Sister|Brother|Mother|Father|Miss|Mr|Mrs|Ms)\\s+[A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+)?\\b/g,
        /\\b[A-Z][A-Za-z'’-]{1,24}(?:\\s+[A-Z][A-Za-z'’-]{1,24}){1,2}\\b/g,
    ];
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) addCandidate(match[0],1);
    const rows=[...counts.entries()].filter(([,count])=>count>=2).map(([key,count])=>({name:displayNames.get(key),relationship:'Unknown',summary:'',status:'❓',_score:count})).sort((a,b)=>b._score-a._score||a.name.localeCompare(b.name)).slice(0,40).map(({_score,...row})=>row);
    return normalizeScanRows(rows);
}

function openScanReview(rows) {
    const overlay = document.createElement('div');
    overlay.className = 'enpc-overlay';

    const cards = rows.map((row, index) => {
        const existing = findNpcByName(row.name);
        const locked = existing?.locked;
        const label = existing ? (locked ? 'Existing · locked' : 'Existing · can update') : 'New character';

        return `
            <label class="enpc-scan-card ${locked ? 'enpc-scan-locked' : ''}">
                <input class="enpc-scan-check" type="checkbox" data-index="${index}" ${locked ? '' : 'checked'}>
                <span class="enpc-scan-emoji">${escapeHtml(row.status)}</span>
                <span class="enpc-scan-info">
                    <strong>${escapeHtml(row.name)}</strong>
                    <small>${escapeHtml(label)}</small>
                    <span>${escapeHtml(row.relationship)} · ${escapeHtml(row.summary || 'No summary')}</span>
                </span>
            </label>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="enpc-modal enpc-scan-modal">
            <h3>Scan Results</h3>
            <p class="enpc-help">Choose the names to save. Existing unlocked characters update status, relationship, and summary. Your notes are never overwritten.</p>
            <div class="enpc-scan-list">${cards}</div>
            <div class="enpc-actions enpc-scan-actions">
                <span></span>
                <span></span>
                <button id="enpc-scan-cancel" type="button" class="menu_button">Cancel</button>
                <button id="enpc-scan-import" type="button" class="menu_button">Save Selected</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();

    overlay.querySelector('#enpc-scan-cancel').addEventListener('click', close);
    overlay.addEventListener('mousedown', event => {
        if (event.target === overlay) close();
    });

    overlay.querySelector('#enpc-scan-import').addEventListener('click', () => {
        const selected = [...overlay.querySelectorAll('.enpc-scan-check:checked')]
            .map(input => rows[Number(input.dataset.index)])
            .filter(Boolean);

        if (!selected.length) {
            toastr.warning('Select at least one character.');
            return;
        }

        let added = 0;
        let updated = 0;
        let skipped = 0;

        for (const row of selected) {
            const existing = findNpcByName(row.name);

            if (existing) {
                if (existing.locked) {
                    skipped++;
                    continue;
                }

                existing.status = row.status;
                existing.relationship = row.relationship;
                if (row.summary) existing.summary = row.summary;
                existing.updatedAt = Date.now();
                updated++;
            } else {
                data.npcs.push({
                    id: makeId(),
                    ...row,
                    notes: '',
                    locked: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                added++;
            }
        }

        persistData();
        render();
        toastr.success(`Saved ${added} new and updated ${updated}${skipped ? `; skipped ${skipped} locked` : ''}.`);
        close();
    });
}

async function scanNpcs() {
    if (scanRunning) return;
    const button = document.querySelector('#enpc-scan');
    scanRunning = true;
    if (button) { button.disabled = true; button.textContent = 'Scanning chat…'; }
    try {
        const rows = localScanNpcs();
        if (!rows.length) { toastr.info('No likely NPC names were found in the current chat. You can still add one manually.'); return; }
        openScanReview(rows);
    } catch (error) {
        console.error('[Encountered NPCs] Local scan failed:', error);
        toastr.error(`Local NPC scan failed: ${error.message}`);
    } finally {
        scanRunning = false;
        if (button) { button.disabled = false; button.textContent = '🔍 Scan Chat'; }
    }
}

function makeDraggable(panel, handle) {
    let drag = null;

    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button')) return;

        const rect = panel.getBoundingClientRect();
        drag = {
            dx: event.clientX - rect.left,
            dy: event.clientY - rect.top,
        };

        handle.setPointerCapture(event.pointerId);
        panel.classList.add('enpc-moving');
        event.preventDefault();
    });

    handle.addEventListener('pointermove', event => {
        if (!drag) return;

        const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - 44);

        panel.style.left = `${Math.min(maxX, Math.max(0, event.clientX - drag.dx))}px`;
        panel.style.top = `${Math.min(maxY, Math.max(0, event.clientY - drag.dy))}px`;
        panel.style.right = 'auto';
    });

    const stop = event => {
        if (!drag) return;
        drag = null;
        panel.classList.remove('enpc-moving');

        const rect = panel.getBoundingClientRect();
        const settings = loadSettings();
        settings.x = Math.round(rect.left);
        settings.y = Math.round(rect.top);
        settings.width = Math.round(rect.width);
        settings.height = Math.round(rect.height);
        saveSettings(settings);

        try {
            handle.releasePointerCapture(event.pointerId);
        } catch {}
    };

    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
}

function observeSize(panel) {
    const observer = new ResizeObserver(() => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            const rect = panel.getBoundingClientRect();
            if (rect.width < 100 || rect.height < 80) return;

            const settings = loadSettings();
            settings.width = Math.round(rect.width);
            settings.height = Math.round(rect.height);
            saveSettings(settings);
        }, 200);
    });

    observer.observe(panel);
}

function buildPanel() {
    if (document.querySelector('#enpc-panel')) return;

    const settings = loadSettings();
    const panel = document.createElement('aside');
    panel.id = 'enpc-panel';
    panel.className = settings.panelOpen ? '' : 'enpc-collapsed';
    panel.style.width = `${Math.max(500, settings.width)}px`;
    panel.style.height = `${Math.max(260, settings.height)}px`;
    panel.style.top = `${Math.max(0, settings.y)}px`;

    if (Number.isFinite(settings.x)) {
        panel.style.left = `${Math.max(0, settings.x)}px`;
        panel.style.right = 'auto';
    }

    panel.innerHTML = `
        <div id="enpc-drag-handle" class="enpc-header" title="Drag to move">
            <button id="enpc-collapse" type="button" title="Collapse">☰</button>
            <strong>Characters</strong>
            <span id="enpc-count">0</span>
            <button id="enpc-add" type="button" title="Add character">＋</button>
        </div>

        <div class="enpc-body">
            <div class="enpc-toolbar">
                <button id="enpc-scan" type="button" class="menu_button">🔍 Scan Chat</button>
                <input id="enpc-search" type="search" placeholder="Search name, relationship, summary, or notes…">
            </div>

            <div class="enpc-columns">
                <span>Status</span>
                <span>Name</span>
                <span>Relationship</span>
                <span>Summary</span>
                <span></span>
            </div>

            <div id="enpc-list"></div>

            <div class="enpc-footer">
                <button id="enpc-reset-position" type="button" class="menu_button" title="Reset panel position and size">Reset panel</button>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    makeDraggable(panel, panel.querySelector('#enpc-drag-handle'));
    observeSize(panel);

    panel.querySelector('#enpc-collapse').addEventListener('click', () => {
        panel.classList.toggle('enpc-collapsed');
        const next = loadSettings();
        next.panelOpen = !panel.classList.contains('enpc-collapsed');
        saveSettings(next);
    });

    panel.querySelector('#enpc-add').addEventListener('click', () => openEditor());
    panel.querySelector('#enpc-scan').addEventListener('click', scanNpcs);
    panel.querySelector('#enpc-search').addEventListener('input', render);

    panel.querySelector('#enpc-reset-position').addEventListener('click', () => {
        const next = { ...DEFAULT_SETTINGS };
        saveSettings(next);

        panel.classList.remove('enpc-collapsed');
        panel.style.left = 'auto';
        panel.style.right = '10px';
        panel.style.top = `${DEFAULT_SETTINGS.y}px`;
        panel.style.width = `${DEFAULT_SETTINGS.width}px`;
        panel.style.height = `${DEFAULT_SETTINGS.height}px`;

        render();
    });
}

function switchChat() {
    const nextKey = getChatKey();
    if (nextKey === currentChatKey) return;

    currentChatKey = nextKey;
    data = loadData();
    render();
}

function initialize() {
    currentChatKey = getChatKey();
    data = loadData();
    buildPanel();
    render();

    const c = context();
    c.eventSource.on(c.event_types.CHAT_CHANGED, () => {
        currentChatKey = '';
        setTimeout(switchChat, 50);
    });

    console.log(`[Encountered NPCs] v${VERSION} loaded`);
}

const c = context();
c.eventSource.on(c.event_types.APP_READY, initialize);
