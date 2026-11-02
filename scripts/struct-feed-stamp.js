#!/usr/bin/env node
/**
 * struct-feed-stamp.js - stamps the LIVE STRUCT feed rows for the audit
 * board (vant issue #264, steps b, c, d).
 *
 * Three rows stamp from machine truth, never prose parsing:
 *
 *   crashtest (b)   - test/crashtest-packs.test.js's own verdict ledger
 *                     (the same sentinel dump CRASHTEST_PACKS_JSON=1 gives
 *                     the CI gate). Counters derive from the measured rows;
 *                     the stamp date is the day the ledger ran.
 *   packstruct (c)  - `npx packstruct@1.0.0 lint packs/ --deep --json`
 *                     (the machine lint emit: {schema, packsChecked,
 *                     idsCensused, violations, ...}) plus the CI gate's own
 *                     run of scripts/audit-packs-gate.js (the honest
 *                     honorend/refused line — the gate stays the judge;
 *                     the stamp only records what it measured).
 *   eyestruct (d)   - `npx eyestruct@1 gate --json` (the browserless gate
 *                     emit: {ok, verdict, artifacts, rows, pin}).
 *
 * poststruct stays the flavors' inline absent row: the npm package is
 * pre-publish (staged 0.9.0), so there is no emit to stamp and the page
 * states that absence honestly. Never stamped here.
 *
 * Rows write byte-identically into every flavor (the vendoring-ring law,
 * applied to data):
 *   web/home/src/generated/struct-feed[-cron].json
 *   web/dashboard/src/generated/<same>
 * each with its own .sha256 pin sidecar. --check verifies ALL pins + the
 * flavor byte-identity of every stamped row (CI unarmed hook).
 *
 * If a tool run fails, the row stamps an honest typed ABSENCE ({ok:false,
 * error}) and the script exits 1: a wedged endpoint is a finding, never a
 * silent green. Values that could be invented are left out entirely.
 *
 * Usage:
 *   node scripts/struct-feed-stamp.js [--from-json dump.json] [--check]
 *                                     [--rows crashtest,packstruct,eyestruct]
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SUITE = 'test/crashtest-packs.test.js';
const SENTINEL = /CRASHTEST_PACKS_GATE<<([\s\S]*?)>>END/;

// Every stamped row and the byte-identical flavor copies it owns (the
// vendoring-ring law applied to data - the ring check asserts identity
// across flavors AND the .sha256 pin beside each copy).
const ROWS = {
    crashtest: {
        name: 'struct-feed.json',
        targets: [
            'web/home/src/generated/struct-feed.json',
            'web/dashboard/src/generated/struct-feed.json',
        ],
    },
    packstruct: {
        name: 'struct-feed-packstruct.json',
        targets: [
            'web/home/src/generated/struct-feed-packstruct.json',
            'web/dashboard/src/generated/struct-feed-packstruct.json',
        ],
    },
    eyestruct: {
        name: 'struct-feed-eyestruct.json',
        targets: [
            'web/home/src/generated/struct-feed-eyestruct.json',
            'web/dashboard/src/generated/struct-feed-eyestruct.json',
        ],
    },
};

// ---- crashtest row (step b) ----
// Shape mirrors the kit contract (StructFeed): keys ordered so the two
// flavor copies stay byte-identical.

function parseDump(text) {
    const hit = SENTINEL.exec(text);
    if (!hit) return null;
    try { return JSON.parse(hit[1]); } catch { return null; }
}

function deriveCrashFeed(dump, when) {
    const packs = Object.keys(dump).length;
    let rows = 0;
    let refused = 0;
    let skipped = 0;
    let exploited = 0;
    const findings = [];
    for (const [pack, entry] of Object.entries(dump)) {
        for (const [attack, row] of Object.entries(entry.verdicts || {})) {
            rows += 1;
            if (row.skipped) { skipped += 1; continue; }
            if (row.verdict === 'EXPLOITED') {
                exploited += 1;
                findings.push({
                    id: `${pack}/${attack}`,
                    page: pack,
                    level: 'fail',
                    message: String(row.detail || '').slice(0, 300),
                });
            } else {
                refused += 1;
            }
        }
    }
    const verdict = exploited > 0 ? 'FINDINGS-basis' : 'PASS-basis';
    findings.push({
        id: 'contract-table',
        level: exploited > 0 ? 'fail' : 'info',
        message: `Contract table ${verdict === 'PASS-basis' ? 'held' : 'SURVEY'}: ${packs} packs, ${rows} rows \u2014 ${refused} REFUSED, ${skipped} honest skips, ${exploited} EXPLOITED. Measured live by ${SUITE} (two-cycle deterministic).`,
    });
    return {
        source: 'crashtest',
        ok: true,
        version: 'crashledger/1',
        generatedAt: when,
        counts: { packs, rows, refused, skipped, exploited },
        findings,
        sourceHref: 'https://www.npmjs.com/package/crashtest',
        _stamp: {
            by: 'scripts/struct-feed-stamp.js',
            from: SUITE,
            legend: 'values derive from the measured verdict ledger run this stamp\'s date; restamp with npm run struct:stamp after a campaign wave',
        },
    };
}

// ---- packstruct row (step c) ----
// Two emits, both the tools' own: the machine lint (--deep --json) and the
// CI gate's verdict line (policy judged by the gate, recorded by the stamp).

function derivePackstructFeed(when) {
    const lint = spawnSync('npx', ['-y', 'packstruct@1.0.0', 'lint', 'packs/', '--deep', '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 5 * 60 * 1000,
        env: { ...process.env, NO_COLOR: '1' },
        maxBuffer: 64 * 1024 * 1024,
    });
    const gate = spawnSync(process.execPath, ['scripts/audit-packs-gate.js'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 12 * 60 * 1000,
        env: { ...process.env, NO_COLOR: '1' },
        maxBuffer: 64 * 1024 * 1024,
    });
    const lintOut = (lint.stdout || '').trim();
    const gateOut = `${gate.stdout || ''}${gate.stderr || ''}`;
    let emit = null;
    try { emit = JSON.parse(lintOut); } catch { emit = null; }
    const which = [];
    if (lint.error || lint.status !== 0 || !emit || typeof emit !== 'object') {
        which.push(`lint packs/ --deep --json (exit ${lint.error ? String(lint.error) : lint.status}, ${lintOut.slice(0, 200) || 'no emit'})`);
    }
    if (gate.error || gate.status !== 0) {
        which.unshift(`scripts/audit-packs-gate.js (exit ${gate.error ? String(gate.error) : gate.status}; the gate judged the packs and one verdict is open - fix the finding, then restamp)`);
    }
    if (which.length) {
        return absentPackstruct(when, which.join('; '));
    }

    // The gate's own honest line carries the conformance arithmetic; the
    // stamp never re-derives policy the gate already judged. The pinned
    // COUNT is the gate's stated number (never derived from names - the
    // line's tail reads "...: clean, rest honored" and the names capture
    // must not eat the tail). honored = total cases - the stated count.
    const totalM = /(\d+)\s+case\(s\)/.exec(gateOut);
    const countM = /(\d+)\s+pinned known finding\(s\)/.exec(gateOut);
    const namesM = /known finding\(s\):\s*([^)\n]*)\)/.exec(gateOut);
    const totalCases = totalM ? Number(totalM[1]) : null;
    const pinnedNames = namesM
        ? namesM[1].replace(/,\s*rest\s+honored\s*$/, '').split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const pinned = countM ? Number(countM[1]) : pinnedNames.length;
    const honored = totalCases != null ? totalCases - pinned : null;

    const findings = [];
    for (const v of Array.isArray(emit.violations) ? emit.violations : []) {
        findings.push({
            id: typeof v === 'object' && v !== null && typeof v.id === 'string'
                ? 'lint:' + v.id
                : 'lint-violation',
            page: 'packs/',
            level: 'fail',
            message: (typeof v === 'object' && v !== null
                ? String(v.message || v.detail || JSON.stringify(v))
                : String(v)).slice(0, 300),
        });
    }
    findings.push({
        id: 'audit-conformance',
        page: 'vant-spine',
        level: 'info',
        message: `${honored != null ? honored + '/' + totalCases : 'case'} conformance honored; ` +
            (pinned > 0
                ? `${pinned} pinned known finding${pinned === 1 ? '' : 's'} (${pinnedNames.join(', ')}), honest and tracked in packs/README.md.`
                : 'no pinned findings. The gate is GREEN.'),
    });
    return {
        source: 'packstruct',
        ok: true,
        version: 'packstruct-lint/' + (emit.schema != null ? String(emit.schema) : '?'),
        generatedAt: when,
        counts: {
            packs: emit.packsChecked,
            ids: emit.idsCensused,
            honored: honored != null ? honored : pinned, // the gate's own arithmetic
            pinned,
            violations: Array.isArray(emit.violations) ? emit.violations.length : 0,
        },
        findings,
        sourceHref: 'https://www.npmjs.com/package/packstruct',
        _stamp: {
            by: 'scripts/struct-feed-stamp.js',
            from: 'npx packstruct@1.0.0 lint packs/ --deep --json + scripts/audit-packs-gate.js',
            legend: 'values derive from the two measured emits (lint machine truth + the gate\'s own verdict line); restamp with npm run struct:stamp -- --rows packstruct after a packs/ or loader wave',
        },
    };
}

function absentPackstruct(when, reason) {
    return {
        source: 'packstruct',
        ok: false,
        generatedAt: when,
        error: 'absent: the packstruct emit failed at stamp time - ' + String(reason).slice(0, 300) + '. The page states the absence; nothing is graded.',
        sourceHref: 'https://www.npmjs.com/package/packstruct',
        _stamp: {
            by: 'scripts/struct-feed-stamp.js',
            failure: true,
            legend: 'the endpoint wedged at stamp time; fix the tool run and restamp with npm run struct:stamp -- --rows packstruct',
        },
    };
}

// ---- eyestruct row (step d) ----

function deriveEyestructFeed(when) {
    const gate = spawnSync('npx', ['-y', 'eyestruct@1', 'gate', '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 2 * 60 * 1000,
        env: { ...process.env, NO_COLOR: '1' },
        maxBuffer: 64 * 1024 * 1024,
    });
    let ok = null;
    try { ok = JSON.parse((gate.stdout || '').trim()); } catch { ok = null; }
    if (gate.error || gate.status !== 0 || !ok || typeof ok !== 'object' || ok.ok !== true) {
        const detail = gate.error ? String(gate.error)
            : gate.status !== 0 ? `exit ${gate.status}; ${(gate.stdout || '').slice(0, 200)}`
            : 'no gate emit';
        return {
            source: 'eyestruct',
            ok: false,
            generatedAt: when,
            error: 'absent: the eyestruct drone emitted nothing at stamp time - ' + String(detail).slice(0, 260) + '. The page states the absence; nothing is graded.',
            sourceHref: 'https://www.npmjs.com/package/eyestruct',
            _stamp: {
                by: 'scripts/struct-feed-stamp.js',
                failure: true,
                legend: 'the battery wedged at stamp time; see CI lane eyes (gate+lint-packs) first, then restamp with npm run struct:stamp -- --rows eyestruct',
            },
        };
    }
    const pin = ok.pin && typeof ok.pin === 'object' ? ok.pin : {};
    return {
        source: 'eyestruct',
        ok: true,
        version: 'eyestruct-gate/1',
        generatedAt: when,
        counts: {
            fail: 0, // the gate judged ok === true: no unexplained artifact rides
            warn: 0,
            artifacts: ok.artifacts,
            rows: ok.rows,
        },
        findings: [{
            id: 'eyes-gate',
            level: 'info',
            message: 'The vi gate verdict: ' + String(ok.verdict || '').replace(/^\s*gate:\s*/, '') + '.',
        }],
        sourceHref: 'https://www.npmjs.com/package/eyestruct',
        _stamp: {
            by: 'scripts/struct-feed-stamp.js',
            from: 'npx eyestruct@1 gate --json',
            legend: 'values derive from the gate emit (ok/artifacts/rows + the tool\'s own verdict line); restamp with npm run struct:stamp -- --rows eyestruct after a labs/.eyes/ wave',
        },
    };
}

// ---- the ring writer ----

function writeRow(key, feed) {
    const bytes = Buffer.from(JSON.stringify(feed, null, 2) + '\n', 'utf8');
    for (const rel of ROWS[key].targets) {
        const target = path.join(ROOT, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        fs.writeFileSync(target + '.sha256', crypto.createHash('sha256').update(bytes).digest('hex') + '\n');
    }
    console.log('[stamped] ' + ROWS[key].name + ' (' + feed.source + ', pin ' + crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12) + '...' + ')');
}

function main() {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const fromIdx = args.indexOf('--from-json');
    const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : null;
    const rowsArg = args.includes('--rows')
        ? args[args.indexOf('--rows') + 1] || ''
        : 'crashtest,packstruct,eyestruct';
    const wanted = rowsArg.split(',').map((s) => s.trim()).filter(Boolean);
    for (const key of wanted) {
        if (!ROWS[key]) {
            console.error('struct-feed-stamp: unknown row "' + key + '" (stamped rows: ' + Object.keys(ROWS).join(', ') + '; poststruct is NEVER stamped - the npm package is pre-publish and stays an inline absent row)');
            process.exit(1);
        }
    }

    if (check) {
        let ok = true;
        for (const [name, row] of Object.entries(ROWS)) {
            if (!wanted.includes(name)) continue;
            let first = null;
            for (const rel of row.targets) {
                const target = path.join(ROOT, rel);
                const pin = target + '.sha256';
                if (!fs.existsSync(target) || !fs.existsSync(pin)) {
                    console.error('[drift] missing feed/pin: ' + rel);
                    ok = false;
                    continue;
                }
                const got = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
                if (fs.readFileSync(pin, 'utf8').trim() !== got) {
                    console.error('[drift] pin mismatch: ' + rel);
                    ok = false;
                }
                if (first === null) first = fs.readFileSync(target);
                else if (!first.equals(fs.readFileSync(target))) {
                    console.error('[drift] flavor copies diverged: ' + name);
                    ok = false;
                }
            }
        }
        process.exit(ok ? 0 : 1);
    }

    const when = new Date().toISOString().slice(0, 10);
    let stampFailed = false;

    if (wanted.includes('crashtest')) {
        let dump;
        if (fromFile) {
            dump = parseDump(fs.readFileSync(fromFile, 'utf8'));
            if (!dump) { console.error('struct-feed-stamp: no sentinel ledger in ' + fromFile); process.exit(1); }
        } else {
            console.log('struct-feed-stamp: measuring the live contract suite (this is the CI gate\'s phase-A body; minutes)...');
            const r = spawnSync(process.execPath, [SUITE], {
                cwd: ROOT,
                encoding: 'utf8',
                timeout: 12 * 60 * 1000,
                env: { ...process.env, CRASHTEST_PACKS_JSON: '1' },
                maxBuffer: 64 * 1024 * 1024,
            });
            if (r.error) { console.error('suite fault: ' + r.error); process.exit(1); }
            if (r.status !== 0) { console.error('suite exited ' + r.status + ' \u2014 refusing to stamp a RED ledger'); process.exit(1); }
            dump = parseDump(r.stdout || '');
            if (!dump) { console.error('suite gave no sentinel ledger'); process.exit(1); }
        }
        const feed = deriveCrashFeed(dump, when);
        writeRow('crashtest', feed);
        const c = feed.counts;
        console.log(`stamped: crashtest feed \u2014 ${c.packs} packs, ${c.rows} rows, ${c.refused} REFUSED, ${c.skipped} skips, ${c.exploited} EXPLOITED (as of ${feed.generatedAt})`);
    }

    if (wanted.includes('packstruct')) {
        const feed = derivePackstructFeed(when);
        writeRow('packstruct', feed);
        const c = feed.counts || {};
        if (feed.ok) {
            console.log(`stamped: packstruct feed \u2014 ${c.packs} packs linted, ${c.ids} ids censused, ${c.violations} violations; conformance ${c.honored} honored, ${c.pinned} pinned (as of ${feed.generatedAt})`);
        } else {
            console.error('stamped: packstruct feed is an honest ABSENCE - ' + String(feed.error).slice(0, 160));
            stampFailed = true;
        }
    }

    if (wanted.includes('eyestruct')) {
        const feed = deriveEyestructFeed(when);
        writeRow('eyestruct', feed);
        if (feed.ok) {
            const c = feed.counts;
            console.log(`stamped: eyestruct feed \u2014 gate ok, ${c.artifacts} artifact(s) / ${c.rows} ledger row(s), 0 unexplained (as of ${feed.generatedAt})`);
        } else {
            console.error('stamped: eyestruct feed is an honest ABSENCE - ' + String(feed.error).slice(0, 160));
            stampFailed = true;
        }
    }

    // poststruct is deliberately never stamped: the npm package is
    // pre-publish; the page's inline absent row states that honestly.

    if (stampFailed) {
        console.error('struct-feed-stamp: one or more rows stamped an honest ABSENCE (exit 1) - fix the wedged tool and restamp that row.');
        process.exit(1);
    }
}

main();
