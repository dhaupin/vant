#!/usr/bin/env node
/**
 * Vant Trust CLI
 *
 * Usage:
 *   vant trust score <entity>
 *   vant trust record <entity> <type> <delta>
 *   vant trust leaderboard
 *   vant trust can <entity> <permission>
 *   vant trust required [permission] [minTrust]
 */

const mcp = require('../lib/mcp');

const args = process.argv.slice(2);
const action = args[0];
const entity = args[1];
const param1 = args[2];
const param2 = args[3];

async function main() {
    switch (action) {
        case 'score':
            if (!entity) {
                console.log('Usage: vant trust score <entity>');
                process.exit(1);
            }
            const score = await mcp.execute('trust_getScore', { entity });
            console.log(JSON.stringify(score, null, 2));
            break;

        case 'record':
            if (!entity || !param1 || !param2) {
                console.log('Usage: vant trust record <entity> <type> <delta>');
                console.log('Example: vant trust record agent-1 delegation 0.1');
                process.exit(1);
            }
            const delta = parseFloat(param2);
            const result = await mcp.execute('trust_record', { 
                entity, 
                type: param1, 
                delta 
            });
            console.log(JSON.stringify(result, null, 2));
            break;

        case 'leaderboard':
        case 'lb':
            const lb = await mcp.execute('trust_leaderboard', {});
            console.log(JSON.stringify(lb, null, 2));
            break;

        case 'can':
            if (!entity || !param1) {
                console.log('Usage: vant trust can <entity> <permission>');
                console.log('Example: vant trust can agent-1 canWrite');
                process.exit(1);
            }
            const can = await mcp.execute('trust_can', { entity, permission: param1 });
            console.log(can.allowed ? '✓ Allowed' : '✗ Denied');
            break;

        case 'required':
            if (!param1) {
                // Show current requirements
                const trust = require('../lib/trust');
                if (trust && trust.getRequired) {
                    const required = trust.getRequired();
                    console.log(JSON.stringify(required, null, 2));
                } else {
                    console.log('No trust requirements set');
                }
            } else if (param2) {
                // Set requirement
                const setResult = await mcp.execute('trust_setRequired', {
                    permission: param1,
                    minTrust: parseFloat(param2)
                });
                console.log(JSON.stringify(setResult, null, 2));
            } else {
                console.log('Usage: vant trust required [permission] [minTrust]');
                console.log('Example: vant trust required canDeploy 0.6');
            }
            break;

        default:
            console.log('Vant Trust CLI');
            console.log('');
            console.log('Usage:');
            console.log('  vant trust score <entity>          Get trust score');
            console.log('  vant trust record <e> <t> <d>       Record interaction');
            console.log('  vant trust leaderboard             Show top agents');
            console.log('  vant trust can <e> <p>            Check permission');
            console.log('  vant trust required [p] [n]        Get/set thresholds');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
