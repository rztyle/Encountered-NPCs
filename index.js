const MODULE = 'encountered_npcs_v2';
const STORAGE_PREFIX = `${MODULE}:chat:`;
const SETTINGS_KEY = `${MODULE}:settings`;
const VERSION = '1.0.2';

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
    width: 620,
    height: 420,
};

let data = blankData();
let currentChatKey = '';
let analyzing = false;
let saveTimer = null;

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

function normalizeName(value) {
    return normalizeText(value, 80);
}

function normalizeRelationship(value) {
    return normalizeText(value, 80, 'Unknown');
}

function normalizeSummary(value) {
    return normalizeText(value, 160);
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

function upsertNpc(input, force = false) {
    const name = normalizeName(input?.name);
    if (!name) return false;

    const relationship = normalizeRelationship(input?.relationship);
    const summary = normalizeSummary(input?.summary);
    const status = inferStatus(input?.status, relationship);
    const existing = findNpcByName(name);

    if (existing) {
        if (existing.locked && !force) return false;

        const nextSummary = summary || existing.summary || '';
        const changed =
            existing.name !== name ||
            existing.status !== status ||
            existing.relationship !== relationship ||
            existing.summary !== nextSummary;

        existing.name = name;
        existing.status = status;
        existing.relationship = relationship;
        existing.summary = nextSummary;
        existing.updatedAt = Date.now();
        return changed;
    }

    data.npcs.push({
        id: makeId(),
        name,
        status,
        relationship,
        summary,
        locked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    return true;
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
                || npc.summary.toLowerCase().includes(query);
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
            ${npc.locked ? '<span class="enpc-lock" title="Locked">🔒</span>' : '<span></span>'}
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
            <textarea id="enpc-summary-input" maxlength="160" rows="3"
                      placeholder="Short description of who this character is">${escapeHtml(npc?.summary || '')}</textarea>

            <label class="enpc-check">
                <input id="enpc-lock-input" type="checkbox" ${npc?.locked ? 'checked' : ''}>
                Lock this character from automatic changes
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
            const status = overlay.querySelector('#enpc-status-input').value;
            const locked = overlay.querySelector('#enpc-lock-input').checked;

            if (!name) {
                toastr.warning('Enter a character name.');
                return;
            }

            if (npc) {
                npc.name = name;
                npc.status = status;
                npc.relationship = relationship;
                npc.summary = summary;
                npc.locked = locked;
                npc.updatedAt = Date.now();
            } else {
                upsertNpc({ name, status, relationship, summary }, true);
                const added = findNpcByName(name);
                if (added) added.locked = locked;
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

function responseText(raw) {
    if (typeof raw === 'string') return raw;
    if (raw == null) return '';

    if (Array.isArray(raw)) {
        return raw.map(responseText).filter(Boolean).join('\n');
    }

    if (typeof raw === 'object') {
        const directKeys = [
            'text',
            'content',
            'response',
            'result',
            'message',
            'output',
            'data',
        ];

        for (const key of directKeys) {
            const value = raw[key];
            if (typeof value === 'string') return value;
            if (value && typeof value === 'object') {
                const nested = responseText(value);
                if (nested) return nested;
            }
        }

        if (Array.isArray(raw.choices)) {
            const choices = raw.choices
                .map(choice => responseText(choice?.message?.content ?? choice?.text ?? choice))
                .filter(Boolean);

            if (choices.length) return choices.join('\n');
        }

        try {
            return JSON.stringify(raw);
        } catch {
            return String(raw);
        }
    }

    return String(raw);
}

function cleanModelText(raw) {
    return responseText(raw)
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
        .replace(/```(?:json|javascript|js|text|txt|csv|tsv)?/gi, '')
        .replace(/```/g, '')
        .trim();
}

function normalizeParsedRow(row) {
    if (!row || typeof row !== 'object') return null;

    const name = normalizeName(
        row.name ?? row.character ?? row.characterName ?? row.npc ?? row.full_name
    );

    if (!name) return null;

    const relationship = normalizeRelationship(
        row.relationship ?? row.relation ?? row.role ?? row.connection ?? 'Unknown'
    );

    const summary = normalizeSummary(
        row.summary ?? row.description ?? row.note ?? row.details ?? row.identity ?? ''
    );

    return {
        name,
        status: inferStatus(row.status ?? row.emoji ?? row.icon, relationship),
        relationship,
        summary,
    };
}

function parseAnalysis(raw) {
    const text = cleanModelText(raw);
    if (!text) return [];

    const candidates = [text];

    const firstObject = text.indexOf('{');
    const lastObject = text.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject) {
        candidates.push(text.slice(firstObject, lastObject + 1));
    }

    const firstArray = text.indexOf('[');
    const lastArray = text.lastIndexOf(']');
    if (firstArray >= 0 && lastArray > firstArray) {
        candidates.push(text.slice(firstArray, lastArray + 1));
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const rows = Array.isArray(parsed)
                ? parsed
                : parsed?.npcs ?? parsed?.characters ?? parsed?.results ?? parsed?.data;

            if (Array.isArray(rows)) {
                return rows.map(normalizeParsedRow).filter(Boolean);
            }

            const one = normalizeParsedRow(parsed);
            if (one) return [one];
        } catch {}
    }

    const rows = [];
    const lines = text.split(/\r?\n/);

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;

        // Ignore table separators and common headers.
        if (/^\|?\s*:?-{2,}/.test(line)) continue;
        if (/^\|?\s*(status|emoji|icon)\s*\|/i.test(line)) continue;
        if (/^\s*(name|character)\s*[:|]\s*(relationship|relation)/i.test(line)) continue;

        line = line
            .replace(/^[\s>*#•]+/, '')
            .replace(/^\d+[.)]\s*/, '')
            .replace(/\*\*/g, '')
            .replace(/`/g, '')
            .trim();

        // Markdown/pipe table: | emoji | Name | Relationship | Summary |
        if (line.includes('|')) {
            const parts = line
                .split('|')
                .map(part => part.trim())
                .filter(Boolean);

            if (parts.length >= 4 && STATUS_OPTIONS.some(([emoji]) => emoji === parts[0])) {
                rows.push(normalizeParsedRow({
                    status: parts[0],
                    name: parts[1],
                    relationship: parts[2],
                    summary: parts.slice(3).join(' | '),
                }));
                continue;
            }

            if (parts.length >= 3) {
                rows.push(normalizeParsedRow({
                    name: parts[0],
                    relationship: parts[1],
                    summary: parts.slice(2).join(' | '),
                }));
                continue;
            }
        }

        // Tab-separated output.
        const tabs = line.split(/\t+/).map(part => part.trim()).filter(Boolean);
        if (tabs.length >= 4 && STATUS_OPTIONS.some(([emoji]) => emoji === tabs[0])) {
            rows.push(normalizeParsedRow({
                status: tabs[0],
                name: tabs[1],
                relationship: tabs[2],
                summary: tabs.slice(3).join(' '),
            }));
            continue;
        }

        // Emoji — Name — Relationship — Summary
        const dash = line.split(/\s+(?:—|–|-)\s+/).map(part => part.trim()).filter(Boolean);
        if (dash.length >= 4 && STATUS_OPTIONS.some(([emoji]) => emoji === dash[0])) {
            rows.push(normalizeParsedRow({
                status: dash[0],
                name: dash[1],
                relationship: dash[2],
                summary: dash.slice(3).join(' — '),
            }));
            continue;
        }

        // Name: X; Relationship: Y; Summary: Z; Status: emoji
        const nameMatch = line.match(/(?:name|character)\s*:\s*([^;]+)/i);
        const relationshipMatch = line.match(/(?:relationship|relation|role)\s*:\s*([^;]+)/i);
        const summaryMatch = line.match(/(?:summary|description|note)\s*:\s*([^;]+)/i);
        const statusMatch = line.match(/(?:status|emoji|icon)\s*:\s*([^\s;]+)/i);

        if (nameMatch && relationshipMatch) {
            rows.push(normalizeParsedRow({
                name: nameMatch[1],
                relationship: relationshipMatch[1],
                summary: summaryMatch?.[1] || '',
                status: statusMatch?.[1] || '',
            }));
        }
    }

    return rows.filter(Boolean);
}

function transcript() {
    const chat = context().chat || [];

    return chat.slice(-16).map(message => {
        const speaker = message.is_user ? 'PLAYER' : (message.name || 'NARRATOR');
        return `${speaker}: ${String(message.mes || '').slice(0, 5000)}`;
    }).join('\n\n');
}

async function requestCharacterAnalysis(prompt) {
    const c = context();

    // SillyTavern versions differ here. The most compatible form is the
    // positional signature with the prompt string as the first argument.
    // Passing an options object to older builds can make the model receive
    // "[object Object]" instead of the actual instructions.
    return await c.generateQuietPrompt(
        prompt,  // quietPrompt
        false,   // quietToLoud
        true,    // skipWorldInfo
        '',      // quietImage
        '',      // quietName
        700      // responseLength
    );
}

async function analyze() {
    if (analyzing) return;

    const c = context();
    if (!c.chat?.length) {
        toastr.info('There is no chat to analyze.');
        return;
    }

    analyzing = true;
    const button = document.querySelector('#enpc-analyze');

    if (button) {
        button.disabled = true;
        button.textContent = 'Analyzing…';
    }

    try {
        const existing = data.npcs.map(npc => ({
            name: npc.name,
            status: npc.status,
            relationship: npc.relationship,
            summary: npc.summary,
            locked: npc.locked,
        }));

        const prompt = `
Read the recent roleplay and update the named NPC list.

Return ONLY this JSON shape:
{"npcs":[{"name":"Name","status":"❓","relationship":"Short label","summary":"One short sentence."}]}

Allowed status values: ❓ 😐 😊 🤝 ❤️ 👑 🎓 😠 ⚔️ 💀

Requirements:
- Include named NPCs only.
- Do not include the player, narrator, locations, organizations, titles without names, or unnamed groups.
- Relationship examples: Aunt, Friend, Master, Enemy, Fiancée, Stranger.
- Summary must identify the NPC or explain why they matter.
- Summary must be no more than 160 characters.
- Keep useful existing data unless the story clearly changes it.
- Never change locked entries.
- Do not invent names.
- Return no explanation and no markdown.

Existing tracker:
${JSON.stringify(existing)}

Recent roleplay:
${transcript()}
        `.trim();

        let result = await requestCharacterAnalysis(prompt);
        console.debug('[Encountered NPCs] Raw analysis response:', result);

        let rows = parseAnalysis(result);

        // Some local roleplay models ignore JSON. Retry using a very simple line format.
        if (!rows.length) {
            const retryPrompt = `
Extract named NPCs from the roleplay below.

Output one NPC per line exactly like:
❓ | Name | Relationship | Short summary

Use only these first-column emojis:
❓ 😐 😊 🤝 ❤️ 👑 🎓 😠 ⚔️ 💀

Do not output headers, numbering, explanations, code fences, the player, narrator, places, factions, or unnamed people.

Recent roleplay:
${transcript()}
            `.trim();

            result = await c.generateQuietPrompt(
                retryPrompt,
                false,
                true,
                '',
                '',
                700
            );

            console.debug('[Encountered NPCs] Raw retry response:', result);
            rows = parseAnalysis(result);
        }

        if (!rows.length) {
            const rawPreview = cleanModelText(result).slice(0, 500);
            console.error('[Encountered NPCs] Unparsed model response preview:', rawPreview);
            throw new Error('The model did not return any recognizable NPC rows.');
        }

        let changed = false;
        for (const row of rows.slice(0, 200)) {
            changed = upsertNpc(row) || changed;
        }

        if (changed) {
            persistData();
            render();
            toastr.success(`Updated ${rows.length} character(s).`);
        } else {
            toastr.info('No character changes found.');
        }
    } catch (error) {
        console.error('[Encountered NPCs]', error);
        toastr.error(`Character analysis failed: ${error.message}`, '', {
            preventDuplicates: true,
        });
    } finally {
        analyzing = false;

        if (button) {
            button.disabled = false;
            button.textContent = 'Analyze now';
        }
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
    panel.style.width = `${Math.max(460, settings.width)}px`;
    panel.style.height = `${Math.max(240, settings.height)}px`;
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
            <input id="enpc-search" type="search" placeholder="Search characters…">

            <div class="enpc-columns">
                <span>Status</span>
                <span>Name</span>
                <span>Relationship</span>
                <span>Summary</span>
                <span></span>
            </div>

            <div id="enpc-list"></div>

            <div class="enpc-footer">
                <button id="enpc-analyze" type="button" class="menu_button">Analyze now</button>
                <button id="enpc-reset-position" type="button" class="menu_button" title="Reset position">⌖</button>
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
    panel.querySelector('#enpc-search').addEventListener('input', render);
    panel.querySelector('#enpc-analyze').addEventListener('click', analyze);

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
