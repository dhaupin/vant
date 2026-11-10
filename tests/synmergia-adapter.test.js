#!/usr/bin/env node
/**
 * Synmergia adapter pins — Vant's world-side client for the gamestruct lane.
 *
 * The composition law (vant#363): Vant is the BRAIN, Synmergia is the WORLD,
 * gamestruct is the BRIDGE. This suite pins the vant-side SEAM that wraps
 * gamestruct's reference `DoorClient` (`gamestruct/adapters/vant`) and rides
 * vant's own SSRF wall (`lib/network.fetch`).
 *
 * Every pin runs against a REAL loopback door (a local http server speaking
 * the door's own wire), so each verdict measures the true contract:
 *
 *   S0  registration  — `connect()` refuses a missing door; a URL with
 *                       credentials or a non-http scheme refuses typed.
 *   S1  the four primitives — observe (GET), act (POST {id,verb,value}),
 *                       wait_for (POST {predicate,timeoutMs}), events
 *                       (honest cursor) on their routes.
 *   S2  refusal-as-data — a door's 409 refusal is a first-class
 *                       `{ ok:false, reason }`, never a throw (N26).
 *   S3  the wall — a non-loopback internal door is refused by
 *                       `lib/network.fetch`, never dialled.
 *   S4  coord — the door's OWN `/coord {op,...}` extension.
 *   S5  see (the eyes) — a sighted descriptor passes through; a blind door's
 *                       refusal is honest, never thrown.
 *   S6  find/nodes — the door's flat `actions[]` folds to handles via
 *                       gamestruct's own `doorNodes`.
 *   S7  leisure seam — the vant-side want-list records a want and pursues
 *                       exactly ONE act (gamestruct owns the choice).
 *
 * DISCRIMINATING: every pin requires `lib/adapters/synmergia.js` (the walled
 * DoorClient wrapper) and the `gamestruct` dependency; stashing either fails
 * S1-S7, passes post-fix.
 *
 * Run: node tests/synmergia-adapter.test.js
 */
'use strict';

const assert = require('assert');
const http = require('http');
const fs = require('fs');

const syn = require('../lib/adapters/synmergia');

let passed = 0, failed = 0;
const _tests = [];
function test(name, fn) { _tests.push([name, fn]); }

/**
 * Start a real door on loopback speaking the door's own wire. `opts.blind`
 * omits the /see route (an honest blind surface). Returns { door, close, seen }.
 */
async function mintDoor(opts = {}) {
    const seen = { paths: [], methods: [], auth: [] };
    const srv = http.createServer((req, res) => {
        seen.auth.push(req.headers.authorization || null);
        seen.paths.push(req.url);
        seen.methods.push(req.method + ' ' + req.url.split('?')[0]);
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            res.setHeader('content-type', 'application/json');
            const pathname = req.url.split('?')[0];
            const send = (status, obj) => { res.statusCode = status; res.end(JSON.stringify(obj)); };
            if (pathname === '/observe' && req.method === 'GET') {
                return send(200, {
                    ok: true, frame: 7, scene: 'globe_world', in_world: true,
                    actions: [
                        { id: 'world:wolf_7', kind: 'entity', action: 'Attack wolf', disabled: false },
                        { id: 'ui:login:name', kind: 'lineedit', action: 'Name', disabled: false },
                    ],
                });
            }
            if (pathname === '/act' && req.method === 'POST') {
                const p = JSON.parse(body || '{}');
                if (p.id === 'world:deny_1') return send(409, { ok: false, reason: 'no such handle: world:deny_1' });
                return send(200, { ok: true, id: p.id, verb: p.verb, value: p.value });
            }
            if (pathname === '/wait_for' && req.method === 'POST') {
                const p = JSON.parse(body || '{}');
                return send(200, { ok: true, held: true, predicate: p.predicate, timeoutMs: p.timeoutMs });
            }
            if (pathname === '/events' && req.method === 'GET') {
                return send(200, { ok: true, frame: 7, events: [{ frame: 1, type: 'moved' }] });
            }
            if (pathname === '/coord' && req.method === 'POST') {
                const p = JSON.parse(body || '{}');
                return send(200, { ok: true, op: p.op, handle: p.handle });
            }
            if (pathname === '/see' && !opts.blind) {
                return send(200, { ok: true, path: '/tmp/frame.png', mime: 'image/png', bytes: 12, width: 4, height: 4 });
            }
            send(404, { ok: false, reason: 'no such route: ' + pathname });
        });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    return { door: 'http://127.0.0.1:' + srv.address().port, seen, close: () => new Promise((r) => srv.close(r)) };
}

// S0 — registration + door hygiene.
test('S0 a missing door refuses, and a credentialed / non-http door refuses typed', () => {
    let err = null;
    try { syn.connect({}); } catch (e) { err = e; }
    assert.ok(err, 'a missing door must refuse');
    assert.strictEqual(err.code, 'VAF_INPUT_INVALID', 'the refusal must be typed');
    let err2 = null;
    try { syn.connect({ door: 'http://user:pass@127.0.0.1:8791' }); } catch (e) { err2 = e; }
    assert.strictEqual(err2 && err2.code, 'E_SYNMERGIA_DOOR', 'a leaked userinfo must refuse typed');
    let err3 = null;
    try { syn.connect({ door: 'ftp://127.0.0.1:21' }); } catch (e) { err3 = e; }
    assert.strictEqual(err3 && err3.code, 'E_SYNMERGIA_DOOR', 'a non-http scheme must refuse typed');
});

// S1 — the four primitives on the door's wire.
test('S1 observe/act/wait_for/events ride the door routes', async () => {
    const d = await mintDoor();
    try {
        const w = syn.connect({ door: d.door });
        const snap = await w.observe();
        assert.strictEqual(snap.scene, 'globe_world', 'observe must return the snapshot');
        assert.strictEqual(w.connected, true, 'observe must mark the client connected');
        const acted = await w.act('world:wolf_7', 'activate', 'x');
        assert.strictEqual(acted.id, 'world:wolf_7', 'act must carry the handle');
        assert.strictEqual(acted.verb, 'activate', 'act must carry the verb');
        const waited = await w.waitFor({ hp_lt: 30 }, 500);
        assert.strictEqual(waited.held, true, 'wait_for must carry the predicate');
        assert.strictEqual(waited.timeoutMs, 500, 'wait_for must carry the honest timeout (camelCase wire key)');
        const evs = await w.events(0);
        assert.strictEqual(evs.frame, 7, 'events must return the frame cursor');
        assert.ok(d.seen.methods.includes('GET /observe'), 'observe must be a GET');
        assert.ok(d.seen.paths.some((p) => p.startsWith('/events?since=0')), 'events must send the cursor');
    } finally { await d.close(); }
});

// S2 — a door refusal is data, never a throw (N26).
test('S2 a 409 refusal arrives as a first-class { ok:false, reason }', async () => {
    const d = await mintDoor();
    try {
        const w = syn.connect({ door: d.door });
        const refused = await w.act('world:deny_1', 'activate');
        assert.strictEqual(refused.ok, false, 'a refusal is a first-class result');
        assert.match(refused.reason, /no such handle/, 'the door reason is preserved, not collapsed to HTTP 409');
    } finally { await d.close(); }
});

// S3 — the wall: a non-loopback internal door is never dialled.
test('S3 a non-loopback internal door is refused by the network wall', async () => {
    const w = syn.connect({ door: 'http://10.0.0.5:8791' });
    assert.strictEqual(w.isLoopback, false, 'a private address is not loopback');
    const out = await w.observe();
    assert.strictEqual(out.ok, false, 'an internal address must refuse');
    assert.match(String(out.reason), /unreachable|domain|Network/i, 'the refusal must come from the wall');
});

// S4 — the door's own /coord extension.
test('S4 coord rides the door\'s /coord route with { op, ... }', async () => {
    const d = await mintDoor();
    try {
        const w = syn.connect({ door: d.door });
        const reg = await w.register('rook');
        assert.strictEqual(reg.op, 'register', 'coord must carry the op');
        assert.strictEqual(reg.handle, 'rook', 'coord must carry the extra args');
        assert.ok(d.seen.methods.includes('POST /coord'), 'coord must POST /coord');
    } finally { await d.close(); }
});

// S5 — the eyes: a sighted descriptor passes through; a blind door refuses honestly.
test('S5 see passes a sighted descriptor through and a blind refusal as data', async () => {
    const sighted = await mintDoor();
    try {
        const w = syn.connect({ door: sighted.door });
        const shot = await w.see({ label: 'login' });
        assert.strictEqual(shot.ok, true, 'a sighted door returns a descriptor');
        assert.strictEqual(shot.path, '/tmp/frame.png', 'the descriptor is passed through UNCHANGED');
        assert.ok(sighted.seen.paths.some((p) => p.startsWith('/see')), 'see must hit /see');
    } finally { await sighted.close(); }
    const blind = await mintDoor({ blind: true });
    try {
        const w = syn.connect({ door: blind.door });
        const shot = await w.see();
        assert.strictEqual(shot.ok, false, 'a blind door is an honest refusal');
        assert.match(String(shot.reason), /no such route/, 'the blind refusal is passed through, never thrown');
    } finally { await blind.close(); }
});

// S6 — find folds the door's flat actions[] via gamestruct's doorNodes.
test('S6 find locates a handle from the door\'s actions[] without hardcoding ids', async () => {
    const d = await mintDoor();
    try {
        const w = syn.connect({ door: d.door });
        const node = await w.find({ name: 'Attack' });
        assert.ok(node, 'find must locate by name substring');
        assert.strictEqual(node.id, 'world:wolf_7', 'find must return the matching node');
        assert.strictEqual(node.role, 'listitem', 'an entity kind maps to the listitem role');
        const nodes = await w.nodes();
        assert.strictEqual(nodes.length, 2, 'nodes() folds every actionable');
    } finally { await d.close(); }
});

// S7 — the leisure seam: vant owns the want-list, gamestruct owns the choice.
test('S7 the leisure seam records a want and pursues exactly one act', async () => {
    const d = await mintDoor();
    const play = require('../lib/adapters/synmergia-leisure');
    const ledgerPath = require('../lib/leisure')._ledgerPath();
    const backup = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : null;
    try {
        const w = syn.connect({ door: d.door });
        const n = play.seedWants(['greet someone']);
        assert.ok(n >= 1, 'seedWants records a want');
        const out = await play.pursueOne(w, { want: 'greet someone' });
        assert.strictEqual(out.ok, true, 'pursueOne acts once');
        assert.ok(out.act, 'a handle was acted on');
        assert.match(out.learned, /for want: greet someone/, 'the act carries the want as its receipt');
        const noWorld = await play.pursueOne(null);
        assert.strictEqual(noWorld.ok, false, 'pursueOne refuses without a world');
    } finally {
        await d.close();
        // Restore the brain's real ledger (the pin writes into it once).
        if (backup === null) { try { fs.unlinkSync(ledgerPath); } catch (e) { /* absent */ } }
        else { fs.writeFileSync(ledgerPath, backup); }
    }
});

(async () => {
    for (const [name, fn] of _tests) {
        try { await fn(); passed++; console.log('  \u2713 ' + name); }
        catch (e) { failed++; console.log('  \u2717 ' + name + ': ' + (e && e.message ? e.message.split('\n')[0] : e)); }
    }
    console.log('\n=== synmergia-adapter: ' + passed + ' passed, ' + failed + ' failed ===');
    process.exit(failed ? 1 : 0);
})();
