/**
 * Vant Crew Bus (v0.8.6, pass 35) — node-crew v0.2 transport
 *
 * The PRD's v0.1 constraint: crew nodes shared ONE process because protocol
 * state lived in module singletons, so "parallel" meant in-process actors.
 * This module is the network bridge: crew messages travel as SIGNED webhook
 * envelopes between node processes (labs/prd-node-crew.md v0.2).
 *
 *   node A                              node B
 *   crewBus.configure({name, port})     crewBus.configure({name, port})
 *   crewBus.registerNode({name:'b',…})  crewBus.registerNode({name:'a',…})
 *   crewBus.listen(port)                crewBus.listen(port)
 *   crewBus.send('b','message',payload) ── HMAC-signed POST ──▶ /b route
 *                                        └─ verify → dispatch → ack
 *
 * Security posture (reuses existing chains, zero new crypto):
 *   - Envelopes are HMAC-SHA256 signed (Encrypt.hmacSign) and verified by
 *     lib/webhooks' inbound route (timing-safe Encrypt.hmacVerify) before
 *     anything dispatches. Unsigned/missigned POSTs get 401.
 *   - Outbound delivery goes through lib/network.fetch with system:true
 *     (system-initiated transport — the sandbox gate stays for agent-space
 *     fetches). The SSRF domain allowlist still applies: nodes call
 *     network.setAllowedDomains([...]) for their crew peers.
 *   - Node names share the brain/topic charset [A-Za-z0-9_-] — they become
 *     webhook route segments.
 *
 * Envelope shape (JSON body):
 *   { event: 'crew.<type>', from, type, payload, ts, nonce }
 * The `event` field is what lib/webhooks' eventKeyExpr reads; verified
 * deliveries emit `webhook:crew.<type>` into the event system AND dispatch
 * to the bus's registered handler for `<type>`.
 */

const Encrypt = require('./encrypt');
const errors = require('./error');
const logger = require('./audit');
const network = require('./network');

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        try { return _event.emit(event, data); } catch (e) { return -1; }
    }
    return 0;
}

const VALID_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const SIGNATURE_HEADER = 'X-Signature-256';

// (pass 61 / Wave E) ENVELOPE PROTOCOL VERSION — the stamps on the Post.
// Nodes of different ages must interoperate or refuse loudly, never
// silently misread each other. MAJOR bumps change the envelope's parsing
// contract (field names, semantics, required fields) — a receiver that
// does not know the major CANNOT interpret the payload and must refuse
// loudly. MINOR bumps are additive (new optional fields, new types) —
// an older receiver tolerates them; its known fields read as before.
//
// GATES RUN ON THE RECEIVER (the Wave-E watch-item): a sender's version
// claim — or a missing, forged, or downgraded one — never widens what a
// receiving node accepts. The receiver evaluates every payload with its
// OWN gate stack (scope, registered-peers, merge re-derivation) exactly
// as if the envelope carried no version at all. The stamp exists so the
// receiver can REFUSE what it cannot parse, not so it can trust more.
const ENVELOPE_VERSION = { major: 1, minor: 0 };

// (pass 61) Test/ops seam: stage the receiver's version to exercise the
// cross-version matrix for real (an v1 receiver cannot otherwise meet a
// v1 sender as 'the older one'). Guarded by the same validator as the
// wire; the PRODUCTION stamp reads this object live, so a staged value
// changes what the receiver accepts AND what it signs — always restore.
function _setReceiverVersion(v) {
    if (!_validVersion(v) || !v || v.major < 1) {
        throw new errors.VantError('Invalid receiver version', { code: errors.CODES.INPUT_VALIDATION_FAILED });
    }
    ENVELOPE_VERSION.major = v.major;
    ENVELOPE_VERSION.minor = v.minor;
    return { ...ENVELOPE_VERSION };
}

function _validVersion(v) {
    return v === null || v === undefined
        || (typeof v === 'object' && !Array.isArray(v)
            && Number.isFinite(v.major) && v.major >= 1 && v.major <= 1000
            && Number.isFinite(v.minor) && v.minor >= 0 && v.minor <= 1000);
}

function _validNodeName(name) {
    return typeof name === 'string' && VALID_NAME.test(name);
}

function _validUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) { return false; }
}

/**
 * Create an isolated bus instance. One per node process is normal; the
 * factory exists so tests can run twin buses in-process (each instance
 * registers its own webhook route and filters events by its own name).
 * @param {object} [opts] - { name, port, secret } to configure immediately
 */
function createBus(opts = {}) {
    const state = {
        config: null,          // { name, port, secret }
        server: null,          // http server from webhooks.startServer
        nodes: new Map(),      // peer name → { name, url, secret }
        dispatchers: new Map(),// type → handler fn(envelope)
        subscribed: new Set(), // event types with a live webhook:… subscription
        seq: 0,
        listening: false
    };

    function _configured() {
        if (!state.config) {
            throw new errors.VantError('Crew bus not configured — call configure({ name, port, secret }) first',
                { code: errors.CODES.CONFIG_MISSING });
        }
        return state.config;
    }

    // Inbound: lib/webhooks verified the HMAC + matched the filter, then
    // emitted webhook:<event>. Filter to OUR route (twin buses in one
    // process must not cross-dispatch), validate the envelope, dispatch.
    function _onWebhookEvent(data) {
        if (!state.config) return;
        if (!data || data.webhook !== state.config.name) return;
        const env = data.body;
        if (!env || typeof env !== 'object') return;
        if (env.from == null || env.type == null || env.payload === undefined) {
            logger.warn('[CrewBus] Malformed envelope dropped: ' + JSON.stringify(env).slice(0, 120));
            return;
        }
        if (env.event !== 'crew.' + env.type) {
            logger.warn('[CrewBus] Event/type mismatch dropped: ' + String(env.event).slice(0, 60));
            return;
        }
        // (pass 61 / Wave E) VERSION GATE — before the scope gate, because
        // this gate decides whether the receiver can INTERPRET the payload
        // at all. Precedence inside this gate:
        //   1. malformed v (garbage, wrong shape, out of range) → drop
        //   2. future MAJOR (sender newer than receiver) → loud drop:
        //      the parsing contract itself is unknown
        //   3. past MAJOR (sender older than receiver) → loud drop: the
        //      receiver's contract assumes fields the old wire may not
        //      carry (a lenient read of an old format would be the
        //      silent-misparse the PRD forbids)
        //   4. MINOR mismatch (either direction) → tolerated: additive
        //   5. missing v (pre-Wave-E sender) → tolerated as {1,0}: the
        //      current envelope shape IS v1.0, so an unstamped v1-era
        //      envelope is exactly what this receiver already reads
        // Forged claims change nothing further down: every payload gate
        // (scope, registered-peers, re-derivation) runs on the receiver
        // with its own resolvers regardless of the stamp.
        if (!_validVersion(env.v)) {
            logger.warn('[CrewBus] Malformed envelope version dropped (v=' + JSON.stringify(env.v) + '): ' + env.type + ' from ' + env.from);
            return;
        }
        if (env.v && env.v.major !== ENVELOPE_VERSION.major) {
            const dir = env.v.major > ENVELOPE_VERSION.major ? 'newer sender' : 'older sender';
            logger.warn('[CrewBus] Envelope MAJOR version mismatch — DROPPED (' + dir + ': v' + env.v.major + '.' + env.v.minor + ', receiver v' + ENVELOPE_VERSION.major + '.' + ENVELOPE_VERSION.minor + '): ' + env.type + ' from ' + env.from);
            _emit('crew:version:mismatch', { from: env.from, type: env.type, sender: env.v, receiver: { ...ENVELOPE_VERSION }, direction: dir });
            return;
        }
        if (env.v && env.v.minor !== ENVELOPE_VERSION.minor) {
            logger.warn('[CrewBus] Envelope minor version difference tolerated (sender v' + env.v.major + '.' + env.v.minor + ', receiver v' + ENVELOPE_VERSION.major + '.' + ENVELOPE_VERSION.minor + '): ' + env.type + ' from ' + env.from);
        }
        // (pass 40 / agora) Scope gate on inbound envelopes: a payload
        // carrying scope must pass canAccess for THIS node's agentId, or
        // it is dropped (scoped means unseen — same rule as market).
        // Unscoped payloads flow as before. The node identity is the bus
        // name; configure({ agentId }) links the node to its principal so
        // team/org/agent scopes resolve. Without an agentId, a scoped
        // payload is invisible (fail-closed).
        if (env.payload && env.payload.scope) {
            // (pass 41 live-fire hardening) FAIL-CLOSED: if the scope module
            // cannot even be loaded we cannot evaluate the boundary, so a
            // scoped envelope is dropped — never dispatched. The old shape
            // fell through to dispatch when the require threw (the gate
            // vanished exactly when the system is broken).
            let scopeMod = null;
            try { scopeMod = require('./scope'); } catch (e) { scopeMod = null; }
            if (!scopeMod) {
                logger.warn('[CrewBus] Scope module unavailable - scoped envelope DROPPED (fail-closed): ' + env.type + ' from ' + env.from);
                return;
            }
            let visible = false;
            try { visible = scopeMod.canAccess({ scope: env.payload.scope }, state.config.agentId); } catch (e) { visible = false; }
            if (!visible) {
                logger.warn('[CrewBus] Scoped envelope dropped (not a member): ' + env.type + ' from ' + env.from);
                return;
            }
        }
        const handler = state.dispatchers.get(env.type);
        if (handler) {
            try { handler(env); }
            catch (e) { logger.error('[CrewBus] Dispatcher error (' + env.type + '): ' + e.message); }
        }
        // Local event for other vant systems (islands, cron, consensus…)
        _emit('crew:' + env.type, env);
    }

    function _subscribe(type) {
        if (state.subscribed.has(type)) return;
        try {
            const event = require('./event');
            event.on('webhook:crew.' + type, _onWebhookEvent);
            state.subscribed.add(type);
        } catch (e) { /* event system unavailable — dispatchers still get nothing inbound */ }
    }

    /** Configure this node: { name, port, secret, agentId? }. Required before listen/send. */
    function configure(opts2 = {}) {
        const name = opts2.name;
        if (!_validNodeName(name)) {
            throw new errors.VantError('Invalid crew node name: ' + JSON.stringify(name).slice(0, 40) +
                ' (allowed: [A-Za-z0-9_-])', { code: errors.CODES.INPUT_VALIDATION_FAILED });
        }
        const port = parseInt(opts2.port, 10);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new errors.VantError('Invalid crew bus port', { code: errors.CODES.INPUT_VALIDATION_FAILED });
        }
        // (pass 42 live-fire) A node that listens MUST have a secret: the
        // inbound route HMAC-verifies envelopes against it, and outbound
        // HMAC-signing with an undefined key already throws. Secretless crew
        // = zero transport auth. Outbound-only nodes may omit it.
        if (typeof opts2.secret !== 'string' || !opts2.secret) {
            throw new errors.VantError('Crew bus requires a secret (shared HMAC key for envelope auth) — pass { secret }',
                { code: errors.CODES.INPUT_VALIDATION_FAILED });
        }
        // (pass 40 / agora) agentId links this node to its principal agent
        // for scope resolution (scoped envelopes resolve membership against
        // it). Optional: without it, scoped inbound payloads are dropped.
        state.config = { name, port, secret: opts2.secret, agentId: opts2.agentId || null };
        return { name, port, agentId: state.config.agentId };
    }

    /**
     * Register a peer node. Peers are webhook routes on THEIR process:
     * url is the base (we append /<name>), secret is the shared HMAC key.
     */
    function registerNode({ name, url, secret } = {}) {
        _configured();
        if (!_validNodeName(name)) {
            throw new errors.VantError('Invalid peer node name', { code: errors.CODES.INPUT_VALIDATION_FAILED });
        }
        if (!_validUrl(url)) {
            throw new errors.VantError('Invalid peer node url: ' + String(url).slice(0, 60),
                { code: errors.CODES.INPUT_VALIDATION_FAILED });
        }
        state.nodes.set(name, { name, url: url.replace(/\/+$/, ''), secret });
        _emit('crew:node:registered', { name, url, timestamp: Date.now() });
        return { name, url };
    }

    function removeNode(name) {
        return state.nodes.delete(name);
    }

    /** Peer snapshot — secrets never leave the process. */
    function nodes() {
        return [...state.nodes.values()].map((n) => ({ name: n.name, url: n.url }));
    }

    /** Register the dispatcher for an envelope type (e.g. 'message'). */
    function onDispatch(type, handler) {
        if (typeof handler !== 'function') {
            throw new errors.VantError('Dispatcher must be a function', { code: errors.CODES.INPUT_VALIDATION_FAILED });
        }
        state.dispatchers.set(type, handler);
        _subscribe(type);
    }

    /** Start the webhook server for this node's route. */
    function listen(port) {
        const config = _configured();
        if (state.listening) return state.server;
        const webhooks = require('./webhooks');
        // Route = /<node name> (webhooks routes by registered name).
        webhooks.register({
            name: config.name,
            source: 'vant-crew',
            eventKeyExpr: 'event',
            signatureHeader: SIGNATURE_HEADER,
            secret: config.secret
        });
        state.server = webhooks.startServer(port || config.port);
        state.listening = true;
        // (pass 36 / prd-vant-os Wave 1) Crew nodes are first-class registry
        // peers: listen() registers into node-registry (consensus's vote-
        // verification anchor) so peers can be verified and quorum-counted.
        // Deterministic id — a re-listen refreshes the entry instead of
        // duplicating it.
        try {
            const registry = require('./node-registry');
            registry.register({
                id: 'crew_' + config.name,
                name: config.name,
                host: 'localhost',
                port: config.port,
                status: 'alive',
                metadata: { kind: 'crew-node', source: 'vant-crew' }
            });
        } catch (e) {
            logger.error('[CrewBus] Registry registration failed: ' + e.message);
        }
        _emit('crew:bus:listening', { name: config.name, port: config.port, timestamp: Date.now() });
        return state.server;
    }

    /** Deliver one envelope to one peer. Resolves { ok, handlers, ack }. */
    async function _deliver(node, type, payload) {
        const config = _configured();
        const envelope = {
            event: 'crew.' + type,
            from: config.name,
            type,
            payload,
            ts: Date.now(),
            nonce: ++state.seq,
            v: { ...ENVELOPE_VERSION } // (pass 61) the stamp on the Post
        };
        const body = JSON.stringify(envelope);
        const signature = Encrypt.hmacSign(body, node.secret);
        const url = node.url + '/' + node.name;
        const raw = await network.fetch(url, {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: signature },
            circuit: true,
            system: true // system-initiated transport (see header: security posture)
        });
        let ack = null;
        try { ack = JSON.parse(raw); } catch (e) { /* non-JSON ack body */ }
        return {
            ok: !!(ack && ack.received),
            handlers: ack && typeof ack.handlers === 'number' ? ack.handlers : 0,
            ack
        };
    }

    /** Send one message to one peer. Throws on unknown node / not configured. */
    async function send(nodeName, type, payload = {}) {
        const config = _configured();
        if (!_validNodeName(nodeName) || !state.nodes.has(nodeName)) {
            throw new errors.VantError('Unknown crew node: ' + String(nodeName).slice(0, 40),
                { code: errors.CODES.NOT_FOUND });
        }
        if (nodeName === config.name) {
            throw new errors.VantError('Cannot send to self', { code: errors.CODES.VAF_INPUT_INVALID });
        }
        return _deliver(state.nodes.get(nodeName), type, payload);
    }

    /** Send to every registered peer (parallel). Never rejects per-peer. */
    async function broadcast(type, payload = {}) {
        _configured();
        const targets = [...state.nodes.values()].filter((n) => n.name !== state.config.name);
        return Promise.all(targets.map((n) =>
            _deliver(n, type, payload)
                .then((r) => ({ node: n.name, ...r }))
                .catch((e) => ({ node: n.name, ok: false, error: e.message }))
        ));
    }

    /** Bus status snapshot (safe for logs). */
    function status() {
        return {
            configured: !!state.config,
            name: state.config ? state.config.name : null,
            // (pass 50) The node's principal agent (configure({ agentId }))
            // — identity, not a secret; consumers (agora-sync.vote) need it
            // to attribute remote ballots.
            agentId: state.config ? state.config.agentId : null,
            port: state.config ? state.config.port : null,
            listening: state.listening,
            peers: nodes().map((n) => n.name)
        };
    }

    /** Stop the HTTP server. Idempotent. */
    function stop() {
        if (!state.listening) return Promise.resolve();
        const server = state.server;
        state.listening = false;
        state.server = null;
        // (pass 36) Leave the registry as we came in — the peer is gone
        // from the wire the moment the server closes.
        try {
            require('./node-registry').unregister('crew_' + state.config.name);
        } catch (e) { /* registry unavailable — server still closes */ }
        return new Promise((resolve) => server.close(() => resolve()));
    }

    if (opts.name) configure(opts);

    return {
        configure, listen, send, broadcast,
        registerNode, removeNode, nodes, onDispatch,
        status, stop,
        // test seams
        _state: state
    };
}

// (pass 61 / Wave E) The receiver's own protocol version. Exported so
// tools and tests can stamp/stage envelopes against the truth instead of
// hardcoding literals that would drift at the next bump.
const ENVELOPE_V = { get major() { return ENVELOPE_VERSION.major; }, get minor() { return ENVELOPE_VERSION.minor; } };

// Default singleton: the normal one-bus-per-process case.
const defaultBus = createBus();

module.exports = {
    createBus,
    ENVELOPE_V,
    _setReceiverVersion,
    // singleton convenience (closures — no `this`, safe to spread)
    configure: defaultBus.configure,
    listen: defaultBus.listen,
    send: defaultBus.send,
    broadcast: defaultBus.broadcast,
    registerNode: defaultBus.registerNode,
    removeNode: defaultBus.removeNode,
    nodes: defaultBus.nodes,
    onDispatch: defaultBus.onDispatch,
    status: defaultBus.status,
    stop: defaultBus.stop,
    default: defaultBus
};
