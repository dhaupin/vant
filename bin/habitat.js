#!/usr/bin/env node
/**
 * Vant Habitat CLI (pass 81)
 * Workspace/RLS management over lib/habitat.js — the real subsystem.
 *
 * (pass 81) The old CLI was a facade: it never required lib/habitat.js,
 * status printed a hardcoded string, init/switch just logged. Rebuilt on
 * habitat.getShared() — the same singleton the MCP tools and boot use, so
 * state is coherent across all surfaces. Mirrors the vant_habitat_* MCP
 * tools 1:1.
 *
 * Usage:
 *   vant habitat status                    # workspaces, boundaries, current context
 *   vant habitat list                      # list workspaces
 *   vant habitat init <id>                 # create a workspace
 *   vant habitat use <id>                  # switch current workspace
 *   vant habitat roles <ws> <userId>       # show a user's roles in a workspace
 *   vant habitat grant <ws> <role> <userId> # assign a role (RLS)
 *   vant habitat policy <resource> <json>  # set an RLS boundary policy
 *   vant habitat boundaries                # list all boundary policies
 *   vant habitat can <mode> <resource> <userId> # RLS decision for a context
 *   vant habitat identity <agentId>        # RLS subject of a spawned agent
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Habitat CLI - workspace/RLS management (lib/habitat.js)

Usage:
  vant habitat status                     Workspaces, boundaries, current context
  vant habitat list                       List workspaces
  vant habitat init <id>                  Create a workspace
  vant habitat use <id>                   Switch current workspace
  vant habitat roles <ws> <userId>        Show a user's roles
  vant habitat grant <ws> <role> <userId> Assign a role (RLS)
  vant habitat policy <resource> <json>   Set a boundary policy
  vant habitat boundaries                 List boundary policies
  vant habitat can <mode> <res> <userId>  RLS decision (mode: read|write)
  vant habitat identity <agentId>         RLS subject of a spawned agent
  vant habitat token mint <agentId>       Mint a bearer token for an agent
  vant habitat token verify <token>       Verify + show the RLS subject
  vant habitat token list                 List token lifecycle rows
  vant habitat token revoke <token|hash>  Revoke (persists)
`);
    process.exit(0);
}

function habitat() {
    return require('../lib/habitat').getShared();
}

function run() {
    let h = habitat();

    // (pass 86) Token ops NEED restored state (durable role rows + token
    // hashes). getSharedReady() is awaitable and hands back the same
    // instance post-restore.
    const tokenReady = (subcmd === 'token')
        ? require('../lib/habitat').getSharedReady().then(inst => { h = inst; })
        : Promise.resolve();

    tokenReady.then(() => {
    if (subcmd === 'can' || subcmd === 'check') {
        // (pass 82) RLS decision for a plain user context: roles come from
        // the habitat registry in the CURRENT workspace.
        const [mode, resource, userId] = [args[1], args[2], args[3]];
        if (!mode || !resource || !userId) { console.error('Usage: vant habitat can <read|write> <resource> <userId>'); process.exit(1); }
        const ws = h.getCurrentWorkspace();
        const ctx = { userId, roles: h.getUserRoles(ws, userId), workspace: ws };
        h.can(ctx, resource, mode === 'write' ? 'write' : 'read').then(allowed => {
            console.log(allowed ? 'ALLOWED' : 'DENIED');
            process.exit(allowed ? 0 : 1);
        }).catch(e => { console.error('Error:', e.message); process.exit(1); });
        return;
    }

    if (subcmd === 'identity') {
        // (pass 82) The RLS subject a spawned agent presents.
        const agentId = args[1];
        if (!agentId) { console.error('Usage: vant habitat identity <agentId>'); process.exit(1); }
        const ctx = h.agentContext(agentId);
        if (!ctx) { console.error('AGENT_NOT_FOUND: ' + agentId + ' (spawn it first)'); process.exit(1); }
        console.log(JSON.stringify(ctx, null, 2));
        return;
    }

    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const s = h.status();
        console.log('Habitat status:');
        console.log('  Current workspace:', h.getCurrentWorkspace());
        console.log('  Workspaces:', h.listWorkspaces().map(w => w.id || w.name || w).join(', ') || '(none)');
        console.log('  Boundaries:', Object.keys(h.getBoundaries()).length);
        console.log('  Inputs:', s.inputs);
        console.log('  Contexts:', s.contexts);
    } else if (subcmd === 'list' || subcmd === 'ls') {
        const ws = h.listWorkspaces();
        console.log('Workspaces:', ws.length ? '' : '(none)');
        for (const w of ws) console.log('  -', typeof w === 'string' ? w : (w.id || w.name), JSON.stringify(w));
    } else if (subcmd === 'init' || subcmd === 'create' || subcmd === 'new') {
        const id = args[1];
        if (!id) { console.error('Usage: vant habitat init <id>'); process.exit(1); }
        const created = h.createWorkspace(id, {});
        console.log('✓ Workspace created:', created.id || id);
        console.log('  Current workspace is still:', h.getCurrentWorkspace(), '(use `vant habitat use ' + (created.id || id) + '` to switch)');
    } else if (subcmd === 'use' || subcmd === 'switch' || subcmd === 'activate') {
        const id = args[1];
        if (!id) { console.error('Usage: vant habitat use <id>'); process.exit(1); }
        const ok = h.setWorkspace(id);
        if (!ok) {
            console.error('✗ Unknown workspace: ' + id + ' (create it first: vant habitat init ' + id + ')');
            process.exit(1);
        }
        console.log('✓ Current workspace:', h.getCurrentWorkspace());
    } else if (subcmd === 'roles') {
        const [ws, userId] = [args[1], args[2]];
        if (!ws || !userId) { console.error('Usage: vant habitat roles <ws> <userId>'); process.exit(1); }
        const roles = h.getUserRoles(ws, userId);
        console.log('Roles for ' + userId + ' in ' + ws + ':', (roles && roles.length) ? roles.join(', ') : '(none)');
    } else if (subcmd === 'grant') {
        const [ws, role, userId] = [args[1], args[2], args[3]];
        if (!ws || !role || !userId) { console.error('Usage: vant habitat grant <ws> <role> <userId>'); process.exit(1); }
        h.addRole(ws, role, userId);
        console.log('✓ Granted', role, 'to', userId, 'in', ws);
        console.log('  Roles now:', h.getUserRoles(ws, userId).join(', '));
    } else if (subcmd === 'policy') {
        const [resource, json] = [args[1], args[2]];
        if (!resource || !json) { console.error('Usage: vant habitat policy <resource> <json>'); process.exit(1); }
        let policy;
        try { policy = JSON.parse(json); } catch (e) { console.error('✗ Policy must be valid JSON: ' + e.message); process.exit(1); }
        h.setPolicy(resource, policy);
        console.log('✓ Policy set for', resource);
        console.log(' ', JSON.stringify(h.getBoundaries()[resource]));
    } else if (subcmd === 'boundaries') {
        const b = h.getBoundaries();
        const keys = Object.keys(b);
        console.log('Boundary policies:', keys.length ? '' : '(none — defaults apply)');
        for (const k of keys) console.log('  -', k, '→', JSON.stringify(b[k]));
    } else    if (subcmd === 'token') {
        // (pass 86) Token lifecycle over the shared habitat singleton.
        const op = args[1];
        if (op === 'mint') {
            const [agentId, ttlArg] = [args[2], args[3]];
            if (!agentId) { console.error('Usage: vant habitat token mint <agentId> [ttlMs]'); process.exit(1); }
            try {
                const t = h.mintToken(agentId, ttlArg ? { ttlMs: parseInt(ttlMs, 10) } : {});
                console.log('✓ Token minted for', agentId, '(workspace: ' + t.workspace + ')');
                console.log('  token:', t.token);
                console.log('  expires:', new Date(t.expiresAt).toISOString());
                console.log('  Use it: Authorization: Bearer ' + t.token);
                console.log('  (raw token is shown ONCE — only its hash persists)');
            } catch (e) {
                console.error('✗', e.message);
                process.exit(1);
            }
        } else if (op === 'verify') {
            const token = args[2];
            if (!token) { console.error('Usage: vant habitat token verify <token>'); process.exit(1); }
            const ctx = h.verifyToken(token);
            if (!ctx) { console.error('✗ INVALID (unknown, expired, or agent deregistered)'); process.exit(1); }
            console.log('✓ VALID — registry-verified subject:');
            console.log(JSON.stringify(ctx, null, 2));
        } else if (op === 'list') {
            const list = h.listTokens();
            console.log('Tokens:', list.length ? '' : '(none)');
            for (const t of list) {
                console.log('  -', t.hash, '→', t.agentId, t.expired ? '(EXPIRED)' : '(expires ' + new Date(t.expiresAt).toISOString() + ')');
            }
        } else if (op === 'revoke') {
            const tokenOrHash = args[2];
            if (!tokenOrHash) { console.error('Usage: vant habitat token revoke <token|hash>'); process.exit(1); }
            const ok = h.revokeToken(tokenOrHash);
            console.log(ok ? '✓ Revoked' : '✗ No such token');
            process.exit(ok ? 0 : 1);
        } else {
            console.error('Usage: vant habitat token <mint|verify|list|revoke> ...');
            process.exit(1);
        }
    } else {
        console.log('Usage: vant habitat <status|list|init|use|roles|grant|policy|boundaries|can|identity|token> (try -h)');
        process.exit(1);
    }
    }).catch(e => { console.error('Error:', e.message); process.exit(1); });
}

run();
