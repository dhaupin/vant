'use strict';

/**
 * gamestruct Adapter — vant brain <-> gamestruct door (dhaupin/gamestruct)
 * ======================================================================
 *
 * ADAPTER: the game-agent lane bridge (gamestruct SPEC v0.1.0, section 10).
 * Pure client, no service of its own: it drives a gamestruct DOOR over the
 * two specified bindings (HTTP section 3.1, MCP section 3.2). Like
 * `memstruct.js` it lives in lib/adapters/ and registers as an adapter, not a
 * connector (it holds no store; it speaks a lane).
 *
 * The two houses split the seam: synmergia is the WORLD and implements the
 * door (`observe`/`act`/`wait_for`/`events`); vant is the BRAIN and drives it
 * as a client. gamestruct names the four primitives so neither half owns the
 * other's dialect. This is vant's half.
 *
 * Security posture (SPEC section 7, mapped onto vant's own wall):
 *   - LOOPBACK BY DEFAULT. A door is `http://127.0.0.1:<port>` unless an
 *     operator names another address. A literal loopback host skips the
 *     domain wall (there is no DNS to rebind) but is never logged with its
 *     token; any REMOTE door rides the full SSRF wall + DNS-rebinding
 *     refusal in lib/network.fetch.
 *   - TOKEN, FAIL-CLOSED. When a token is configured it rides every request
 *     (`Authorization: Bearer`, or `x-api-key`). The client never decides
 *     whether the door requires one - the door refuses; the client just
 *     attaches what it holds and never logs it.
 *   - No credentials in the URL: a door URL carrying `user:pass@` is refused
 *     typed (a leaked userinfo is a leaked secret).
 *
 * All outbound traffic rides lib/network.fetch (the SSRF IP wall, the
 * DNS-rebinding refusal, the circuit breaker) - nothing here does its own
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
        this.connected = false;
    }

    /** One request through vant's own wall. `body` is JSON-encoded when given. */
    async _request(method, pathname, body) {
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
                internalPolicy: this.internalPolicy
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

    /** section 2: the current world state for this seat. */
    async observe() {
        const snap = await this._request('POST', '/observe', {});
        this.connected = !!(snap && snap.ok !== false);
        return snap;
    }

    /** section 2: do one thing by stable handle (`world:<id>`, `ui:<path>`, or a verb). */
    async act(id, args = {}) {
        if (typeof id !== 'string' || !id) {
            throw _vantErr('gamestruct.act: id must be a non-empty stable handle', 'E_GAMESTRUCT_INPUT');
        }
        return this._request('POST', '/act', { id, args });
    }

    /** section 2: block until a condition holds or the timeout expires (honest timeout, never a hang). */
    async waitFor(predicate, timeoutMs) {
        if (!predicate || typeof predicate !== 'object') {
            throw _vantErr('gamestruct.waitFor: predicate must be an object', 'E_GAMESTRUCT_INPUT');
        }
        const ms = Number.isFinite(timeoutMs) ? timeoutMs : this.timeout;
        return this._request('POST', '/wait_for', { predicate, timeoutMs: ms });
    }

    /** section 2: the event ring since a frame cursor (what happened while you were not looking). */
    async events(sinceFrame = 0) {
        const since = Number.isFinite(sinceFrame) ? sinceFrame : 0;
        const out = await this._request('GET', '/events?since=' + since);
        return Array.isArray(out) ? out : (out && Array.isArray(out.events) ? out.events : []);
    }

    /**
     * section 3.2: the brain-facing MCP binding. `tools/list` carries a real
     * inputSchema per verb so a brain auto-wires without hand-written glue.
     */
    async tools() {
        const out = await this._request('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const list = out && out.result && Array.isArray(out.result.tools) ? out.result.tools : [];
        return list;
    }

    /** section 3.2: one MCP tool call. */
    async call(name, args = {}) {
        if (typeof name !== 'string' || !name) {
            throw _vantErr('gamestruct.call: tool name must be a non-empty string', 'E_GAMESTRUCT_INPUT');
        }
        const out = await this._request('POST', '/mcp', {
            jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args }
        });
        if (out && out.error) throw _vantErr('gamestruct.call: ' + (out.error.message || 'door error'), 'E_GAMESTRUCT_WIRE');
        return out && out.result;
    }

    /**
     * section 8: pursue one want THROUGH the lane - the same observe/act
     * primitives used without an objective. One cycle: look, pick a safe
     * affordance, act once, return a learn line the leisure keeper records.
     * Never throws on a refused act (a refusal is a first-class outcome).
     */
    async play(want, opts = {}) {
        const snap = await this.observe();
        const actions = (snap && Array.isArray(snap.actions)) ? snap.actions.filter((a) => a && !a.disabled) : [];
        if (!actions.length) return { ok: true, want, acted: false, learned: 'nothing to do in the world right now' };
        const pick = actions.find((a) => a.action === opts.prefer) || actions[0];
        const result = await this.act(pick.id, opts.args || {});
        const ok = !!(result && result.ok !== false);
        return {
            ok: true,
            want,
            acted: true,
            handle: pick.id,
            action: pick.action,
            outcome: ok ? 'done' : 'refused',
            learned: ok
                ? 'played: ' + pick.action + ' at ' + pick.id
                : 'refused: ' + ((result && result.reason) || 'unknown')
        };
    }
}

module.exports = { GamestructAdapter };
