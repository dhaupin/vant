'use strict';

/**
 * pass-ledger — the pass ledger surface, built (labs/prd-kernel.md §3
 * wiring map row 9: "pass ledger (TASKS/MEM) | succeed ceremony
 * (well-practiced) | formal census of open items | queue as census
 * entries").
 *
 * Docs-shaped protocol consumer, honest by construction:
 *  - The ledger IS the docs (labs/TASKS.md pass ceremony + labs/MEM.md).
 *    This module reads them from disk — real bytes, never samples.
 *  - Open items are the markers the ledger actually uses:
 *    `**Next:**`, `**NEXT:**`, `**NEXT-UP:**`, and `Owner queue:` lines.
 *    No invented format; whatever the ledger grows later surfaces here.
 *  - succeed: the well-practiced ceremony is FORMATTING a pass entry in
 *    the ledger's own dialect (`## Pass NNN (date) - TITLE` + body) —
 *    a pure function. The module never writes TASKS.md uninvited; the
 *    owner (or the pass performing the ceremony) takes the string and
 *    commits it. Adoption is never a rewrite, of docs either.
 *  - Kernel census: registered per the three-line recipe (census verb;
 *    succeed for the ceremony stamp), date = kernel journal seq.
 *  - Clerk-not-judge: every kernel refusal journals itself in the
 *    kernel's ledger and surfaces on stderr — the parse surface never
 *    changes behavior because its carry refused. Registry resets
 *    self-heal within the call.
 */

const fs = require('fs');
const path = require('path');
const kernel = require('./kernel');

const ROOT = path.resolve(__dirname, '..');
const LEDGERS = {
    tasks: path.join(ROOT, 'labs', 'TASKS.md'),
    mem: path.join(ROOT, 'labs', 'MEM.md'),
};

/** Open-item markers as they actually appear in the ledger docs. */
const OPEN_ITEM_RE = /^\s*(?:\*\*(?:Next|NEXT(?:-UP)?):\*\*|\*\*Owner (?:queue|Queue)[:.]?\*\*|Owner queue:)/;
const PASS_HEADER_RE = /^## Pass (\S+) \(([^)]*)\) - (.*)$/;
const PASS_LEDGER_VERBS = ['census', 'succeed'];

function _readLedger(key) {
    try {
        return { ok: true, file: LEDGERS[key], content: fs.readFileSync(LEDGERS[key], 'utf8') };
    } catch (e) {
        // a missing ledger file is a real state, not a fake empty one
        return { ok: false, file: LEDGERS[key], code: 'E_EOF', error: String((e && e.message) || e).slice(0, 120) };
    }
}

/** Formal census: the passes, newest-first, from TASKS.md. */
function passes(limit) {
    const g = _readLedger('tasks');
    if (!g.ok) return [];
    const out = [];
    const lines = g.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = PASS_HEADER_RE.exec(lines[i]);
        if (m) out.push({ pass: m[1], date: m[2].trim(), title: m[3].trim(), line: i + 1 });
    }
    return typeof limit === 'number' && limit >= 0 ? out.slice(0, limit) : out;
}

/** Formal census: open items — the Next/NEXT-UP/Owner queue markers —
 * across both ledgers, each carrying its source file + line. */
function openItems() {
    const out = [];
    for (const key of ['tasks', 'mem']) {
        const g = _readLedger(key);
        if (!g.ok) continue;
        const lines = g.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (OPEN_ITEM_RE.test(lines[i])) {
                out.push({
                    id: `${path.basename(g.file)}:${i + 1}`,
                    marker: (lines[i].match(/\*\*(?!\*)(?:Next|NEXT(?:-UP)?):\*\*|Owner queue:[^*]*|\*\*Owner (?:queue|Queue)[:.]?\*\*/ig) || ['next'])[0].trim(),
                    text: lines[i].trim().slice(0, 200),
                    source: key,
                    at: i + 1,
                });
            }
        }
    }
    return out;
}

/** The succeed ceremony: FORMAT a pass entry in the ledger's own
 * dialect. Pure — returns the exact block to paste. Never writes.
 * Refusals are typed (E_NAMING coded errors, never a raw crash). */
function formatPassEntry({ pass, date, title, body } = {}) {
    if (!pass) throw codedTypeError('E_NAMING', 'pass-ledger.formatPassEntry needs a pass id');
    if (!title) throw codedTypeError('E_NAMING', 'pass-ledger.formatPassEntry needs a title');
    const header = `## Pass ${String(pass)} (${date || new Date().toISOString().slice(0, 10)}) - ${String(title)}`;
    return body ? `${header}\n${String(body)}\n` : `${header}\n`;
}

/** Coded refusal at cause: a TypeError with an E_-code carries both the
 * machine name (typed-refusal law) and what a human reads without one. */
function codedTypeError(code, what) {
    const err = new TypeError(`[${code}] ${what}`);
    err.code = code;
    return err;
}

/** The kernel-gated census of open items (dated, journal-backed). */
function _register() {
    try {
        kernel.register({
            name: 'pass-log',
            scope: 'pass ledger (labs/prd-kernel.md §3 wiring map row 9)',
            verbs: {
                census: () => {
                    const seq = kernel.time().seq;
                    const items = openItems();
                    const header = { id: `passes:${passes().length}`, at: seq, kind: 'pass-ledger-census' };
                    return [
                        header,
                        ...items.map((it) => ({
                            id: String(it.id),
                            at: seq,
                            kind: 'open-item',
                            text: it.text.slice(0, 160),
                        })),
                    ];
                },
                succeed: () => ({ witnessed: true }),
            },
        });
    } catch (e) {
        if (e && e.code === 'E_DUPLICATE_NAME') return;
        throw e;
    }
}

function ledgerCensus() {
    _register();
    let out;
    try {
        out = kernel.gate('census', 'pass-log', {});
    } catch (e) {
        if (e && e.code === 'E_UNKNOWN_CONSUMER') {
            _register(); // kernel reset — re-arm within the same call
            out = kernel.gate('census', 'pass-log', {});
        } else {
            process.stderr.write(`[pass-ledger] census carry refused (${(e && e.code) || 'no-code'}: ${String((e && e.message) || e).slice(0, 120)})\n`);
            return null;
        }
    }
    return out.result;
}

/** Ledger visibility at the run root: which docs actually read. The
 * docs-shaped surface works on real bytes — a foreign run root that ships
 * no labs/ degrades to an HONEST skip upstream (honest absence, never a
 * silent fake-empty census). */
function ledgersReadable() {
    return {
        tasks: fs.existsSync(LEDGERS.tasks),
        mem: fs.existsSync(LEDGERS.mem),
    };
}

module.exports = {
    passes,
    openItems,
    formatPassEntry,
    ledgerCensus,
    ledgersReadable,
    PASS_HEADER_RE,
    OPEN_ITEM_RE,
    PASS_LEDGER_VERBS,
    LEDGERS,
};
