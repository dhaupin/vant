#!/usr/bin/env node
/**
 * Vant Skills CLI
 * Skill management
 * 
 * Usage:
 *   vant skills list        # List installed skills
 *   vant skills search <q>  # Search skills
 *   vant skills add <url>   # Add skill from URL
 *   vant skills remove <name>  # Remove skill
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Skills CLI - Skill management

Usage:
  vant skills list              # List installed skills
  vant skills search <query>    # Search skills
  vant skills add <url>        # Add skill from URL
  vant skills remove <name>    # Remove skill
  vant skills info <name>      # Show skill info

Skills are stored in .agents/skills/
`);
    process.exit(0);
}

async function run() {
    try {
        const skills = require('../lib/skills');
        
        if (subcmd === 'list' || subcmd === 'ls') {
            const list = await skills.list();
            console.log('Installed skills:', list.length);
            list.forEach(s => console.log(' -', s));
        } else if (subcmd === 'search') {
            const query = args[1];
            if (!query) {
                console.error('Usage: vant skills search <query>');
                process.exit(1);
            }
            console.log('Searching for:', query);
        } else if (subcmd === 'add' || subcmd === 'install') {
            const url = args[1];
            if (!url) {
                console.error('Usage: vant skills add <url>');
                process.exit(1);
            }
            console.log('Adding skill from:', url);
        } else if (subcmd === 'remove' || subcmd === 'rm' || subcmd === 'uninstall') {
            const name = args[1];
            if (!name) {
                console.error('Usage: vant skills remove <name>');
                process.exit(1);
            }
            console.log('Removing skill:', name);
        } else if (subcmd === 'info') {
            const name = args[1];
            if (!name) {
                console.error('Usage: vant skills info <name>');
                process.exit(1);
            }
            console.log('Skill info:', name);
        } else {
            console.log('Usage: vant skills <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
