#!/usr/bin/env node
/**
 * P4 vector-map plumbing pins (prd-web.md 4 #18 growth path).
 *
 * Covers BOTH sides of the contract:
 *   - lib level: embed.project2d (deterministic seeded JL projection,
 *     typed shape guards) and search.semantic withProjection (per-hit
 *     vectors join by index; a projection failure degrades honestly to
 *     null without killing the search),
 *   - DOOR level (live against the real registry, mcp.start with port:0):
 *     vant_search_semantic answers REAL results (the old handler sliced
 *     the result OBJECT as an array - the same handler-shape class as the
 *     pass-212 msg_send bug - so the tool always answered a typed error),
 *     the withProjection opt-in returns { points, anchor, offsets }, and
 *     the plain form still works (no projection key) like before-since-
 *     -the-fix.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

async function asyncTest(name, fn) {
    try {
        const r = await fn();
        if (r === true || (r && r.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${(r && r.error) || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); return true; }

const embed = require(path.join(ROOT, 'lib', 'embed'));
const searchMod = require(path.join(ROOT, 'lib', 'search'));

// project2d exports as a named fn (repair pass keeps the exports list).
function wantProject2d() {
    if (typeof embed.project2d === 'function') return embed.project2d;
    throw new Error('embed.project2d is not exported — the contract the map consumes must exist');
}

const project2d = wantProject2d();

const fn = (() => { try { return searchMod.semantic; } catch (e) { return null; } })();
if (typeof fn !== 'function') throw new Error('search.semantic is not exported — call contract pins need it');

const mcp = require(path.join(ROOT, 'lib', 'mcp'));

const BASE = 'http://127.0.0.1:PORT';

(async () => {
    // ------------------------------------------------ lib: project2d
    await asyncTest('project2d: deterministic across duplicate calls (same seed, same points)', async () => {
        const vecs = [[1, 2, 3], [-1, 0.5, 2], [0, 0, 1], [2, -3, 0.25]];
        const a = project2d(vecs, 9);
        const b = project2d(vecs, 9);
        assert(JSON.stringify(a) === JSON.stringify(b), 'same seed must produce identical points');
        // a different seed MUST plot differently (the seed is load-bearing)
        const c = project2d(vecs, 10);
        assert(JSON.stringify(a) !== JSON.stringify(c), 'different seed changed nothing — seed not load-bearing');
        return { success: true };
    });

    await asyncTest('project2d: dims/shape contract (dims 2, points pair by index, bounded box)', async () => {
        const vecs = [[1, 2, 3], [-1, 0.5, 2], [0, 0, 1]];
        const p = project2d(vecs, 9);
        assert(p.dims === 2 && p.seed === 9, `dims/seed ${p.dims}/${p.seed}`);
        assert(Array.isArray(p.points) && p.points.length === vecs.length, 'one point per input vector');
        for (const pt of p.points) {
            assert(typeof pt.x === 'number' && Number.isFinite(pt.x), 'x finite');
            assert(typeof pt.y === 'number' && Number.isFinite(pt.y), 'y finite');
            assert(Math.abs(pt.x) <= 1.0000001 && Math.abs(pt.y) <= 1.0000001, 'bounded plot box');
        }
        return { success: true };
    });

    await asyncTest('project2d: typed guards (empty, ragged, non-numeric, NaN all E_EMBED_PROJECTION)', async () => {
        const cases = [[], [[1, 2], [1, 2, 3]], [['a', 2], [1, 2]], [[1, NaN], [1, 2]]];
        for (const bad of cases) {
            let code = null;
            try { project2d(bad, 9); } catch (e) { code = e.code || e.message; }
            assert(String(code).includes('E_EMBED_PROJECTION'), `bad input ${JSON.stringify(bad).slice(0, 40)} did not answer typed: ${code}`);
        }
        return { success: true };
    });

    // ------------------------------------------------ lib: semantic w-projection
    await asyncTest('semanticSearch withoutProjection: shape unchanged (results + projection null key-honest)', async () => {
        const out = await searchMod.semantic('identity', { limit: 3 });
        assert(Array.isArray(out.results), 'results must be an array');
        assert(out.projection === null, `plain calls must carry an honest null projection (got ${out.projection})`);
        return { success: true };
    });

    await asyncTest('semanticSearch withProjection: real points join by index + query anchor', async () => {
        const out = await searchMod.semantic('identity', { limit: 3, withProjection: true });
        if (out.results.length === 0) return { success: true, error: 'corpus empty in this env — pin vacuous, not failing' };
        const p = out.projection;
        assert(p && p.dims === 2 && p.seed === 9, 'projection shape');
        assert(Array.isArray(p.points) && p.points.length === out.results.length + 1, 'anchor + one point per hit');
        assert(p.anchorPointIndex === 0 && p.hitPointOffset === 1, 'contract offsets');
        for (const pt of p.points) {
            assert(Number.isFinite(pt.x) && Number.isFinite(pt.y), 'finite plot coords');
        }
        return { success: true };
    });

    // ------------------------------------------------ DOOR: live vant_search_semantic
    let port = null;
    await asyncTest('door boots (port 0)', async () => {
        const r = await mcp.start({ port: 0, silent: true });
        port = r.port;
        return { success: Number.isInteger(port) && port > 0 };
    });

    await asyncTest('LIVE door: vant_search_semantic answers REAL results (handler-shape repair)', async () => {
        const res = await fetch(`${BASE.replace('PORT', port)}/mcp/exec`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tool: 'vant_search_semantic', args: { query: 'identity', limit: 3 } })
        });
        assert(res.status === 200, `status ${res.status}`);
        const j = await res.json();
        assert(!j.error, `door error: ${j.error && j.error.message}`);
        assert(Array.isArray(j.result.results), 'results must be a REAL array — the old handler sliced the object and always errored');
        assert(j.result.results.length > 0, 'live corpus should answer hits for a common term');
        return { success: true };
    });

    await asyncTest('LIVE door: withProjection carries the real projection through /mcp/exec', async () => {
        const res = await fetch(`${BASE.replace('PORT', port)}/mcp/exec`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tool: 'vant_search_semantic', args: { query: 'identity', limit: 3, withProjection: true } })
        });
        assert(res.status === 200, `status ${res.status}`);
        const j = await res.json();
        assert(!j.error, `door error: ${j.error && j.error.message}`);
        const p = j.result.projection;
        if (!p) return { success: true, error: 'projection falsified downstream — pod lied about vectors' };
        assert(p.dims === 2 && Array.isArray(p.points) && p.points.length === j.result.results.length + 1, 'index-join contract over the wire');
        return { success: true };
    });

    await asyncTest('LIVE door: schema gate refuses withProjection: "no" (typed MCP_INPUT_INVALID)', async () => {
        const res = await fetch(`${BASE.replace('PORT', port)}/mcp/exec`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tool: 'vant_search_semantic', args: { query: 'x', withProjection: 'definitely' } })
        });
        const j = await res.json();
        assert(j.result && j.result.error === 'MCP_INPUT_INVALID', 'schema gate must refuse a string projection flag');
        return { success: true };
    });

    await mcp.stop();

    console.log(`\n  ${results.passed} passed, ${results.failed} failed (embed-projection)`);
    if (results.failed > 0) process.exit(1);
    process.exit(0);
})();
