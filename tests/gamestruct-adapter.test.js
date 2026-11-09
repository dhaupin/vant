#!/usr/bin/env node
/**
 * gamestruct adapter pins — the vant brain <-> gamestruct door client.
 *
 * gamestruct (dhaupin/gamestruct, SPEC v0.1.0) is the game-agent lane bridge:
 * a game exposes a DOOR (the four primitives observe/act/wait_for/events), a
 * brain drives it as a CLIENT. This suite pins vant's half against a REAL
 * loopback door that speaks gamestruct's own HTTP wire (bindings/http.mjs
 * shape), so every verdict measures the true contract.
 *
 *   G0 registration — the adapter is exported from the connectors index.
 *   G1 door hygiene  — credentials in the URL and non-http schemes refuse
 *                      typed (a leaked userinfo is a leaked secret).
 *   G2 the four primitives — observe (GET), act (POST {id,verb,value}),
 *                      wait_for, events (honest cursor) on their routes.
 *   G3 MCP binding   — tools/list + tools/call ride the host MCP route.
 *   G4 token fail-closed — a configured token rides every request as
 *                      Authorization: Bearer (or x-api-key).
 *   G5 remote wall   — a non-loopback door rides vant's SSRF wall (an
 *                      internal/remote address is refused, never dialled).
 *   G6 play (sec 8) — leisure pursuit over the lane: observe -> act one safe
 *                      affordance -> a learn line; a refused act is a
 *                      first-class outcome (N21), never a throw.
 *   G7 find — locate a handle by role/name without hardcoding ids.
 *
 * DISCRIMINATING: every pin requires lib/adapters/gamestruct.js; stashing it
 * (and the connectors/index.js registration) fails G0–G7, passes post-fix.
 *
 * Run: node tests/gamestruct-adapter.test.js
 */
'use strict';

const assert = require('assert');
const http = require('http');

const { GamestructAdapter } = require('../lib/adapters/gamestruct');
const connectors = require('../lib/connectors');

let passed = 0, failed = 0;
const _tests = [];
function test(name, fn) { _tests.push([name, fn]); }

/** Start a real gamestruct-shaped door on loopback. Returns { door, close, seen }. */
async function mintDoor() {
    const seen = { auth: [], paths: [], methods: [], mcp: [] };
    const srv = http.createServer((req, res) => {
        seen.auth.push(req.headers.authorization || req.headers['x-api-key'] || null);
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
                    ok: true, surface: 'globe_world', focus: 'world:wolf_7',
                    summary: { nodes: 2 },
                    nodes: [
                        { id: 'world:wolf_7', role: 'button', name: 'Attack wolf', actions: ['activate'], disabled: false },
                        { id: 'world:gate_1', role: 'button', name: 'Open gate', actions: ['activate'], disabled: true }
                    ]
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
            if (pathname === '/health') return send(200, { ok: true, surface: 'globe_world', frame: 7 });
            if (pathname === '/mcp/exec' && req.method === 'POST') {
                const p = JSON.parse(body || '{}');
                seen.mcp.push(p.method);
                if (p.method === 'tools/list') {
                    return send(200, { jsonrpc: '2.0', id: 1, result: { tools: [
                        { name: 'act__world__wolf_7', description: 'Attack wolf (button)', inputSchema: { type: 'object', properties: { verb: { type: 'string', enum: ['activate'] } } } }
                    ] } });
                }
                return send(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"ok":true}' }], isError: false } });
            }
            send(404, { ok: false, reason: 'no such route: ' + pathname });
        });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const door = 'http://127.0.0.1:' + srv.address().port;
    return { door, seen, close: () => new Promise((r) => srv.close(r)) };
}

// G0 — registration beside memstruct/langchain.
test('G0 gamestruct is registered as an adapter beside memstruct', () => {
    assert.strictEqual(typeof connectors.gamestruct, 'function', 'connectors.gamestruct missing');
    const a = connectors.gamestruct({ door: 'http://127.0.0.1:8791' });
    assert.strictEqual(a.type, 'gamestruct', 'factory must build a gamestruct adapter');
    assert.strictEqual(a.isLoopback, true, 'loopback host must be detected');
});

// G1 — door hygiene: refuse leaked credentials and non-http schemes, typed.
test('G1 a door URL with credentials or a non-http scheme refuses typed', () => {
    let err = null;
    try { new GamestructAdapter({ door: 'http://user:pass@127.0.0.1:8791' }); } catch (e) { err = e; }
    assert.ok(err, 'user:pass@ must refuse');
    assert.strictEqual(err.code, 'E_GAMESTRUCT_DOOR', 'refusal must be typed');
    let err2 = null;
    try { new GamestructAdapter({ door: 'ftp://127.0.0.1:21' }); } catch (e) { err2 = e; }
    assert.strictEqual(err2 && err2.code, 'E_GAMESTRUCT_DOOR', 'non-http scheme must refuse typed');
});

// G2 — the four primitives on the gamestruct v0.1.0 wire.
test('G2 observe/act/wait_for/events ride the specified routes', async () => {
    const d = await mintDoor();
    try {
        const a = new GamestructAdapter({ door: d.door });
        const snap = await a.observe();
        assert.strictEqual(snap.surface, 'globe_world', 'observe must return the snapshot');
        assert.strictEqual(snap.focus, 'world:wolf_7', 'observe must carry the focus handle (N5)');
        assert.strictEqual(a.connected, true, 'observe must mark the client connected');
        const acted = await a.act('world:wolf_7', 'activate');
        assert.strictEqual(acted.id, 'world:wolf_7', 'act must carry the handle');
        assert.strictEqual(acted.verb, 'activate', 'act must carry the verb');
        const waited = await a.waitFor({ hp_lt: 30 }, 500);
        assert.strictEqual(waited.held, true, 'wait_for must carry the predicate');
        assert.strictEqual(waited.timeoutMs, 500, 'wait_for must carry the honest timeout');
        const evs = await a.events(0);
        assert.strictEqual(evs.frame, 7, 'events must return the frame cursor (N4)');
        assert.strictEqual(evs.events[0].type, 'moved', 'events must return the ring');
        assert.ok(d.seen.methods.includes('GET /observe'), 'observe must be a GET');
        assert.ok(d.seen.paths.some((p) => p.startsWith('/events?since=0')), 'events must send the frame cursor');
    } finally { await d.close(); }
});

// G3 — MCP binding.
test('G3 the MCP binding carries tools/list with a real inputSchema', async () => {
    const d = await mintDoor();
    try {
        const a = new GamestructAdapter({ door: d.door });
        const cat = await a.catalog();
        assert.strictEqual(cat.tools[0].name, 'act__world__wolf_7', 'tools/list must return the door tools');
        assert.ok(cat.tools[0].inputSchema && cat.tools[0].inputSchema.type === 'object', 'each tool must carry an inputSchema (N17)');
        const called = await a.call('act__world__wolf_7', { verb: 'activate' });
        assert.ok(called && called.content, 'tools/call must return the door result');
        assert.deepStrictEqual(d.seen.mcp, ['tools/list', 'tools/call'], 'both MCP methods must ride the MCP route');
    } finally { await d.close(); }
});

// G4 — token fail-closed: a configured token rides every request, never logged.
test('G4 a configured token rides every request (Bearer by default, x-api-key on request)', async () => {
    const d = await mintDoor();
    try {
        const a = new GamestructAdapter({ door: d.door, token: 'sekret-token' });
        await a.observe();
        assert.strictEqual(d.seen.auth[0], 'Bearer sekret-token', 'token must ride as Bearer');
        const b = new GamestructAdapter({ door: d.door, token: 'k2', tokenHeader: 'x-api-key' });
        await b.observe();
        assert.strictEqual(d.seen.auth[1], 'k2', 'x-api-key header must be honored');
    } finally { await d.close(); }
});

// G5 — a remote door rides the SSRF wall (never dialled).
test('G5 a non-loopback internal door is refused by the network wall, not dialled', async () => {
    const a = new GamestructAdapter({ door: 'http://10.0.0.5:8791' });
    assert.strictEqual(a.isLoopback, false, 'a private address is not loopback');
    let err = null;
    try { await a.observe(); } catch (e) { err = e; }
    assert.ok(err, 'an internal address must refuse');
    assert.strictEqual(err.code, 'E_GAMESTRUCT_UNREACHABLE', 'the refusal must be typed');
    assert.match(err.message, /domain|Network/i, 'the refusal must come from the network wall');
});

// G6 — play: leisure pursuit over the lane.
test('G6 play observes, acts one safe affordance, and a refusal is a first-class outcome', async () => {
    const d = await mintDoor();
    try {
        const a = new GamestructAdapter({ door: d.door });
        const played = await a.play('hunt');
        assert.strictEqual(played.acted, true, 'play must act');
        assert.strictEqual(played.handle, 'world:wolf_7', 'play must pick the first ENABLED affordance');
        assert.strictEqual(played.action, 'activate', 'play must use the node default verb');
        assert.strictEqual(played.outcome, 'done', 'a successful act is done');
        assert.match(played.learned, /played:/, 'a learn line is returned');
        // a door that refuses the act is honored as an outcome, not a throw (N21)
        const refused = await a.act('world:deny_1', 'activate');
        assert.strictEqual(refused.ok, false, 'a refusal is a first-class result');
        assert.match(refused.reason, /no such handle/, 'the refusal is named');
    } finally { await d.close(); }
});

// G7 — find a handle without hardcoding ids.
test('G7 find locates a handle by role and name', async () => {
    const d = await mintDoor();
    try {
        const a = new GamestructAdapter({ door: d.door });
        const node = await a.find({ name: 'Attack' });
        assert.ok(node, 'find must locate by name substring');
        assert.strictEqual(node.id, 'world:wolf_7', 'find must return the matching node');
    } finally { await d.close(); }
});

(async () => {
    for (const [name, fn] of _tests) {
        try { await fn(); passed++; console.log('  \u2713 ' + name); }
        catch (e) { failed++; console.log('  \u2717 ' + name + ': ' + (e && e.message ? e.message.split('\n')[0] : e)); }
    }
    console.log('\n=== gamestruct-adapter: ' + passed + ' passed, ' + failed + ' failed ===');
    process.exit(failed ? 1 : 0);
})();
