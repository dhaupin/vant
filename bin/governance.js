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

async function main() {
    switch (cmd) {
        case 'decide':
            // vant governance decide <topic> <proposal>
            const topic = args[1];
            const proposal = args.slice(2).join(' ');
            
            if (!topic || !proposal) {
                console.log('Usage: vant governance decide <topic> <proposal>');
                process.exit(1);
            }
            
            const decision = await governance.decide(topic, { benefitScore: 10, consentGiven: true, proposal });
            console.log('Decision:', decision.allowed ? 'APPROVED' : 'DENIED');
            console.log('  Topic:', topic);
            console.log('  Proposal:', proposal);
            if (decision.reason) console.log('  Reason:', decision.reason);
            break;
            
        case 'status':
            // vant governance status <topic>
            // (Issue #173 QC) isAllowed is ASYNC — the old code printed off
            // the un-awaited Promise (`.allowed` on a Promise), so this
            // answered "Allowed: NO" for every topic.
            const statusTopic = args[1];
            
            if (!statusTopic) {
                console.log('Usage: vant governance status <topic>');
                process.exit(1);
            }
            
            const status = governance.getHistory().filter(d => d.action === statusTopic).slice(-1)[0];
            if (!status) {
                console.log('Topic:', statusTopic);
                console.log('Allowed:', 'NO (no decision recorded for this topic)');
                break;
            }
            console.log('Topic:', statusTopic);
            console.log('Allowed:', status.allowed ? 'YES' : 'NO');
            if (status.reason) console.log('  Reason:', status.reason);
            break;
            
        case 'list':
            // vant governance list
            const history = governance.getHistory();
            console.log('Decisions:', history.length);
            history.forEach(d => {
                // (Issue #173 QC) decide() keys the record as `action`, not
                // `topic` — the old print was "- undefined (APPROVED)" for
                // every row. Show the topic/action actually stored.
                console.log(' -', d.action, '(' + (d.allowed ? 'APPROVED' : 'DENIED') + ')');
            });
            break;
            
        case 'stats':
            // vant governance stats
            // (Issue #173 QC) getStats() returns { total, allowed, denied,
            // allowRate, reasons } — there is no `approved` key; the old
            // CLI read stats.approved (always undefined → 0 forever).
            const stats = governance.getStats();
            console.log('Governance Stats:');
            console.log('  Total decisions:', stats.total || 0);
            console.log('  Approved:', stats.allowed || 0);
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

main().catch(console.error);
