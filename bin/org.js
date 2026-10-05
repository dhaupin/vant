#!/usr/bin/env node
/**
 * Vant Org CLI — operator grant + orgchart utility (O-5, PRD D-3)
 *
 * The orgchart stack (lib/teams.js + lib/agents.js) is deny-by-default:
 * a default boot grants scopes ['read'] only, so every teams write returns
 * E_SANDBOX. This CLI is the documented grant path.
 *
 * Usage:
 *   vant org status                      Show current scopes/capabilities (default; read-only)
 *   vant org grant                       Grant operator scopes for this process tree
 *                                        (persists unless --session-only)
 *   vant org grant --scopes read,write,spawn,execute
 *   vant org grant --capabilities canWrite,canSpawn
 *   vant org config --set-operator-scopes read,write,spawn   Persist default for future boots
 *   vant org demo                        Run the create org→dept→team→role→spawn→assign flow
 *
 * (pass 123) Bare `vant org` shows STATUS, not grant. The old 'grant'
 * default meant any side-effect-free invocation of this CLI (CI bin smoke:
 * `node bin/org.js`) silently PERSISTED operator capabilities into the
 * current brain's config — escalating every future boot. Deny-by-default
 * tools must not grant on their no-argument path.
 *
 * Grant model (PRD labs/prd-org-teams.md):
 *   - scopes map to sandbox operation types (read/write/spawn/execute/network)
 *   - capabilities map to sandbox caps (canWrite, canSpawn, ...)
 *   - granting also creates a sudo task so scope-level sudo verdicts apply
 */
const sandbox = require('../lib/sandbox');
const sudo = require('../lib/sudo');
const config = require('../lib/config');

const OPERATOR_DEFAULT = ['read', 'write', 'spawn', 'execute'];
const CAP_DEFAULT = ['canWrite', 'canSpawn', 'canRead'];

// (pass 123) Active brain of record: config.currentBrainName() honors
// VANT_BRAIN (the env a scoped agent/session runs under);
// brain.getCurrentBrain() ignores that env entirely, so a scoped
// `vant org grant` used to persist the operator grant into the DEFAULT
// brain's config instead of the scoped brain's.
function activeBrain() {
    return config.currentBrainName ? config.currentBrainName()
        : require('../lib/brain').getCurrentBrain();
}

function parseList(v) {
    return String(v || '').split(',').map(s => s.trim()).filter(Boolean);
}

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0] || 'status';

    // Operator scopes persist in the CURRENT brain's config.json (see 'config'
    // below); reads must go through the brain-scoped get() or they only see
    // the global config and report null.
    function getOperatorScopes() {
        return config.get('orgchart.operatorScopes', null, { brain: activeBrain() });
    }

    // (pass 88) Persisted capabilities — boot widens fresh processes with
    // these (lib/boot.js), closing the two-layer grant trap.
    function getOperatorCaps() {
        return config.get('orgchart.operatorCapabilities', null, { brain: activeBrain() });
    }

    if (cmd === 'status' || cmd === '--status') {
        const ds = sandbox.defaultSandbox;
        console.log('Org operator status:');
        console.log('  scopes:', JSON.stringify(ds.scopes));
        console.log('  canWrite:', sandbox.canWrite(), ' canSpawn:', sandbox.canSpawn());
        console.log('  explicitlyConfigured:', !!ds._explicitlyConfigured);
        console.log('  config orgchart.operatorScopes:', JSON.stringify(getOperatorScopes()));
        console.log('  config orgchart.operatorCapabilities:', JSON.stringify(getOperatorCaps()));
        console.log('  (boot applies persisted capabilities in every fresh process — pass 88)');
        return;
    }

    if (cmd === 'config') {
        const si = args.indexOf('--set-operator-scopes');
        const ci = args.indexOf('--set-operator-caps');
        if (si === -1 && ci === -1) {
            console.log('Usage: vant org config --set-operator-scopes read,write,spawn,execute [--set-operator-caps canRead,canWrite,canSpawn]');
            console.log('Persists the operator grant applied by boot in every fresh process.');
            return;
        }
        const brain = activeBrain();
        const existing = config.loadBrainConfig(brain) || {};
        const orgchart = { ...(existing.orgchart || {}) };
        if (si !== -1) {
            const scopes = parseList(args[si + 1]);
            if (!scopes.length) { console.error('No scopes given'); process.exit(1); }
            orgchart.operatorScopes = scopes;
        }
        if (ci !== -1) {
            const capNames = parseList(args[ci + 1]);
            if (!capNames.length) { console.error('No capabilities given'); process.exit(1); }
            const capObj = {};
            for (const c of capNames) capObj[c] = true;
            orgchart.operatorCapabilities = capObj;
        }
        const merged = { ...existing, orgchart };
        const saved = config.saveBrainConfig(brain, merged);
        if (!saved) {
            console.error('Could not persist operator grant (brain config write failed).');
            process.exit(1);
        }
        if (orgchart.operatorScopes) console.log('Saved orgchart.operatorScopes =', JSON.stringify(orgchart.operatorScopes));
        if (orgchart.operatorCapabilities) console.log('Saved orgchart.operatorCapabilities =', JSON.stringify(orgchart.operatorCapabilities));
        console.log('  (persisted in brain config for: ' + brain + '; boot widens fresh processes)');
        return;
    }

    if (cmd === 'demo') {
        require('../lib/boot').init({ taskId: 'org-demo', scopes: OPERATOR_DEFAULT, debug: false });  // boot() = islands auto-hydrate (string prompt), init() = security layers
        // boot() wires scopes but DEFAULT_CAPABILITIES still deny canWrite/canSpawn —
        // grant the operator caps explicitly (the F-1 two-layer grant trap)
        sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
        const teams = require('../lib/teams');
        const agents = require('../lib/agents');
        const org = teams.createOrg('DemoOrg' + Date.now().toString(36).slice(-4), { desc: 'vant org demo' });
        if (org.error) { console.error('createOrg:', org.error, org.code); process.exit(1); }
        const dept = teams.createDept('Research', { org: org.id });
        const team = teams.createTeam('Wranglers', { dept: dept.id });
        const role = teams.createRole('agent-wrangler', { team: team.id, org: org.id, permissions: ['brain.read'] });
        const agent = agents.spawn({ name: 'Wrangler-1' });
        const assignment = agent.id ? teams.assign(agent.id, { role: 'agent-wrangler', team: team.id, org: org.id }) : null;
        console.log('Demo org flow:');
        console.log('  org:  ', org.id, org.name);
        console.log('  dept: ', dept.id, dept.name);
        console.log('  team: ', team.id, team.name);
        console.log('  role: ', role.id, role.name);
        console.log('  agent:', agent.id, agent.name, 'brain:', agent.brain);
        console.log('  assign:', assignment && !assignment.error ? 'OK (brain: ' + assignment.brain + ')' : JSON.stringify(assignment));
        console.log("\nClean up with: teams.deleteOrg('" + org.id + "') or teams.deleteOrg('" + org.id + "', {dryRun:true}) to preview cascade");
        // (pass 88 — prime #109) The spawn's persistence is async; exiting
        // before it lands silently lost the agent (agents.json never
        // written). Drain the save chain before exit.
        await agents.flush();
        return;
    }

    if (cmd === 'grant' || cmd === '--grant') {
        const si = args.indexOf('--scopes');
        const ci = args.indexOf('--capabilities');
        const sessionOnly = args.includes('--session-only');
        const scopes = si !== -1 ? parseList(args[si + 1])
            : (getOperatorScopes() || OPERATOR_DEFAULT);
        const caps = ci !== -1 ? parseList(args[ci + 1]) : CAP_DEFAULT;

        // Create a sudo task so scope-level verdicts apply (mirrors boot())
        sudo.createTask('org-operator', scopes);
        sandbox.setScopes(scopes);

        const capObj = {};
        for (const c of caps) capObj[c] = true;
        sandbox.defaultSandbox.setCapabilities(capObj);

        console.log('Org operator granted for this process:');
        console.log('  scopes:', JSON.stringify(scopes));
        console.log('  capabilities:', JSON.stringify(caps));
        console.log('  sudo task: org-operator');

        // (pass 88 — prime #108/#105) Persist the grant by default. The
        // grant used to die with the process ("for this process" output,
        // issue #108's two-layer trap); boot now hydrates the persisted
        // capabilities, so `vant org grant` once = every future process
        // inherits it. Opt out for a throwaway session: --session-only.
        if (!sessionOnly) {
            const brain = activeBrain();
            const existing = config.loadBrainConfig(brain) || {};
            const merged = {
                ...existing,
                orgchart: {
                    ...(existing.orgchart || {}),
                    operatorScopes: scopes,
                    operatorCapabilities: capObj
                }
            };
            const saved = config.saveBrainConfig(brain, merged);
            if (saved) {
                console.log('  persisted to brain config (' + brain + ') — fresh processes inherit it');
            } else {
                console.log('  ⚠ could not persist (brain config write failed) — this process only');
            }
        } else {
            console.log('  session-only (--session-only): not persisted');
        }
        console.log('\nTeams/agents write ops are now permitted (this process and, unless');
        console.log('--session-only, every future process that boots this brain).');
        return;
    }

    console.log(`Vant Org CLI

Usage:
  vant org grant [--scopes a,b,c] [--capabilities x,y] [--session-only]  Grant operator scopes+caps (persists unless --session-only)
  vant org status                                        Show sandbox scopes/caps + persisted config
  vant org config --set-operator-scopes a,b,c            Persist default grant scopes
  vant org config --set-operator-caps canRead,canWrite   Persist default grant capabilities
  vant org demo                                          Run a full org→dept→team→role→spawn→assign flow
`);
}

main().catch(e => { console.error('org:', e.message); process.exit(1); });
