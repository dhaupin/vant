#!/usr/bin/env node
/**
 * Vant Branch - Branch operations
 * 
 * Usage:
 *   vant branch list                # List branches
 *   vant branch create <name>      # Create branch
 *   vant branch switch <name>      # Switch branch
 *   vant branch delete <name>      # Delete branch
 */

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Branch - Branch operations

USAGE:
  vant branch list                  # List branches
  vant branch create <name>        # Create branch
  vant branch switch <name>       # Switch branch
  vant branch delete <name>       # Delete branch

EXAMPLES:
  vant branch list
  vant branch create feature-1
  vant branch switch feature-1
`);
    process.exit(0);
}

const { execSync } = require('child_process');

function main() {
    try {
        switch (action) {
            case 'list':
            case 'ls':
                console.log('Branches:');
                try {
                    const branches = execSync('git branch --list', { encoding: 'utf8' });
                    console.log(branches);
                } catch(e) {
                    console.log('  main (default)');
                }
                break;
                
            case 'create':
                const createName = args[1];
                if (!createName) {
                    console.error('Usage: vant branch create <name>');
                    process.exit(1);
                }
                console.log('Creating branch:', createName);
                try {
                    execSync(`git checkout -b ${createName}`, { encoding: 'utf8' });
                    console.log('✅ Branch created');
                } catch(e) {
                    console.log('Branch may already exist');
                }
                break;
                
            case 'switch':
            case 'checkout':
                const switchName = args[1];
                if (!switchName) {
                    console.error('Usage: vant branch switch <name>');
                    process.exit(1);
                }
                console.log('Switching to branch:', switchName);
                try {
                    execSync(`git checkout ${switchName}`, { encoding: 'utf8' });
                    console.log('✅ Switched');
                } catch(e) {
                    console.log('Error switching branch');
                }
                break;
                
            case 'delete':
            case 'del':
                const deleteName = args[1];
                if (!deleteName) {
                    console.error('Usage: vant branch delete <name>');
                    process.exit(1);
                }
                console.log('Deleting branch:', deleteName);
                try {
                    execSync(`git branch -D ${deleteName}`, { encoding: 'utf8' });
                    console.log('✅ Branch deleted');
                } catch(e) {
                    console.log('Error deleting branch');
                }
                break;
                
            default:
                console.log('Unknown action:', action);
                console.log('Run: vant branch --help');
        }
    } catch(e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

main();
