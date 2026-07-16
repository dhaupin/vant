#!/usr/bin/env node
/**
 * Vant Consensus CLI
 * Consensus mechanisms
 * 
 * Usage:
 *   vant consensus status            # Show consensus status
 *   vant consensus propose <data>  # Propose value
 *   vant consensus vote <id> <yay|nay>  # Vote on proposal
 *   vant consensus leaders          # Show current leaders
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Consensus CLI - Consensus mechanisms

Usage:
  vant consensus status              Show consensus status
  vant consensus propose <data>    Propose a value
  vant consensus vote <id> <vote>   Vote on proposal (yay/nay)
  vant consensus leaders            Show current leaders
  vant consensus history            Show consensus history
`);
    process.exit(0);
}

async function run() {
    const consensus = require('../lib/consensus');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const stats = await consensus.getStats();
        console.log('Consensus status:');
        console.log('  Proposals:', stats.proposals || 0);
        console.log('  Votes:', stats.votes || 0);
        console.log('  Resolved:', stats.resolved || 0);
    } else if (subcmd === 'propose' || subcmd === 'proposal') {
        const data = args.slice(1).join(' ');
        if (!data) {
            console.error('Usage: vant consensus propose <data>');
            process.exit(1);
        }
        const result = await consensus.create(data);
        console.log('Proposed:', data);
        console.log('  ID:', result.id);
    } else if (subcmd === 'vote') {
        const id = args[1];
        const vote = args[2];
        if (!id || !vote) {
            console.error('Usage: vant consensus vote <id> <yay|nay>');
            process.exit(1);
        }
        const result = await consensus.vote(id, vote);
        console.log('Voted', vote, 'on proposal:', id);
        console.log('  Result:', result.voted ? 'SUCCESS' : 'FAILED');
    } else if (subcmd === 'leaders' || subcmd === 'delegate') {
        const list = await consensus.list();
        console.log('Current leaders:', list.length);
    } else if (subcmd === 'history' || subcmd === 'log') {
        const list = await consensus.list();
        console.log('Consensus history:', list.length, 'proposals');
    } else {
        console.log('Usage: vant consensus <command>');
        process.exit(1);
    }
}

run().catch(console.error);
