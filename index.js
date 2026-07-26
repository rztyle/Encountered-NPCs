
const MODULE_NAME = 'encountered_npcs';
const META_KEY = 'encountered_npcs_v1';

const DEFAULT_SETTINGS = {
    enabled: true,
    autoAnalyze: true,
    analyzeEvery: 1,
    maxRecentMessages: 12,
    panelOpen: true,
};

const STATUS_OPTIONS = [
    ['❓', 'Unknown'],
    ['😐', 'Neutral'],
    ['😊', 'Friend'],
    ['😁', 'Best Friend'],
    ['🤝', 'Ally'],
    ['❤️', 'Romance'],
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

let isAnalyzing = false;
let messageCounter = 0;

function context() {
    return SillyTavern.getContext();
}

function settings() {
    const { extensionSettings } = context();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = value;
        }
    }
    return extensionSettings[MODULE_NAME];
}

function getData() {
    const { chatMetadata } = context();
    if (!chatMetadata[META_KEY]) {
        chatMetadata[META_KEY] = { npcs: [], updatedAt: Date.now() };
    }
    if (!Array.isArray(chatMetadata[META_KEY].npcs)) {
        chatMetadata[META_KEY].npcs = [];
    }
    return chatMetadata[META_KEY];
}

async function saveData() {
    const ctx = context();
    getData().updatedAt = Date.now();
    await ctx.saveMetadata();
}

function normalizeName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeRelationship(value) {
    return String(value ?? 'Unknown').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Unknown';
}

function normalizeStatus(value, relationship = '') {
    const raw = String(value ?? '').trim();
    if (STATUS_OPTIONS.some(([emoji]) => emoji === raw)) return raw;

    const text = `${raw} ${relationship}`.toLowerCase();
    if (/(wife|husband|spouse|fianc)/.test(text)) return '💍';
    if (/(lover|girlfriend|boyfriend|partner)/.test(text)) return '💕';
    if (/(romance|romantic|crush|love interest)/.test(text)) return '❤️';
    if (/(former lover|ex-|ex lover|ex-girlfriend|ex-boyfriend)/.test(text)) return '💔';
    if (/(best friend|closest friend)/.test(text)) return '😁';
    if (/(friend|friendly)/.test(text)) return '😊';
    if (/(ally|companion|teammate)/.test(text)) return '🤝';
    if (/(mother|father|sister|brother|aunt|uncle|cousin|daughter|son|family)/.test(text)) return '👑';
    if (/(master|mentor|teacher|sensei|shifu)/.test(text)) return '🎓';
    if (/(enemy|hostile|villain)/.test(text)) return '⚔️';
    if (/(rival)/.test(text)) return '😠';
    if (/(dislike|distrust|annoyed)/.test(text)) return '😒';
    if (/(dead|deceased|killed)/.test(text)) return '💀';
    if (/(missing|lost|unknown whereabouts)/.test(text)) return '👻';
    if (/(neutral|acquaintance|stranger)/.test(text)) return '😐';
    return '❓';
}

function upsertNpc(input, { force = false } = {}) {
    const name = normalizeName(input.name);
    if (!name) return false;

    const data = getData();
    const key = name.toLocaleLowerCase();
    const existing = data.npcs.find(n => normalizeName(n.name).toLocaleLowerCase() === key);

    const relationship = normalizeRelationship(input.relationship);
    const status = normalizeStatus(input.status, relationship);

    if (existing) {
        if (existing.locked && !force) return false;
        const changed = existing.relationship !== relationship || existing.status !== status;
        if (changed) {
            existing.history ??= [];
            existing.history.push({
                status: existing.status,
                relationship: existing.relationship,
                at: Date.now(),
            });
            existing.history = existing.history.slice(-20);
            existing.relationship = relationship;
            existing.status = status;
            existing.updatedAt = Date.now();
        }
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
        history: [],
    });
    return true;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function renderList() {
    const list = document.querySelector('#enpc-list');
    const count = document.querySelector('#enpc-count');
    if (!list || !count) return;

    const query = (document.querySelector('#enpc-search')?.value || '').trim().toLowerCase();
    const npcs = [...getData().npcs]
        .filter(n => !query || n.name.toLowerCase().includes(query) || n.relationship.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name));

    count.textContent = String(getData().npcs.length);

    if (!npcs.length) {
        list.innerHTML = '<div class="enpc-empty">No NPCs encountered yet.</div>';
        return;
    }

    list.innerHTML = npcs.map(npc => `
        <button class="enpc-row" data-id="${npc.id}" title="Click to edit">
            <span class="enpc-status">${escapeHtml(npc.status)}</span>
            <span class="enpc-name">${escapeHtml(npc.name)}</span>
            <span class="enpc-relationship">${escapeHtml(npc.relationship)}</span>
            ${npc.locked ? '<span class="enpc-lock" title="Locked">🔒</span>' : ''}
        </button>
    `).join('');

    list.querySelectorAll('.enpc-row').forEach(row => {
        row.addEventListener('click', () => openEditor(row.dataset.id));
    });
}

function statusOptionsHtml(selected) {
    return STATUS_OPTIONS.map(([emoji, label]) =>
        `<option value="${emoji}" ${emoji === selected ? 'selected' : ''}>${emoji} ${label}</option>`
    ).join('');
}

function openEditor(id = null) {
    const npc = id ? getData().npcs.find(n => n.id === id) : null;
    const overlay = document.createElement('div');
    overlay.className = 'enpc-modal-overlay';
    overlay.innerHTML = `
        <div class="enpc-modal">
            <h3>${npc ? 'Edit NPC' : 'Add NPC'}</h3>
            <label>Name</label>
            <input id="enpc-edit-name" type="text" maxlength="80" value="${escapeHtml(npc?.name || '')}">
            <label>Status</label>
            <select id="enpc-edit-status">${statusOptionsHtml(npc?.status || '❓')}</select>
            <label>Relationship</label>
            <input id="enpc-edit-relationship" type="text" maxlength="80" value="${escapeHtml(npc?.relationship || 'Unknown')}">
            <label class="enpc-check">
                <input id="enpc-edit-locked" type="checkbox" ${npc?.locked ? 'checked' : ''}>
                Lock this relationship
            </label>
            <div class="enpc-modal-actions">
                ${npc ? '<button id="enpc-delete" class="menu_button redWarningBG">Delete</button>' : ''}
                <span class="enpc-spacer"></span>
                <button id="enpc-cancel" class="menu_button">Cancel</button>
                <button id="enpc-save" class="menu_button">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#enpc-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#enpc-save').addEventListener('click', async () => {
        const name = normalizeName(overlay.querySelector('#enpc-edit-name').value);
        if (!name) {
            toastr.warning('NPC name is required.');
            return;
        }

        if (npc) {
            npc.name = name;
            npc.status = overlay.querySelector('#enpc-edit-status').value;
            npc.relationship = normalizeRelationship(overlay.querySelector('#enpc-edit-relationship').value);
            npc.locked = overlay.querySelector('#enpc-edit-locked').checked;
            npc.updatedAt = Date.now();
        } else {
            upsertNpc({
                name,
                status: overlay.querySelector('#enpc-edit-status').value,
                relationship: overlay.querySelector('#enpc-edit-relationship').value,
            }, { force: true });
            const added = getData().npcs.find(n => n.name.toLowerCase() === name.toLowerCase());
            if (added) added.locked = overlay.querySelector('#enpc-edit-locked').checked;
        }

        await saveData();
        renderList();
        close();
    });

    overlay.querySelector('#enpc-delete')?.addEventListener('click', async () => {
        getData().npcs = getData().npcs.filter(n => n.id !== npc.id);
        await saveData();
        renderList();
        close();
    });

    setTimeout(() => overlay.querySelector('#enpc-edit-name')?.focus(), 0);
}

function buildPanel() {
    if (document.querySelector('#enpc-panel')) return;

    const panel = document.createElement('aside');
    panel.id = 'enpc-panel';
    panel.className = settings().panelOpen ? '' : 'enpc-collapsed';
    panel.innerHTML = `
        <div class="enpc-header">
            <button id="enpc-collapse" title="Collapse">☰</button>
            <strong>Encountered NPCs</strong>
            <span id="enpc-count">0</span>
            <button id="enpc-add" title="Add NPC">＋</button>
        </div>
        <div class="enpc-body">
            <input id="enpc-search" type="search" placeholder="Search NPCs…">
            <div class="enpc-columns">
                <span>Status</span><span>Name</span><span>Relationship</span>
            </div>
            <div id="enpc-list"></div>
            <div class="enpc-footer">
                <button id="enpc-analyze" class="menu_button">Analyze now</button>
                <button id="enpc-settings" class="menu_button">⚙</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#enpc-collapse').addEventListener('click', () => {
        panel.classList.toggle('enpc-collapsed');
        settings().panelOpen = !panel.classList.contains('enpc-collapsed');
        context().saveSettingsDebounced();
    });
    panel.querySelector('#enpc-add').addEventListener('click', () => openEditor());
    panel.querySelector('#enpc-search').addEventListener('input', renderList);
    panel.querySelector('#enpc-analyze').addEventListener('click', () => analyzeChat(true));
    panel.querySelector('#enpc-settings').addEventListener('click', openSettings);
}

function openSettings() {
    const s = settings();
    const overlay = document.createElement('div');
    overlay.className = 'enpc-modal-overlay';
    overlay.innerHTML = `
        <div class="enpc-modal">
            <h3>Encountered NPCs Settings</h3>
            <label class="enpc-check">
                <input id="enpc-auto" type="checkbox" ${s.autoAnalyze ? 'checked' : ''}>
                Automatically analyze new replies
            </label>
            <label>Analyze every</label>
            <select id="enpc-every">
                ${[1,2,3,5,10].map(v => `<option value="${v}" ${v === s.analyzeEvery ? 'selected' : ''}>${v} AI repl${v === 1 ? 'y' : 'ies'}</option>`).join('')}
            </select>
            <label>Recent messages used</label>
            <select id="enpc-recent">
                ${[6,8,12,16,24].map(v => `<option value="${v}" ${v === s.maxRecentMessages ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <p class="enpc-help">Automatic analysis makes one quiet background generation. It only adds named NPCs who were actually encountered and updates relationships when the story clearly changes.</p>
            <div class="enpc-modal-actions">
                <button id="enpc-export" class="menu_button">Export JSON</button>
                <button id="enpc-import" class="menu_button">Import JSON</button>
                <input id="enpc-import-file" type="file" accept=".json" hidden>
                <span class="enpc-spacer"></span>
                <button id="enpc-close-settings" class="menu_button">Close</button>
                <button id="enpc-save-settings" class="menu_button">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();

    overlay.querySelector('#enpc-close-settings').addEventListener('click', close);
    overlay.querySelector('#enpc-save-settings').addEventListener('click', () => {
        s.autoAnalyze = overlay.querySelector('#enpc-auto').checked;
        s.analyzeEvery = Number(overlay.querySelector('#enpc-every').value);
        s.maxRecentMessages = Number(overlay.querySelector('#enpc-recent').value);
        context().saveSettingsDebounced();
        toastr.success('NPC Tracker settings saved.');
        close();
    });

    overlay.querySelector('#enpc-export').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'encountered-npcs.json';
        a.click();
        URL.revokeObjectURL(a.href);
    });

    const fileInput = overlay.querySelector('#enpc-import-file');
    overlay.querySelector('#enpc-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        try {
            const parsed = JSON.parse(await fileInput.files[0].text());
            const rows = Array.isArray(parsed) ? parsed : parsed.npcs;
            if (!Array.isArray(rows)) throw new Error('No NPC list found.');
            let changed = false;
            for (const row of rows) changed = upsertNpc(row, { force: true }) || changed;
            if (changed) await saveData();
            renderList();
            toastr.success('NPC list imported.');
            close();
        } catch (error) {
            toastr.error(`Import failed: ${error.message}`);
        }
    });
}

function getRecentTranscript() {
    const { chat } = context();
    const recent = chat.slice(-settings().maxRecentMessages);
    return recent.map(message => {
        const speaker = message.is_user ? 'USER' : (message.name || 'CHARACTER');
        const text = String(message.mes || '').slice(0, 5000);
        return `${speaker}: ${text}`;
    }).join('\n\n');
}

function parseJsonResult(raw) {
    const text = String(raw || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
        throw new Error('The model did not return valid JSON.');
    }
}

async function analyzeChat(manual = false) {
    if (isAnalyzing) return;
    const { chat, generateQuietPrompt } = context();
    if (!chat?.length) {
        if (manual) toastr.info('There is no chat to analyze.');
        return;
    }

    isAnalyzing = true;
    const button = document.querySelector('#enpc-analyze');
    if (button) {
        button.disabled = true;
        button.textContent = 'Analyzing…';
    }

    try {
        const existing = getData().npcs.map(n => ({
            name: n.name,
            status: n.status,
            relationship: n.relationship,
            locked: n.locked,
        }));

        const prompt = `
You are updating a compact Encountered NPC list for a roleplay chat.

Return ONLY valid JSON in this exact shape:
{"npcs":[{"name":"NPC full or commonly used name","status":"one emoji","relationship":"short relationship label"}]}

Allowed status emojis:
❓ unknown, 😐 neutral/acquaintance, 😊 friend, 😁 best friend, 🤝 ally,
❤️ romance interest, 💕 lover, 💍 spouse/fiance, 👑 family, 🎓 master/mentor,
😒 dislikes user, 😠 rival, ⚔️ enemy, 💔 former lover, 👻 missing, 💀 dead.

Rules:
- Include only named NPCs the user/player has actually encountered in-scene.
- Do not add places, factions, titles without a usable name, the player, or the main AI narrator.
- Keep one row per NPC.
- Relationship must be short, such as Friend, Best Friend, Mother, Master, Rival, Lover.
- Preserve existing relationships unless recent events clearly changed them.
- Never turn relatives, minors, teachers, or non-romantic bonds into romance without explicit story evidence.
- Do not change locked entries.
- Do not invent NPCs.
- Return the full current list, not only changes.

Existing list:
${JSON.stringify(existing)}

Recent chat:
${getRecentTranscript()}
        `.trim();

        const result = await generateQuietPrompt({ quietPrompt: prompt });
        const parsed = parseJsonResult(result);
        if (!Array.isArray(parsed.npcs)) throw new Error('Missing npcs array.');

        let changed = false;
        for (const item of parsed.npcs.slice(0, 250)) {
            changed = upsertNpc(item) || changed;
        }

        if (changed) {
            await saveData();
            renderList();
            if (manual) toastr.success('NPC list updated.');
        } else if (manual) {
            toastr.info('No NPC relationship changes found.');
        }
    } catch (error) {
        console.error('[Encountered NPCs] Analysis failed:', error);
        if (manual) toastr.error(`NPC analysis failed: ${error.message}`);
    } finally {
        isAnalyzing = false;
        if (button) {
            button.disabled = false;
            button.textContent = 'Analyze now';
        }
    }
}

function handleMessageReceived() {
    if (!settings().enabled || !settings().autoAnalyze) return;
    messageCounter += 1;
    if (messageCounter % Math.max(1, settings().analyzeEvery) !== 0) return;
    setTimeout(() => analyzeChat(false), 800);
}

async function initialize() {
    buildPanel();
    renderList();

    const { eventSource, event_types } = context();
    eventSource.on(event_types.CHAT_CHANGED, () => {
        messageCounter = 0;
        renderList();
    });
    eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);

    console.log('[Encountered NPCs] Loaded');
}

const ctx = context();
ctx.eventSource.on(ctx.event_types.APP_READY, initialize);
