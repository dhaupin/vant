/**
 * Vant Webhook System (v0.8.6)
 * WITH EVENT EMISSIONS - HTTP triggers emit globally
 *
 * Inbound webhook receiver + event triggers for automations
 * Used for GitHub events, custom services, and automation triggers
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        // (pass 33) return the handler count — the server reports it in the
        // HTTP response and callers can detect the -1 recursion-blocked case.
        return _event.emit(event, data);
    }
    return 0;
}

const http = require('http');
const Encrypt = require('./encrypt');
const logger = require('./audit');
const Storage = require('./storage');
const network = require('./network');
const vaf = require('./vaf');
const { QoS } = require('./qos');
const pipeline = require('./pipeline');
// (pass 33) brain was USED (audit log write) but never imported — every
// webhook event logged '[Webhook] Brain log error: brain is not defined'
// and the audit trail silently vanished. Caught by the pass-33 live probe.
const brain = require('./brain');
// (pass 35) _checkNetwork threw `new errors.VantError` with no errors module
// in scope — a ReferenceError its own catch swallowed, so the network
// capability gate silently no-op'd. Same latent bug class onboard had.
const errors = require('./error');

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// Check capability before network operations
function _checkNetwork() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canNetwork) {
        try {
            if (!sandbox.canNetwork()) {
                throw new errors.VantError('Network permission required for webhook operations', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
            }
        } catch (e) {}
    }
}

const qos = new QoS();

// Environment
const WEBHOOK_PORT = process.env.VANT_WEBHOOK_PORT || 3456;
const WEBHOOK_SECRET = process.env.VANT_WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.VANT_WEBHOOK_URL;

// Webhook Registry
const webhooks = new Map();

// Event filters (JMESPath patterns)
const filters = new Map();

// (pass 42 live-fire) Replay/freshness defense for signed envelopes.
// Crew-bus signs ENVELOPE BYTES, so a captured request replays bit-perfect
// forever (probe-verified: identical bytes + identical signature dispatched
// twice, 10-minute-old ts dispatched). The signed bytes themselves are the
// dedupe key: same bytes = same signature = replay. Fresh envelopes carry a
// numeric ts; non-crew payloads without ts skip the freshness half.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const REPLAY_SEEN_MAX = 5000; // per route; bounded memory
const replaySeen = new Map(); // routeName -> Map(signatureHex -> firstSeenTs)

function _replayCheck(routeName, payload, signatureHex) {
    if (!signatureHex) return { ok: true };
    let seen = replaySeen.get(routeName);
    if (!seen) { seen = new Map(); replaySeen.set(routeName, seen); }
    if (seen.has(signatureHex)) {
        return { ok: false, code: 409, error: 'Replay detected: envelope already processed' };
    }
    // Freshness: crew envelopes are timestamped at send; refuse ones outside
    // the window so an attacker cannot bank signed bytes for later replay.
    if (payload && typeof payload === 'object' && typeof payload.ts === 'number') {
        const age = Math.abs(Date.now() - payload.ts);
        if (age > REPLAY_WINDOW_MS) {
            return { ok: false, code: 401, error: 'Stale envelope: ts outside replay window' };
        }
    }
    seen.set(signatureHex, Date.now());
    if (seen.size > REPLAY_SEEN_MAX) {
        // Drop the oldest half (insertion-ordered).
        const drop = Math.floor(REPLAY_SEEN_MAX / 2);
        let n = 0;
        for (const k of seen.keys()) { if (n++ >= drop) break; seen.delete(k); }
    }
    return { ok: true };
}

/**
 * Register webhook source
 * @param {object} config - { name, source, eventKeyExpr, signatureHeader, secret }
 */
function register(config) {
    const { name, source, eventKeyExpr = 'type', signatureHeader = 'X-Signature-256', secret } = config;

    const webhook = {
        name,
        source,
        eventKeyExpr,
        signatureHeader,
        secret: secret || WEBHOOK_SECRET,
        enabled: true,
        createdAt: new Date().toISOString()
    };

    // (pass 42 live-fire) A route without a secret can never authenticate:
    // HMAC with an undefined key throws in Encrypt.hmacSign, and the old
    // fail-open verifySignature was its only "protection". Refuse to serve
    // unauthenticated routes instead of inviting forgeries.
    if (!webhook.secret) {
        throw new errors.VantError('Webhook route refuses to bind without a secret (pass VANT_WEBHOOK_SECRET or secret:)',
            { code: errors.CODES.INPUT_VALIDATION_FAILED });
    }

    webhooks.set(name, webhook);

    // EVENT: webhook registered (integration connected)
    _emit('webhook:registered', {
        name,
        source,
        timestamp: Date.now()
    });

    logger.info(`[Webhook] Registered: ${name} (${source})`);

    return {
        id: name,
        webhook_url: `${WEBHOOK_URL}/${source}`,
        source,
        enabled: true
    };
}

/**
 * Verify webhook signature.
 * (pass 42 live-fire) FAIL-CLOSED: a missing signature or a missing secret
 * REFUSES. The old `if (!signature || !secret) return true` meant ANY route
 * with a configured secret still accepted an unsigned request — an attacker
 * who can reach the port forges envelopes wholesale (probe-verified: unsigned
 * crew envelopes dispatched with 200). Secretless routes are refused at
 * register() so this belt keeps them from ever binding.
 */
function verifySignature(payload, signature, secret) {
    if (!secret || !signature) return false;
    return Encrypt.hmacVerify(payload, secret, signature);
}

/**
 * Parse event with JMESPath filter
 */
async function parseEvent(webhook, payload) {
    // Simple JMESPath-like extraction
    const key = webhook.eventKeyExpr;
    const eventType = key.includes('.')
        ? key.split('.').reduce((obj, k) => obj?.[k], payload)
        : payload[key];

    return eventType;
}

/**
 * Add event filter
 */
function addFilter(webhookName, eventPattern, filterExpr) {
    const key = `${webhookName}:${eventPattern}`;
    filters.set(key, filterExpr);
    logger.info(`[Webhook] Filter: ${key} = ${filterExpr}`);
}

/**
 * Match event against filter
 */
function matchFilter(filterExpr, payload) {
    if (!filterExpr) return true;

    // Basic JMESPath filter implementation
    try {
        // Simple equality
        if (filterExpr.includes('==')) {
            const [path, value] = filterExpr.split('==').map(s => s.trim());
            const actual = path.split('.').reduce((obj, k) => obj?.[k], payload);
            return actual == value.replace(/^`|`$/g, '');
        }

        // glob pattern
        if (filterExpr.includes('glob(')) {
            const match = filterExpr.match(/glob\((\w+),\s*'(\w+\/\*)'\)/);
            if (match) {
                const [path, pattern] = match;
                const actual = path.split('.').reduce((obj, k) => obj?.[k], payload);
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                return regex.test(actual);
            }
        }

        // contains
        if (filterExpr.includes('contains(')) {
            const match = filterExpr.match(/contains\((\w+)\.\w+,\s*'(\w+)'\)/);
            if (match) {
                const [path, value] = match;
                const actual = path.split('.').reduce((obj, k) => obj?.[k], payload);
                return actual?.includes(value);
            }
        }

        // icontains (case-insensitive)
        if (filterExpr.includes('icontains(')) {
            const match = filterExpr.match(/icontains\((\w+),\s*'(\w+)'\)/);
            if (match) {
                const [path, value] = match;
                const actual = path.split('.').reduce((obj, k) => obj?.[k], payload);
                return actual?.toLowerCase().includes(value.toLowerCase());
            }
        }

        return true;
    } catch (e) {
        logger.warn(`[Webhook] Filter error: ${e.message}`);
        return false;
    }
}

/**
 * Start webhook server.
 * (pass 42 live-fire) Binds LOOPBACK by default — the old listen(port) with
 * no host advertised HMAC-authenticated (and historically fail-open)
 * envelope endpoints to the whole LAN. VANT_WEBHOOK_BIND is the explicit
 * opt-out for real multi-host crew deployments.
 */
function startServer(port = WEBHOOK_PORT) {
    _checkNetwork();
    const bind = process.env.VANT_WEBHOOK_BIND || '127.0.0.1';
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const path = url.pathname.slice(1); // remove leading /

        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature-256');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        try {
            // Health check
            if (path === 'health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', webhooks: webhooks.size }));
                return;
            }

            // Get webhook info
            if (path.startsWith('info')) {
                const source = path.split('/')[1];
                const webhook = webhooks.get(source);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(webhook || { error: 'Not found' }));
                return;
            }

            // Webhook event
            if (req.method === 'POST') {
                const chunks = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const payload = Buffer.concat(chunks).toString();
                const body = JSON.parse(payload);

                // Find webhook by path
                const webhook = webhooks.get(path);
                if (!webhook) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Webhook not found' }));
                    return;
                }

                // Verify signature (fail-closed: unsigned requests are refused
                // whenever a secret is configured — which is always, since
                // register() refuses secretless routes)
                const signature = req.headers[webhook.signatureHeader.toLowerCase()];
                if (!verifySignature(payload, signature, webhook.secret)) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid signature' }));
                    return;
                }

                // (pass 42 live-fire) Replay + freshness gate on the signed
                // bytes. Identical signed envelope = 409; stale ts = 401.
                // NOTE: `payload` is the raw body STRING here; `body` is the
                // parsed envelope — freshness reads ts off the object.
                const replay = _replayCheck(webhook.name, body, String(signature || ''));
                if (!replay.ok) {
                    res.writeHead(replay.code, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: replay.error }));
                    return;
                }

                // Parse event type
                const eventType = await parseEvent(webhook, body);
                logger.info(`[Webhook] Event: ${eventType}`);

                // Get filter
                const filterKey = `${webhook.name}:${eventType}`;
                const filterExpr = filters.get(filterKey);

                // Match filter
                if (filterExpr && !matchFilter(filterExpr, body)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ filtered: true }));
                    return;
                }

                // Log to brain
                try {
                    const audit = {
                        type: 'webhook',
                        source: webhook.source,
                        event: eventType,
                        timestamp: new Date().toISOString()
                    };
                    // SECURITY: Use brain.write (includes VAF → QoS → Escrow by default)
                    await brain.write('audit', 'logger.md', JSON.stringify(audit, null, 2));
                } catch (e) {
                    logger.warn(`[Webhook] Brain log error: ${e.message}`);
                }

                // (pass 33) EMIT the event into the event system. The header
                // always claimed "HTTP triggers emit globally" but only
                // registration emitted — the actual event never did, so
                // nothing (consensus, islands, cron, crew nodes) could react
                // to an HTTP trigger. Channel: 'webhook:<event>' with source
                // + payload + parse metadata.
                let handlerCount = 0;
                try {
                    handlerCount = _emit('webhook:' + eventType, {
                        source: webhook.source,
                        webhook: webhook.name,
                        event: eventType,
                        body,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    logger.warn(`[Webhook] Event emit error: ${e.message}`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    received: true,
                    event: eventType,
                    source: webhook.source,
                    handlers: handlerCount === -1 ? 0 : handlerCount
                }));
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));

        } catch (e) {
            logger.error(`[Webhook] Server error: ${e.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });

    server.listen(port, bind, () => {
        logger.info(`[Webhook] Server listening on ${bind}:${port}`);
    });

    return server;
}

/**
 * Send outbound webhook
 * @param {string} url - Target URL
 * @param {object} payload - Event payload
 */
async function send(url, payload) {
    _checkNetwork();
    logger.info(`[Webhook] Sending to ${url}`);

    try {
        const data = await network.fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload),
            circuit: true
        });

        return !!data;
    } catch (e) {
        logger.error(`[Webhook] Send error: ${e.message}`);
        return false;
    }
}

module.exports = {
    register,
    verifySignature,
    addFilter,
    matchFilter,
    startServer,
    _replayCheck,
    send
};
// ========================================
// Generic Webhook Sender (Batch 5)
// ========================================

/**
 * Generic webhook sender
 * @param {string} url - Target URL
 * @param {string} method - HTTP method
 * @param {object} headers - Custom headers
 * @param {object} body - Request body
 */
async function sendWebhook(url, method = 'POST', headers = {}, body = {}) {
    // Run through unified pipeline
    return pipeline.run(
        { name: 'webhooks:send', url, method, operation: 'send' },
        async () => {
            _checkNetwork();
            logger.info(`[Webhook] ${method} ${url}`);

            try {
                const data = await network.fetch(url, {
                    method,
                    body: JSON.stringify(body),
                    headers: { 'Content-Type': 'application/json', ...headers },
                    circuit: true
                });

                if (data) {
                    logger.info(`[Webhook] Success`);
                    return { ok: true, status: 200 };
                } else {
                    logger.warn(`[Webhook] Failed`);
                    return { ok: false, status: 500 };
                }
            } catch (e) {
                logger.error(`[Webhook] Error: ${e.message}`);
                return { ok: false, error: e.message };
            }
        },
        { mode: pipeline.REMOTE }
    );
}

// Extend exports
module.exports = {
    ...module.exports,
    register,
    verifySignature,
    addFilter,
    matchFilter,
    startServer,
    _replayCheck,
    send,
    sendWebhook
};
