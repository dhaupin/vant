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

function run() {
    const consensus = require('../lib/consensus');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('Consensus status:');
        console.log('  (use consensus.status() for actual status)');
    } else if (subcmd === 'propose' || subcmd === 'proposal') {
        const data = args.slice(1).join(' ');
        if (!data) {
            console.error('Usage: vant consensus propose <data>');
            process.exit(1);
        }
        console.log('Proposing:', data);
    } else if (subcmd === 'vote') {
        const id = args[1];
        const vote = args[2];
        if (!id || !vote) {
            console.error('Usage: vant consensus vote <id> <yay|nay>');
            process.exit(1);
        }
        console.log('Voting', vote, 'on proposal:', id);
    } else if (subcmd === 'leaders' || subcmd === 'delegate') {
        console.log('Current leaders: (use consensus.leaders() for list)');
    } else if (subcmd === 'history' || subcmd === 'log') {
        console.log('Consensus history: (use consensus.history() for list)');
    } else {
        console.log('Usage: vant consensus <command>');
        process.exit(1);
    }
}

run();
