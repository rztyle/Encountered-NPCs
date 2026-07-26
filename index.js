
const MODULE = 'encountered_npcs_v2';
const STORAGE_PREFIX = `${MODULE}:chat:`;
const SETTINGS_KEY = `${MODULE}:settings`;

const STATUS_OPTIONS = [
    ['❓', 'Unknown'],
    ['😐', 'Neutral / Acquaintance'],
    ['😊', 'Friend'],
    ['😁', 'Best Friend'],
    ['🤝', 'Ally'],
    ['❤️', 'Romantic Interest'],
    ['💕', 'Lover'],
    ['💍', 'Spouse / Fiancé(e)'],
    ['👑', 'Family'],
    ['🎓', 'Master / Mentor'],
    ['😒', 'Dislikes You'],
    ['😠', 'Rival'],
    ['⚔️', 'Enemy'],
    ['💔', 'Former Lover'],
    ['👻', 'Missing'],
    ['💀', 'Dead'],
];

const DEFAULT_SETTINGS = {
    autoAnalyze: false,
    panelOpen: true,
    x: null,
    y: 72,
    width: 360,
    height: 360,
};

let analyzing = false;
let currentChatKey = '';
let saveTimer = null;

function ctx() {
    return SillyTavern.getContext();
}

function loadSettings() {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(next) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

function getChatKey() {
    const c = ctx();
    const stable = c.chatId ?? c.chat_id ?? c.chatFile ?? c.chat_file_name;
    if (stable) return String(stable);

    const char = c.characterId ?? c.character_id ?? c.name2 ?? 'character';
    const first = Array.isArray(c.chat) && c.chat.length
        ? String(c.chat[0]?.mes || '').slice(0, 120)
        : 'empty';
    return `${char}:${first}`;
}

function storageKey() {
    currentChatKey = getChatKey();
    return STORAGE_PREFIX + encodeURIComponent(currentChatKey);
}

function blankData() {
    return { npcs: [], updatedAt: Date.now() };
}

function loadData() {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey()) || 'null');
        if (!parsed || !Array.isArray(parsed.npcs)) return blankData();
        return parsed;
    } catch {
        return blankData();
    }
}

let data = blankData();

function persistData() {
    data.updatedAt = Date.now();
    localStorage.setItem(storageKey(), JSON.stringify(data));
}

function normalizeName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeRelationship(value) {
    const text = String(value ?? 'Unknown').trim().replace(/\s+/g, ' ');
    return (text || 'Unknown').slice(0, 80);
}

function inferStatus(status, relationship) {
    const raw = String(status ?? '').trim();
    if (STATUS_OPTIONS.some(([emoji]) => emoji === raw)) return raw;

    const text = `${raw} ${relationship}`.toLowerCase();
    if (/(former lover|ex lover|ex-girlfriend|ex-boyfriend|former partner)/.test(text)) return '💔';
    if (/(wife|husband|spouse|fianc)/.test(text)) return '💍';
    if (/(lover|girlfriend|boyfriend|romantic partner)/.test(text)) return '💕';
    if (/(romantic|romance|love interest|crush)/.test(text)) return '❤️';
    if (/(best friend|closest friend)/.test(text)) return '😁';
    if (/(friend|friendly)/.test(text)) return '😊';
    if (/(ally|companion|teammate)/.test(text)) return '🤝';
    if (/(mother|father|sister|brother|aunt|uncle|cousin|daughter|son|family)/.test(text)) return '👑';
    if (/(master|mentor|teacher|sensei|shifu)/.test(text)) return '🎓';
    if (/(enemy|hostile|villain)/.test(text)) return '⚔️';
    if (/(rival)/.test(text)) return '😠';
    if (/(dislike|distrust|annoyed|hates you)/.test(text)) return '😒';
    if (/(dead|deceased|killed)/.test(text)) return '💀';
    if (/(missing|lost|whereabouts unknown)/.test(text)) return '👻';
    if (/(neutral|acquaintance|stranger)/.test(text)) return '😐';
    return '❓';
}

function upsertNpc(input, force = false) {
    const name = normalizeName(input?.name);
    if (!name) return false;

    const relationship = normalizeRelationship(input?.relationship);
    const status = inferStatus(input?.status, relationship);
    const key = name.toLocaleLowerCase();
    const existing = data.npcs.find(n => n.name.toLocaleLowerCase() === key);

    if (existing) {
        if (existing.locked && !force) return false;
        const changed =
            existing.name !== name ||
            existing.relationship !== relationship ||
            existing.status !== status;

        existing.name = name;
        existing.relationship = relationship;
        existing.status = status;
        existing.updatedAt = Date.now();
        return changed;
    }

    data.npcs.push({
        id: crypto.randomUUID(),
        name,
        status,
        relationship,
        locked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    return true;
}

function esc(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
}

function statusOptions(selected) {
    return STATUS_OPTIONS.map(([emoji, label]) =>
        `<option value="${emoji}" ${emoji === selected ? 'selected' : ''}>${emoji} ${esc(label)}</option>`
    ).join('');
}

function render() {
    const list = document.querySelector('#enpc-list');
    const count = document.querySelector('#enpc-count');
    if (!list || !count) return;

    count.textContent = data.npcs.length;
    const q = (document.querySelector('#enpc-search')?.value || '').toLowerCase().trim();
    const rows = [...data.npcs]
        .filter(n => !q || n.name.toLowerCase().includes(q) || n.relationship.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (!rows.length) {
        list.innerHTML = '<div class="enpc-empty">No NPCs encountered yet.</div>';
        return;
    }

    list.innerHTML = rows.map(n => `
        <button class="enpc-row" data-id="${n.id}" type="button">
            <span class="enpc-status">${esc(n.status)}</span>
            <span class="enpc-name">${esc(n.name)}</span>
            <span class="enpc-relation">${esc(n.relationship)}</span>
            ${n.locked ? '<span class="enpc-lock">🔒</span>' : ''}
        </button>
    `).join('');

    list.querySelectorAll('.enpc-row').forEach(row => {
        row.addEventListener('click', () => openEditor(row.dataset.id));
    });
}

function openEditor(id = null) {
    const npc = id ? data.npcs.find(n => n.id === id) : null;
    const overlay = document.createElement('div');
    overlay.className = 'enpc-overlay';
    overlay.innerHTML = `
        <form class="enpc-modal">
            <h3>${npc ? 'Edit NPC' : 'Add NPC'}</h3>

            <label>Name</label>
            <input id="enpc-name-input" type="text" maxlength="80" value="${esc(npc?.name || '')}" required>

            <label>Status</label>
            <select id="enpc-status-input">${statusOptions(npc?.status || '❓')}</select>

            <label>Relationship</label>
            <input id="enpc-relation-input" type="text" maxlength="80"
                   value="${esc(npc?.relationship || 'Unknown')}" required>

            <label class="enpc-check">
                <input id="enpc-lock-input" type="checkbox" ${npc?.locked ? 'checked' : ''}>
                Lock this row from automatic changes
            </label>

            <div class="enpc-actions">
                ${npc ? '<button id="enpc-delete" type="button" class="menu_button redWarningBG">Delete</button>' : ''}
                <span></span>
                <button id="enpc-cancel" type="button" class="menu_button">Cancel</button>
                <button type="submit" class="menu_button">Save</button>
            </div>
        </form>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('form');
    const close = () => overlay.remove();

    overlay.querySelector('#enpc-cancel').addEventListener('click', close);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

    form.addEventListener('submit', e => {
        e.preventDefault();

        const name = normalizeName(overlay.querySelector('#enpc-name-input').value);
        const relationship = normalizeRelationship(overlay.querySelector('#enpc-relation-input').value);
        const status = overlay.querySelector('#enpc-status-input').value;
        const locked = overlay.querySelector('#enpc-lock-input').checked;

        if (!name) {
            toastr.warning('Enter an NPC name.');
            return;
        }

        if (npc) {
            npc.name = name;
            npc.relationship = relationship;
            npc.status = status;
            npc.locked = locked;
            npc.updatedAt = Date.now();
        } else {
            upsertNpc({ name, relationship, status }, true);
            const added = data.npcs.find(n => n.name.toLowerCase() === name.toLowerCase());
            if (added) added.locked = locked;
        }

        persistData();
        render();
        toastr.success('NPC saved.');
        close();
    });

    overlay.querySelector('#enpc-delete')?.addEventListener('click', () => {
        data.npcs = data.npcs.filter(n => n.id !== npc.id);
        persistData();
        render();
        toastr.success('NPC deleted.');
        close();
    });

    setTimeout(() => overlay.querySelector('#enpc-name-input')?.focus(), 0);
}

function parseAnalysis(raw) {
    const text = String(raw || '').trim();

    const candidates = [
        text,
        text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    ];

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.push(text.slice(firstBrace, lastBrace + 1));
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const rows = Array.isArray(parsed) ? parsed : parsed?.npcs;
            if (Array.isArray(rows)) return rows;
        } catch {}
    }

    const rows = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine
            .replace(/^[\s>*#\-•\d.)]+/, '')
            .replace(/[*_`]/g, '')
            .trim();

        if (!line) continue;

        let match = line.match(/^([❓😐😊😁🤝❤️💕💍👑🎓😒😠⚔️💔👻💀])\s+(.+?)\s*(?:—|-|\||:)\s*(.+)$/u);
        if (match) {
            rows.push({ status: match[1], name: match[2], relationship: match[3] });
            continue;
        }

        match = line.match(/^(.+?)\s*(?:—|\||\t)\s*(.+)$/);
        if (match && match[1].length <= 80 && match[2].length <= 80) {
            rows.push({ name: match[1], relationship: match[2] });
            continue;
        }

        match = line.match(/^(.+?)\s*:\s*(.+)$/);
        if (match && !/^(relationship|status|name|npcs?)$/i.test(match[1])) {
            rows.push({ name: match[1], relationship: match[2] });
        }
    }

    return rows;
}

function transcript() {
    const chat = ctx().chat || [];
    return chat.slice(-12).map(m => {
        const who = m.is_user ? 'PLAYER' : (m.name || 'NARRATOR');
        return `${who}: ${String(m.mes || '').slice(0, 5000)}`;
    }).join('\n\n');
}

async function analyze(manual = true) {
    if (analyzing) return;
    const c = ctx();
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
        const existing = data.npcs.map(n => ({
            name: n.name,
            status: n.status,
            relationship: n.relationship,
            locked: n.locked,
        }));

        const prompt = `
Update an encountered-NPC relationship list from the recent roleplay.

Preferred output:
{"npcs":[{"name":"Name","status":"emoji","relationship":"short label"}]}

If you cannot produce JSON, output exactly one NPC per line:
emoji | Name | Relationship

Allowed emojis:
❓ unknown, 😐 neutral, 😊 friend, 😁 best friend, 🤝 ally,
❤️ romantic interest, 💕 lover, 💍 spouse/fiance, 👑 family,
🎓 master/mentor, 😒 dislikes player, 😠 rival, ⚔️ enemy,
💔 former lover, 👻 missing, 💀 dead.

Rules:
- Include only named NPCs who actually appear or directly interact in the story.
- Do not include the player, narrator, places, factions, unnamed roles, or generic groups.
- Keep relationship labels short.
- Preserve existing rows unless the recent story clearly changes them.
- Do not modify locked rows.
- Do not invent characters.

Existing rows:
${JSON.stringify(existing)}

Recent roleplay:
${transcript()}
        `.trim();

        const result = await c.generateQuietPrompt({ quietPrompt: prompt });
        const rows = parseAnalysis(result);

        if (!rows.length) {
            throw new Error('No usable NPC rows were returned.');
        }

        let changed = false;
        for (const row of rows.slice(0, 200)) {
            changed = upsertNpc(row) || changed;
        }

        if (changed) {
            persistData();
            render();
            toastr.success(`Updated ${rows.length} NPC row(s).`);
        } else {
            toastr.info('No relationship changes found.');
        }
    } catch (error) {
        console.error('[Encountered NPCs]', error);
        toastr.error(`NPC analysis failed: ${error.message}`);
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

    handle.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const rect = panel.getBoundingClientRect();
        drag = {
            dx: e.clientX - rect.left,
            dy: e.clientY - rect.top,
        };
        handle.setPointerCapture(e.pointerId);
        panel.classList.add('enpc-moving');
        e.preventDefault();
    });

    handle.addEventListener('pointermove', e => {
        if (!drag) return;
        const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - 44);
        panel.style.left = `${Math.min(maxX, Math.max(0, e.clientX - drag.dx))}px`;
        panel.style.top = `${Math.min(maxY, Math.max(0, e.clientY - drag.dy))}px`;
        panel.style.right = 'auto';
    });

    const stop = e => {
        if (!drag) return;
        drag = null;
        panel.classList.remove('enpc-moving');
        const rect = panel.getBoundingClientRect();
        const s = loadSettings();
        s.x = Math.round(rect.left);
        s.y = Math.round(rect.top);
        s.width = Math.round(rect.width);
        s.height = Math.round(rect.height);
        saveSettings(s);
        try { handle.releasePointerCapture(e.pointerId); } catch {}
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
            const s = loadSettings();
            s.width = Math.round(rect.width);
            s.height = Math.round(rect.height);
            saveSettings(s);
        }, 200);
    });
    observer.observe(panel);
}

function buildPanel() {
    if (document.querySelector('#enpc-panel')) return;

    const s = loadSettings();
    const panel = document.createElement('aside');
    panel.id = 'enpc-panel';
    panel.className = s.panelOpen ? '' : 'enpc-collapsed';
    panel.style.width = `${s.width}px`;
    panel.style.height = `${s.height}px`;

    if (Number.isFinite(s.x)) {
        panel.style.left = `${Math.max(0, s.x)}px`;
        panel.style.right = 'auto';
    }
    panel.style.top = `${Math.max(0, s.y)}px`;

    panel.innerHTML = `
        <div id="enpc-drag-handle" class="enpc-header" title="Drag to move">
            <button id="enpc-collapse" type="button" title="Collapse">☰</button>
            <strong>Encountered NPCs</strong>
            <span id="enpc-count">0</span>
            <button id="enpc-add" type="button" title="Add NPC">＋</button>
        </div>

        <div class="enpc-body">
            <input id="enpc-search" type="search" placeholder="Search NPCs…">

            <div class="enpc-columns">
                <span>Status</span><span>Name</span><span>Relationship</span>
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
    panel.querySelector('#enpc-analyze').addEventListener('click', () => analyze(true));
    panel.querySelector('#enpc-reset-position').addEventListener('click', () => {
        const next = { ...loadSettings(), x: null, y: 72, width: 360, height: 360 };
        saveSettings(next);
        panel.style.left = 'auto';
        panel.style.right = '10px';
        panel.style.top = '72px';
        panel.style.width = '360px';
        panel.style.height = '360px';
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

    const c = ctx();
    c.eventSource.on(c.event_types.CHAT_CHANGED, () => {
        currentChatKey = '';
        setTimeout(switchChat, 50);
    });

    console.log('[Encountered NPCs] v0.2.0 loaded');
}

const c = ctx();
c.eventSource.on(c.event_types.APP_READY, initialize);
