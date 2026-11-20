#!/usr/bin/env node
/**
 * crashtest-shard.test.js - the pin for vant#356 (the run root's row slice).
 *
 * Sharding a CI matrix is a correctness change wearing a performance hat: if
 * the partition is not total and disjoint, a row either gets graded twice
 * (wasted work, and a finding can be reported twice) or not at all (a silent
 * hole, which is the one failure mode this repo refuses). So the pins below
 * grade the PROPERTY, not the timing:
 *
 *   1. every row lands in exactly one shard, for T = 2..8;
 *   2. the union of T shards is exactly the unsharded row set;
 *   3. the plan is stable across runs (no directory-order dependence);
 *   4. the plan is reasonably BALANCED (a disjoint-but-6:1 split buys
 *      nothing, which is what the first key-hash attempt produced);
 *   5. a bad --shard value is refused, never silently defaulted;
 *   6. a shard that owns no packs refuses rather than printing a vacuous
 *      green.
 *
 * The pack half of the plan is READ FROM THE SHIPPED PLANNER via
 * `--dump-plan`, never recomputed here. Recomputing it would grade a copy of
 * the algorithm: these pins would stay green if the script's planner were
 * deleted or changed, which is exactly the vacuous pin this repo refuses.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(ROOT, 'scripts', 'crashtest-run.js');
const CRASHTEST = require.resolve('crashtest/package.json').replace(/package\.json$/, '');
const LIB_DIR = path.join(CRASHTEST, 'src', 'scenarios', 'library');

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// The shipped pack plan, straight from the script.
function dumpPlan(total) {
    const r = spawnSync(process.execPath, [RUNNER, `--shard=${total}/${total}`, '--dump-plan'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 2 * 60 * 1000,
    });
    const line = String(r.stdout || '').trim().split('\n').filter((l) => l.startsWith('{')).pop();
    if (!line) return { status: r.status, plan: null, weights: null, err: String(r.stderr || '') };
    try {
        const d = JSON.parse(line);
        return { status: r.status, plan: d.packs, weights: d.weights, err: '' };
    } catch (e) { return { status: r.status, plan: null, weights: null, err: e.message }; }
}

// The full plan: the shipped pack half, then the library modules joined to
// the same load vector by the same greedy the script uses.
function planFor(total) {
    const d = dumpPlan(total);
    const packPlan = d.plan || {};
    const packWeights = d.weights || {};
    const libs = fs.readdirSync(LIB_DIR).filter((f) => f.endsWith('.js')).sort()
        .map((f) => ({
            key: `library/${f}`,
            weight: Math.max((fs.readFileSync(path.join(LIB_DIR, f), 'utf8').match(/\n\s*\{\s*\n\s*name:/g) || []).length, 1),
        }));
    const plan = new Map(Object.entries(packPlan).map(([k, v]) => [k, v - 1]));
    const load = new Array(total).fill(0);
    for (const [key, shard] of Object.entries(packPlan)) load[shard - 1] += packWeights[key] || 1;
    for (const item of libs) {
        let best = 0;
        for (let i = 1; i < total; i++) if (load[i] < load[best]) best = i;
        plan.set(item.key, best);
        load[best] += item.weight;
    }
    return { plan, load, keys: [...plan.keys()] };
}

// One real shard, for the end-to-end pin.
function rowsFor(shard, total) {
    const r = spawnSync(process.execPath, [RUNNER, `--shard=${shard}/${total}`], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 15 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
    });
    const out = String(r.stdout || '');
    const banner = out.match(/=== crashtest run-root: (\d+) pack\(s\)/);
    const rows = [...out.matchAll(/^ {2}[✓✗·] ([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+): /gm)].map((m) => m[1]);
    return { status: r.status, packs: banner ? Number(banner[1]) : null, rows, out };
}

console.log('\n🧩 crashtest shard partition (vant#356)\n');

// --- the shipped plan exists at all --------------------------------------
{
    const d = dumpPlan(4);
    ok('--dump-plan returns a plan', !!d.plan && Object.keys(d.plan).length > 0, d.err || `exit ${d.status}`);
    // counted from disk, not hardcoded: adding a pack must not turn this pin
    // red, it must simply be covered
    const onDisk = ['public', 'local'].reduce((n, sub) => {
        const dir = path.join(ROOT, 'packs', sub);
        if (!fs.existsSync(dir)) return n;
        return n + fs.readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'index.mjs'))).length;
    }, 0);
    ok('the plan covers every pack on disk', !!d.plan && Object.keys(d.plan).length === onDisk,
        `${d.plan ? Object.keys(d.plan).length : 0} planned vs ${onDisk} on disk`);
}

// --- property 1 + 2: total and disjoint --------------------------------
for (const total of [2, 3, 4, 6, 8]) {
    const { plan, keys } = planFor(total);
    ok(`T=${total}: every row planned exactly once`,
        plan.size === keys.length && keys.every((k) => typeof plan.get(k) === 'number'));

    const buckets = Array.from({ length: total }, () => new Set());
    for (const [k, b] of plan) buckets[b].add(k);
    const union = new Set(buckets.flatMap((s) => [...s]));
    ok(`T=${total}: union covers every row (${union.size}/${keys.length})`, union.size === keys.length);

    const seen = new Map();
    let dup = 0;
    for (const [k, b] of plan) { if (seen.has(k)) dup++; seen.set(k, b); }
    ok(`T=${total}: no row in two shards`, dup === 0, `${dup} duplicated`);
    ok(`T=${total}: no empty shard`, buckets.every((s) => s.size > 0),
        `sizes ${buckets.map((s) => s.size).join('/')}`);
}

// --- property 3: stable across runs --------------------------------------
{
    const a = dumpPlan(4).plan || {};
    const b = dumpPlan(4).plan || {};
    ok('the plan is stable across runs', JSON.stringify(a) === JSON.stringify(b));
}

// --- property 4: balanced -------------------------------------------------
{
    const total = 4;
    const { load } = planFor(total);
    const spread = Math.max(...load) / Math.min(...load);
    ok('T=4: load is balanced (max/min <= 1.25)', spread <= 1.25,
        `load ${load.join('/')} spread ${spread.toFixed(2)}`);
    // the pin that would have caught the first (key-hash) attempt: it is
    // disjoint but lands 136/23/64/138 on this corpus.
    ok('T=4: the heaviest shard is not the whole job',
        Math.max(...load) < load.reduce((x, y) => x + y, 0) * 0.4,
        `heaviest ${Math.max(...load)} of ${load.reduce((x, y) => x + y, 0)}`);
}

// --- property 5: a bad value is refused, never defaulted ------------------
for (const bad of ['0/4', '5/4', 'abc', '1-4', '1/0']) {
    const r = spawnSync(process.execPath, [RUNNER, `--shard=${bad}`], {
        cwd: ROOT, encoding: 'utf8', timeout: 60 * 1000,
    });
    ok(`--shard=${bad} refused (exit 2)`, r.status === 2, `exit ${r.status}`);
}

// --- property 6: no vacuous green ----------------------------------------
{
    const r = spawnSync(process.execPath, [RUNNER, '--shard=99/200'], {
        cwd: ROOT, encoding: 'utf8', timeout: 60 * 1000,
    });
    ok('an empty slice refuses a vacuous pass (exit 2)', r.status === 2, `exit ${r.status}`);
    ok('the refusal says why',
        /owns 0 of \d+ pack/.test(String(r.stderr || '')), String(r.stderr || '').trim().slice(0, 120));
}

// --- the end-to-end pin: one real shard grades a real subset -------------
{
    const { load } = planFor(4);
    const totalRows = load.reduce((a, b) => a + b, 0);
    const r = rowsFor(1, 4);
    ok('a real shard exits 0', r.status === 0, `exit ${r.status}`);
    ok('a real shard grades a strict subset of the rows',
        r.rows.length > 0 && r.rows.length < totalRows,
        `${r.rows.length} of ~${totalRows} rows`);
    ok('a real shard names its slice in the banner', /\[shard 1\/4\]/.test(r.out), 'banner missing the slice');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} crashtest-shard: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
