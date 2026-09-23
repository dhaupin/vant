#!/usr/bin/env node
/**
 * Vant Org CLI — operator grant + orgchart utility (O-5, PRD D-3)
 *
 * The orgchart stack (lib/teams.js + lib/agents.js) is deny-by-default:
 * a default boot grants scopes ['read'] only, so every teams write returns
 * E_SANDBOX. This CLI is the documented grant path.
 *
 * Usage:
 *   vant org grant                       Grant operator scopes for this process tree (default)
 *   vant org grant --scopes read,write,spawn,execute
 *   vant org grant --capabilities canWrite,canSpawn
 *   vant org status                      Show current scopes/capabilities
 *   vant org config --set-operator-scopes read,write,spawn   Persist default for future boots
 *   vant org demo                        Run the create org→dept→team→role→spawn→assign flow
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

function parseList(v) {
    return String(v || '').split(',').map(s => s.trim()).filter(Boolean);
}

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0] || 'grant';

    // Operator scopes persist in the CURRENT brain's config.json (see 'config'
    // below); reads must go through the brain-scoped get() or they only see
    // the global config and report null.
    function getOperatorScopes() {
        const brain = require('../lib/brain').getCurrentBrain();
        return config.get('orgchart.operatorScopes', null, { brain });
    }

    if (cmd === 'status' || cmd === '--status') {
        const ds = sandbox.defaultSandbox;
        console.log('Org operator status:');
        console.log('  scopes:', JSON.stringify(ds.scopes));
        console.log('  canWrite:', sandbox.canWrite(), ' canSpawn:', sandbox.canSpawn());
        console.log('  explicitlyConfigured:', !!ds._explicitlyConfigured);
        console.log('  config orgchart.operatorScopes:', JSON.stringify(getOperatorScopes()));
        return;
    }

    if (cmd === 'config') {
        const i = args.indexOf('--set-operator-scopes');
        if (i === -1) {
            console.log('Usage: vant org config --set-operator-scopes read,write,spawn,execute');
            console.log('Persists scopes applied by "vant org grant" when no --scopes given.');
            return;
        }
        const scopes = parseList(args[i + 1]);
        if (!scopes.length) { console.error('No scopes given'); process.exit(1); }
        // Persist in the brain's config.json (survives across processes;
        // config.setFlag is an in-memory runtime map and never persisted,
        // so the old setFlag call silently lost the value on next boot).
        // Read back through config.get('orgchart.operatorScopes') - the
        // same key 'grant' and 'status' consult.
        const brain = require('../lib/brain').getCurrentBrain();
        const existing = config.loadBrainConfig(brain) || {};
        const merged = { ...existing, orgchart: { ...(existing.orgchart || {}), operatorScopes: scopes } };
        const saved = config.saveBrainConfig(brain, merged);
        if (!saved) {
            console.error('Could not persist orgchart.operatorScopes (brain config write failed).');
            process.exit(1);
        }
        console.log('Saved orgchart.operatorScopes =', JSON.stringify(scopes));
        console.log('  (persisted in brain config for: ' + brain + ')');
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
        return;
    }

    if (cmd === 'grant' || cmd === '--grant') {
        const si = args.indexOf('--scopes');
        const ci = args.indexOf('--capabilities');
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
        console.log('\nTeams/agents write ops are now permitted. Persist defaults:');
        console.log('  vant org config --set-operator-scopes ' + scopes.join(','));
        return;
    }

    console.log(`Vant Org CLI

Usage:
  vant org grant [--scopes a,b,c] [--capabilities x,y]   Grant operator scopes+caps (this process)
  vant org status                                        Show sandbox scopes/caps + config
  vant org config --set-operator-scopes a,b,c            Persist default grant scopes
  vant org demo                                          Run a full org→dept→team→role→spawn→assign flow
`);
}

main().catch(e => { console.error('org:', e.message); process.exit(1); });
