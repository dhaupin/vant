/**
 * Plates (wave F, vant#339, echoing the wave-A..E port-review series) — the
 * unifying publication primitive: CHANNELS are typed rows the engine owns;
 * PLATES are read-only rendered views over them, one derivation, many
 * readers. A fact acknowledged the other confession: the word went the way
 * it now sits fixed per vant#341's upstream call — PLATE is the reader
 * layer's verb (render), CARRIER stays the process layer's verb (carry,
 * lib/carriers.js). Two layers, no clash; this module never touches the
 * process one.
 *
 * The three plate laws, verbatim from vant#339:
 *
 *   1. TEMPLATE FIELDS ONLY. A plate renders structured fields resolved
 *      from the owning module's rows (field-name selectors) — never
 *      free-form authorial text typed at render time (E_PLATE_TEMPLATE).
 *      The module's validation already bounds the row; the render must
 *      not grow a new injection surface.
 *
 *   2. TENANCY ENFORCED AT THE PLATE. The same visibility rules the
 *      owning module applies to its rows apply to any plate reading
 *      them: a channel registers its tenancy honestly ('public', or a
 *      gate(row, viewer) callback); a row the viewer cannot see is
 *      WITHHELD (counted, never silently reshaped) — the same
 *      publication posture the #335 exporters wrote, fail-closed.
 *      A channel that declares neither is refused at registration
 *      (E_CHANNEL_VISIBILITY) — an undeclared tier never reads as
 *      public by default.
 *
 *   3. THE PLATE NEVER MUTATES. Every write path stays in the owning
 *      module; this exports no setter, no edit, no write verb. A plate
 *      is a lens, not an editor.
 *
 * Provenance rides the derive identity — `${channel}:${rowId}@${version}` —
 * the stable, rehydratable address readers cache and share without
 * trusting a copy. Render output is deterministic and JSON-safe: the same
 * truth serves a web UI, a CLI, an export, and any machine reader, and a
 * row's fields NOT selected by the template never leave the plate
 * (plate render exposes template fields and provenance, nothing else).
 */

const eventBus = (() => {
    try { return require('./event'); } catch (e) { return null; }
})();

const _channels = new Map();     // name -> { module, rows, visibility, at }
const _plates = new Map();       // name -> { channels: [..], template, at }

const MAX_NAME = 60;
const MAX_TEMPLATE_FIELDS = 24;

function _nameOk(n) {
    return typeof n === 'string' && n.trim() && n.length <= MAX_NAME
        && /^[a-z0-9][a-z0-9._:-]*$/i.test(n.trim());
}

// ==================== CHANNELS (typed rows the engine owns) =================

/**
 * Register a row family a module already generates. `visibility` is the
 * tenancy contract: 'public' (every viewer per the module's own tier
 * rules) or gate(row, viewer) -> boolean. Neither → refused (fail-closed).
 * `rows()` is the owning module's provider — the plate never captures or
 * mutates the rows, it reads them fresh each render.
 */
function registerChannel(opts = {}) {
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
        return { error: 'opts must be an object', code: 'E_CHANNEL_INPUT' };
    }
    if (!_nameOk(opts.name)) {
        return { error: 'valid channel name required', code: 'E_CHANNEL_INPUT' };
    }
    const name = opts.name.trim();
    if (_channels.has(name)) {
        return { error: 'channel already registered: ' + name, code: 'E_CHANNEL_DUPLICATE' };
    }
    if (typeof opts.module !== 'string' || !opts.module.trim()) {
        return { error: 'owning module id required (provenance)', code: 'E_CHANNEL_INPUT' };
    }
    if (typeof opts.rows !== 'function') {
        return { error: 'rows provider required (a function the plate calls fresh at each render)', code: 'E_CHANNEL_ROWS' };
    }
    const vis = opts.visibility;
    if (vis !== 'public' && typeof vis !== 'function') {
        return { error: 'visibility required - declare `public` or a gate(row, viewer); an undeclared tier never defaults to public', code: 'E_CHANNEL_VISIBILITY' };
    }
    const channel = { name, module: opts.module.trim(), rows: opts.rows, visibility: vis, at: Date.now() };
    _channels.set(name, channel);
    _emit('channel:registered', { channel: name, module: channel.module, tenancy: typeof vis === 'function' ? 'gate' : 'public' });
    return { registered: true, channel: name, module: channel.module, tenancy: typeof vis === 'function' ? 'gate' : 'public' };
}

function listChannels() {
    return Array.from(_channels.values()).map((c) => ({
        name: c.name, module: c.module, tenancy: typeof c.visibility === 'function' ? 'gate' : 'public', at: c.at
    }));
}

// ==================== PLATES (read-only rendered views) =====================

/**
 * Define a plate over one or more channels. The template maps an output
 * field name → the row field it derives from (a field-name SELECTOR).
 * Anything that would render authorial content — a nested object literal,
 * a template string, an array of literals — refuses: the render must not
 * grow a new injection surface (law 1).
 */
function createPlate(opts = {}) {
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
        return { error: 'opts must be an object', code: 'E_PLATE_INPUT' };
    }
    if (!_nameOk(opts.name)) {
        return { error: 'valid plate name required', code: 'E_PLATE_INPUT' };
    }
    const name = opts.name.trim();
    if (_plates.has(name)) {
        return { error: 'plate already defined: ' + name, code: 'E_PLATE_DUPLICATE' };
    }
    const chanRefs = Array.isArray(opts.channels) ? opts.channels : null;
    if (!chanRefs || !chanRefs.length || chanRefs.length > 8) {
        return { error: 'channels required - a plate renders over 1..8 channels', code: 'E_PLATE_INPUT' };
    }
    for (const c of chanRefs) {
        if (typeof c !== 'string' || !_channels.has(c.trim())) {
            return { error: 'unknown channel in plate: ' + String(c), code: 'E_PLATE_UNKNOWN_CHANNEL' };
        }
    }
    const template = opts.template;
    if (typeof template !== 'object' || template === null || Array.isArray(template)) {
        return { error: 'template required - field -> selector map (template fields only)', code: 'E_PLATE_TEMPLATE' };
    }
    const keys = Object.keys(template);
    if (!keys.length || keys.length > MAX_TEMPLATE_FIELDS) {
        return { error: 'template must map 1..' + MAX_TEMPLATE_FIELDS + ' fields', code: 'E_PLATE_TEMPLATE' };
    }
    for (const k of keys) {
        const sel = template[k];
        // A value that is itself an object/array/string-with-content-that-is-
        // not-a-field-name is authorial text smuggled into the render path.
        if (typeof sel !== 'string' || !sel.trim() || sel.length > 80 || /[{}<>`"']/.test(sel)) {
            return { error: 'template value for "' + k + '" must be a field-name selector (no authorial text at render time)', code: 'E_PLATE_TEMPLATE' };
        }
    }
    const plate = { name, channels: chanRefs.map((c) => c.trim()), template, at: Date.now() };
    _plates.set(name, plate);
    _emit('plate:defined', { plate: name, channels: plate.channels, fields: keys });
    return { defined: true, plate: name, channels: plate.channels, fields: keys };
}

function listPlates() {
    return Array.from(_plates.values()).map((p) => ({
        name: p.name, channels: p.channels, fields: Object.keys(p.template), at: p.at
    }));
}

// ==================== RENDER (the lens, read-only) ==========================

/**
 * Render a plate for one viewer. Gated rows the viewer cannot see are
 * withheld (counted, upstream-unshaped); each emitted row carries its
 * derive identity `${channel}:${rowId}@${version}` and template fields
 * ONLY. Row ordering is deterministic — sorted by derive id — so every
 * reader (web, CLI, export, machine) sees the same derivation.
 */
function renderPlate(name, opts = {}) {
    if (typeof name !== 'string' || !_plates.has(name.trim())) {
        return { error: 'unknown plate: ' + String(name), code: 'E_PLATE_UNKNOWN' };
    }
    if (typeof opts !== 'object' || opts === null) {
        return { error: 'opts must be an object', code: 'E_PLATE_INPUT' };
    }
    const plate = _plates.get(name.trim());
    const viewer = (opts.viewer === undefined || opts.viewer === null) ? 'anonymous' : opts.viewer;
    const since = Number.isFinite(opts.since) ? opts.since : null;
    const limit = (Number.isFinite(opts.limit) && opts.limit > 0 && opts.limit <= 200) ? Math.floor(opts.limit) : 100;

    const rows = [];
    let withheld = 0;
    for (const chanName of plate.channels) {
        const chan = _channels.get(chanName);
        let provided;
        try { provided = chan.rows(); } catch (e) { provided = null; }
        // A provider is supplied by its owning module mid-suite; a broken
        // provider answers with zero fresh rows rather than a falsified view.
        if (!Array.isArray(provided)) continue;
        for (const raw of provided) {
            const row = (raw && typeof raw === 'object') ? raw : null;
            const id = _rowField(row, ['id', 'rowId']);
            if (!row || typeof id !== 'string' || !id.trim()) continue;   // provenance-less rows are not renderable
            if (since != null) {
                const at = _rowField(row, ['at', 'ts', 'timestamp', 'createdAt']);
                if (typeof at !== 'number' || at < since) continue;      // since filters by the rows own at
            }
            // Tenancy at the plate (law 2): fail-closed withheld, never leaked.
            if (chan.visibility === 'public') { /* module's own tier governs */ }
            else if (typeof chan.visibility === 'function') {
                let canSee = false;
                try { canSee = chan.visibility(row, viewer) === true; } catch (e) { canSee = false; }
                if (!canSee) { withheld++; continue; }
            }
            const version = _rowField(row, ['version', 'rowVersion']);
            rows.push({
                derive: chanName + ':' + id.trim() + '@' + (typeof version === 'string' || typeof version === 'number' ? version : 1),
                channel: chanName,
                fields: _select(plate.template, row)
            });
        }
    }
    rows.sort((a, b) => (a.derive < b.derive ? -1 : a.derive > b.derive ? 1 : 0));
    const page = rows.slice(0, limit);
    const out = {
        plate: plate.name,
        channels: plate.channels,
        rows: page,
        count: page.length,
        total: rows.length,
        withheld,
        renderedAt: Date.now()
    };
    _emit('plate:rendered', { plate: plate.name, count: out.count, withheld, viewer: typeof viewer === 'string' ? viewer : 'custom' });
    return out;
}

function _rowField(row, names) {
    for (const n of names) {
        if (row && row[n] !== undefined) return row[n];
    }
    return undefined;
}

function _select(template, row) {
    const out = {};
    for (const [field, sel] of Object.entries(template)) {
        const parts = sel.split('.');
        let v = row;
        for (const p of parts) {
            if (v && typeof v === 'object' && v[p] !== undefined) v = v[p];
            else { v = null; break; }
        }
        out[field] = v === undefined ? null : v;
    }
    return out;
}

// ---------- tests/ops seams (sibling pattern; NO write verbs for rows) ------

module.exports = {
    registerChannel,
    createPlate,
    renderPlate,
    listChannels,
    listPlates,
    _channels: _channels,     // read-only inspection for tests
    _plates: _plates,
    clearState: () => {
        _channels.clear();
        _plates.clear();
        return true;
    }
};

function _emit(event, data) {
    if (eventBus && eventBus.emit) {
        try { eventBus.emit(event, data); } catch (e) { /* the bus never gates a read */ }
    }
}
