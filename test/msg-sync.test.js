#!/usr/bin/env node
/**
 * Msg sync tests (pass 59 / Wave D, labs/prd-mesh.md)
 *
 * Pins the cross-node conversation snapshot legs — the JV standup over
 * the wire — with the same trust posture as every agora leg:
 *
 *   Stub-bus (unit legs):
 *   1. Snapshot round-trip: bounded export, merge adopts unknowns only,
 *      re-merge adopts 0 (in-memory wins), dedup inside the batch,
 *      scope recorded on the merged conversation
 *   2. Junk refusal: bad kind / bad id / malformed scope / non-object
 *      never touch a conversation
 *   3. A wire snapshot NEVER rewrites a local scope boundary (either
 *      direction) — messages adopt, the boundary stays local
 *   4. Request leg owner-side scope gate: member asks -> snapshot,
 *      non-member asks -> null (indistinguishable from not-found),
 *      unscoped -> anyone; principal resolved through node-registry
 *   5. Reply leg sender-bound (pass-51 rule on the msg legs): an
 *      observed reqId replayed by a third peer is dropped
 *   6. Push leg receiver-side gate: member-delivered scoped snapshot
 *      merges; a foreign-scope push is dropped; malformed drops
 *   7. Push/request legs answer REGISTERED peers only
 *
 *   Two real processes (the JV standup, genesis-formed pair):
 *   8. Host creates the JV-scoped standup channel + posts; joiner
 *      msgPulls it (owner-side gate through the genesis-vetted
 *      principal); joiner posts locally; host msgPulls back and sees
 *      BOTH orgs' messages — merge-only, no wire edits
 *
 * Run: node test/msg-sync.test.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const results = { passed: 0, failed: 0 };
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { results.passed++; console.log(`  ✓ ${name}`); })
        .catch((e) => { results.failed++; console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`); });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const msg = require(path.join(ROOT, 'lib', 'msg'));
const sync = require(path.join(ROOT, 'lib', 'agora-sync'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const teams = require(path.join(ROOT, 'lib', 'teams'));
const scope = require(path.join(ROOT, 'lib', 'scope'));

registry.clearState();
msg.clearState();

for (const [id, name] of [['msa-agent', 'msa'], ['msb-agent', 'msb'], ['msx-agent', 'msx']]) {
    registry.register({ id, name, host: '127.0.0.1', port: 1 });
}        // The JV org model: one team owning the standup channel, members from
        // "both orgs" (msa = owner principal, msj = partner principal).
        const org = teams.createOrg('ms59-org');
        const dept = teams.createDept('ms59-dept', { org: org.id });
        const team = teams.createTeam('ms59-team', { dept: dept.id });
        for (const a of ['msa-agent', 'msj-agent']) {
            const r = teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
            assert(!r.error, 'teams.assign failed: ' + JSON.stringify(r));
        }
        const JV_SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };
        // Registry principal for the partner ORG's node ('msh') IS its vetted
        // agentId (the genesis shape: register({ id: agentId, name: nodeName })).
        registry.register({ id: 'msj-agent', name: 'msh', host: '127.0.0.1', port: 1 });        assert(scope.canAccess({ scope: JV_SCOPE }, 'msa-agent'), 'sanity: owner is a member');
        assert(scope.canAccess({ scope: JV_SCOPE }, 'msj-agent'), 'sanity: partner is a member');
        assert(!scope.canAccess({ scope: JV_SCOPE }, 'msb-agent'), 'sanity: outsider denied');
        assert(scope.canAccess({ scope: JV_SCOPE }, 'msj-agent'), 'sanity: partner node principal is a member');

/** Minimal stub bus with captured sends + injectable peers (agora-hygiene pattern). */
function stubBus(name, opts = {}) {
    const handlers = new Map();
    const sent = [];
    const bus = {
        onDispatch: (t, fn) => handlers.set(t, fn),
        send: async (to, type, payload) => {
            sent.push({ to, type, payload });
            return { ok: true, handlers: 1 };
        },
        nodes: () => (opts.peers || []).map((n) => ({ name: n })),
        status: () => ({ name, agentId: opts.agentId || null, configured: true })
    };
    return { bus, handlers, sent };
}

/** Deliver an envelope to a stub bus's dispatcher (simulates the wire). */
function deliver(node, type, env) {
    node.handlers.get(type)({ from: env.from, payload: env.payload });
}

async function main() {
    console.log('\n✉️  MSG SYNC TESTS (pass 59 / Wave D)\n');

    await test('snapshot round-trip: bounded export, merge-only adoption, in-memory wins, dedup, scope recorded', async () => {
        msg.clearState();
        const r = msg.create({ id: 'ms-conv-1', scope: JV_SCOPE });
        assert(r.id === 'ms-conv-1', 'create failed');
        msg.post('ms-conv-1', 'standup day 1', { author: 'msa-agent' });
        msg.post('ms-conv-1', 'standup day 2', { author: 'msj-agent' });
        msg.addParticipant('ms-conv-1', 'msj-agent');

        const snap = msg.exportSnapshot('ms-conv-1');
        assert(snap && snap.kind === 'vant-msg-snapshot', 'snapshot kind missing');
        assert(snap.messages.length === 2 && snap.participants.includes('msj-agent'), 'export incomplete');
        assert(snap.scope && snap.scope.owner === JV_SCOPE.owner, 'scope not exported');

        // A receiver is its OWN process with its OWN conversation map.
        const mkReceiver = () => new msg.Msg({ conversations: new Map(), channels: new Map(), handlers: new Map() });

        // Fresh receiver adopts the whole conversation.
        const rx = mkReceiver();
        const m1 = rx.mergeSnapshot(JSON.parse(JSON.stringify(snap)));
        assert(m1.merged === true && m1.adopted === 2 && m1.created === true, 'merge failed: ' + JSON.stringify(m1));
        assert(rx.messages('ms-conv-1').length === 2, 'messages not merged');
        assert(rx.getScope('ms-conv-1') && rx.getScope('ms-conv-1').owner === JV_SCOPE.owner, 'scope not recorded on merged conv');

        // Re-merge the SAME snapshot: in-memory wins, adopts 0.
        const m2 = rx.mergeSnapshot(snap);
        assert(m2.merged === true && m2.adopted === 0, 're-merge not idempotent: ' + JSON.stringify(m2));

        // Partial overlap on a receiver that ALREADY has the batch: one new
        // + two duplicate ids -> adopts only the new one.
        const richer = JSON.parse(JSON.stringify(snap));
        richer.messages.push({ id: 'wire_only_1', author: 'x', content: 'new from wire', encryption: 'plain', timestamp: Date.now() + 5, metadata: {}, replies: [] });
        const m3 = rx.mergeSnapshot(richer);
        assert(m3.adopted === 1, 'overlap merge adopted wrong count: ' + JSON.stringify(m3));

        // Dedup inside one batch: the same id twice must not double-insert.
        const rx3 = mkReceiver();
        const dbl = JSON.parse(JSON.stringify(snap));
        dbl.messages.push(dbl.messages[0]);
        const m4 = rx3.mergeSnapshot(dbl);
        assert(m4.adopted === 2, 'in-batch duplicate smuggled through: ' + JSON.stringify(m4));
    });

    await test('junk refusal: bad kind / bad id / malformed scope / non-object never reach a conversation', async () => {
        msg.clearState();
        const good = (() => {
            msg.create({ id: 'ms-clean' });
            msg.post('ms-clean', 'x', { author: 'a' });
            return msg.exportSnapshot('ms-clean');
        })();
        const junk = [
            null,
            {},
            { ...good, kind: 'other-kind' },
            { ...good, id: '../traversal' },
            { ...good, id: '' },
            { ...good, scope: { owner: 'team:does-not-exist ', visibility: 'NOPE' } },
            { ...good, messages: 'not-an-array' },
            { ...good, participants: 'nope' }
        ];
        for (const j of junk) {
            const r = msg.mergeSnapshot(j);
            assert(r.merged === false && r.reason, 'junk accepted: ' + JSON.stringify(r));
        }
        assert(msg.list().length === 1 && msg.list()[0].id === 'ms-clean', 'junk mutated conversations: ' + JSON.stringify(msg.list()));
    });

    await test('wire snapshot NEVER rewrites a local scope boundary (either direction)', async () => {
        msg.clearState();
        // Local boundary: JV team scope. Wire claims public (looser) and
        // then foreign (different owner). Messages may adopt; the
        // boundary must stay the local one.
        msg.create({ id: 'ms-bound', scope: JV_SCOPE });
        msg.post('ms-bound', 'local history', { author: 'msa-agent' });

        const wirePub = { kind: 'vant-msg-snapshot', id: 'ms-bound', scope: null, messages: [{ id: 'w1', author: 'w', content: 'w', encryption: 'plain', timestamp: Date.now() + 1, metadata: {}, replies: [] }], participants: ['w'], created: Date.now(), lastActivity: Date.now() };
        const r1 = msg.mergeSnapshot(wirePub);
        assert(r1.merged === true && r1.adopted === 1, 'valid snapshot refused: ' + JSON.stringify(r1));
        assert(msg.getScope('ms-bound').owner === JV_SCOPE.owner, 'local boundary loosened by wire: ' + JSON.stringify(msg.getScope('ms-bound')));

        const wireForeign = { kind: 'vant-msg-snapshot', id: 'ms-bound', scope: { owner: 'team:other-team', visibility: 'scope' }, messages: [{ id: 'w2', author: 'w', content: 'w2', encryption: 'plain', timestamp: Date.now() + 2, metadata: {}, replies: [] }], participants: [], created: Date.now(), lastActivity: Date.now() };
        const r2 = msg.mergeSnapshot(wireForeign);
        assert(r2.merged === true && r2.adopted === 1, 'valid snapshot refused: ' + JSON.stringify(r2));
        assert(msg.getScope('ms-bound').owner === JV_SCOPE.owner, 'local boundary rewritten by wire');
    });

    await test('request leg: owner-side scope gate — member gets snapshot, outsider gets null, unscoped flows', async () => {
        msg.clearState();
        msg.create({ id: 'ms-open', scope: null });
        msg.post('ms-open', 'open mic', { author: 'msa-agent' });
        msg.create({ id: 'ms-jv', scope: JV_SCOPE });
        msg.post('ms-jv', 'joint standup', { author: 'msa-agent' });

        // The OWNER node knows peers msh (partner), msb/msx (outsiders).
        const host = stubBus('msa', { peers: ['msb', 'msx', 'msh'] });
        sync.install(host.bus);

        // MEMBER node asks for the scoped conv -> snapshot rides back,
        // with the scope LIFTED into the envelope payload (crew-bus's
        // pass-40 gate re-checks it on the reply leg).
        deliver(host, 'msg.request', { from: 'msh', payload: { convId: 'ms-jv', reqId: 'rq-member' } });
        let reply = host.sent.find((s) => s.type === 'msg' && s.to === 'msh');
        assert(reply && reply.payload.snapshot && reply.payload.snapshot.id === 'ms-jv',
            'member denied: ' + JSON.stringify(reply ? reply.payload : null));
        assert(reply.payload.scope && reply.payload.scope.owner === JV_SCOPE.owner, 'scope not lifted into envelope payload');

        // OUTSIDER asks for the scoped conv -> snapshot null, indistinguishable from missing.
        deliver(host, 'msg.request', { from: 'msb', payload: { convId: 'ms-jv', reqId: 'rq-out' } });
        reply = host.sent.filter((s) => s.type === 'msg' && s.to === 'msb').pop();
        assert(reply && reply.payload.snapshot === null, 'outsider saw the scoped conversation');

        // ANYONE asks for the UNSCOPED conv -> flows.
        deliver(host, 'msg.request', { from: 'msb', payload: { convId: 'ms-open', reqId: 'rq-open' } });
        reply = host.sent.filter((s) => s.type === 'msg' && s.to === 'msb').pop();
        assert(reply && reply.payload.snapshot && reply.payload.snapshot.id === 'ms-open', 'unscoped conv refused to a registered peer');

        // Malformed asks dropped silently (no reply at all).
        const before = host.sent.length;
        deliver(host, 'msg.request', { from: 'msb', payload: { convId: 42, reqId: 'rq-bad' } });
        deliver(host, 'msg.request', { from: 'msb', payload: {} });
        assert(host.sent.length === before, 'malformed ask got a reply (leaks handler shape)');
    });

    await test('reply leg is sender-bound: observed reqId from a third peer is dropped', async () => {
        msg.clearState();
        msg.create({ id: 'ms-twin' });
        msg.post('ms-twin', 'twin', { author: 'msa-agent' });
        const asker = stubBus('msa', { peers: ['msh', 'msx'] });
        sync.install(asker.bus);
        // Owner answers asynchronously (stub replay pattern).
        asker.bus.send = async (to, type, payload) => {
            asker.sent.push({ to, type, payload });
            if (type === 'msg.request' && to === 'msh') {
                const snap = msg.exportSnapshot('ms-twin');
                setImmediate(() => {
                    // The FORGED reply comes from 'msx' with the REAL reqId.
                    asker.handlers.get('msg')({ from: 'msx', payload: { snapshot: snap, reqId: payload.reqId } });
                });
            }
            return { ok: true, handlers: 1 };
        };
        const r = await sync.msgPull(asker.bus, 'msh', 'ms-twin', { timeoutMs: 300 });
        assert(r.pulled === false && r.reason === 'timeout', 'forged reply merged: ' + JSON.stringify(r));
        assert(msg.messages('ms-twin').length === 1, 'forged snapshot mutated local history');
    });

    await test('push leg: receiver-side gate — member-delivered merges, foreign scope dropped, malformed dropped', async () => {
        msg.clearState();
        // The receiver IS the partner org's node: its agentId is a JV member
        // (msj-agent) — that is the node the push leg exists for.
        const recv = stubBus('msh', { peers: ['msa'], agentId: 'msj-agent' });
        sync.install(recv.bus);

        const mkSnap = (id, scopeVal) => ({
            kind: 'vant-msg-snapshot', id, scope: scopeVal === undefined ? JV_SCOPE : scopeVal,
            messages: [{ id: 'p1-' + id, author: 'msj-agent', content: 'pushed', encryption: 'plain', timestamp: Date.now(), metadata: {}, replies: [] }],
            participants: ['msj-agent'], created: Date.now(), lastActivity: Date.now()
        });

        // Registered peer pushes a scoped snapshot THIS node's agent can access.
        deliver(recv, 'msg.push', { from: 'msa', payload: { snapshot: mkSnap('ms-acc'), scope: JV_SCOPE } });
        assert(msg.messages('ms-acc').length === 1, 'member push not merged');

        // Registered peer pushes a FOREIGN-scope snapshot -> receiver gate drops.
        deliver(recv, 'msg.push', { from: 'msa', payload: { snapshot: mkSnap('ms-foreign', { owner: 'team:no-such-team', visibility: 'scope' }), scope: { owner: 'team:no-such-team', visibility: 'scope' } } });
        assert(msg.list().every((c) => c.id !== 'ms-foreign'), 'foreign-scope push landed');

        // Registered peer pushes MALFORMED -> dropped.
        deliver(recv, 'msg.push', { from: 'msa', payload: { snapshot: { kind: 'nope', id: 'ms-bad' }, scope: null } });
        assert(msg.list().every((c) => c.id !== 'ms-bad'), 'malformed push landed');
    });

    await test('sync legs answer REGISTERED peers only', async () => {
        msg.clearState();
        msg.create({ id: 'ms-reg' });
        msg.post('ms-reg', 'members only', { author: 'msa-agent' });
        const host = stubBus('msa', { peers: ['msb'] });
        sync.install(host.bus);
        const before = host.sent.length;
        // 'ms-ghost' is NOT in the registry.
        deliver(host, 'msg.request', { from: 'ms-ghost', payload: { convId: 'ms-reg', reqId: 'rq-g1' } });
        deliver(host, 'msg.push', { from: 'ms-ghost', payload: { snapshot: { kind: 'vant-msg-snapshot', id: 'ms-ghost-conv', scope: null, messages: [], participants: [], created: Date.now(), lastActivity: Date.now() } } });
        assert(host.sent.length === before, 'unregistered peer got state or pushed state');
    });

    await test('registry resolvePrincipal: vetted identity beats crew_ transport self-registration (name-keyed precedence)', async () => {
        // The pass-59 live-fire shape, pinned as a unit: BOTH entries share
        // the node name — the crew-bus transport self-registration (crew_)
        // and the genesis-vetted agent identity. Whichever hydrated first,
        // the VETTED identity must win; the transport id is only the
        // fallback when no agent identity was ever vetted.
        const reg = require(path.join(ROOT, 'lib', 'node-registry'));
        const tag = 'rp' + Date.now().toString(36);
        // Insertion order A: transport FIRST, vetted SECOND.
        reg.register({ id: 'crew_' + tag, name: tag + '-node', host: '127.0.0.1', port: 1, metadata: { kind: 'crew-node', source: 'vant-crew' } });
        reg.register({ id: tag + '-agent', name: tag + '-node', host: '127.0.0.1', port: 1 });
        assert(reg.resolvePrincipal(tag + '-node') === tag + '-agent',
            'vetted identity lost to transport entry (order A): ' + reg.resolvePrincipal(tag + '-node'));
        // Insertion order B: vetted FIRST, transport SECOND.
        const tag2 = tag + 'b';
        reg.register({ id: tag2 + '-agent', name: tag2 + '-node', host: '127.0.0.1', port: 1 });
        reg.register({ id: 'crew_' + tag2, name: tag2 + '-node', host: '127.0.0.1', port: 1, metadata: { kind: 'crew-node', source: 'vant-crew' } });
        assert(reg.resolvePrincipal(tag2 + '-node') === tag2 + '-agent',
            'vetted identity lost to transport entry (order B): ' + reg.resolvePrincipal(tag2 + '-node'));
        // No vetted identity: the transport id is the fallback (pass-40 rule).
        const tag3 = tag + 'c';
        reg.register({ id: 'crew_' + tag3, name: tag3 + '-node', host: '127.0.0.1', port: 1, metadata: { kind: 'crew-node', source: 'vant-crew' } });
        assert(reg.resolvePrincipal(tag3 + '-node') === 'crew_' + tag3,
            'transport fallback missing: ' + reg.resolvePrincipal(tag3 + '-node'));
        // No entry at all: null (caller falls back to the node name itself).
        assert(reg.resolvePrincipal('no-such-node-' + tag) === null, 'unknown name must resolve null');
        // Garbage in: null, never a throw.
        assert(reg.resolvePrincipal('') === null && reg.resolvePrincipal(null) === null, 'null/empty name must resolve null');
    });

    // ---------- two real processes: the JV standup (genesis pair) ----------
    const pidSuffix = process.pid.toString(36);
    const PORT_H = 50000 + (parseInt(pidSuffix, 36) % 6000) * 2;
    const PORT_J = PORT_H + 1;
    const CONV = 'ms59-' + pidSuffix;

    const HOST_SCRIPT = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const genesis = require('./lib/genesis');
const msg = require('./lib/msg');
const agoraSync = require('./lib/agora-sync');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    const g = await genesis.create({
        name: 'ms59-host', agentId: 'ms59-host-agent', port: ${PORT_H},
        joiner: { name: 'ms59-joiner', agentId: 'ms59-join-agent', port: ${PORT_J} },
        jv: { org: 'ms59-org', dept: 'ms59-dept', team: 'ms59-team' }
    });
    if (!g.ok) { console.log('HOST_FAIL:' + JSON.stringify(g).slice(0, 200)); process.exit(1); }
    console.log('HOST_SECRET:' + g.secret);
    // The JV standup channel: JV-scoped conversation on the OWNER node.
    const c = msg.create({ id: ${JSON.stringify(CONV)}, scope: g.jv.scope });
    if (c.error) { console.log('HOST_FAIL:create ' + c.error); process.exit(1); }
    msg.addParticipant(${JSON.stringify(CONV)}, 'ms59-host-agent');
    const p = msg.post(${JSON.stringify(CONV)}, 'host standup: agora gates shipped', { author: 'ms59-host-agent' });
    if (p.error) { console.log('HOST_FAIL:post ' + p.error); process.exit(1); }
    console.log('HOST_POSTED');
    // Wait for the joiner to merge, then pull BACK from the joiner — the
    // joiner will have added its own message locally (merge-only wire).
    // Every attempt is recorded: a return-pull failure must be diagnosable
    // from the log alone (pass-59 hunt: the loop used to overwrite the
    // result, hiding all mid-run failure reasons behind the final error).
    let back = null;
    const attempts = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
        back = await agoraSync.msgPull(require('./lib/crew-bus').default, 'ms59-joiner', ${JSON.stringify(CONV)}, { timeoutMs: 2000 });
        attempts.push({ at: Date.now() - t0, r: back ? { pulled: back.pulled, reason: back.reason || (back.merged && back.merged.reason) || (back.merged ? 'adopted:' + back.merged.adopted : null) } : null });
        if (back.pulled && back.merged && back.merged.adopted >= 1) break;
        await wait(400);
    }
    console.log('HOST_ATTEMPTS:' + JSON.stringify(attempts));
    console.log('HOST_PULL:' + JSON.stringify(back && { pulled: back.pulled, adopted: back.merged && back.merged.adopted }));
    console.log('HOST_PULLFULL:' + JSON.stringify(back && { pulled: back.pulled, reason: back.reason || (back.merged && back.merged.reason) || null }));
    const seen = msg.messages(${JSON.stringify(CONV)}).map((m) => m.author);
    console.log('HOST_SEES:' + JSON.stringify(seen));
    setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.log('HOST_FAIL:' + e.message); process.exit(1); });
`;

    const joinerScript = (secret) => `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const genesis = require('./lib/genesis');
const msg = require('./lib/msg');
const agoraSync = require('./lib/agora-sync');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    const r = await genesis.join({
        name: 'ms59-joiner', agentId: 'ms59-join-agent', port: ${PORT_J},
        host: 'ms59-host', hostPort: ${PORT_H}, hostAgent: 'ms59-host-agent',
        secret: ${JSON.stringify(secret)}, timeoutMs: 10000
    });
    if (!r.ok) { console.log('JOIN_FAIL:' + JSON.stringify(r).slice(0, 200)); process.exit(1); }
    console.log('JOIN_ACKED:' + JSON.stringify({ team: r.jv ? r.jv.team : null }));
    // Pull the JV standup from the owner. The OWNER gates on our genesis-
    // vetted principal; the snapshot carries the JV scope.
    let pull = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
        pull = await agoraSync.msgPull(require('./lib/crew-bus').default, 'ms59-host', ${JSON.stringify(CONV)}, { timeoutMs: 2000 });
        if (pull.pulled) break;
        await wait(400);
    }
    if (!pull.pulled) { console.log('JOIN_FAIL:pull ' + JSON.stringify(pull)); process.exit(1); }
    console.log('JOIN_MERGED:' + JSON.stringify({ merged: pull.merged.merged === true, adopted: pull.merged.adopted }));
    const seenJoiner = msg.messages(${JSON.stringify(CONV)}).map((m) => m.author);
    console.log('JOIN_SEES:' + JSON.stringify(seenJoiner));
    // Gate-math probe: can the JOINER'S owner-side gate resolve the HOST's
    // principal as a member? Through the PRODUCT surface (registry
    // resolvePrincipal — vetted identity beats the crew_ transport
    // self-registration), not a hand-rolled name scan. The joiner's
    // teams/org model is printed beside it — the gate is only as good as
    // the membership model beneath it.
    const reg = require('./lib/node-registry');
    const hostPrincipal = reg.resolvePrincipal('ms59-host');
    const convScope = msg.getScope(${JSON.stringify(CONV)});
    let gate = null, gateErr = null;
    try { gate = require('./lib/scope').canAccess({ scope: convScope }, hostPrincipal); } catch (e) { gateErr = e.message; }
    let tmodel = null;
    try {
        const teams = require('./lib/teams');
        tmodel = { orgs: (teams.listOrgs() || []).map((o) => o.id), teams: (teams.listTeams() || []).map((t) => t.id), asg: ['ms59-host-agent', 'ms59-join-agent'].map((a) => { const r = teams.getAssignment(a); return a + ':' + (r && r.team ? r.team : 'none'); }) };
    } catch (e2) { tmodel = { error: e2.message }; }
    console.log('JOIN_GATE:' + JSON.stringify({ principal: hostPrincipal, gate, gateErr, scope: convScope, regCount: (reg.list() || []).length, tmodel }));
    // The joiner posts LOCALLY (never over the wire) — the next owner pull
    // must bring this message home via the merge-only return leg.
    const p = msg.post(${JSON.stringify(CONV)}, 'joiner standup: snapshots look clean', { author: 'ms59-join-agent' });
    if (p.error) { console.log('JOIN_FAIL:post ' + p.error); process.exit(1); }
    console.log('JOIN_POSTED');
    await wait(3000); // stay up for the host's return pull
    process.exit(0);
})().catch((e) => { console.log('JOIN_FAIL:' + e.message); process.exit(1); });
`;

    function run(script, onLine) {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ['-e', script], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
            let out = '', errout = '';
            child.stdout.on('data', (d) => {
                out += d.toString();
                if (onLine) for (const line of d.toString().split('\n')) if (line.trim()) onLine(line.trim());
            });
            child.stderr.on('data', (d) => { errout += d.toString(); });
            child.on('close', (code) => resolve({ code, out, errout }));
            child.on('error', reject);
            child.stdin.end();
        });
    }

    await test('two-process JV standup: owner posts, joiner pulls through the genesis gates, return pull converges both orgs', async () => {
        const obs = { secret: null, joinAcked: null, joinMerged: null, joinSees: null, hostPull: null, hostSees: null, fails: [] };
        let joinerPromise = null;
        const hostPromise = run(HOST_SCRIPT, (line) => {
            if (line.startsWith('HOST_SECRET:') && !joinerPromise) {
                obs.secret = line.slice(12);
                joinerPromise = run(joinerScript(obs.secret), (l) => {
                    if (l.startsWith('JOIN_ACKED:')) { try { obs.joinAcked = JSON.parse(l.slice(11)); } catch (e) {} }
                    if (l.startsWith('JOIN_MERGED:')) { try { obs.joinMerged = JSON.parse(l.slice(12)); } catch (e) {} }
                    if (l.startsWith('JOIN_SEES:')) { try { obs.joinSees = JSON.parse(l.slice(10)); } catch (e) {} }
                    if (l.startsWith('JOIN_GATE:')) { try { obs.joinGate = JSON.parse(l.slice(10)); } catch (e) {} }
                    if (l.startsWith('JOIN_FAIL:')) obs.fails.push(l);
                });
            }
            if (line.startsWith('HOST_ATTEMPTS:')) { try { obs.hostAttempts = JSON.parse(line.slice(14)); } catch (e) {} }
            if (line.startsWith('HOST_PULL:')) { try { obs.hostPull = JSON.parse(line.slice(10)); } catch (e) {} }
            if (line.startsWith('HOST_PULLFULL:')) { try { obs.hostPullFull = JSON.parse(line.slice(14)); } catch (e) {} }
            if (line.startsWith('HOST_SEES:')) { try { obs.hostSees = JSON.parse(line.slice(10)); } catch (e) {} }
            if (line.startsWith('HOST_FAIL:')) obs.fails.push(line);
        });
        await Promise.race([hostPromise, wait(30000)]);
        if (joinerPromise) await Promise.race([joinerPromise, wait(12000)]);

        assert(obs.fails.length === 0, 'process failures: ' + obs.fails.join(' | ').slice(0, 400));
        if (obs.joinGate) console.log('   gate probe: ' + JSON.stringify(obs.joinGate));
        if (obs.hostAttempts) console.log('   host attempts: ' + JSON.stringify(obs.hostAttempts));
        if (obs.hostPullFull) console.log('   host pull: ' + JSON.stringify(obs.hostPullFull));
        assert(obs.joinAcked && /^team_/.test(obs.joinAcked.team || ''), 'joiner not acked into the JV: ' + JSON.stringify(obs.joinAcked));
        assert(obs.joinMerged && obs.joinMerged.merged === true, 'joiner pull did not merge: ' + JSON.stringify(obs.joinMerged));
        // Same-disk nodes share the state store, so the joiner may see the
        // standup via hydration OR via the wire pull — either way it must
        // SEE the host's message. (The WIRE value is proven by the host's
        // return pull below: the host's in-memory map predates the joiner's
        // post, so only the wire can bring it home.)
        assert(Array.isArray(obs.joinSees) && obs.joinSees.includes('ms59-host-agent'), 'joiner never saw the host standup: ' + JSON.stringify(obs.joinSees));
        assert(obs.hostPull && obs.hostPull.pulled === true && obs.hostPull.adopted >= 1, 'host return pull failed: ' + JSON.stringify(obs.hostPull));
        assert(Array.isArray(obs.hostSees) && obs.hostSees.includes('ms59-host-agent') && obs.hostSees.includes('ms59-join-agent'),
            'host does not see BOTH orgs messages: ' + JSON.stringify(obs.hostSees));
    });

    const banner = `  ${results.passed} passed, ${results.failed} failed`;
    console.log('\n' + (results.failed ? '✗ ' : '✓ ') + banner + '\n');
    process.exit(results.failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
