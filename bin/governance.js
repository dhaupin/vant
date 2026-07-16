#!/usr/bin/env node
/**
 * vant governance CLI - Governance decision making
 * 
 * Usage:
 *   vant governance decide <topic> <proposal>
 *   vant governance status <topic>
 *   vant governance list
 *   vant governance stats
 */

const governance = require('../lib/governance');

const args = process.argv.slice(2);
const cmd = args[0];

function main() {
    switch (cmd) {
        case 'decide':
            // vant governance decide <topic> <proposal>
            const topic = args[1];
            const proposal = args.slice(2).join(' ');
            
            if (!topic || !proposal) {
                console.log('Usage: vant governance decide <topic> <proposal>');
                process.exit(1);
            }
            
            const decision = governance.decide(topic, proposal);
            console.log('Decision:', decision.allowed ? 'APPROVED' : 'DENIED');
            console.log('  Topic:', topic);
            console.log('  Proposal:', proposal);
            break;
            
        case 'status':
            // vant governance status <topic>
            const statusTopic = args[1];
            
            if (!statusTopic) {
                console.log('Usage: vant governance status <topic>');
                process.exit(1);
            }
            
            const status = governance.isAllowed(statusTopic);
            console.log('Topic:', statusTopic);
            console.log('Allowed:', status.allowed ? 'YES' : 'NO');
            break;
            
        case 'list':
            // vant governance list
            const history = governance.getHistory();
            console.log('Decisions:', history.length);
            history.forEach(d => {
                console.log(' -', d.topic, '(' + (d.allowed ? 'APPROVED' : 'DENIED') + ')');
            });
            break;
            
        case 'stats':
            // vant governance stats
            const stats = governance.getStats();
            console.log('Governance Stats:');
            console.log('  Total decisions:', stats.total || 0);
            console.log('  Approved:', stats.approved || 0);
            console.log('  Denied:', stats.denied || 0);
            break;
            
        default:
            console.log('vant governance - Governance decision making');
            console.log('');
            console.log('Usage:');
            console.log('  vant governance decide <topic> <proposal>');
            console.log('  vant governance status <topic>');
            console.log('  vant governance list');
            console.log('  vant governance stats');
    }
}

main();
