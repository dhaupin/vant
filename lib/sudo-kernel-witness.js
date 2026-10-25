'use strict';

/**
 * sudo-kernel-witness — the K8-row witness for the sudo surface
 * (labs/prd-kernel.md §3 wiring map row 5: "lib/sudo.js registers as
 * 'sudo' with census of grants; succeed of elevation across ops").
 *
 * In its own module so the wiring never leaks into the sudo flows
 * (adoption is registration + verb wiring, never a rewrite). The census
 * chunk enumerates through sudo's PUBLIC API only (listTasks, getGrants,
 * getHealthChecks) — the adoption law "never a rewrite" holds at the data
 * layer too: no internals reached for. The succeed chunk witnesses an
 * elevation landing through the kernel gate, self-basing with a kernel-
 * gated census (invariant 2: a dated census entry behind every succeed).
 *
 * Clerk-not-judge (§2 Q8): every kernel refusal journals itself in the
 * kernel's ledger and surfaces on stderr — the sudo grant/escalate paths
 * are never touched by witness health. Probe-reset registries self-heal.
 */

const kernel = require('./kernel');

const SUDO_WIRED_VERBS = ['census', 'succeed'];

function _register() {
    try {
        kernel.register({
            name: 'sudo',
            scope: 'capability ladder (labs/prd-kernel.md §3 wiring map row 5)',
            verbs: {
                census: () => {
                    const sudo = require('./sudo');
                    const seq = kernel.time().seq;   // kernel time at the census gate
                    const entries = [];
                    const push = (id, kind) => {
                        if (id) entries.push({ id, at: seq, kind });
                    };
                    // the pass-through law: enumerate via PUBLIC surface only
                    const tasks = sudo.listTasks();
                    if (Array.isArray(tasks)) {
                        tasks.forEach((t) => push(`task:${typeof t === 'string' ? t : (t && (t.id || t.name)) || 'anon'}`, 'sudo-task'));
                    } else if (tasks && typeof tasks === 'object') {
                        Object.keys(tasks).forEach((k) => push(`task:${k}`, 'sudo-task'));
                    }
                    const grants = sudo.getGrants();
                    if (Array.isArray(grants)) {
                        grants.forEach((g) => push(`grant:${typeof g === 'string' ? g : (g && (g.task || g.id || g.key)) || 'anon'}`, 'sudo-escalation-grant'));
                    } else if (grants && typeof grants === 'object') {
                        for (const [k, v] of Object.entries(grants)) {
                            const scopes = v && typeof v === 'object' ? Object.keys(v) : [];
                            for (const s of scopes.length ? scopes : [String(k)]) push(`grant:${k}/${String(s).slice(0, 40)}`, 'sudo-escalation-grant');
                        }
                    }
                    const health = sudo.getHealthChecks();
                    if (health && typeof health === 'object') {
                        Object.keys(health).forEach((svc) => push(`health:${svc}`, 'sudo-health-check'));
                    }
                    return entries;
                },
                succeed: () => ({ witnessed: true }),
            },
        });
    } catch (e) {
        if (e && e.code === 'E_DUPLICATE_NAME') return; // already on the roster
        throw e;
    }
}

/** The kernel-gated census of the grant/escalation surface. */
function sudoCensus() {
    _register();
    const out = kernel.gate('census', 'sudo', {});
    const byKind = out.result.reduce((acc, e) => {
        (acc[e.kind] = acc[e.kind] || []).push(e.id);
        return acc;
    }, {});
    return { ok: out.ok, entries: out.result, byKind, time: out.time };
}

/** succeed of elevation across ops: a dated census basis behind the
 * boundary-journal, self-healing on resets, swallow-everything so the
 * sudo grant/escalate flow never feels the witness. */
let _basis = null;

function sudoWitnessSucceed(entry) {
    try {
        _register();
        const len = kernel.journal().length;
        if (_basis === null || _basis < 1 || _basis > len) {
            _basis = kernel.gate('census', 'sudo', {}).time.seq;
        }
        const out = kernel.gate('succeed', 'sudo', {
            boundary: 'elevation-audit',
            attestChain: [_basis],
            detail: {
                action: (entry && String(entry.action).slice(0, 60)) || 'elevate',
                taskId: (entry && String(entry.taskId || entry.task).slice(0, 60)) || null,
            },
        });
        return { witnessed: true, seq: out.time.seq };
    } catch (e) {
        if (e && e.code === 'E_UNKNOWN_CONSUMER') _basis = null;   // self-heal on reset
        // failure surfaces on stderr at most, never the audit path
        process.stderr.write(`[sudo-kernel-witness] kernel carry refused (${(e && e.code) || 'no-code'}: ${String((e && e.message) || e).slice(0, 120)})\n`);
        return { witnessed: false, code: (e && e.code) || null };
    }
}

module.exports = {
    sudoCensus,
    sudoWitnessSucceed,
    SUDO_WIRED_VERBS,
};
