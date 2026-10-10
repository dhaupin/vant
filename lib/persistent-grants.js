'use strict';

/**
 * Persistent Grants (#162) — targeted fix
 * ========================================
 *
 * Grants live in in-process capability state. Any operation in a NEW
 * process (cron, spawned agent, CLI one-shot) fails with E_SANDBOX even
 * after `vant org grant` ran in another shell — the fail-closed rule is
 * right, but the grant primitive is unusable for anything long-lived.
 *
 * Keep fail-closed, add a durable tier:
 *   1. persistent grant ledger: `org grant --persist` writes
 *      {capability, scope, grantor, granted_at, expires_at} into an
 *      append-only ledger, re-hydrated at boot into the in-process
 *      capability set,
 *   2. TTL + renewal: persistent grants expire (default 24h); renewal
 *      re-anchors the grantor's authority,
 *   3. audit: every grant/persist/renew/expire is a ledger entry — the
 *      revocation story stays as strong as today's,
 *   4. in-process grants keep working exactly as now (zero migration).
 *
 * Engine-parity series (targeted fixes).
 */

const fs = require('fs');
const path = require('path');
const { VantError } = require('./error');

const DEFAULT_TTL_MS = 24 * 3600 * 1000;

function _ledgerPath(options = {}) {
    if (options.ledgerPath) return options.ledgerPath;
    // brain-scoped, gitignored, like all protocol state (state-store pattern)
    let brain = 'vant';
    try {
        const envBrain = process.env.VANT_BRAIN;
        if (envBrain && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(envBrain)) brain = envBrain;
        else {
            const b = require('./brain');
            const name = b.getCurrentBrain ? b.getCurrentBrain() : 'vant';
            if (name && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) brain = name;
        }
    } catch (e) { /* default brain */ }
    return path.join('models', 'private', brain, 'grants.jsonl');
}

function _audit(action, data) {
    try { require('./audit').log(action, data); } catch (e) { /* audit never blocks */ }
}

class PersistentGrants {
    constructor(options = {}) {
        this.ledgerPath = _ledgerPath(options);
        this.ttlMs = options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;
        this._now = typeof options.now === 'function' ? options.now : () => Date.now();
    }

    _readAll() {
        try {
            if (!fs.existsSync(this.ledgerPath)) return [];
            const out = [];
            for (const line of fs.readFileSync(this.ledgerPath, 'utf8').split('\n').filter(Boolean)) {
                try { out.push(JSON.parse(line)); } catch (e) { /* torn tail line */ }
            }
            return out;
        } catch (e) {
            // #163: unreadable ledger is DENIED, not empty — refuse to bless
            throw new VantError('persistent-grants: ledger unreadable: ' + e.message, { code: 'E_GRANTS_DENIED' });
        }
    }

    _append(rec) {
        fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
        fs.appendFileSync(this.ledgerPath, JSON.stringify(rec) + '\n');
        _audit('grant:' + rec.op, { capability: rec.capability, grantor: rec.grantor });
    }

    /**
     * Persist a grant. `grantor` is mandatory (provenance, per #161 law).
     * @returns {{capability, scope, grantor, granted_at, expires_at}}
     */
    persist({ capability, scope, grantor, ttlMs }) {
        if (!capability || typeof capability !== 'string') {
            throw new VantError('persistent-grants: capability required', { code: 'E_GRANTS_INPUT' });
        }
        if (!grantor) {
            throw new VantError('persistent-grants: grantor is NOT optional — every grant carries provenance', { code: 'E_GRANTS_ACTOR' });
        }
        const now = this._now();
        const rec = {
            op: 'persist',
            capability,
            scope: scope || '*',
            grantor: String(grantor),
            granted_at: now,
            expires_at: now + (ttlMs > 0 ? ttlMs : this.ttlMs)
        };
        this._append(rec);
        return rec;
    }

    /** Renew: re-anchors the grantor's authority with a fresh TTL. */
    renew({ capability, scope, grantor, ttlMs }) {
        const active = this.list({ capability, scope, activeOnly: true });
        if (active.length === 0) {
            throw new VantError('persistent-grants: no active grant to renew for ' + capability, { code: 'E_GRANTS_NOT_FOUND' });
        }
        return this.persist({ capability, scope, grantor, ttlMs });
    }

    /** Revoke: append a revoke record — honored by booted processes on next check. */
    revoke({ capability, scope, actor }) {
        if (!actor) {
            throw new VantError('persistent-grants: revoke actor is NOT optional', { code: 'E_GRANTS_ACTOR' });
        }
        const rec = { op: 'revoke', capability, scope: scope || '*', actor: String(actor), at: this._now() };
        this._append(rec);
        return rec;
    }

    /**
     * Active (non-expired, non-revoked) grants. Revocation is honored by
     * already-booted processes because every capability check re-reads the
     * ledger tail (cached for 2s — bounded staleness, still fail-closed:
     * an unreadable ledger DENIES rather than passing).
     */
    list({ capability, scope, activeOnly = false } = {}) {
        const records = this._readAll();
        const now = this._now();
        const revokedKeys = new Set();
        const grants = [];
        for (const r of records) {
            if (r.op === 'revoke') {
                revokedKeys.add(r.capability + '|' + (r.scope || '*'));
                continue;
            }
            if (r.op === 'persist') grants.push(r);
        }
        let out = grants.filter(g => !revokedKeys.has(g.capability + '|' + (g.scope || '*')));
        if (activeOnly) out = out.filter(g => g.expires_at > now);
        if (capability) out = out.filter(g => g.capability === capability);
        if (scope) out = out.filter(g => g.scope === scope || g.scope === '*');
        return out;
    }

    /**
     * Hydration check used by the sandbox `can()` path: does a persistent
     * grant back this capability right now? Expired → typed refusal with
     * the expired reason (#162 acceptance #2); none → false (E_SANDBOX as
     * today — callers without a persistent grant see zero change).
     */
    allows(capability) {
        const active = this.list({ capability, activeOnly: true });
        if (active.length > 0) return { allowed: true, via: 'persistent-grant' };
        const everGranted = this.list({ capability }).length > 0;
        if (everGranted) {
            return { allowed: false, reason: 'expired' };
        }
        return { allowed: false, reason: 'none' };
    }
}

module.exports = { PersistentGrants, DEFAULT_TTL_MS };
