'use strict';

/**
 * Agent Keys — per-agent Ed25519 vote-signing identity (pass 388).
 *
 * WHY THIS EXISTS
 * ---------------
 * consensus.vote() always "signed" ballots, but the signing was decorative:
 * `_signVote` fell through to `createHmac('sha256', agentSecret || 'default')`
 * because no caller ever threaded a secret, and `_verifyVote` was never
 * called from anywhere. Every ballot in a ledger was therefore HMAC'd with
 * the literal constant 'default' — reproducible by anyone — and nothing ever
 * checked it. The ledger had no cryptographic proof of WHO cast a ballot or
 * that a ballot was not edited after the fact.
 *
 * This module gives each principal a real Ed25519 keypair:
 *   - the PRIVATE key stays local, on disk at mode 0600, and never leaves;
 *   - the PUBLIC key is published (node-registry metadata / genesis intro)
 *     so peers can verify that principal's ballots.
 *
 * A ballot is signed over the CANONICAL encoding of {topic, agentId, outcome,
 * ts, nonce} (lib/state/canonical, the #146 deterministic encoder), so the
 * signature is stable across processes and key order. Verification is
 * fail-closed: once a principal's public key is ENROLLED (vetted via genesis
 * or a ring intro), a ballot for that principal must carry a valid signature
 * or it is dropped. Ballots from un-enrolled principals are still accepted
 * during the migration window but are COUNTED as unverified on the ledger —
 * observable, never silent.
 *
 * Everything here is SYNCHRONOUS: consensus.vote() is synchronous, so the
 * async lib/secret.js store cannot sit in the signing path. Keys live in the
 * same state spine as node-registry (models/private/<brain>/state/), with the
 * private-key file pinned 0600 like config.json.
 */

const crypto = require('crypto');
const stateStore = require('./state-store');

const STATE_FILE = 'state/agent-keys.json';
const PRINCIPAL_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const _PRIVATE_KEY_HEADER = '-----BEGIN PRIVATE KEY-----';

let _hydrated = false;
// principal -> { publicKey, privateKey, created }   (LOCAL, private key here)
const _keys = new Map();
// principal -> publicKey PEM                        (PEERS, public only)
const _enrolled = new Map();

function _validPrincipal(p) {
    return typeof p === 'string' && PRINCIPAL_RE.test(p);
}

function _apply(data) {
    if (!data || typeof data !== 'object') return;
    if (data.keys && typeof data.keys === 'object') {
        for (const [p, k] of Object.entries(data.keys)) {
            if (!_validPrincipal(p) || !k || typeof k.publicKey !== 'string') continue;
            if (typeof k.privateKey !== 'string' || !k.privateKey.includes(_PRIVATE_KEY_HEADER)) continue;
            _keys.set(p, { publicKey: k.publicKey, privateKey: k.privateKey, created: Number(k.created) || Date.now() });
        }
    }
    if (data.enrolled && typeof data.enrolled === 'object') {
        for (const [p, pem] of Object.entries(data.enrolled)) {
            if (!_validPrincipal(p) || typeof pem !== 'string') continue;
            _enrolled.set(p, pem);
        }
    }
}

function _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    try {
        const { store, file } = stateStore.getStore(STATE_FILE);
        if (!store.has(file)) return;
        const raw = store.read(file);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && data.kind === 'vant-protocol-state') _apply(data);
    } catch (e) {
        // Read-denied or corrupt: start empty. A missing key is regenerated
        // on demand; a lost PRIVATE key is unrecoverable by design (the
        // operator must re-enroll). Never throw out of hydrate.
    }
}

function _persist() {
    try {
        const { store, file } = stateStore.getStore(STATE_FILE);
        const keys = {};
        for (const [p, k] of _keys.entries()) keys[p] = { publicKey: k.publicKey, privateKey: k.privateKey, created: k.created };
        const enrolled = {};
        for (const [p, pem] of _enrolled.entries()) enrolled[p] = pem;
        store.write(file, JSON.stringify({
            kind: 'vant-protocol-state',
            module: 'agent-keys',
            keys,
            enrolled,
            savedAt: Date.now()
        }, null, 2), { mode: 0o600 });
        return true;
    } catch (e) {
        return false;
    }
}

/** PEM public key -> KeyObject (null on malformed input). */
function _publicKeyObject(pem) {
    if (typeof pem !== 'string' || !pem.includes('PUBLIC KEY')) return null;
    try { return crypto.createPublicKey(pem); } catch (e) { return null; }
}

/** Canonical bytes for a vote payload — deterministic across processes. */
function _canonicalBytes(data) {
    return require('./state/canonical').encode(data);
}

/**
 * Ensure a local keypair exists for `principal`, generating + persisting one
 * on first use. Returns { publicKey, privateKey } or null on a bad principal.
 */
function ensure(principal) {
    _hydrate();
    if (!_validPrincipal(principal)) return null;
    const existing = _keys.get(principal);
    if (existing) return { publicKey: existing.publicKey, privateKey: existing.privateKey };
    try {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        const entry = {
            publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
            privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
            created: Date.now()
        };
        _keys.set(principal, entry);
        _persist();
        return { publicKey: entry.publicKey, privateKey: entry.privateKey };
    } catch (e) {
        return null;
    }
}

/** Local keypair for a principal (never generates). */
function getKeyPair(principal) {
    _hydrate();
    if (!_validPrincipal(principal)) return null;
    const k = _keys.get(principal);
    return k ? { publicKey: k.publicKey, privateKey: k.privateKey } : null;
}

/**
 * Sign `data` (canonical-encoded) with the local private key for `principal`.
 * Generates the keypair if absent. Returns a base64 signature, or null.
 */
function sign(principal, data) {
    const kp = ensure(principal);
    if (!kp) return null;
    try {
        const keyObject = crypto.createPrivateKey(kp.privateKey);
        return crypto.sign(null, _canonicalBytes(data), keyObject).toString('base64');
    } catch (e) {
        return null;
    }
}

/** Verify a base64 signature over `data` against a PEM public key. */
function verify(publicKeyPem, data, signature) {
    const keyObject = _publicKeyObject(publicKeyPem);
    if (!keyObject || typeof signature !== 'string' || !signature) return false;
    try {
        return crypto.verify(null, _canonicalBytes(data), keyObject, Buffer.from(signature, 'base64'));
    } catch (e) {
        return false;
    }
}

/**
 * Enroll (pin) a peer's public key. Called from the genesis / ring-intro
 * vetting path. Once enrolled, a ballot for that principal MUST verify
 * against this key or it is dropped. An attempt to CHANGE an enrolled key
 * is refused (re-keying is a re-genesis ceremony, not a wire mutation).
 * Returns true when the key is now the pinned one, false otherwise.
 */
function enroll(principal, publicKeyPem) {
    _hydrate();
    if (!_validPrincipal(principal)) return false;
    if (!_publicKeyObject(publicKeyPem)) return false;
    const current = _enrolled.get(principal);
    if (current) return current === publicKeyPem; // immutable once pinned
    _enrolled.set(principal, publicKeyPem);
    _persist();
    return true;
}

/** The enrolled (vetted) public key for a principal, or null. */
function enrolledKey(principal) {
    _hydrate();
    if (!_validPrincipal(principal)) return null;
    return _enrolled.get(principal) || null;
}

/** Public key for a principal: local key first, then the enrolled peer key. */
function publicKeyFor(principal) {
    _hydrate();
    if (!_validPrincipal(principal)) return null;
    const local = _keys.get(principal);
    if (local) return local.publicKey;
    return _enrolled.get(principal) || null;
}

/** Public-only view: local principals + enrolled peers. Never exposes a private key. */
function list() {
    _hydrate();
    const keys = {};
    for (const [p, k] of _keys.entries()) keys[p] = { publicKey: k.publicKey, created: k.created };
    const enrolled = {};
    for (const [p, pem] of _enrolled.entries()) enrolled[p] = pem;
    return { keys, enrolled };
}

/** Test seam: drop in-memory + on-disk state. */
function clear() {
    _keys.clear();
    _enrolled.clear();
    _hydrated = false;
    try {
        const { store, file } = stateStore.getStore(STATE_FILE);
        if (store.has(file)) store.delete ? store.delete(file) : null;
    } catch (e) { /* best-effort */ }
}

module.exports = {
    ensure,
    getKeyPair,
    sign,
    verify,
    enroll,
    enrolledKey,
    publicKeyFor,
    list,
    clear,
    STATE_FILE
};
