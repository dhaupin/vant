'use strict';

/**
 * Synmergia Adapter — Vant's world-side client for the gamestruct lane.
 *
 * The composition law (vant#363): Vant is the BRAIN, Synmergia is the WORLD,
 * gamestruct is the BRIDGE between them. gamestruct owns the transport: its
 * reference `DoorClient` (`gamestruct/adapters/vant`) drives any door through
 * the four primitives (observe / act / wait_for / events), and its synmergia
 * world adapter supplies `doorNodes()`, the ONE normalizer that folds the
 * door's flat `actions[]` into the SPEC node shape.
 *
 * This file is the vant-side SEAM, not a second transport. It wraps
 * `DoorClient` and adds only what is vant's:
 *   - the SSRF wall. `DoorClient` takes an injected `fetch` (SPEC N25); we
 *     pass vant's own `lib/network.fetch` so every door request rides the
 *     same IP wall, DNS-rebinding refusal, and circuit breaker as the relay
 *     hop and the crew bus. A literal loopback door has no DNS to rebind, so
 *     it skips the domain check; a remote door keeps the full wall.
 *   - the door's OWN `/coord` multi-agent extension (register / delegate /
 *     step), which is not one of the four primitives.
 *
 * Vant is CommonJS and gamestruct is ESM; the ESM modules are loaded with a
 * cached dynamic `import()` (gamestruct is zero-dependency, so this pulls in
 * nothing but itself).
 *
 * Zero networking of its own: every byte leaves through `lib/network.fetch`.
 *
 * Usage:
 *   const synmergia = require('./adapters/synmergia');
 *   const world = synmergia.connect({ door: 'http://127.0.0.1:3789', token: process.env.SYN_AGENT_TOKEN });
 *   const snap = await world.observe();
 *   await world.act('world:wolf_7', 'activate');
 *   const shot = await world.see({ label: 'login' });
 */

const network = require('../network');
const errors = require('../error');

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * A literal loopback door has no DNS to rebind, so it skips the domain check
 * (a remote door keeps the full wall). `new URL().hostname` yields an IPv6
 * literal WITH brackets (`[::1]`), and any 127/8 address is loopback, not just
 * 127.0.0.1 - miss either and the wall refuses the door outright.
 */
function _isLoopbackHost(host) {
    if (!host) return false;
    let h = String(host).toLowerCase();
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1); // IPv6 literal
    if (h === 'localhost' || h === '::1') return true;
    return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** The door's refusal statuses, read as data instead of a bare `HTTP <n>` (SPEC N26). */
const REFUSAL_STATUS = [401, 403, 404, 408, 409];

function _vantErr(msg, code) {
    return new errors.VantError(msg, { code: code || errors.CODES.UNKNOWN, retryable: false });
}

/** Load (and cache) the gamestruct ESM modules once per process. */
let _esmPromise = null;
function _esm() {
    if (!_esmPromise) {
        _esmPromise = Promise.all([
            import('gamestruct/adapters/vant'),
            import('gamestruct/adapters/synmergia'),
        ]).then(([vant, syn]) => ({ DoorClient: vant.DoorClient, pursueOne: vant.pursueOne, doorNodes: syn.doorNodes }));
    }
    return _esmPromise;
}

/**
 * A door is the world's control surface. One instance holds one connection
 * to one door; the four primitives come from gamestruct's DoorClient.
 */
class SynmergiaWorld {
    constructor(config = {}) {
        const raw = String(config.door || '').trim();
        if (!raw) {
            throw _vantErr('synmergia.connect: a door URL is required', errors.CODES.VAF_INPUT_INVALID);
        }
        let parsed;
        try { parsed = new URL(raw); } catch (e) {
            throw _vantErr('synmergia: door is not a valid URL: ' + JSON.stringify(raw), 'E_SYNMERGIA_DOOR');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw _vantErr('synmergia: door scheme must be http or https (got ' + parsed.protocol + ')', 'E_SYNMERGIA_DOOR');
        }
        if (parsed.username || parsed.password) {
            throw _vantErr('synmergia: door URL must not carry credentials (user:pass@) - use the token option instead', 'E_SYNMERGIA_DOOR');
        }
        this.door = parsed.origin;
        this.host = parsed.hostname;
        this.isLoopback = _isLoopbackHost(this.host);
        // The token rides a header; it is never logged and never persisted here.
        this.token = config.token || process.env.SYN_AGENT_TOKEN || '';
        this.timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
        this.internalPolicy = config.internalPolicy === 'privateLan' ? 'privateLan' : 'refuse';
        this.connected = false;
        this._client = null;
    }

    /**
     * The walled transport handed to DoorClient (SPEC N25). It is a
     * fetch-shaped function: DoorClient calls it and reads `.ok` / `.json()`,
     * so it must return a Response-shaped value. Everything rides
     * lib/network.fetch - the SSRF wall, DNS-rebinding refusal, circuit
     * breaker - and a refusal body (401/403/408/409) is read as data, never
     * collapsed into a generic transport error.
     */
    _walledFetch() {
        const self = this;
        return async function walledFetch(url, options = {}) {
            // DoorClient catches a transport throw and turns it into
            // { ok:false, reason:'unreachable: ...' }.
            const raw = await network.fetch(url, {
                method: options.method || 'GET',
                headers: options.headers,
                body: options.body,
                timeout: self.timeoutMs,
                circuit: true,
                cache: false,
                // The adapter is vant acting (like the relay hop / crew bus):
                // the per-call sandbox gate is not the authority here, the
                // door's token is.
                system: true,
                // A literal loopback door has no DNS to rebind; a remote
                // door keeps the full wall (domain check + DNS-rebinding).
                skipDomainCheck: self.isLoopback,
                internalPolicy: self.internalPolicy,
                allowStatus: REFUSAL_STATUS,
            });
            return {
                ok: true,
                status: 200,
                json: async () => {
                    if (!raw || !String(raw).trim()) return { ok: false, reason: 'the door returned an empty body' };
                    try { return JSON.parse(raw); }
                    catch (e) { return { ok: false, reason: 'the door returned a non-JSON body' }; }
                },
            };
        };
    }

    /** The DoorClient, built once. */
    async _ensure() {
        if (!this._client) {
            const { DoorClient, doorNodes } = await _esm();
            this._client = new DoorClient({
                url: this.door,
                token: this.token,
                fetch: this._walledFetch(),
                mapNodes: doorNodes,
            });
        }
        return this._client;
    }

    /** A cheap liveness probe: one observe() round-trip. */
    async connect() {
        const snap = await this.observe();
        this.connected = !!(snap && snap.ok !== false);
        return this.connected;
    }

    /** observe() -> the world snapshot for this seat (the door's own shape). */
    async observe() {
        const c = await this._ensure();
        const snap = await c.observe();
        this.connected = !!(snap && snap.ok !== false);
        return snap;
    }

    /** act(handle, verb, value) -> the result of one action by stable handle. */
    async act(handle, verb, value) {
        if (!handle || String(handle).trim() === '') {
            return { ok: false, reason: 'act: a stable handle is required' };
        }
        const c = await this._ensure();
        return c.act(String(handle), verb, value);
    }

    /** wait_for(predicate, timeoutMs) -> resolves on the predicate or an honest timeout. */
    async waitFor(predicate, timeoutMs) {
        const c = await this._ensure();
        return c.waitFor(predicate, Number.isFinite(timeoutMs) ? timeoutMs : this.timeoutMs);
    }

    /** events(sinceFrame) -> the event ring since a frame cursor (honest cursor). */
    async events(sinceFrame) {
        const c = await this._ensure();
        return c.events(sinceFrame);
    }

    /**
     * see(opts) -> a visual capture of the surface (the eyes). Forwards to the
     * door's /see and returns the descriptor UNCHANGED; a blind door's
     * `{ ok:false, reason }` is an honest refusal, never a throw.
     */
    async see(opts = {}) {
        const c = await this._ensure();
        return c.see(opts);
    }

    /** catalog() -> the door's tools (MCP tools/list shape). */
    async catalog() {
        const c = await this._ensure();
        return c.catalog();
    }

    /**
     * nodes() -> the door's actionable list folded into the SPEC node shape
     * via gamestruct's own `doorNodes` (the SAME normalizer the catalog rides).
     * A door serves its flat `actions[]`; this is the tree both lanes read.
     */
    async nodes() {
        const { doorNodes } = await _esm();
        const snap = await this.observe();
        return doorNodes(snap);
    }

    /**
     * find({ role, name }) -> locate a handle without hardcoding ids. The door
     * serves `actions[]` (not a serialized `nodes` tree), so the node list is
     * folded with gamestruct's own `doorNodes` before filtering - the same
     * normalizer the catalog rides, so the two never drift.
     */
    async find({ role, name } = {}) {
        const nodes = await this.nodes();
        const needle = name ? String(name).toLowerCase() : null;
        return nodes.find((n) =>
            (!role || n.role === role) && (!needle || String(n.name).toLowerCase().includes(needle))) || null;
    }

    // ---- the coordinator surface (the door's own multi-agent extension) ----

    /**
     * coord(op, extra) -> the door's coordinator (register/delegate/step/...).
     * This is the door's OWN extension, not one of the four primitives: it
     * POSTs `/coord { op, ... }` through the same walled transport.
     */
    async coord(op, extra = {}) {
        if (!op || String(op).trim() === '') {
            return { ok: false, reason: 'coord: an op is required' };
        }
        const body = Object.assign({ op: String(op) }, extra || {});
        return this._request('POST', '/coord', body);
    }

    /** One vant-owned request through the wall (the door's own routes). */
    async _request(method, pathname, body) {
        const headers = { 'content-type': 'application/json' };
        if (this.token) headers.authorization = 'Bearer ' + this.token;
        const res = await this._walledFetch()(this.door + pathname, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        return res.json();
    }

    /** register(handle, opts) -> add an agent to the world's roster. */
    async register(handle, opts = {}) {
        return this.coord('register', { handle: String(handle), opts: opts || {} });
    }

    /** delegate(handle, task) -> queue one work item on the world roster. */
    async delegate(handle, task) {
        return this.coord('delegate', { handle: String(handle), task: task || {} });
    }

    /** step() -> advance the world roster one turn (round-robin). */
    async step() {
        return this.coord('step');
    }
}

/**
 * Connect to a gamestruct door. Returns a SynmergiaWorld (the name is the
 * first world; the contract is general).
 *
 * @param {object} config { door, token?, timeoutMs? }
 * @returns {SynmergiaWorld}
 */
function connect(config = {}) {
    return new SynmergiaWorld(config);
}

module.exports = { connect, SynmergiaWorld };
