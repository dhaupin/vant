const errors = require('./error');
/**
 * Msg (v0.8.6)
 * Agent-to-agent messaging (unified: Conversation + IPC + Encryption)
 *
 * Messaging layers:
 * - Plain: Default, readable
 * - Encrypt: AES-256-GCM encryption (via encrypt.js)
 *
 * Usage:
 *   const msg = require('./msg');
 *   msg.post(convId, "hello");
 *   msg.post(convId, "secret", { encrypt: true });
 *   msg.send(channel, message);  // IPC-style
 *
 * Configuration (via config.js):
 *   config.get('msg.encrypted')       // Enable encryption (default: true)
 *   config.get('msg.autoEncrypt')     // Auto-detect encryption (default: true)
 */

const vaf = require('./vaf');
const qos = require('./qos');
const escrow = require('./escrow');
const encrypt = require('./encrypt');
const config = require('./config');
const event = require('./event');
const guard = require('./recursion');  // Unified recursion guard

// Lazy load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// Lazy load pipeline for unified security chain (v0.9.0-axolotl)
let _pipeline = null;
function _getPipeline() {
    if (!_pipeline) {
        try { _pipeline = require('./pipeline'); } catch (e) {}
    }
    return _pipeline;
}

function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('ECAP: read not allowed', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkRead(userCtx, resource, 'read');
    }
}

// ==================== DEFAULTS ====================
// Default encryption key (should be overridden in production via config)
const DEFAULT_ENCRYPT_KEY = 'vant-msg-default-key-2024';

// ==================== MSG STORAGE ====================
const _conversations = new Map();
const _channels = new Map();  // IPC-style (no history)
const _handlers = new Map();   // Channel subscribers

// ==================== PERSISTENCE (pass 37 / prd-vant-os arch A) ====================
// Conversations (bounded message arrays + participants) are the history
// unit; channels are ephemeral IPC by design (never persisted). Snapshot
// serialization converts Sets; hydration restores them. Rules live in
// lib/state-store.js (read-denial throws E_STATE_READ, corruption warns).
const stateStore = require('./state-store');
const MSG_STATE_FILE = 'state/msg-conversations.json';

// (pass 59 / Wave D, labs/prd-mesh.md) Cross-node snapshot bounds. A
// conversation snapshot is a WIRE shape: bounded arrays, bounded content,
// kind-marked so a receiving node can refuse junk before it touches a
// conversation. Bounds mirror the wire posture of agora-sync (a miss or
// a hostile peer cannot flood disk or memory).
const MSG_SNAPSHOT_KIND = 'vant-msg-snapshot';
const MSG_SYNC_MAX_MESSAGES = 200;        // most recent N messages ride the wire
const MSG_SYNC_MAX_PARTICIPANTS = 200;
const MSG_SYNC_MAX_REPLIES = 50;          // per message
const MSG_SYNC_MAX_CONTENT_CHARS = 10000; // matches vaf's max message length
const MSG_SYNC_MAX_META_KEYS = 16;
const MSG_SYNC_MAX_META_VALUE_CHARS = 200;

function _serializeConversations() {
    return Array.from(_conversations.values()).map((c) => ({
        id: c.id,
        messages: c.messages,
        participants: Array.from(c.participants),
        maxMessages: c.maxMessages,
        encryption: c.encryption,
        scope: c.scope || null,
        created: c.created,
        lastActivity: c.lastActivity
    }));
}

function _applyConversations(data) {
    if (!data || !Array.isArray(data.conversations)) return;
    for (const c of data.conversations) {
        if (!c || typeof c.id !== 'string' || !Array.isArray(c.messages)) continue;
        if (_conversations.has(c.id)) continue; // in-memory wins (hot state)
        _conversations.set(c.id, {
            id: c.id,
            messages: c.messages.slice(-(typeof c.maxMessages === 'number' ? c.maxMessages : 100)),
            participants: new Set(Array.isArray(c.participants) ? c.participants : []),
            maxMessages: typeof c.maxMessages === 'number' ? c.maxMessages : 100,
            encryption: !!c.encryption,
            scope: c.scope ? c.scope : null,
            created: c.created || Date.now(),
            lastActivity: c.lastActivity || Date.now()
        });
    }
}

let _msgHydrated = false;
function _hydrate() {
    if (_msgHydrated) return;
    _msgHydrated = true;
    stateStore.hydrate({ moduleName: 'msg', stateFile: MSG_STATE_FILE, apply: _applyConversations });
}

function _persistConversations() {
    stateStore.persist({
        moduleName: 'msg',
        stateFile: MSG_STATE_FILE,
        data: { conversations: _serializeConversations() }
    });
}

// Hydrate on module load (first import restores conversations).
// Injected Maps (new Msg({ conversations }) in tests) are untouched.
_hydrate();

// ==================== SECURITY ====================
// QoS rate limiter (max 500 messages/minute)
const _rateLimit = new qos.RateLimiter({ windowMs: 60000, maxPerMinute: 500 });

// ==================== UTILITIES ====================
function generateId(prefix = 'msg') {
    return prefix + '_' + Date.now().toString(36) + encrypt.key(24);
}

// Auto-detect encrypted content
function isEncrypted(content) {
    return typeof content === 'string' && content.startsWith('ENC:');
}

// ==================== SNAPSHOT WIRE HELPERS (pass 59 / Wave D) ====================

/** Shallow-clamp one message to wire bounds. Drops nothing a reader needs: id, author, content, timestamps, bounded metadata/replies. */
function _clampWireMessage(m) {
    if (!m || typeof m !== 'object') return null;
    const out = {
        id: String(m.id || '').slice(0, 120),
        author: String(m.author || 'anonymous').slice(0, 120),
        content: typeof m.content === 'string' ? m.content.slice(0, MSG_SYNC_MAX_CONTENT_CHARS) : '',
        encryption: m.encryption === 'encrypt' ? 'encrypt' : 'plain',
        timestamp: Number.isFinite(m.timestamp) ? m.timestamp : Date.now()
    };
    // Bounded metadata: flat string map only (wire shape; local metadata
    // may carry richer objects — those stay LOCAL, never ride the wire).
    const meta = {};
    if (m.metadata && typeof m.metadata === 'object') {
        for (const k of Object.keys(m.metadata).slice(0, MSG_SYNC_MAX_META_KEYS)) {
            const v = m.metadata[k];
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                meta[k] = typeof v === 'string' ? v.slice(0, MSG_SYNC_MAX_META_VALUE_CHARS) : v;
            }
        }
    }
    out.metadata = meta;
    // Bounded replies (wire shape: id/author/content/timestamp only).
    out.replies = (Array.isArray(m.replies) ? m.replies : []).slice(0, MSG_SYNC_MAX_REPLIES).map((r) => ({
        id: String((r && r.id) || '').slice(0, 120),
        author: String((r && r.author) || 'anonymous').slice(0, 120),
        content: typeof (r && r.content) === 'string' ? r.content.slice(0, MSG_SYNC_MAX_CONTENT_CHARS) : '',
        timestamp: Number.isFinite(r && r.timestamp) ? r.timestamp : Date.now()
    }));
    return out;
}

/** Validate + clamp a wire snapshot. Returns { ok, value?, reason? }. Kind-marked (pass-37 marker convention) — junk never reaches a conversation. */
function _validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'not_an_object' };
    if (snapshot.kind !== MSG_SNAPSHOT_KIND) return { ok: false, reason: 'bad_kind' };
    if (typeof snapshot.id !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(snapshot.id)) {
        return { ok: false, reason: 'invalid_id' };
    }
    if (!Array.isArray(snapshot.messages)) return { ok: false, reason: 'invalid_messages' };
    if (!Array.isArray(snapshot.participants)) return { ok: false, reason: 'invalid_participants' };
    // Scope: null (unscoped) or a normalizeable scope record — malformed
    // scope REFUSES the snapshot (the receiving node does not guess).
    let scope = null;
    if (snapshot.scope !== null && snapshot.scope !== undefined) {
        scope = require('./scope').normalize(snapshot.scope);
        if (!scope) return { ok: false, reason: 'invalid_scope' };
    }
    const messages = snapshot.messages.slice(-MSG_SYNC_MAX_MESSAGES)
        .map(_clampWireMessage)
        .filter((m) => m && m.id && m.id.length > 0)
        .sort((a, b) => (a.timestamp - b.timestamp) || a.id.localeCompare(b.id));
    // Dedup inside the batch (a sloppy sender must not smuggle a double).
    const seen = new Set();
    const deduped = messages.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
    const participants = snapshot.participants
        .filter((p) => typeof p === 'string' && p.length >= 1 && p.length <= 200)
        .slice(0, MSG_SYNC_MAX_PARTICIPANTS);
    return {
        ok: true,
        value: {
            id: snapshot.id,
            scope,
            messages: deduped,
            participants,
            created: Number.isFinite(snapshot.created) ? snapshot.created : Date.now(),
            lastActivity: Number.isFinite(snapshot.lastActivity) ? snapshot.lastActivity : Date.now()
        }
    };
}

// ==================== CORE MSG CLASS ====================
class Msg {
    constructor(options = {}) {
        this._conversations = options.conversations || _conversations;
        this._channels = options.channels || _channels;
        this._handlers = options.handlers || _handlers;
    }

    // ==================== CONVERSATION API ====================

    /**
     * Create conversation
     */
    create(options = {}) {
        const { id, maxMessages = 100, encryption = false } = options;

        if (id) vaf.check(id, { name: 'conversation id', minLength: 1, maxLength: 100 });

        if (maxMessages !== 100) {
            if (typeof maxMessages !== 'number' || maxMessages < 1 || maxMessages > 1000) {
                throw new errors.VantError('maxMessages must be 1-1000', { code: errors.CODES.UNKNOWN });
            }
        }

        const convId = id || 'conv_' + Date.now().toString(36);

        // (pass 59) Optional scope record (lib/scope.js shape). Recorded on
        // the conversation; ENFORCEMENT stays owner-side (the pass-50 rule)
        // — this is the seam cross-node snapshot legs and the habitat layer
        // gate on. Malformed scope rejects the create loudly.
        let convScope = null;
        if (options.scope !== undefined && options.scope !== null) {
            convScope = require('./scope').normalize(options.scope);
            if (!convScope) {
                throw new errors.VantError('Invalid scope for conversation ' + convId, { code: errors.CODES.UNKNOWN });
            }
        }

        const conversation = {
            id: convId,
            messages: [],
            participants: new Set(),
            maxMessages,
            encryption,
            scope: convScope,
            created: Date.now(),
            lastActivity: Date.now()
        };

        this._conversations.set(convId, conversation);
        _persistConversations();

        return { id: convId, messages: [] };
    }

    /**
     * Join existing conversation
     */
    join(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) {
            return this.create({ id: convId });
        }
        return conv;
    }

    /**
     * Post message (plain or encrypted, protected by sandbox)
     */
    post(convId, content, options = {}) {
        const {
            author = 'anonymous',
            metadata = {},
            encrypt: doEncrypt = false,      // Explicit encrypt
            forcePlain = false            // Force plain (skip auto-detect)
        } = options;

        // VAF validation
        vaf.check(convId, { name: 'conversation id', minLength: 1, maxLength: 100 });
        vaf.check(content, { name: 'message', minLength: 1, maxLength: 10000 });

        // Check sandbox capability (canWrite for sending messages)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) {
            return { error: 'Sandbox: capability not allowed - canWrite is false' };
        }

        // QoS rate limiting
        const opKey = 'msg:post:' + convId;
        if (!_rateLimit.check(opKey)) {
            return { error: 'Rate limit exceeded for messaging' };
        }

        // Escrow quota check
        const quota = escrow.checkQuota(opKey, 1);
        if (!quota.allowed) {
            return { error: 'Escrow quota exceeded for: ' + convId };
        }

        const conv = this._conversations.get(convId);
        if (!conv) {
            return { error: 'Conversation not found: ' + convId };
        }

        // Determine encryption layer
        let messageContent = content;
        let encryptionLayer = 'plain';

        // Get config settings
        const msgConfig = config.get('msg') || { encrypted: true, autoEncrypt: true };
        const encryptionEnabled = msgConfig.encrypted !== false && doEncrypt;

        if (!forcePlain && encryptionEnabled) {
            // Auto-detect: Check if already encrypted
            if (isEncrypted(content)) {
                encryptionLayer = 'encrypt';
            } else if (doEncrypt) {
                messageContent = 'ENC:' + encrypt.encrypt(content, DEFAULT_ENCRYPT_KEY);
                encryptionLayer = 'encrypt';
            }
        }

        const msgObj = {
            id: generateId('msg'),
            author,
            content: messageContent,
            encryption: encryptionLayer,
            metadata,
            timestamp: Date.now(),
            replies: []
        };

        conv.messages.push(msgObj);

        // Wire to brain: attend conversation
        try {
            const Brain = require('./brain');
            Brain.attend(convId, 0.3);
        } catch (e) {}
        conv.lastActivity = Date.now();

        // Trim if needed
        if (conv.messages.length > conv.maxMessages) {
            conv.messages = conv.messages.slice(-conv.maxMessages);
        }

        _persistConversations();

        // Emit event for new message
        event.emit('msg:new', { convId, msg: msgObj });

        return { id: msgObj.id, conversation: convId, encryption: encryptionLayer };
    }

    /**
     * Decrypt message (explicit reveal)
     */
    decrypt(messageContent) {
        if (!isEncrypted(messageContent)) {
            return { error: 'Not encrypted', content: messageContent };
        }

        const encrypted = messageContent.slice(4); // Remove 'ENC:'
        return { content: encrypt.decrypt(encrypted, DEFAULT_ENCRYPT_KEY) };
    }

    /**

    /**
     * Auto-detect and decrypt if encrypted
     */
    revealAuto(messageContent) {
        if (isEncrypted(messageContent)) {
            const result = this.decrypt(messageContent);
            result.layer = 'encrypt';
            return result;
        }

        return { content: messageContent, layer: 'plain' };
    }

    /**
     * Reply to message
     */
    reply(convId, messageId, content, options = {}) {
        const { author = 'anonymous', encrypt: doEncrypt = false } = options;

        const conv = this._conversations.get(convId);
        if (!conv) return { error: 'Conversation not found' };

        const msg = conv.messages.find(m => m.id === messageId);
        if (!msg) return { error: 'Message not found' };

        let replyContent = content;
        if (doEncrypt) {
            replyContent = 'ENC:' + encrypt.encrypt(content, DEFAULT_ENCRYPT_KEY);
        }

        const reply = {
            id: generateId('reply'),
            author,
            content: replyContent,
            timestamp: Date.now()
        };

        msg.replies.push(reply);
        _persistConversations();
        return { id: reply.id };
    }

    /**
     * Get messages
     */
    messages(convId, options = {}) {
        if (options.userCtx) {
            _checkRead(options.userCtx, '_msg:messages:' + convId);
        }
        const { limit = 50, since = 0, reveal = false } = options;

        const conv = this._conversations.get(convId);
        if (!conv) return [];

        let msgs = conv.messages;

        if (since > 0) {
            msgs = msgs.filter(m => m.timestamp > since);
        }

        msgs = msgs.slice(-limit);

        // Auto-reveal if requested
        if (reveal) {
            msgs = msgs.map(m => ({
                ...m,
                content: this.revealAuto(m.content).content || m.content
            }));
        }

        return msgs;
    }

    /**
     * Add participant
     */
    addParticipant(convId, participantId) {
        const conv = this._conversations.get(convId);
        if (!conv) return false;
        // (pass 42 live-fire) addParticipant used to be unbounded: every call
        // added to the persisted Set with no validation, so a loop could
        // balloon the conversations file on disk (probe: 600 adds accepted).
        // Validate the id and cap the roster — matches the maxMessages
        // ceiling (1000). Re-adding an existing participant stays idempotent
        // and never trips the cap.
        vaf.check(participantId, { name: 'participant id', type: 'string', minLength: 1, maxLength: 200 });
        if (!conv.participants.has(participantId) && conv.participants.size >= 1000) {
            throw new errors.VantError('conversation participant cap reached (1000)', { code: errors.CODES.UNKNOWN });
        }
        conv.participants.add(participantId);
        _persistConversations();
        return true;
    }

    /**
     * Remove participant
     */
    removeParticipant(convId, participantId) {
        const conv = this._conversations.get(convId);
        if (!conv) return false;
        conv.participants.delete(participantId);
        _persistConversations();
        return true;
    }

    /**
     * Get participants
     */
    participants(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) return [];
        return Array.from(conv.participants);
    }

    /**
     * Get conversation info
     */
    info(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) return null;

        return {
            id: conv.id,
            messageCount: conv.messages.length,
            participantCount: conv.participants.size,
            created: conv.created,
            lastActivity: conv.lastActivity
        };
    }

    /**
     * Delete conversation
     */
    delete(convId) {
        const removed = this._conversations.delete(convId);
        if (removed) _persistConversations();
        return removed;
    }

    /**
     * List all conversations
     */
    list() {
        return Array.from(this._conversations.values()).map(c => ({
            id: c.id,
            messageCount: c.messages.length,
            participantCount: c.participants.size,
            lastActivity: c.lastActivity
        }));
    }

    /**
     * Export conversation
     */
    export(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) return null;

        return {
            id: conv.id,
            messages: conv.messages,
            participants: Array.from(conv.participants),
            exported: Date.now()
        };
    }

    /**
     * (pass 59 / Wave D) The conversation's scope record (or null when
     * unscoped). Sync legs and the habitat layer gate on this; read-only.
     */
    getScope(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) return null;
        return conv.scope ? { ...conv.scope } : null;
    }

    // ==================== CROSS-NODE SNAPSHOTS (pass 59 / Wave D) ====================

    /**
     * Export a conversation as a bounded wire snapshot (prd-mesh §4 Wave D).
     * Mirrors consensus.exportTopic's contract: null for an unknown id, so
     * a pull reply can carry "not found" without a separate shape. The
     * snapshot is MERGE-ONLY on the far side: whatever it carries can only
     * ADD messages to a receiving conversation, never rewrite one.
     *
     * @param {string} convId
     * @returns {object|null} bounded snapshot { kind, id, scope, messages, participants, created, lastActivity, exported }
     */
    exportSnapshot(convId) {
        if (typeof convId !== 'string' || !convId || convId.length > 100) return null;
        const conv = this._conversations.get(convId);
        if (!conv) return null;
        return {
            kind: MSG_SNAPSHOT_KIND,
            id: conv.id,
            scope: conv.scope ? { ...conv.scope } : null,
            messages: (conv.messages || []).slice(-MSG_SYNC_MAX_MESSAGES).map((m) => _clampWireMessage(m)),
            participants: Array.from(conv.participants || []).slice(0, MSG_SYNC_MAX_PARTICIPANTS),
            created: conv.created || Date.now(),
            lastActivity: conv.lastActivity || Date.now(),
            exported: Date.now()
        };
    }

    /**
     * Merge a wire snapshot into local conversations. MERGE-ONLY (the
     * pass-49 invariant, now for msg): only messages the local side has
     * never seen (by id) are adopted — in-memory WINS on any conflict, the
     * wire never edits, reorders, or deletes a local message. Participants
     * UNION in; scope is recorded but NEVER rewritten once a conversation
     * exists locally (a snapshot cannot tighten or loosen a local
     * boundary — scope resolves owner-side). Re-derived locally: created
     * keeps the earlier stamp, lastActivity keeps the later.
     *
     * @param {object} snapshot - as produced by exportSnapshot
     * @returns {object} { merged: boolean, adopted: number, reason?: string }
     */
    mergeSnapshot(snapshot) {
        const s = _validateSnapshot(snapshot);
        if (!s.ok) return { merged: false, adopted: 0, reason: s.reason };
        const wire = s.value;

        const existing = this._conversations.get(wire.id);
        if (!existing) {
            // Adopt the whole conversation: bounds re-clamped locally, scope
            // normalized (already validated), created stays the sender's.
            this._conversations.set(wire.id, {
                id: wire.id,
                messages: wire.messages,
                participants: new Set(wire.participants),
                maxMessages: MSG_SYNC_MAX_MESSAGES,
                encryption: wire.messages.some((m) => m.encryption === 'encrypt'),
                scope: wire.scope,
                created: wire.created,
                lastActivity: wire.lastActivity
            });
            _persistConversations();
            return { merged: true, adopted: wire.messages.length, created: true };
        }

        // Existing conversation: adopt-only-unknown. Local history is truth.
        const known = new Set(existing.messages.map((m) => m.id));
        let adopted = 0;
        for (const m of wire.messages) {
            if (known.has(m.id)) continue;
            existing.messages.push(m);
            known.add(m.id);
            adopted++;
        }
        if (adopted > 0) {
            // Keep sender's ORDER among the adopted batch, but cap locally.
            existing.messages.sort((a, b) => (a.timestamp - b.timestamp) || String(a.id).localeCompare(String(b.id)));
            existing.messages = existing.messages.slice(-existing.maxMessages);
        }
        for (const p of wire.participants) {
            if (!existing.participants.has(p) && existing.participants.size < 1000) {
                existing.participants.add(p);
            }
        }
        if (wire.created < existing.created) existing.created = wire.created;
        if (wire.lastActivity > existing.lastActivity) existing.lastActivity = wire.lastActivity;
        // scope: deliberately untouched. A wire snapshot may not rewrite a
        // local boundary in either direction.
        if (adopted > 0) _persistConversations();
        return { merged: true, adopted };
    }

    // ==================== CHANNEL API (IPC-style) ====================

    /**
     * Send to channel (no history, fire-and-forget)
     */
    send(channel, message) {
        vaf.check(channel, { name: 'channel', minLength: 1, maxLength: 100 });

        const messages = this._channels.get(channel) || [];
        messages.push({ ...message, timestamp: Date.now() });
        this._channels.set(channel, messages);

        // Publish to handlers
        this.publish(channel, message);

        return true;
    }

    /**
     * Subscribe to channel
     */
    subscribe(channel, handler) {
        const handlers = this._handlers.get(channel) || [];
        handlers.push(handler);
        this._handlers.set(channel, handlers);
    }

    /**
     * Publish (sync handlers with unified recursion guard)
     */
    publish(channel, message) {
        // Prevent infinite publish loops using unified guard
        const check = guard.check('publish:' + channel);
        if (!check.allowed) {
            console.warn('[Msg] Publish blocked: ' + channel + ' at depth ' + check.depth);
            return false;
        }

        try {
            const handlers = this._handlers.get(channel) || [];
            for (const h of handlers) {
                try { h(message); } catch (e) {
                    try { audit.error('Handler error:', e.message); } catch(e) {}
                }
            }
            return true;
        } finally {
            guard.release('publish:' + channel);
        }
    }

    /**
     * Get channel messages
     */
    channelMessages(channel) {
        return this._channels.get(channel) || [];
    }

    /**
     * Clear channel
     */
    clear(channel) {
        this._channels.delete(channel);
        this._handlers.delete(channel);
    }

    // ==================== STATS ====================

    stats() {
        return {
            conversations: this._conversations.size,
            channels: this._channels.size,
            uptime: Date.now()
        };
    }

    // ==================== v0.9.0-axolotl PIPELINE-BACKED VARIANTS ====================
    // Async versions of the conversation API that route every call through the
    // unified security pipeline (sandbox -> vaf -> qos -> escrow). New code
    // should prefer these over the sync variants.
    async createSecured(options = {}) {
        const pipeline = _getPipeline();
        if (!pipeline) return this.create(options);
        return pipeline.run(
            { name: 'msg.create', operation: 'write', input: options.id || 'msg:new', options },
            async () => this.create(options),
            { mode: pipeline.PRIVATE }
        );
    }

    async postSecured(convId, content, options = {}) {
        const pipeline = _getPipeline();
        if (!pipeline) return this.post(convId, content, options);
        return pipeline.run(
            { name: 'msg.post', operation: 'write', input: content, convId },
            async () => this.post(convId, content, options),
            { mode: pipeline.PRIVATE }
        );
    }

    async messagesSecured(convId, options = {}) {
        const pipeline = _getPipeline();
        if (!pipeline) return this.messages(convId, options);
        return pipeline.run(
            { name: 'msg.messages', operation: 'read', input: convId, convId },
            async () => this.messages(convId, options),
            { mode: pipeline.PRIVATE }
        );
    }

    async listSecured(options = {}) {
        const pipeline = _getPipeline();
        if (!pipeline) return this.list(options);
        return pipeline.run(
            { name: 'msg.list', operation: 'read', input: 'msg:list', options },
            async () => this.list(options),
            { mode: pipeline.PRIVATE }
        );
    }
}

// ==================== DEFAULT INSTANCE ====================
const defaultMsg = new Msg();

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * List conversations from all brains in the stack
 * @param {Object} options - Filter options
 * @returns {Array} Combined conversations from all brains
 */
function listStack(options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const convos = defaultMsg.list(options);
            if (Array.isArray(convos)) {
                convos.forEach(c => {
                    results.push({ ...c, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Get stats from all brains in the stack
 * @returns {Object} Combined stats
 */
function getStackStats() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        totalConversations: 0,
        totalChannels: 0,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const s = defaultMsg.stats();
            results.byBrain[brainName] = s;
            results.totalConversations += s.conversations || 0;
            results.totalChannels += s.channels || 0;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Get all messages from a conversation across all brains
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Options
 * @returns {Array} Combined messages from all brains
 */
function getStackMessages(conversationId, options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const msgs = defaultMsg.messages(conversationId, options);
            if (Array.isArray(msgs)) {
                msgs.forEach(m => {
                    results.push({ ...m, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// ==================== EXPORTS ====================
module.exports = {
    // Class
    Msg,

    // Instance
    defaultMsg,

    // Conversation methods
    create: (...args) => defaultMsg.create(...args),
    join: (...args) => defaultMsg.join(...args),
    post: (...args) => defaultMsg.post(...args),
    reply: (...args) => defaultMsg.reply(...args),
    messages: (...args) => defaultMsg.messages(...args),

    // v0.9.0-axolotl pipeline-backed variants
    createSecured: (...args) => defaultMsg.createSecured(...args),
    postSecured: (...args) => defaultMsg.postSecured(...args),
    messagesSecured: (...args) => defaultMsg.messagesSecured(...args),
    listSecured: (...args) => defaultMsg.listSecured(...args),
    addParticipant: (...args) => defaultMsg.addParticipant(...args),
    removeParticipant: (...args) => defaultMsg.removeParticipant(...args),
    participants: (...args) => defaultMsg.participants(...args),
    info: (...args) => defaultMsg.info(...args),
    delete: (...args) => defaultMsg.delete(...args),
    list: (...args) => defaultMsg.list(...args),
    export: (...args) => defaultMsg.export(...args),

    // Decryption methods
    decrypt: (...args) => defaultMsg.decrypt(...args),
    reveal: (...args) => defaultMsg.reveal(...args),
    revealAuto: (...args) => defaultMsg.revealAuto(...args),

    // Channel methods (IPC-style)
    send: (...args) => defaultMsg.send(...args),
    subscribe: (...args) => defaultMsg.subscribe(...args),
    publish: (...args) => defaultMsg.publish(...args),
    channelMessages: (...args) => defaultMsg.channelMessages(...args),
    clear: (...args) => defaultMsg.clear(...args),

    // Stats
    stats: (...args) => defaultMsg.stats(...args),

    // Framework interface
    getLayerStatus: () => ({ name: 'Msg', type: 'msg', version: require('./version'), enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, conversations: _conversations.size, channels: _channels.size }),

    // (pass 37) Persistence seams (test/ops)
    _persistNow: () => _persistConversations(),
    _resetHydration: () => { _msgHydrated = false; },
    clearState: () => { stateStore.clear(MSG_STATE_FILE); _conversations.clear(); _msgHydrated = true; return true; },
    _stateFile: MSG_STATE_FILE,

    // (pass 59 / Wave D) Cross-node snapshot legs + scope record seam
    exportSnapshot: (...args) => defaultMsg.exportSnapshot(...args),
    mergeSnapshot: (...args) => defaultMsg.mergeSnapshot(...args),
    getScope: (...args) => defaultMsg.getScope(...args),
    MSG_SYNC_MAX_MESSAGES,
    MSG_SNAPSHOT_KIND,

    // Multibrain Stack
    listStack,
    getStackStats,
    gatherState,
    restoreState,
    getStackMessages
};

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return {
        conversations: Array.from(_conversations.entries()),
        count: _conversations.size,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    _conversations.clear();
    if (data && data.conversations) {
        for (const [id, conv] of data.conversations) {
            _conversations.set(id, conv);
        }
    }
    return { restored: true, conversations: _conversations.size };
}
