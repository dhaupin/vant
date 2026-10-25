'use strict';

/**
 * kernel-ledger — the K9-row witness for the docs-gates surface
 * (labs/prd-kernel.md §3 wiring map row 6: the docs-gate chain registers
 * as 'docs-gates' with a census of its gates).
 *
 * Census law kept honest: the census enumerates the six REAL gate
 * check-scripts (frontmatter, links, style, language, fiction signatures,
 * surface consistency) by fs presence — never a REQUIRED stand-in module,
 * because no pass-ledger module exists in lib/ and a census that invented
 * entries would be exactly the quiet new math this repo refuses. When the
 * pass-ledger module is BUILT, it gets its own consumer here per the same
 * three-line recipe — not before.
 *
 * The adoption law holds: registration + verb wiring, no rewrite of any
 * gate script. Clerk-not-judge: a refused register carry surfaces on
 * stderr at most — a docs gate never fails because its census carry
 * refused, and the kernel never breaks a working docs run.
 */

const fs = require('fs');
const path = require('path');
const kernel = require('./kernel');

const GATE_SCRIPTS = [
    { id: 'docs-gates/frontmatter', script: 'check-docs-frontmatter.js' },
    { id: 'docs-gates/links', script: 'check-docs-links.js' },
    { id: 'docs-gates/style', script: 'check-docs-style.js' },
    { id: 'docs-gates/language', script: 'check-language.js' },
    { id: 'docs-gates/fiction-signatures', script: 'check-fiction-signatures.js' },
    { id: 'docs-gates/surface-consistency', script: 'check-surface-consistency.js' },
];

const DOCS_GATE_VERBS = ['census'];

let _registered = false;

function registerDocsGates() {
    try {
        kernel.register({
            name: 'docs-gates',
            scope: 'docs certification chain (labs/prd-kernel.md §3 wiring map row 6)',
            verbs: {
                census: () => {
                    const seq = kernel.time().seq;
                    const scriptsDir = path.join(__dirname, '..', 'scripts');
                    return GATE_SCRIPTS.map((g) => ({
                        id: g.id,
                        at: seq,
                        kind: 'docs-gate',
                        present: fs.existsSync(path.join(scriptsDir, g.script)),
                    }));
                },
                succeed: () => ({ witnessed: true }),
            },
        });
        _registered = true;
    } catch (e) {
        if (e && e.code === 'E_DUPLICATE_NAME') { _registered = true; return; }
        // a refused register carry surfaces on stderr at most
        process.stderr.write(`[kernel-ledger] register carry refused (${(e && e.code) || 'no-code'}: ${String((e && e.message) || e).slice(0, 120)})\n`);
    }
}

/** The kernel-gated census of the docs-gate chain (self-heals within
 * the same call on reset: re-register once, then retry — invariant 3,
 * "never wedged"). */
function docsGatesCensus() {
    if (!_registered) registerDocsGates();
    try {
        let out;
        try {
            out = kernel.gate('census', 'docs-gates', {});
        } catch (e) {
            if (e && e.code === 'E_UNKNOWN_CONSUMER') {
                // kernel reset we didn't cause: re-arm and retry once
                registerDocsGates();
                out = kernel.gate('census', 'docs-gates', {});
            } else {
                throw e;
            }
        }
        return { ok: true, entries: out.result, time: out.time };
    } catch (e) {
        process.stderr.write(`[kernel-ledger] census carry refused (${(e && e.code) || 'no-code'}: ${String((e && e.message) || e).slice(0, 120)})\n`);
        return { ok: false, entries: [], code: (e && e.code) || null };
    }
}

module.exports = {
    registerDocsGates,
    docsGatesCensus,
    GATE_SCRIPTS,
    DOCS_GATE_VERBS,
};
