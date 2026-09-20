#!/usr/bin/env node
/**
 * Sudo Integration Tests (referenced by labs/TASKS.md handoff - previously missing)
 *
 * Verifies the prd-sudo.md contract end-to-end:
 * - Whitelist governance (allowedScopes / autoApprove / requiresCallback per service)
 * - TTL grants (exact expiry, no permanent static scope)
 * - Revalidation loop behavior (extend vs revoke)
 * - Sandbox.can() delegation to sudo (prd-sudo.md: can(cap) → sudo.can(taskId, scope))
 * - Storage *Secured escalation path
 * - Audit event emissions
 *
 * Run: node test/sudo-integration.test.js
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const sudo = require(path.join(ROOT, 'lib', 'sudo'));
const sandboxMod = require(path.join(ROOT, 'lib', 'sandbox'));
const event = require(path.join(ROOT, 'lib', 'event'));

const results = { passed: 0, failed: 0, tests: [] };
const _asyncTests = [];

function _verdict(r) {
    if (r === true || (r && r.success)) return { ok: true };
    return { ok: false, why: (r && r.error) || 'assertion failed' };
}

function test(name, fn) {
    let v;
    try { v = _verdict(fn()); } catch (e) { v = { ok: false, why: e.message }; }
    if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
}

function asyncTest(name, fn) { _asyncTests.push({ name, fn }); }

async function _runAsync() {
    for (const { name, fn } of _asyncTests) {
        let v;
        try {
            v = _verdict(await fn());
        } catch (e) { v = { ok: false, why: e.message }; }
        if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
    }
}

function freshDefaultTask() {
    sudo.reset();
    sudo.createTask('default', ['read']);
}

console.log('\n🛡️  SUDO INTEGRATION TESTS\n');

// ==================== WHITELIST GOVERNANCE ====================

test('whitelist covers all core services', () => {
    const w = sudo.ESCALATION_WHITELIST;
    for (const s of ['boot', 'network', 'storage', 'mcp', 'agents', 'default']) {
        if (!w[s]) return { success: false, error: `missing policy: ${s}` };
    }
    return { success: true };
});

test('default policy allows nothing', () => {
    const w = sudo.ESCALATION_WHITELIST.default;
    return { success: w.allowedScopes.length === 0 && w.autoApprove.length === 0 && w.requiresCallback.length === 0 };
});

asyncTest('denies scope not in service whitelist', async () => {
    freshDefaultTask();
    const r = await sudo.escalate(null, 'network', { service: 'storage' });
    return { success: r.denied === 'network' && r.reason === 'not_in_whitelist' };
});

asyncTest('storage write is auto-approved with TTL', async () => {
    freshDefaultTask();
    const r = await sudo.escalate(null, 'write', { service: 'storage' });
    return {
        success: r.granted === 'write' && r.auto === true &&
                 typeof r.expiresAt === 'number' && r.expiresAt > Date.now()
    };
});

asyncTest('grant makes sudo.can() true; unrelated scope stays denied', async () => {
    freshDefaultTask();
    await sudo.escalate(null, 'write', { service: 'storage' });
    return { success: sudo.can('default', 'write') === true && sudo.can('default', 'network') === false };
});

asyncTest('mcp read auto-approves; mcp write requires callback', async () => {
    freshDefaultTask();
    const r1 = await sudo.escalate(null, 'read', { service: 'mcp' });
    if (r1.granted !== 'read') return { success: false, error: `mcp read not auto-approved: ${JSON.stringify(r1)}` };
    const r2 = await sudo.escalate(null, 'write', { service: 'mcp' });
    return { success: r2.denied === 'write' && r2.reason === 'callback_required' };
});

asyncTest('callback approval grants; callback denial denies', async () => {
    freshDefaultTask();
    const ok = await sudo.escalate(null, 'spawn', { service: 'agents', callback: (esc, approve) => approve(true) });
    if (ok.granted !== 'spawn') return { success: false, error: 'callback approval failed' };
    const no = await sudo.escalate(null, 'write', { service: 'agents', callback: (esc, approve) => approve(false) });
    return { success: no.denied === 'write' && no.reason === 'callback_denied' };
});

asyncTest('TTL capped by policy maxTTL', async () => {
    freshDefaultTask();
    const maxTTL = sudo.ESCALATION_WHITELIST.mcp.maxTTL;
    const r = await sudo.escalate(null, 'write', { service: 'mcp', ttl: 999999999, callback: (e, ok) => ok(true) });
    return { success: r.granted === 'write' && (r.expiresAt - Date.now()) <= maxTTL + 100 };
});

asyncTest('explicit taskId routes the grant to that task', async () => {
    sudo.reset();
    sudo.createTask('worker-1', ['read']);
    const r = await sudo.escalate('worker-1', 'write', { service: 'storage' });
    return { success: r.granted === 'write' && sudo.can('worker-1', 'write') === true };
});

// ==================== TTL SEMANTICS ====================

asyncTest('expired grant no longer permits', async () => {
    freshDefaultTask();
    await sudo.escalate(null, 'write', { service: 'storage', ttl: 40 });
    const during = sudo.can('default', 'write');
    await new Promise(r => setTimeout(r, 90));
    const after = sudo.can('default', 'write');
    return { success: during === true && after === false };
});

asyncTest('escalation does NOT create a permanent static scope', async () => {
    freshDefaultTask();
    await sudo.escalate(null, 'write', { service: 'storage' });
    const t = sudo.getTask('default');
    return { success: t.scopes.has('write') === false };
});

// ==================== REVALIDATION ====================

asyncTest('revalidateEscalation extends a revalidatable (storage) grant', async () => {
    freshDefaultTask();
    await sudo.escalate(null, 'write', { service: 'storage' });
    const before = sudo.getGrants('default').write.expiresAt;
    await new Promise(r => setTimeout(r, 15));
    const r = sudo.revalidateEscalation('default', 'write');
    const after = sudo.getGrants('default').write.expiresAt;
    return { success: r.revalidated === true && after > before };
});

asyncTest('revalidateEscalation refuses non-revalidatable (mcp) grant', async () => {
    freshDefaultTask();
    await sudo.escalate(null, 'write', { service: 'mcp', callback: (e, ok) => ok(true) });
    const r = sudo.revalidateEscalation('default', 'write');
    return { success: r.revalidated === false && r.reason === 'not_revalidatable' };
});

asyncTest('revalidateEscalation reports no_grant when none exists', async () => {
    freshDefaultTask();
    const r = sudo.revalidateEscalation('default', 'write');
    return { success: r.revalidated === false && r.reason === 'no_grant' };
});

asyncTest('revalidation loop extends expired revalidatable grants', async () => {
    freshDefaultTask();
    // storage revalidates: grant with a short TTL, let it expire under the loop
    await sudo.escalate(null, 'write', { service: 'storage', ttl: 30 });
    sudo.startRevalidationLoop(40);
    await new Promise(r => setTimeout(r, 150));
    const g = sudo.getGrants('default').write;
    sudo.stopRevalidationLoop();
    return {
        success: !!g && g.revalidations >= 1 &&
                 g.expiresAt > Date.now() && sudo.can('default', 'write') === true
    };
});

asyncTest('revalidation loop revokes expired non-revalidatable grants', async () => {
    freshDefaultTask();
    // mcp does not revalidate: callback-approved write grant expires and must go
    await sudo.escalate(null, 'write', { service: 'mcp', callback: (e, ok) => ok(true), ttl: 25 });
    sudo.startRevalidationLoop(40);
    await new Promise(r => setTimeout(r, 150));
    const g = sudo.getGrants('default');
    sudo.stopRevalidationLoop();
    return { success: !g.write && sudo.can('default', 'write') === false };
});

// ==================== SANDBOX DELEGATION (can(cap) → sudo.can()) ====================

asyncTest('sandbox.can delegates to sudo for the boot task', async () => {
    freshDefaultTask();
    const before = sandboxMod.defaultSandbox.can('canWrite');
    await sudo.escalate(null, 'write', { service: 'storage' });
    const after = sandboxMod.defaultSandbox.can('canWrite');
    return { success: before === false && after === true };
});

asyncTest('standalone sandbox falls back to static capabilities', async () => {
    sudo.reset();
    const s = sandboxMod.create({ agentId: 'standalone-test', capabilities: { canWrite: true } });
    const v = s.can('canWrite');
    return { success: v === true };
});

asyncTest('sandbox denies cap the sudo task lacks', async () => {
    freshDefaultTask(); // read only, no network grant
    return { success: sandboxMod.defaultSandbox.can('canNetwork') === false };
});

// ==================== STORAGE ESCALATION PATH ====================

asyncTest('storage.writeSecured escalates via sudo and writes', async () => {
    sudo.reset();
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const tmpBase = path.join(ROOT, 'models', 'private', 'vant', '.sudo-test-tmp');
    fs.mkdirSync(tmpBase, { recursive: true });
    const s = Storage.get('file', { basePath: tmpBase });
    const f = 'sudo-esc-' + Date.now() + '.md';
    try {
        await s.writeSecured(f, 'escalated write');
        const content = await s.readSecured(f);
        return { success: content === 'escalated write' };
    } finally {
        try { fs.unlinkSync(path.join(tmpBase, f)); } catch (e) {}
        try { fs.rmdirSync(tmpBase); } catch (e) {}
    }
});

// ==================== AUDIT EVENTS ====================

asyncTest('escalation emits requested/granted/denied events', async () => {
    freshDefaultTask();
    const events = [];
    const on = (ev) => () => { events.push(ev); };
    const watchers = ['sudo:escalation_requested', 'sudo:escalation_granted', 'sudo:escalation_denied']
        .map(ev => { event.on(ev, on(ev)); return ev; });
    try {
        await sudo.escalate(null, 'write', { service: 'storage' });   // granted
        await sudo.escalate(null, 'network', { service: 'storage' }); // denied
    } finally {
        for (const ev of watchers) event.off(ev, on(ev));
    }
    return {
        success: events.includes('sudo:escalation_requested') &&
                 events.includes('sudo:escalation_granted') &&
                 events.includes('sudo:escalation_denied')
    };
});

// ==================== RUN ====================

(async () => {
    await _runAsync();
    sudo.reset();
    console.log(`\n--- RESULTS ---\n\n  Passed:  ${results.passed}\n  Failed:  ${results.failed}\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
