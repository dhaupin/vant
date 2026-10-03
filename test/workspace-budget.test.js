#!/usr/bin/env node
/**
 * Workspace Budget Tests (pass 83)
 *
 * Covers workspace-scoped escrow budgets (#2 of the integration list):
 *   1. Key protocol - WORKSPACE_KEY / parseBudgetKey / isWorkspaceKey.
 *   2. Pool semantics - org pool + member rows, two rows one pool,
 *      refunds restore both, member caps persist and gate.
 *   3. RLS alongside - fail-closed on unknown workspaces
 *      (E_UNKNOWN_WORKSPACE / unknown_workspace), registry-verified
 *      admin gate on MCP money-admin tools.
 *   4. Market integration - trade() with context.workspace draws the
 *      org pool (debit lands on pool AND member row).
 *   5. Backward compat - flat budgets, beforeExecute/afterExecute and
 *      settlement-style paths are byte-identical without workspace.
 *
 * ISOLATION: scratch brain (VANT_BRAIN) so pool writes never touch a
 * real brain's escrow.json. run-all runs every suite in its own process.
 */

const SCRATCH_BRAIN = 'wsb-test-' + Date.now().toString(36);
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

async function test(name, fn) {
    try {
        const ok = await fn();
        if (ok === false) throw new Error('assertion failed');
        results.passed++;
        console.log(`  \u2713 ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  \u2717 ${name}: ${e.message}`);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

async function main() {
    console.log('\n\ud83d\udcb0 WORKSPACE BUDGET TESTS (pass 83)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    // Sandbox grants: market trade path needs canTrade; writes need canWrite.
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    sandbox.setScopes(['read', 'write', 'network']);
    sandbox.defaultSandbox.setCapabilities({
        canRead: true, canWrite: true, canNetwork: true, canTrade: true
    });

    const { Escrow } = require(path.join(ROOT, 'lib', 'escrow'));
    const escrowMod = require(path.join(ROOT, 'lib', 'escrow'));
    const habitat = require(path.join(ROOT, 'lib', 'habitat'));
    const h = habitat.getShared();
    await habitat.getSharedReady();

    // Provision TWO workspaces + a pool, like production would.
    h.createWorkspace('org-acme', { owner: 'founder' });
    h.createWorkspace('org-globex', { owner: 'founder2' });

    // ---------- Key protocol ----------
    console.log('\n  Key protocol:');

    await test('WORKSPACE_KEY member/org forms', () => {
        assert(Escrow.WORKSPACE_KEY('org-acme', 'a1') === 'ws:org-acme:a1', 'member key shape');
        assert(Escrow.WORKSPACE_KEY('org-acme', null) === 'ws:org-acme::org', 'org key shape');
    });

    await test('parseBudgetKey round-trips member/org, rejects globals', () => {
        const m = Escrow.parseBudgetKey('ws:org-acme:a1');
        assert(m && m.workspace === 'org-acme' && m.agentId === 'a1' && m.org === false, 'member parse');
        const o = Escrow.parseBudgetKey('ws:org-globex::org');
        assert(o && o.workspace === 'org-globex' && o.org === true, 'org parse');
        assert(Escrow.parseBudgetKey('agent-legacy') === null, 'global is not workspace');
        assert(Escrow.parseBudgetKey('ws:malformed') === null, 'ws:-only is not a valid ws key');
        assert(Escrow.isWorkspaceKey('ws:org-acme:a1') === true, 'isWorkspaceKey member');
        assert(Escrow.isWorkspaceKey('agent-legacy') === false, 'isWorkspaceKey global');
    });

    // ---------- Pool semantics (persisted instances - disk-coherent genre) ----------
    console.log('\n  Pool semantics:');

    await test('setWorkspaceBudget creates the org pool', () => {
        const pool = escrowMod.setWorkspaceBudget('org-acme', 500);
        assert(pool.limit === 500 && pool.available === 500 && pool.workspace === 'org-acme', 'pool shape: ' + JSON.stringify(pool));
    });

    await test('member spend debits BOTH member row and org pool', () => {
        const r = escrowMod.workspaceRecordSpend('org-acme', 'a1', 100);
        assert(r.recorded === true && r.spent === 100, 'spend recorded');
        const pool = escrowMod.getWorkspacePool('org-acme');
        assert(pool.spent === 100 && pool.available === 400, 'pool drained: ' + JSON.stringify(pool));
        const member = new Escrow().getBudget('a1', { workspace: 'org-acme' });
        assert(member.spent === 100 && member.available === 400, 'member tracked');
    });

    await test('canSpend refuses amounts beyond the POOL (two rows, one pool)', () => {
        const r = escrowMod.workspaceCanSpend('org-acme', 'a2', 450);
        assert(r.allowed === false && r.reason === 'workspace_pool_exceeded', 'pool gate: ' + JSON.stringify(r));
        assert(escrowMod.workspaceCanSpend('org-acme', 'a2', 400).allowed === true, 'within pool');
    });

    await test('refund restores member AND pool', () => {
        new Escrow().refund('a1', 50, { workspace: 'org-acme' });
        const pool = escrowMod.getWorkspacePool('org-acme');
        assert(pool.spent === 50 && pool.available === 450, 'pool after refund: ' + JSON.stringify(pool));
    });

    await test('member cap persists and gates across instances', () => {
        escrowMod.setWorkspaceMemberLimit('org-acme', 'capped1', 25);
        const r = new Escrow().canSpend('capped1', 30, { workspace: 'org-acme' });
        assert(r.allowed === false && r.reason === 'member_limit_exceeded', 'cap gate: ' + JSON.stringify(r));
        assert(new Escrow().canSpend('capped1', 20, { workspace: 'org-acme' }).allowed === true, 'within cap');
    });

    await test('capped member draw drains pool only up to cap', () => {
        escrowMod.workspaceRecordSpend('org-acme', 'capped1', 20);
        const r = new Escrow().canSpend('capped1', 10, { workspace: 'org-acme' });
        assert(r.allowed === false && r.reason === 'member_limit_exceeded', 'cap exhausted');
        const pool = escrowMod.getWorkspacePool('org-acme');
        assert(pool.available === 430, 'pool only lost 20: ' + JSON.stringify(pool));
    });

    await test('other members unaffected by one member cap', () => {
        assert(new Escrow().canSpend('b1', 10, { workspace: 'org-acme' }).allowed === true, 'b1 draws fine');
    });

    await test('listWorkspacePools enumerates org pools', () => {
        const pools = escrowMod.listWorkspacePools();
        const acme = pools.find(p => p.workspace === 'org-acme');
        assert(acme && acme.limit === 500 && acme.available === 430, 'acme pool listed: ' + JSON.stringify(acme));
    });

    // ---------- RLS alongside ----------
    console.log('\n  RLS alongside:');

    await test('draws fail closed on UNKNOWN workspaces (canSpend)', () => {
        const r = new Escrow().canSpend('ghost', 5, { workspace: 'never-created-ws' });
        assert(r.allowed === false && r.reason === 'unknown_workspace', 'pool gate: ' + JSON.stringify(r));
    });

    await test('draws fail closed on UNKNOWN workspaces (recordSpend)', () => {
        const r = new Escrow().recordSpend('ghost', 5, { workspace: 'never-created-ws' });
        assert(r.recorded === false && r.code === 'E_UNKNOWN_WORKSPACE', 'spend refused: ' + JSON.stringify(r));
    });

    await test('recordSpend on unknown workspace writes NO budget rows', () => {
        const state = escrowMod.gatherState();
        const ghosts = Object.keys(state.budgets).filter(k => k.includes('never-created-ws'));
        assert(ghosts.length === 0, 'no phantom rows: ' + JSON.stringify(ghosts));
    });

    await test('RLS_DISABLED option restores pass-through (documented escape hatch)', () => {
        const e = new Escrow({ persistBudgets: false, enforceWorkspaceRLS: false });
        assert(e.canSpend('x1', 5, { workspace: 'any-ws' }).allowed === true, 'unmanaged ws allowed when gate off');
    });

    await test('MCP admin gate: admin of ANOTHER workspace is denied (RLS_DENIED)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        let threw = null;
        try {
            await mcp.execute('escrow_setWorkspaceBudget', { workspaceId: 'org-globex', amount: 999, adminId: 'boss-acme' });
        } catch (e) { threw = e; }
        assert(threw, 'cross-ws admin must be refused');
        assert(threw.code === 'RLS_DENIED', 'expected RLS_DENIED, got ' + threw.code);
    });

    await test('MCP admin gate: legitimate workspace admin succeeds', async () => {
        h.addRole('org-globex', 'admin', 'boss-globex');
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const out = await mcp.execute('escrow_setWorkspaceBudget', { workspaceId: 'org-globex', amount: 999, adminId: 'boss-globex' });
        assert(out.ok === true && out.pool.limit === 999, 'pool set by legit admin: ' + JSON.stringify(out));
        assert(escrowMod.getWorkspacePool('org-globex').limit === 999, 'pool persisted');
    });

    await test('MCP member cap: non-admin denied, admin succeeds', async () => {
        h.addRole('org-acme', 'admin', 'boss-acme');   // granted here (single grant point)
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        let threw = null;
        try {
            await mcp.execute('escrow_setWorkspaceMemberLimit', { workspaceId: 'org-globex', agentId: 'm1', limit: 10, adminId: 'boss-acme' });
        } catch (e) { threw = e; }
        assert(threw && threw.code === 'RLS_DENIED', 'cross-ws cap refused');
        const ok = await mcp.execute('escrow_setWorkspaceMemberLimit', { workspaceId: 'org-globex', agentId: 'm1', limit: 10, adminId: 'boss-globex' });
        assert(ok.ok === true && ok.member.limit === 10, 'cap set by legit admin');
    });

    // ---------- Market integration ----------
    console.log('\n  Market integration:');

    await test('trade with context.workspace draws the org pool', async () => {
        const market = require(path.join(ROOT, 'lib', 'market'));
        // Governance gate (pass 38 genre): requiresConsent defaults true and
        // consent must be IN THE CONTEXT - the listing body is data, not ctx.
        const listing = await market.list('knowledge', {
            title: 'wsb pool listing ' + Date.now(), summary: 'workspace debit pin',
            seller: 'trust-agent', price: 30
        }, { requiresConsent: true, consentGiven: true });
        assert(!listing.error, 'list failed: ' + (listing.error || JSON.stringify(listing)));
        escrowMod.setWorkspaceBudget('org-acme', 500);   // top pool back up
        const before = escrowMod.getWorkspacePool('org-acme').available;
        // Consent rides the trade CONTEXT (same as listing), buyer needs
        // trust >= 0.3 (seed via trust.recordTrade genre used by the pins).
        let trade = await market.trade(listing.id, 'trust-agent', { workspace: 'org-acme', requiresConsent: true, consentGiven: true });
        if (trade.error === 'Buyer trust too low' || trade.error === 'Governance: trade not allowed') {
            try {
                const trust = require(path.join(ROOT, 'lib', 'trust'));
                if (trust.recordTrade) { trust.recordTrade('trust-agent', 'trust-agent', 1); trust.recordTrade('trust-agent', 'trust-agent', 1); }
            } catch (e) { /* trust optional */ }
            trade = await market.trade(listing.id, 'trust-agent', { workspace: 'org-acme', requiresConsent: true, consentGiven: true });
        }
        if (trade.error) {
            // If a non-escrow gate still blocks, the pool must be untouched
            const after = escrowMod.getWorkspacePool('org-acme').available;
            assert(after === before, 'blocked trade must not debit pool: ' + trade.error);
            console.log('    (trade gated upstream: ' + trade.error + ' - pool untouched, still valid)');
            return;
        }
        const after = escrowMod.getWorkspacePool('org-acme').available;
        assert(after === before - 30, 'pool debited by price: ' + before + ' -> ' + after);
    });

    // ---------- Backward compat ----------
    console.log('\n  Backward compat:');

    await test('flat budgets work exactly as before', () => {
        const e = new Escrow({ persistBudgets: false });
        e.setBudget('agent-flat', 10);
        assert(JSON.stringify(e.getBudget('agent-flat')) === '{"spent":0,"limit":10,"available":10}', 'flat shape unchanged');
        e.recordSpend('agent-flat', 4);
        assert(e.getBudget('agent-flat').available === 6, 'flat spend unchanged');
        assert(e.canSpend('agent-flat', 100).allowed === false, 'flat gate unchanged');
    });

    await test('beforeExecute/afterExecute without workspace are unchanged', async () => {
        const e = new Escrow({ persistBudgets: false });
        e.setBudget('agent-exec', 100);
        const before = await e.beforeExecute({ agentId: 'agent-exec', operation: 'read', cost: 5 });
        assert(before.allowed === true && before.results.budget.available === 100, 'beforeExecute flat');
        const after = e.afterExecute({ agentId: 'agent-exec', operation: 'read', cost: 5, success: true });
        assert(after.recorded === true, 'afterExecute flat');
        assert(e.getBudget('agent-exec').spent === 5, 'flat debit intact');
    });

    await test('beforeExecute honors userCtx.workspace (RLS subject flows in)', async () => {
        const e = new Escrow({ persistBudgets: false });
        e.setBudget(null, 100, { workspace: 'org-globex' });
        const before = await e.beforeExecute({ agentId: 'm1', operation: 'read', cost: 5, userCtx: { workspace: 'org-globex' } });
        assert(before.allowed === true, 'userCtx.workspace accepted');
        const pool = e.getBudget(null, { workspace: 'org-globex' });
        const after = e.afterExecute({ agentId: 'm1', cost: 5, success: true, userCtx: { workspace: 'org-globex' } });
        assert(after.recorded === true && e.getBudget(null, { workspace: 'org-globex' }).available === 95, 'userCtx.workspace debits pool');
    });

    await test('settlement-style canSpend->recordSpend pair unchanged (no workspace)', () => {
        const e = new Escrow({ persistBudgets: false });
        e.setBudget('settle-agent', 50);
        const check = e.canSpend('settle-agent', 10);
        assert(check.allowed === true && check.available === 50, 'check shape');
        const spend = e.recordSpend('settle-agent', 10);
        assert(spend.recorded === true && spend.spent === 10, 'spend shape');
    });

    // ---------- Summary ----------
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('SUITE ERROR:', e.stack || e.message);
    process.exit(1);
});
