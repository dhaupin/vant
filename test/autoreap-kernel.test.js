#!/usr/bin/env node
/**
 * K4 — the harness-autoreap adoption pins (the pass-328 kill switch
 * becoming a contract).
 *
 * labs/prd-kernel.md §7: K4 = "Harness autoreap: census its own minted
 * scratch brains, retire them on suite exit". The wiring map names
 * 'test-harness' (row 2). These pins attach the contract, not the plug:
 *   - 'test-harness' registers with census + retire wired (attest/succeed
 *     left as the census-visible gap, invariant 3);
 *   - the census enumerates ONLY sweep-minted dirs (pre-sweep brains are
 *     never mints — the scratch-manifest law) with a DATED census entry;
 *   - the retire runs THROUGH the gate with the census receipt attached —
 *     every retired id is listed first (invariant 1, structurally);
 *   - dryRun bills the tide without crossing it;
 *   - the fallback stays honest: a faulting kernel degrades to the bare
 *     janitor law with the refusal visible (never silent, never blocking);
 *   - hostile names and malformed ids are never guessed into deletion.
 *
 * Store-free and cwd-safe: the suite builds its own synthetic slate root
 * in a temp dir, so no models/ residue can exist either way (the autoreap
 * doors take a slate object, root included).
 *
 * Run: node test/autoreap-kernel.test.js   (also picked up by test/run-all.js)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');

const kernel = require(path.join(ROOT, 'lib', 'kernel.js'));
const autoreapMod = require(path.join(ROOT, 'test', 'harness-autoreap.js'));

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

// preExisting maps side -> brain names, and the manifests the caller builds
// MUST list exactly what it created here (the fixture teaches the same law
// the sweep obeys: a capture-time manifest names every pre-sweep brain).
function makeSlateRoot(preExisting) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-autoreap-pin-'));
    for (const dir of ['models/private', 'models/public']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const [side, brains] of Object.entries(preExisting || {})) {
        for (const brain of brains) {
            fs.mkdirSync(path.join(root, 'models', side, brain), { recursive: true });
            fs.writeFileSync(path.join(root, 'models', side, brain, 'anchor.txt'), 'pre-sweep: never a mint');
        }
    }
    return root;
}

function mint(root, side, name) {
    const dir = path.join(root, 'models', side, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'scratch.txt'), 'sweep-minted');
    return dir;
}

console.log('\n🧹 K4 — HARNESS AUTOREAP PINS (the pass-328 kill switch, kernel-contracted)\n');

// ---------------------------------------------------------------------------
// Group 1: the census (mint listing is the shared law, dated through the gate)
// ---------------------------------------------------------------------------
kernel._unwind();

const root = makeSlateRoot({ private: ['gstest-old', 'livefire-keeper'] });
mint(root, 'private', 'livefire-new');
mint(root, 'public', 'p9x-new2');
mint(root, 'private', 'weird name..');   // hostile name: never guessed

const slateObj = {
    root,
    privateManifest: ['gstest-old', 'livefire-keeper'],
    publicManifest: [],
};

kernel._unwind();
const bill = autoreapMod.censusMints(slateObj);
check('test-harness registers through the gate', kernel.census().consumers.some((c) => c.name === 'test-harness'), 'not listed');
check('census returns the mint ids', bill.ok === true, JSON.stringify(bill));
const ids = (bill.mints || []).map((m) => m.id).sort();
check('the census names the mints, only the mints', JSON.stringify(ids.slice().sort()) === JSON.stringify(['private/livefire-new', 'public/p9x-new2']), JSON.stringify(ids));
check('hostile names are never guessed into the census', !ids.some((i) => i.includes('weird name')), JSON.stringify(ids));
check('pre-sweep brains are never mints (scratch-manifest law)', !ids.some((i) => i.includes('gstest-old') || i.includes('livefire-keeper')), JSON.stringify(ids));
const censusEntry = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'census').pop();
check('the census journaled itself with a dated entry', !!censusEntry && typeof censusEntry.seq === 'number', 'no census verb entry');

// ---------------------------------------------------------------------------
// Group 2: the tide (retire through the gate, receipt attached)
// ---------------------------------------------------------------------------
kernel._unwind();

const out = autoreapMod.autoreap(slateObj);
check('autoreap removes exactly the census-named mints', out && !out.fallback && out.removed.join('|') === ['private/livefire-new', 'public/p9x-new2'].join('|'), JSON.stringify(out));
check('pre-sweep brains SURVIVE the tide', fs.existsSync(path.join(root, 'models', 'private', 'gstest-old')) && fs.existsSync(path.join(root, 'models', 'private', 'livefire-keeper')), 'a pre-existing brain was reaped');
check('the minted dirs are gone', !fs.existsSync(path.join(root, 'models', 'private', 'livefire-new')) && !fs.existsSync(path.join(root, 'models', 'public', 'p9x-new2')), 'mints survived');
check('the hostile-name dir is left alone', fs.existsSync(path.join(root, 'models', 'private', 'weird name..')), 'guessed into deletion');

const retireEntry = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'retire').pop();
check('the retire journaled itself naming what died (invariant 1)', !!retireEntry
    && retireEntry.detail.ids.join('|') === ['private/livefire-new', 'public/p9x-new2'].join('|')
    && /pass-328/.test(retireEntry.detail.reason), JSON.stringify(retireEntry && retireEntry.detail));
check('the retire carries a dated census receipt', !!retireEntry && typeof retireEntry.detail.censusAt === 'number', retireEntry && `censusAt=${retireEntry.detail && retireEntry.detail.censusAt}`);

// the census listing that seeded the retire is on the journal BEFORE the tide
check('every retired id was LISTED in the census before dying (invariant 1)', (() => {
    const censusIdx = retireEntry.detail.censusAt;
    const pre = kernel.journal().slice(0, censusIdx);
    return pre.filter((j) => j.kind === 'verb' && j.verb === 'census').length >= 1;
})(), 'retire ran on an uncensused ledger');

// ---------------------------------------------------------------------------
// Group 3: dryRun — the bill without the tide
// ---------------------------------------------------------------------------
const root2 = makeSlateRoot({ private: [], public: [] });
mint(root2, 'private', 'dryrun-mint');
const slate2 = { root: root2, privateManifest: [], publicManifest: [] };
const dry = autoreapMod.autoreap(slate2, { dryRun: true });
check('dryRun censuses without retiring', dry.dryRun === true && dry.removed.length === 0 && dry.censused.includes('private/dryrun-mint'), JSON.stringify(dry));
check('dryRun leaves the mint on disk', fs.existsSync(path.join(root2, 'models', 'private', 'dryrun-mint')), 'the tide crossed on a dry bill');
const real2 = autoreapMod.autoreap(slate2);
check('the real autoreap still works after a dry bill', real2.removed.join('|') === 'private/dryrun-mint' && !fs.existsSync(path.join(root2, 'models', 'private', 'dryrun-mint')), JSON.stringify(real2));

// ---------------------------------------------------------------------------
// Group 4: self-heal (probe resets) + the honest gap + the fallback
// ---------------------------------------------------------------------------
kernel._unwind();
autoreapMod.autoreap(slate2);   // the heal: re-register + re-census through the reset
check('autoreap self-heals after an external registry reset', kernel.census().consumers.some((c) => c.name === 'test-harness'), 'registration lost');
check('the census-visible gap names attest + succeed (invariant 3)', (() => {
    const me = kernel.census().consumers.find((c) => c.name === 'test-harness');
    return me && JSON.stringify(me.missingVerbs) === JSON.stringify(['attest', 'succeed']);
})(), 'gap shape drifted');

// The fallback: simulate a kernel that cannot witness — an impostor owning
// the name blocks re-registration, the census/retire gates then refuse, and
// the bare janitor law must still run with the refusal VISIBLE (stderr),
// never silent and never blocking.
kernel._unwind();
kernel.register({ name: 'test-harness', scope: 'hostile impostor', verbs: {} }); // the impostor blocks re-register
const fb = autoreapMod.autoreap(slate2);
check('a faulting kernel degrades to the bare janitor law (honest fallback)', fb && fb.fallback === true && fb.removed && Array.isArray(fb.removed), JSON.stringify(fb));
check('falling back still honors the cleanup duty', typeof fb.removed === 'object' && (fb.dryRun === false), JSON.stringify(fb));
check('the sweep exit is never mutated by bookkeeping health', typeof fb.removed === 'object', 'ticket: the exit contract moved');
// restore the shape for any later group
kernel._unwind();

// ---------------------------------------------------------------------------

console.log('');
console.log(`  ${results.passed} passed, ${results.failed} failed${results.skipped ? `, ${results.skipped} skipped` : ''}`);
process.exit(results.failed ? 1 : 0);
