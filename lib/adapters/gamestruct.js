'use strict';

/**
 * gamestruct Adapter — vant brain <-> gamestruct door (dhaupin/gamestruct)
 * ======================================================================
 *
 * ADAPTER: the game-agent lane bridge (gamestruct SPEC v0.1.0). Pure client,
 * no service of its own: it drives a gamestruct DOOR over the two specified
 * bindings (HTTP sec 7.1, MCP sec 7.2). Like `memstruct.js` it lives in
 * lib/adapters/ and registers as an adapter, not a connector (it holds no
 * store; it speaks a lane).
 *
 * Two houses split the seam: a game (synmergia) exposes a *door* and
 * implements the four primitives; a brain (vant) is the *client*. gamestruct
 * names the primitives so neither half owns the other's dialect. gamestruct
 * itself ships a reference `DoorClient` (`lib/adapters/vant.mjs`) — this is
 * the same shape, but it rides VANT's wall instead of global fetch: the SSRF
 * IP wall, the DNS-rebinding refusal, the circuit breaker, and the token
 * posture (SPEC sec 8). A brain should not open an unwalled socket to the
 * internet to play a game.
 *
 * The wire (gamestruct v0.1.0, bindings/http.mjs):
 *   GET  /observe                    -> Snapshot { ok, nodes, focus, summary }
 *   POST /act       { id, verb, value } -> Result { ok, id, verb } | { ok:false, reason }
 *   POST /wait_for  { predicate, timeoutMs } -> Outcome | { ok:false, reason:'timeout' }
 *   GET  /events?since=N             -> { ok, frame, events: [...] }
 *   GET  /health                     -> liveness
 *   POST /mcp/exec  { method, params } -> JSON-RPC (tools/list, tools/call)
 *
 * Security posture (SPEC sec 8, mapped onto vant's own wall):
 *   - LOOPBACK BY DEFAULT. A door is `http://127.0.0.1:<port>` unless an
 *     operator names another address. A literal loopback host skips the
 *     domain wall (there is no DNS to rebind); any REMOTE door rides the full
 *     SSRF wall + DNS-rebinding refusal in lib/network.fetch.
 *   - TOKEN, FAIL-CLOSED. When a token is configured it rides every request
 *     (`Authorization: Bearer`, or `x-api-key`). The client never decides
 *     whether the door requires one - the door refuses (N16); the client
 *     attaches what it holds and never logs it.
 *   - No credentials in the URL: a door URL carrying `user:pass@` is refused
 *     typed (a leaked userinfo is a leaked secret).
 *
 * All outbound traffic rides lib/network.fetch - nothing here does its own
 * networking, exactly like the relay hop and the crew bus.
 */

const network = require('../network');

/** Typed refusal (the lib/ no-raw-throw invariant; see lib/export-bundle.js). */
function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const DEFAULT_DOOR = 'http://127.0.0.1:8791';
const DEFAULT_TIMEOUT_MS = 10000;

class GamestructAdapter {
    constructor(config = {}) {
        this.type = 'gamestruct';

        const raw = String(config.door || process.env.VANT_GAMESTRUCT_DOOR || DEFAULT_DOOR).trim();
        let parsed;
        try { parsed = new URL(raw); } catch (e) {
            throw _vantErr('gamestruct: door is not a valid URL: ' + JSON.stringify(raw), 'E_GAMESTRUCT_DOOR');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw _vantErr('gamestruct: door scheme must be http or https (got ' + parsed.protocol + ')', 'E_GAMESTRUCT_DOOR');
        }
        if (parsed.username || parsed.password) {
            throw _vantErr('gamestruct: door URL must not carry credentials (user:pass@) - use the token option instead', 'E_GAMESTRUCT_DOOR');
        }
        this.door = parsed.origin;
        this.host = parsed.hostname;
        this.isLoopback = LOOPBACK_HOSTS.has(this.host);

        // SECURE: the token is read from config or env, never logged.
        this.token = config.token || process.env.VANT_GAMESTRUCT_TOKEN || null;
        this.tokenHeader = config.tokenHeader === 'x-api-key' ? 'x-api-key' : 'authorization';
        this.timeout = Number.isFinite(config.timeout) ? config.timeout : DEFAULT_TIMEOUT_MS;
        this.internalPolicy = config.internalPolicy === 'privateLan' ? 'privateLan' : 'refuse';
        // The host names its own MCP route (bindings/mcp.mjs is transport-free);
        // `/mcp/exec` is the reference host's choice (gamestruct DoorClient).
        this.mcpPath = config.mcpPath || '/mcp/exec';
        this.connected = false;
        this._frame = -1;
    }

    /** One request through vant's own wall. `body` is JSON-encoded when given. */
    async _request(method, pathname, body, opts = {}) {
        const headers = { accept: 'application/json' };
        if (body !== undefined) headers['content-type'] = 'application/json';
        if (this.token) {
            if (this.tokenHeader === 'x-api-key') headers['x-api-key'] = this.token;
            else headers.authorization = 'Bearer ' + this.token;
        }
        const url = this.door + pathname;
        let raw;
        try {
            raw = await network.fetch(url, {
                method,
                body: body === undefined ? undefined : JSON.stringify(body),
                headers,
                timeout: this.timeout,
                circuit: true,
                cache: false,
                // System-initiated transport (see lib/crew-bus.js): the adapter
                // is vant acting, not user-space, so the per-call sandbox gate
                // is not the authority here - the door's token is.
                system: true,
                // A literal loopback door has no DNS to rebind; a remote door
                // keeps the full wall (domain check + DNS-rebinding refusal).
                skipDomainCheck: this.isLoopback,
                internalPolicy: this.internalPolicy,
                // gamestruct's HTTP binding carries a first-class refusal as
                // HTTP 409 (act) / 408 (wait_for timeout) with a JSON body
                // (SPEC N21). Read that body instead of a bare `HTTP 409`.
                allowStatus: opts.allowStatus || []
            });
        } catch (e) {
            throw _vantErr('gamestruct: door unreachable (' + method + ' ' + pathname + '): ' + e.message, 'E_GAMESTRUCT_UNREACHABLE');
        }
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) {
            throw _vantErr('gamestruct: door returned non-JSON for ' + method + ' ' + pathname, 'E_GAMESTRUCT_WIRE');
        }
        return parsed;
    }

    /** sec 3: the current state of the surface for this seat. */
    async observe() {
        const snap = await this._request('GET', '/observe');
        this.connected = !!(snap && snap.ok !== false);
        return snap;
    }

    /** sec 3 + N1/N2: do one thing by stable handle. `verb` is the node's action. */
    async act(handle, verb, value) {
        if (typeof handle !== 'string' || !handle) {
            throw _vantErr('gamestruct.act: handle must be a non-empty stable id', 'E_GAMESTRUCT_INPUT');
        }
        const body = { id: handle };
        if (verb !== undefined) body.verb = verb;
        if (value !== undefined) body.value = value;
        // 409 = a first-class refusal (N2/N21): read the { ok:false, reason } body.
        return this._request('POST', '/act', body, { allowStatus: [409] });
    }

    /** sec 3 + N3: resolve when a condition holds, or time out honestly. */
    async waitFor(predicate, timeoutMs) {
        if (!predicate || typeof predicate !== 'object') {
            throw _vantErr('gamestruct.waitFor: predicate must be an object', 'E_GAMESTRUCT_INPUT');
        }
        const ms = Number.isFinite(timeoutMs) ? timeoutMs : this.timeout;
        // 408 = an honest timeout (N3): read the { ok:false, reason:'timeout' } body.
        return this._request('POST', '/wait_for', { predicate, timeoutMs: ms }, { allowStatus: [408] });
    }

    /** sec 3 + N4: the honest event cursor. Calling twice with one cursor is stable. */
    async events(sinceFrame) {
        const since = Number.isFinite(sinceFrame) ? sinceFrame : this._frame;
        const out = await this._request('GET', '/events?since=' + encodeURIComponent(since));
        if (out && typeof out.frame === 'number') this._frame = out.frame;
        return out;
    }

    /** Liveness (the one route the token gate exempts, N16). */
    async health() {
        return this._request('GET', '/health');
    }

    /**
     * sec 7.2: the brain-facing MCP binding. `tools/list` carries a real
     * inputSchema per tool so a brain auto-wires without hand-written glue.
     */
    async catalog() {
        const out = await this._request('POST', this.mcpPath, { method: 'tools/list', params: {} });
        return out && out.result ? out.result : out;
    }

    /** sec 7.2 + N14: one MCP tool call, dispatched onto the same act(). */
    async call(name, args = {}) {
        if (typeof name !== 'string' || !name) {
            throw _vantErr('gamestruct.call: tool name must be a non-empty string', 'E_GAMESTRUCT_INPUT');
        }
        const out = await this._request('POST', this.mcpPath, { method: 'tools/call', params: { name, arguments: args } });
        if (out && out.error) throw _vantErr('gamestruct.call: ' + (out.error.message || 'door error'), 'E_GAMESTRUCT_WIRE');
        return out && out.result;
    }

    /** Locate a handle by role and/or name substring (never hardcode ids). */
    async find({ role, name } = {}) {
        const snap = await this.observe();
        const needle = name ? String(name).toLowerCase() : null;
        return (snap && Array.isArray(snap.nodes) ? snap.nodes : []).find((n) =>
            (!role || n.role === role) && (!needle || String(n.name).toLowerCase().includes(needle))) || null;
    }

    /**
     * sec 8: pursue one want THROUGH the lane - the same observe/act
     * primitives used without an objective. One cycle: look, pick a safe
     * affordance, act once, return a learn line the leisure keeper records.
     * Never throws on a refused act (a refusal is a first-class outcome, N21).
     */
    async play(want, opts = {}) {
        const snap = await this.observe();
        const nodes = (snap && Array.isArray(snap.nodes)) ? snap.nodes : [];
        const candidates = nodes.filter((n) => !n.disabled && Array.isArray(n.actions) && n.actions.length
            && (!opts.role || n.role === opts.role)
            && (!opts.not || !opts.not.includes(n.role)));
        if (!candidates.length) return { ok: true, want, acted: false, learned: 'nothing to do in the world right now' };
        const pick = opts.pick === 'last' ? candidates[candidates.length - 1] : candidates[0];
        const verb = opts.verb || pick.actions[0];
        const result = await this.act(pick.id, verb, opts.value);
        const ok = !!(result && result.ok !== false);
        return {
            ok: true,
            want,
            acted: true,
            handle: pick.id,
            name: pick.name,
            action: verb,
            outcome: ok ? 'done' : 'refused',
            learned: ok
                ? 'played: ' + verb + ' at ' + pick.id
                : 'refused: ' + ((result && result.reason) || 'unknown')
        };
    }
}

module.exports = { GamestructAdapter };
