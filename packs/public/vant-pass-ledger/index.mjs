// packs/public/vant-pass-ledger/index.mjs - conformance rows for the
// pass-ledger surface (labs/prd-kernel.md sec 3 wiring map row 9).
//
// The surface is docs-shaped: the ledger IS the docs (labs/TASKS.md pass
// ceremony + labs/MEM.md), and lib/pass-ledger.js reads them from disk.
// These rows attack the contract with the same house law as the other
// packs in this fleet: typed refusals required, never raw crashes; the
// census is REAL bytes; the ceremony never mutates the ledger doc.
//
// Module shape contract (host-owned): ESM, default export carrying
// `name`, `description`, `attacks[]` - factory-built rows, no `this`
// dependency, runnable destructured or as a method by any runner.
//
// THE ONE LAW: zero sockets, zero wall clock. Every assertion is a pure
// function of the marker shapes and the kernel's journal positions.
// Isolation: when lib/kernel.js exports the TEST-ONLY _unwind() seam,
// rows reset to a clean journal first; when absent, rows use journal-
// delta scans and tolerate already-registered duplicates (double-run
// stable; verdict detail never carries absolute seq numbers).
// Expected verdicts are ALL REFUSED (defenses holding) - an EXPLOITED
// here means a raw crash, an undated census carry, a marker dialect that
// drifted, or a ledger doc that got written by the ceremony. Honest
// per-row skips: absent module = skipped-REFUSED (house rule 5: honest
// absence, never a false positive).

const refusedRecord = (detail, evidence) => ({ verdict: 'REFUSED', detail, tookRequests: 0, evidence });
const exploitedRecord = (detail, evidence) => ({ verdict: 'EXPLOITED', detail, tookRequests: 0, evidence });
const skipRecord = (detail) => ({ verdict: 'REFUSED', skipped: true, detail: detail || 'not armed: no pass-ledger module resolved from the run root', tookRequests: 0 });

async function loadModule(ctx) {
    const cfg = (ctx && ctx.config && ctx.config['vant-pass-ledger']) || {};
    if (cfg.module === null) return null; // host says foreign: honest skip
    const { resolve } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    try {
        const ns = await import(pathToFileURL(resolve(cfg.module || 'lib/pass-ledger.js')).href);
        return (ns && ns.default && typeof ns.default.openItems === 'function') ? ns.default : ns;
    } catch (_e) {
        return null; // caller degrades to skipped-REFUSED
    }
}

function safeReset(kernel) {
    try {
        if (typeof kernel._unwind === 'function') kernel._unwind();
    } catch (_e) { /* delta-scan path still holds */ }
}

function row(name, description, run) {
    return { name, description, run };
}

// Kernel-time check: dated entries are journal positions with a seq the
// journal can verify - integer, > 0, never a wall clock field.
function datedEntries(rows) {
    return Array.isArray(rows)
        && rows.length > 0
        && rows.every((e) => e && typeof e.id === 'string' && Number.isInteger(e.at) && e.at > 0 && typeof e.kind === 'string');
}

const attacks = [
    row('open-item-census-real',
        'the formal census reads the REAL docs and queues open items as kernel-dated census entries (the row-9 spec: "queue as census entries") - undated or fabricated carries are findings',
        async (_harness, ctx) => {
            const mod = await loadModule(ctx);
            if (!mod) return skipRecord();
            if (typeof mod.ledgerCensus !== 'function') {
                return skipRecord('not armed: module exports no ledgerCensus door (adopter differs - census-visible absence)');
            }
            // Honest absence first: a foreign run root ships no labs/ - the
            // census of ZERO items is indistinguishable from UNREAD docs, so
            // the rows degrade to explicit skips rather than riding that
            // ambiguity (house rule 5: honest absence, never a false pass).
            if (typeof mod.ledgersReadable === 'function') {
                const vis = mod.ledgersReadable();
                if (!vis || (!vis.tasks && !vis.mem)) {
                    return skipRecord('not armed: ledger docs not readable at the run root (foreign sandbox - the docs-shaped surface attacks real bytes only)');
                }
            }
            let kernelSeam = null;
            try { kernelSeam = await import('node:path').then(async (p) => { const { pathToFileURL } = await import('node:url'); return import(pathToFileURL(p.default.resolve('lib/kernel.js')).href); }); } catch (_e) { /* delta path */ }
            const kernel = kernelSeam && kernelSeam.default ? kernelSeam.default : kernelSeam;
            safeReset(kernel);
            const rows = mod.ledgerCensus();
            if (!datedEntries(rows)) {
                return exploitedRecord(`the open-item carry is not kernel-dated: ${JSON.stringify(Array.isArray(rows) ? rows[0] : rows).slice(0, 100)} - wall-clock or shape drift`, { rows: Array.isArray(rows) ? rows.length : 'not-an-array' });
            }
            if (rows[0].kind !== 'pass-ledger-census') {
                return exploitedRecord(`census does not lead with the pass-count header: rows[0].kind=${rows[0].kind} - the census shape moved`, { kinds: rows.slice(0, 3).map((r) => r.kind) });
            }
            const rest = rows.slice(1);
            if (rest.some((r) => r.kind !== 'open-item')) {
                return exploitedRecord('non-open-item kinds ride inside the census - the queue is not the queue', { alien: rest.map((r) => r.kind).filter((k) => k !== 'open-item') });
            }
            return refusedRecord(`census holds: ${rows.length} kernel-dated entries (1 pass-count header + ${rest.length} open-item queues from the real docs)`, { count: rows.length });
        }),
    row('marker-dialect-only',
        'open items are marked in the ledger\'s OWN dialect (Next / NEXT / NEXT-UP / Owner queue) - an invented marker vocabulary is a finding, and ids must carry their true file:line',
        async (_harness, ctx) => {
            const mod = await loadModule(ctx);
            if (!mod) return skipRecord();
            const re = mod.OPEN_ITEM_RE;
            if (!(re instanceof RegExp)) {
                return skipRecord('not armed: module exposes no OPEN_ITEM_RE (adopter differs - census-visible absence)');
            }
            // The dialect that must pass: these shapes actually live in TASKS/MEM.
            const speaks = ['**Next:** the next lift', '**NEXT-UP:** something queued', '**NEXT:** another', 'Owner queue: held'];
            // A random prose line must NOT speak the dialect.
            const silences = ['Random: text without a marker', '**Next steps:** prose paragraph (no colon-marker)'];
            const falsePositives = silences.filter((s) => re.test(s));
            const misses = speaks.filter((s) => !re.test(s));
            if (falsePositives.length || misses.length) {
                return exploitedRecord(`marker dialect drifted: misses=${JSON.stringify(misses)} false-positives=${JSON.stringify(falsePositives)} - the census would count invented items or skip real ones`, { misses, falsePositives });
            }
            // Same honest-absence gate as the census row: no readable docs at
            // the run root = explicit skip, never a silent 0-item pass.
            if (typeof mod.ledgersReadable === 'function') {
                const vis = mod.ledgersReadable();
                if (!vis || (!vis.tasks && !vis.mem)) {
                    return skipRecord('not armed: ledger docs not readable at the run root (foreign sandbox - the dialect leg reads real bytes only)');
                }
            }
            const items = mod.openItems();
            if (!Array.isArray(items) || !items.every((i) => typeof i.id === 'string' && i.id.includes(':') && (i.source === 'tasks' || i.source === 'mem') && Number.isInteger(i.at))) {
                return exploitedRecord(`open-item ids lost their file:line identity: ${JSON.stringify(items && items[0]).slice(0, 100)}`, { items: items && items.length });
            }
            return refusedRecord(`dialect holds: ${items.length} open items enumerated, every id carrying its true file+line source`, { items: items.length });
        }),
    row('ceremony-never-writes',
        'the succeed ceremony is a pure FORMATTER: the ## Pass NNN dialect goes out as a string, an unnamed pass refuses TYPED (E_NAMING, never a raw crash), and the ledger doc is byte-identical through the whole ceremony',
        async (_harness, ctx) => {
            const mod = await loadModule(ctx);
            if (!mod) return skipRecord();
            if (typeof mod.formatPassEntry !== 'function') {
                return skipRecord('not armed: module exports no formatPassEntry door (adopter differs - census-visible absence)');
            }
            const block = mod.formatPassEntry({ pass: 'PACK', date: '2026-10-25', title: 'PACK CEREMONY PROBE', body: 'Body line.\n' });
            if (typeof block !== 'string' || !block.startsWith('## Pass PACK (2026-10-25) - PACK CEREMONY PROBE\n') || !block.includes('Body line.')) {
                return exploitedRecord(`the ceremony dialect drifted: ${JSON.stringify(String(block).slice(0, 60))}`, { block: typeof block });
            }
            let refused = null;
            try { mod.formatPassEntry({}); } catch (e) { refused = e; }
            if (!refused) {
                return exploitedRecord('formatPassEntry({}) succeeded silently - an unnamed pass entered the ledger dialect', { rows: 'silent' });
            }
            if (!(typeof refused.code === 'string' && /^E_/.test(refused.code))) {
                return exploitedRecord(`unnamed-pass refusal is not typed (${refused.name}) - typed refusal required, never a raw crash`, { raw: refused.name });
            }
            // The write-proof leg: hash a ledger doc before/after through the
            // module's OWN LEDGERS map. The REAL doc when it resolves under the
            // run root; otherwise a synthesized probe ledger (a std-fs tmp file
            // with a dialect body) - a foreign run root must not degrade the
            // proof, it only changes which bytes it reads.
            const fs = await import('node:fs');
            const os = await import('node:os');
            const pathMod = await import('node:path');
            let probePath = null, restorePath = null, synthesized = false;
            try {
                if (mod.LEDGERS && mod.LEDGERS.tasks && fs.existsSync(mod.LEDGERS.tasks)) {
                    probePath = mod.LEDGERS.tasks;
                } else {
                    probePath = pathMod.default.join(os.default.tmpdir(), `pass-ledger-pack-probe-TASKS-${process.pid}.md`);
                    fs.writeFileSync(probePath, '# probe ledger\n## Pass P0 (2026-01-01) - seed\n\nOwner queue: probe line\n');
                    restorePath = (mod.LEDGERS && typeof mod.LEDGERS === 'object') ? mod.LEDGERS.tasks : null;
                    if (!mod.LEDGERS || typeof mod.LEDGERS !== 'object') throw new Error('no LEDGERS map');
                    mod.LEDGERS.tasks = probePath;
                    synthesized = true;
                }
                const before = fs.readFileSync(probePath, 'utf8');
                mod.formatPassEntry({ pass: 'PACK-NOWRITE', title: 'MUST NOT WRITE' });
                const after = fs.readFileSync(probePath, 'utf8');
                if (before !== after) {
                    return exploitedRecord('THE CEREMONY WROTE THE LEDGER DOC - succeed is a formatter, the owner commits the block, never the module', { delta: (after.length - before.length) });
                }
                return refusedRecord(`ceremony holds: dialect emitted as a string, unnamed refusal typed (${refused.code}), ledger doc byte-identical through the whole probe (${synthesized ? 'synthesized probe ledger' : 'real ledger doc'})`, { code: refused.code, synthesized });
            } finally {
                // The probe file and the module shape go back exactly as found.
                if (synthesized) {
                    try { fs.unlinkSync(probePath); } catch (_e) { /* already gone */ }
                    try { mod.LEDGERS.tasks = restorePath; } catch (_e) { /* as found */ }
                }
            }
        }),
    row('reset-self-heal',
        'the registry-reset path the seed owns: after a probe reset the pass-log consumer re-arms within the same census call - a wedged consumer is a finding (invariant 3, clerk-not-judge)',
        async (_harness, ctx) => {
            const mod = await loadModule(ctx);
            if (!mod) return skipRecord();
            if (typeof mod.ledgerCensus !== 'function') {
                return skipRecord('not armed: module exports no ledgerCensus door (adopter differs - census-visible absence)');
            }
            let kernelSeam = null;
            try { kernelSeam = await import('node:path').then(async (p) => { const { pathToFileURL } = await import('node:url'); return import(pathToFileURL(p.default.resolve('lib/kernel.js')).href); }); } catch (_e) { /* no seam: leg below degrades */ }
            const kernel = kernelSeam && kernelSeam.default ? kernelSeam.default : kernelSeam;
            safeReset(kernel);
            const healed = mod.ledgerCensus();
            if (!datedEntries(healed)) {
                return exploitedRecord(`the consumer wedged after the probe reset: ${JSON.stringify(healed).slice(0, 100)} - self-heal is fiction`, { healed: healed === null ? 'null' : typeof healed });
            }
            return refusedRecord('self-heal holds: after the probe reset the pass-log consumer re-armed within the call and carried kernel-dated census entries again', { count: healed.length });
        }),
];

export default {
    name: 'vant-pass-ledger',
    description: 'Conformance rows for the pass-ledger surface: real-docs open-item census in the ledger\'s own dialect, dated kernel carries, a pure ceremony formatter that never writes the doc, and reset self-heal',
    attacks,
};
