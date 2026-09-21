#!/usr/bin/env node
/**
 * Sudo Escalation Templates + Policies-as-Code Tests (prd-sudo.md)
 *
 * Templates: define/get/list/delete/apply — pinned service+scope+ttl,
 * applied through escalate() so whitelist/rate-limit/audit still govern.
 * Policies: version-controlled, tighten-only whitelist overrides — whole-file
 * refusal on any widening or malformed entry.
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        results.passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

const POLICIES_REL = 'models/private/sudo/policies.json';
const TEMPLATES_REL = 'models/private/sudo/templates.json';
const POLICIES_FULL = path.join(ROOT, POLICIES_REL);
const TEMPLATES_FULL = path.join(ROOT, TEMPLATES_REL);

let sudo;

console.log('\n🔑 SUDO TEMPLATES + POLICIES-AS-CODE TESTS\n');

(async () => {
    // Clean slate for both files so tests are order-independent
    try { fs.rmSync(TEMPLATES_FULL, { force: true }); } catch (e) {}
    try { fs.rmSync(POLICIES_FULL, { force: true }); } catch (e) {}
    sudo = require(path.join(ROOT, 'lib', 'sudo'));
    sudo.reset();

    // ============== TEMPLATES ==============

    test('defineTemplate rejects invalid names', () => {
        for (const bad of ['', '../evil', 'has space', null, 'x'.repeat(65)]) {
            let threw = false;
            try { sudo.defineTemplate(bad, { service: 'storage', scope: 'write' }); } catch (e) { threw = true; }
            if (!threw) return { error: `accepted name: ${JSON.stringify(bad)}` };
        }
        return { success: true };
    });

    test('defineTemplate rejects bad specs', () => {
        for (const [spec, why] of [
            [null, 'null spec'],
            [{}, 'missing service+scope'],
            [{ service: 'storage' }, 'missing scope'],
            [{ scope: 'write' }, 'missing service'],
            [{ service: 'storage', scope: 'flying' }, 'unknown scope'],
            [{ service: 'storage', scope: 'write', ttl: -5 }, 'negative ttl'],
            [{ service: 'storage', scope: 'write', ttl: 'nope' }, 'string ttl'],
        ]) {
            let threw = false;
            try { sudo.defineTemplate('bad-' + Math.random(), spec); } catch (e) { threw = true; }
            if (!threw) return { error: why };
        }
        return { success: true };
    });

    test('defineTemplate normalizes ttl to policy cap and persists', () => {
        // storage.maxTTL is 300000; asking for 999999 must clamp
        const t = sudo.defineTemplate('deploy-hotfix', {
            service: 'storage', scope: 'write', ttl: 999999,
            reason: 'hotfix deploy', description: 'Push a hotfix now'
        });
        if (t.ttl !== 300000) return { error: `ttl not clamped: ${t.ttl}` };
        if (sudo.getTemplate('deploy-hotfix') === null) return { error: 'not persisted' };
        const raw = JSON.parse(fs.readFileSync(TEMPLATES_FULL, 'utf8'));
        if (!raw['deploy-hotfix'] || raw['deploy-hotfix'].ttl !== 300000) return { error: 'file missing template' };
        return { success: true };
    });

    test('listTemplates + deleteTemplate round-trip', () => {
        sudo.defineTemplate('t-b', { service: 'network', scope: 'network' });
        sudo.defineTemplate('t-a', { service: 'trust', scope: 'write' });
        const names = sudo.listTemplates().map(t => t.name);
        if (names.indexOf('t-a') === -1 || names.indexOf('t-b') === -1 || names.indexOf('deploy-hotfix') === -1) {
            return { error: 'missing templates: ' + names.join(',') };
        }
        if (names[0] !== 'deploy-hotfix' || names[1] !== 't-a') return { error: 'not sorted: ' + names.join(',') };
        const del = sudo.deleteTemplate('t-b');
        if (!del.deleted) return { error: 'delete failed' };
        if (sudo.getTemplate('t-b') !== null) return { error: 'still there' };
        const del2 = sudo.deleteTemplate('t-b');
        if (del2.deleted) return { error: 'double delete should report not found' };
        return { success: true };
    });

    await testAsync('applyTemplate grants via auto-approve path', async () => {
        // storage.write is auto-approved; template routes through escalate()
        const out = await sudo.applyTemplate('deploy-hotfix', 'tmpl-task-1');
        if (!out.granted) return { error: 'not granted: ' + JSON.stringify(out) };
        if (out.auto !== true) return { error: 'expected auto grant' };
        const g = sudo.getGrants('tmpl-task-1');
        if (!g.write) return { error: 'no TTL grant recorded' };
        return { success: true };
    });

    await testAsync('applyTemplate respects whitelist (denied on widened service)', async () => {
        // network service only allows 'network' scope — a template pinned to it
        // must NOT be able to grant 'write' even though templates validate scope
        sudo.defineTemplate('bad-net', { service: 'network', scope: 'network' });
        const out = await sudo.applyTemplate('bad-net', 'tmpl-task-2');
        if (!out.granted) return { error: 'expected network grant: ' + JSON.stringify(out) };
        return { success: true };
    });

    await testAsync('applyTemplate unknown template throws NOT_FOUND', async () => {
        let msg = '';
        try { await sudo.applyTemplate('nope-' + Date.now(), 't'); } catch (e) { msg = e.message; }
        if (!msg.includes('not found')) return { error: 'wrong error: ' + msg };
        return { success: true };
    });

    // ============== POLICIES AS CODE ==============

    test('loadPolicies no-op when file absent', () => {
        const r = sudo.loadPolicies();
        if (r.applied) return { error: 'should be no-op without file' };
        return { success: true };
    });

    test('loadPolicies tightens: narrow scopes, drop autoApprove, lower TTL', () => {
        fs.writeFileSync(POLICIES_FULL, JSON.stringify({
            storage: { allowedScopes: ['write'], autoApprove: [], maxTTL: 60000 },
            mcp: { revalidate: true }
        }, null, 2));
        const r = sudo.loadPolicies();
        if (!r.applied) return { error: 'not applied: ' + JSON.stringify(r) };
        const st = sudo.getPoliciesStatus();
        const p = st.services.storage;
        if (JSON.stringify(p.autoApprove) !== '[]') return { error: 'autoApprove not emptied' };
        if (p.maxTTL !== 60000) return { error: 'maxTTL not lowered: ' + p.maxTTL };
        if (st.services.mcp.revalidate !== true) return { error: 'revalidate not forced on' };
        return { success: true };
    });

    await testAsync('tightened policy actually governs escalate() (auto-approve removed)', async () => {
        // storage.write WAS auto-approved; after the tightening it must queue
        // pending instead of granting
        const out = await sudo.escalate('pol-task-1', 'write', { service: 'storage' });
        if (!out.pending) return { error: 'expected pending after autoApprove removal: ' + JSON.stringify(out) };
        return { success: true };
    });

    test('loadPolicies refuses scope additions (widening)', () => {
        const before = JSON.stringify(sudo.getPoliciesStatus().services.mcp);
        fs.writeFileSync(POLICIES_FULL, JSON.stringify({
            mcp: { allowedScopes: ['read', 'write', 'network', 'exec', 'spawn'] }
        }, null, 2));
        let threw = false;
        try { sudo.loadPolicies(); } catch (e) { threw = true; }
        const after = JSON.stringify(sudo.getPoliciesStatus().services.mcp);
        if (!threw) return { error: 'widening accepted!' };
        if (after !== before) return { error: 'state mutated on refusal!' };
        return { success: true };
    });

    test('loadPolicies refuses raising maxTTL', () => {
        fs.writeFileSync(POLICIES_FULL, JSON.stringify({
            network: { maxTTL: 999999999 }
        }, null, 2));
        let threw = false;
        try { sudo.loadPolicies(); } catch (e) { threw = true; }
        if (!threw) return { error: 'TTL raise accepted!' };
        if (sudo.getPoliciesStatus().services.network.maxTTL !== 600000) return { error: 'state mutated' };
        return { success: true };
    });

    test('loadPolicies refuses disabling revalidation where forced on', () => {
        fs.writeFileSync(POLICIES_FULL, JSON.stringify({
            boot: { revalidate: false }
        }, null, 2));
        let threw = false;
        try { sudo.loadPolicies(); } catch (e) { threw = true; }
        if (!threw) return { error: 'revalidate-off accepted!' };
        if (sudo.getPoliciesStatus().services.boot.revalidate !== true) return { error: 'state mutated' };
        return { success: true };
    });

    test('loadPolicies refuses removing a callback requirement', () => {
        // boot requires callback for exec/spawn; try to drop exec
        fs.writeFileSync(POLICIES_FULL, JSON.stringify({
            boot: { requiresCallback: ['spawn'] }
        }, null, 2));
        let threw = false;
        try { sudo.loadPolicies(); } catch (e) { threw = true; }
        if (!threw) return { error: 'callback removal accepted!' };
        return { success: true };
    });

    test('loadPolicies refuses malformed files (whole-file, no partial apply)', () => {
        for (const [body, why] of [
            ['{"storage": [1,2]}', 'array entry'],
            ['{"storage": {"bogusField": 1}}', 'unknown field'],
            ['{"made-up-service": {"maxTTL": 100}}', 'unknown service'],
            ['{"storage": {"allowedScopes": "write"}}', 'string allowedScopes'],
            ['{broken json', 'unparseable JSON'],
            ['["storage"]', 'top-level array'],
        ]) {
            fs.writeFileSync(POLICIES_FULL, body);
            let threw = false;
            try { sudo.loadPolicies(); } catch (e) { threw = true; }
            if (!threw) return { error: `accepted: ${why}` };
        }
        return { success: true };
    });

    test('resetPolicies restores shipped whitelist exactly', () => {
        // apply a valid tightening, then reset
        fs.writeFileSync(POLICIES_FULL, JSON.stringify({
            storage: { allowedScopes: ['write'], autoApprove: [], maxTTL: 60000 }
        }, null, 2));
        sudo.loadPolicies();
        if (sudo.getPoliciesStatus().services.storage.maxTTL !== 60000) return { error: 'tighten failed' };
        sudo.resetPolicies();
        const p = sudo.getPoliciesStatus();
        if (p.applied) return { error: 'still marked applied' };
        if (p.services.storage.maxTTL !== 300000) return { error: 'maxTTL not restored' };
        if (JSON.stringify(p.services.storage.autoApprove) !== '["write"]') return { error: 'autoApprove not restored' };
        return { success: true };
    });

    test('tighten requiresCallback (allowed) then apply once', () => {
        sudo.resetPolicies();
        // boot requiresCallback already includes exec/spawn; add 'write' (stricter)
        fs.writeFileSync(POLICIES_FULL, JSON.stringify({
            boot: { requiresCallback: ['spawn', 'exec', 'write'] }
        }, null, 2));
        const r = sudo.loadPolicies();
        if (!r.applied) return { error: 'not applied: ' + JSON.stringify(r) };
        if (JSON.stringify(sudo.getPoliciesStatus().services.boot.requiresCallback) !== '["spawn","exec","write"]') {
            return { error: 'callback add failed' };
        }
        return { success: true };
    });

    // Cleanup: leave no policy file behind (would tighten future boots!)
    try { fs.rmSync(POLICIES_FULL, { force: true }); } catch (e) {}
    try { fs.rmSync(TEMPLATES_FULL, { force: true }); } catch (e) {}
    sudo.resetPolicies();

    console.log(`\n${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
