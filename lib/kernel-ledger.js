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

// ==================== marketing-tables (template consumer) ====================
// The §3 wiring map's last unregistered row: "marketing tables | dated
// status columns (already right shape) | nothing structurally; just
// register | template consumer". REGISTER-ONLY by the row's own law —
// no succeed, no attest, no refactor of the PRD's tables. The census
// enumerates the REAL channel tables (§11.3 registries, §11.4 list
// repos, §11.5 communities) from labs/prd-marketing.md on disk — the
// rows' bold first-column names, never invented entries. Clerk-not-judge:
// it registers, it censuses, and a refused carry surfaces on stderr at
// most.

const MARKETING_PRD_PATH = path.join(__dirname, '..', 'labs', 'prd-marketing.md');
const MARKETING_TABLE_VERBS = ['census'];
// Section headers under "## 11. The marketing dept" that carry channel tables.
const MARKETING_TABLE_SECTIONS = [
    ['11.3 Registries & directories (MCP surfaces)', 'channels'],
    ['11.4 List repos (PR-able, free)', 'lists'],
    ['11.5 Communities (where the humans are)', 'venues'],
];
const MARKETING_ROW_RE = /^\| \*\*([^*]+)\*\*[^|]*\|/; // bold first-column table row (trailing cell text allowed)

function registerMarketingTables() {
    try {
        kernel.register({
            name: 'marketing-tables',
            scope: 'marketing dept channel tables (labs/prd-kernel.md §3 wiring map template-consumer row; register-only)',
            verbs: {
                census: () => {
                    const seq = kernel.time().seq;
                    let entries = [];
                    try {
                        const lines = fs.readFileSync(MARKETING_PRD_PATH, 'utf8').split('\n');
                        // Track the CURRENT section: the last §11.x header seen wins.
                        let current = null;
                        for (const line of lines) {
                            for (const [section, kind] of MARKETING_TABLE_SECTIONS) {
                                if (line.startsWith(`### ${section}`)) { current = { section, kind }; break; }
                            }
                            const m = MARKETING_ROW_RE.exec(line);
                            if (current && m) {
                                entries.push({
                                    id: `marketing-tables/${current.kind}/${String(m[1]).trim().slice(0, 60)}`,
                                    at: seq,
                                    kind: 'marketing-channel-table-row',
                                    section: String(current.section).slice(0, 60),
                                });
                            }
                        }
                    } catch (e) {
                        void e; // a missing PRD is a real state — one honest typed entry below, never a raw crash
                        entries = [{ id: 'marketing-tables:prd-unreadable', at: seq, kind: 'marketing-channel-table-row', note: 'E_READ' }];
                    }
                    return entries;
                },
            },
        });
    } catch (e) {
        if (e && e.code === 'E_DUPLICATE_NAME') return; // already on the roster
        process.stderr.write(`[kernel-ledger] marketing register carry refused (${(e && e.code) || 'no-code'}: ${String((e && e.message) || e).slice(0, 120)})\n`);
    }
}

/** The kernel-gated census of the marketing channel tables (the
 * template-consumer row: registration + dated census, nothing structural).
 * Self-heals within the call on a kernel reset, same as docs-gates. */
function marketingTablesCensus() {
    registerMarketingTables();
    try {
        let out;
        try {
            out = kernel.gate('census', 'marketing-tables', {});
        } catch (e) {
            if (e && e.code === 'E_UNKNOWN_CONSUMER') {
                registerMarketingTables(); // re-arm once, then retry (invariant 3)
                out = kernel.gate('census', 'marketing-tables', {});
            } else {
                throw e;
            }
        }
        return { ok: true, entries: out.result, time: out.time };
    } catch (e) {
        process.stderr.write(`[kernel-ledger] marketing census carry refused (${(e && e.code) || 'no-code'}: ${String((e && e.message) || e).slice(0, 120)})\n`);
        return { ok: false, entries: [], code: (e && e.code) || null };
    }
}

module.exports = {
    registerDocsGates,
    docsGatesCensus,
    GATE_SCRIPTS,
    DOCS_GATE_VERBS,
    registerMarketingTables,
    marketingTablesCensus,
    MARKETING_TABLE_VERBS,
    MARKETING_PRD_PATH,
};
