#!/usr/bin/env node
/**
 * K5 — the horcrux census pins ("brains are entries, not mass").
 *
 * labs/prd-kernel.md §7: K5 = "Horcrux inspect gains census semantics",
 * gated on K4 having proven (it did). The §3 wiring map's row 3 wires
 * 'horcrux' with census (brain-level: real vs carcass) + retire (stale
 * stones). These pins attach the contract:
 *   - 'horcrux' registers; the gap names attest + succeed (invariant 3);
 *   - classification law: identity.md/content or state-roster membership
 *     = real; empty-or-marker-only dirs = carcass; hostile names never
 *     guessed; entries are kernel-dated;
 *   - the census journeys through the gate (a verb entry exists);
 *   - the state-roster guard: a state.json-named dir stays real even when
 *     hollow (mid-write lineage member, alive not debris);
 *   - the unverifiable-roster guard: a PRESENT-but-unreadable state.json
 *     makes the retire door refuse (no tide on an unverifiable tree);
 *   - retire: dryRun bills; the live tide removes ONLY the census-named
 *     carcass dirs; real brains survive; a stone inside a carcass dir is
 *     a stale stone NAMED in the receipt; invariant 1 is structural.
 *
 * A synthetic anchorRoot keeps the suite cwd-safe and store-free.
 *
 * Run: node test/horcrux-census.test.js   (also picked up by test/run-all.js)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');

const kernel = require(path.join(ROOT, 'lib', 'kernel.js'));
const horcruxCensus = require(path.join(ROOT, 'lib', 'horcrux-census.js'));

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function check(name, ok, detail) {
    if (ok) {
        results.passed++;
        console.log(`  ✓ ${name}`);
    } else {
        results.failed++;
        console.log(`  ✗ ${name}: ${detail || 'assertion failed'}`);
    }
}

function makeTree() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-horcrux-census-'));
    for (const dir of ['models/private', 'models/public']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    return root;
}
function brain(root, side, name, files) {
    const dir = path.join(root, 'models', side, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, content] of Object.entries(files || {})) {
        fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
}

console.log('\n🪦 K5 — HORCRUX CENSUS PINS (brains are entries, not mass)\n');

// ---------------------------------------------------------------------------
// Group 1: classification (real vs carcass, the census law)
// ---------------------------------------------------------------------------
kernel._unwind();

const root = makeTree();
brain(root, 'private', 'axolotl-live', { 'identity.md': '# axolotl' });
brain(root, 'private', 'hollow-shell');                    // empty dir
brain(root, 'private', 'marker-only', { '.brain-anchor.jsonl': '{"n":1}' });
brain(root, 'private', 'stale-stone-carcass', { 'agent-p_secret.svg': 'fake-stone-bytes' });
brain(root, 'public', 'fresh-air', {});                    // empty on the public side
fs.mkdirSync(path.join(root, 'models', 'private', 'bad name..'), { recursive: true }); // hostile: never guessed

const census = horcruxCensus.censusBrains({ anchorRoot: root });
check('horcrux registers through the gate', kernel.census().consumers.some((c) => c.name === 'horcrux'), 'not listed');
check('census returns a kernel-gated structure', census.ok === true, JSON.stringify(census));
const ids = census.all.map((e) => e.id).sort();
check('the census lists the tree, hostile names never guessed', JSON.stringify(ids) === JSON.stringify([
    'private/axolotl-live', 'private/hollow-shell', 'private/marker-only', 'private/stale-stone-carcass', 'public/fresh-air',
].sort()), JSON.stringify(ids));
check('a content brain classifies real', census.byId.get('private/axolotl-live').kind === 'brain', JSON.stringify(census.byId.get('private/axolotl-live')));
check('a STONE-BEARING dir is never a carcass (disaster-recovery law: the only backup survives)', census.byId.get('private/stale-stone-carcass').kind === 'brain', JSON.stringify(census.byId.get('private/stale-stone-carcass')));
check('the stone surfaces as a stale-stone CANDIDATE for the decommission run (K5a), not the automatic tide', JSON.stringify(census.staleStoneCandidates.map((e) => e.id)) === JSON.stringify(['private/stale-stone-carcass']) && census.staleStoneCandidates[0].stones.includes('agent-p_secret.svg'), JSON.stringify(census.staleStoneCandidates));
check('an empty dir classifies carcass', census.byId.get('private/hollow-shell').kind === 'brain-carcass', JSON.stringify(census.byId.get('private/hollow-shell')));
check('a marker-only dir classifies carcass', census.byId.get('private/marker-only').kind === 'brain-carcass', JSON.stringify(census.byId.get('private/marker-only')));
check('a public-side empty dir classifies carcass too', census.byId.get('public/fresh-air').kind === 'brain-carcass', JSON.stringify(census.byId.get('public/fresh-air')));
check('every census entry is kernel-dated', census.all.every((e) => typeof e.at === 'number' && e.at >= 1), JSON.stringify(census.all.map((e) => e.at)));
const censusEntry = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'census').pop();
check('the census journaled itself', !!censusEntry, 'no census verb entry');

// ---------------------------------------------------------------------------
// Group 2: the roster guard (a state-named dir is alive, not debris)
// ---------------------------------------------------------------------------
kernel._unwind();
const rosterRoot = makeTree();
brain(rosterRoot, 'private', 'shelled-lineage', {});   // hollow BUT state-named
fs.writeFileSync(path.join(rosterRoot, 'models', 'state.json'), JSON.stringify({ currentBrain: 'shelled-lineage', stack: ['shelled-lineage'] }));
const rosterCensus = horcruxCensus.censusBrains({ anchorRoot: rosterRoot });
check('a state.json-named dir stays real even when hollow (mid-write lineage member)', rosterCensus.byId.get('private/shelled-lineage').kind === 'brain', JSON.stringify(rosterCensus.byId.get('private/shelled-lineage')));

// ---------------------------------------------------------------------------
// Group 3: the unverifiable-roster guard (retire refuses, census still lists)
// ---------------------------------------------------------------------------
kernel._unwind();
const unverifiableRoot = makeTree();
brain(unverifiableRoot, 'private', 'ghost-shell');     // hollow: would-be carcass
fs.writeFileSync(path.join(unverifiableRoot, 'models', 'state.json'), '{"currentBrain": "brŒken'); // present but unreadable
const unverifiableCensus = horcruxCensus.censusBrains({ anchorRoot: unverifiableRoot });
check('census still lists on an unverifiable tree (a read never blocks)', unverifiableCensus.all.some((e) => e.id === 'private/ghost-shell'), JSON.stringify(unverifiableCensus.all.map((e) => e.id)));
check('unverifiable-tree entries carry no retirement eligibility', unverifiableCensus.all.every((e) => e.eligible === false), JSON.stringify(unverifiableCensus.all.map((e) => e.eligible === false).filter((x) => x !== undefined).length === unverifiableCensus.all.length)); const unRetire = horcruxCensus.retireCarcass({ anchorRoot: unverifiableRoot });
check('the retire door REFUSES to fire on an unverifiable roster', unRetire && unRetire.ok === false && unRetire.refused === 'roster-unverifiable', JSON.stringify(unRetire));
check('nothing was deleted under the unverifiable tree', fs.existsSync(path.join(unverifiableRoot, 'models', 'private', 'ghost-shell')), 'the tide crossed on an unverifiable tree');

// ---------------------------------------------------------------------------
// Group 4: the retire door (dryRun bills; the tide crosses receipt-attached)
// ---------------------------------------------------------------------------
kernel._unwind();

const carcassIds = census.carcass.map((e) => e.id);   // hollow-shell, marker-only, fresh-air (the stone dir is NOT on the docket)
const dry = horcruxCensus.retireCarcass({ anchorRoot: root, dryRun: true });
check('dryRun bills the tide without crossing it', dry && dry.ok && dry.dryRun === true
    && JSON.stringify((dry.wouldRetire || []).sort()) === JSON.stringify(carcassIds.sort())
    && dry.removed.length === 0, JSON.stringify(dry));
check('dryRun leaves every dir standing', ['private/hollow-shell', 'private/marker-only', 'private/stale-stone-carcass', 'public/fresh-air'].every((d) => fs.existsSync(path.join(root, 'models', ...d.split('/')))), 'a dry bill wet something');

const tide = horcruxCensus.retireCarcass({ anchorRoot: root });
check('the tide removes exactly the census-named carcass dirs', tide && tide.ok
    && JSON.stringify((tide.removed || []).sort()) === JSON.stringify(carcassIds.sort()), JSON.stringify(tide));
check('real brains survive the tide', fs.existsSync(path.join(root, 'models', 'private', 'axolotl-live')), 'a real brain was reaped');
check('the stone-bearing dir and its .svg survive the tide (the disaster-recovery law held)', fs.existsSync(path.join(root, 'models', 'private', 'stale-stone-carcass', 'agent-p_secret.svg')), 'a stone died in the automatic tide');
check('the carcass dirs are gone', !fs.existsSync(path.join(root, 'models', 'private', 'hollow-shell'))
    && !fs.existsSync(path.join(root, 'models', 'private', 'marker-only'))
    && !fs.existsSync(path.join(root, 'models', 'public', 'fresh-air')), 'carcasses survived');

const retireEntry = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'retire').pop();
check('the retire journaled itself naming what died (invariant 1)', !!retireEntry
    && JSON.stringify((retireEntry.detail.ids || []).sort()) === JSON.stringify(carcassIds.sort())
    && /stale stones/.test(retireEntry.detail.reason), JSON.stringify(retireEntry && retireEntry.detail));
check('every retired id was LISTED in the census before dying (invariant 1)', !!retireEntry && typeof retireEntry.detail.censusAt === 'number' && kernel.journal().slice(0, retireEntry.detail.censusAt).some((j) => j.kind === 'verb' && j.verb === 'census'), 'retire ran on an uncensused ledger');

// ---------------------------------------------------------------------------
// Group 5: stale stones named in the receipt; heuristic holding post-tide
// ---------------------------------------------------------------------------

check('no stone died in the automatic tide (the disaster-recovery law)', (tide.stones || []).length === 0, JSON.stringify(tide.stones));
const secondTide = horcruxCensus.retireCarcass({ anchorRoot: root });
check('a re-tide on a clean tree is a quiet no-op (empty tide crosses nothing)', secondTide && secondTide.ok === true && (secondTide.removed || []).length === 0 && !secondTide.refused, JSON.stringify(secondTide));
check('the self-heal holds after the tide', kernel.census().consumers.some((c) => c.name === 'horcrux'), 'registration lost after the tide');

// ---------------------------------------------------------------------------

console.log('');
console.log(`  ${results.passed} passed, ${results.failed} failed${results.skipped ? `, ${results.skipped} skipped` : ''}`);
process.exit(results.failed ? 1 : 0);
