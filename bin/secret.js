#!/usr/bin/env node
/**
 * Vant Secret CLI
 * Manage secrets/passwords for Vant
 * 
 * Usage:
 *   vant secret list               # List secret types
 *   vant secret get <type>         # Get a secret (brain, github, etc.)
 *   vant secret set <type> <val>  # Set a secret
 *   vant secret clear <type>      # Clear a secret
 *   vant secret clear --all        # Clear all secrets
 *   vant secret info <type>       # Show secret info
 * 
 * Examples:
 *   vant secret list
 *   vant secret get brain
 *   vant secret info github
 */

const secret = require('../lib/secret');

const args = process.argv.slice(2);
const subcmd = args[0];

async function main() {
    if (!subcmd || subcmd === 'list' || subcmd === 'ls') {
        console.log('Secret types:');
        for (const type of secret.types()) {
            const info = secret.info(type);
            console.log(`  ${type}: ${info.description}`);
            console.log(`    Env: ${info.envKey}`);
            console.log(`    Has: ${info.hasSecret ? 'yes' : 'no'}`);
        }
        return;
    }
    
    if (subcmd === 'get') {
        const type = args[1] || 'brain';
        try {
            const val = await secret.get(type);
            console.log(`${type}: ${val.substring(0, 10)}...`);
        } catch (e) {
            console.error('Error:', e.message);
            process.exit(1);
        }
        return;
    }
    
    if (subcmd === 'set') {
        const type = args[1];
        const val = args.slice(2).join(' ');
        if (!type || !val) {
            console.error('Usage: vant secret set <type> <value>');
            process.exit(1);
        }
        secret.set(type, val);
        console.log(`${type}: set`);
        return;
    }
    
    if (subcmd === 'clear') {
        if (args[1] === '--all') {
            secret.clearAll();
            console.log('All secrets cleared');
        } else {
            const type = args[1] || 'brain';
            secret.clear(type);
            console.log(`${type}: cleared`);
        }
        return;
    }
    
    if (subcmd === 'info') {
        const type = args[1] || 'brain';
        const info = secret.info(type);
        console.log(`Secret: ${type}`);
        console.log(`  Description: ${info.description}`);
        console.log(`  Env key: ${info.envKey}`);
        console.log(`  Has secret: ${info.hasSecret}`);
        return;
    }
    
    if (subcmd === '-h' || subcmd === '--help') {
        console.log(`
Vant Secret CLI - Manage secrets/passwords

Usage:
  vant secret list                List secret types
  vant secret get <type>          Get a secret
  vant secret set <type> <val>   Set a secret
  vant secret clear <type>       Clear a secret
  vant secret clear --all         Clear all secrets
  vant secret info <type>        Show secret info

Secret types:
  brain       - Brain/horcrux encryption
  github      - GitHub API access
  openai      - OpenAI API access
  anthropic   - Anthropic/Claude API access
  telegram    - Telegram bot token
  slack       - Slack bot token

Examples:
  vant secret list
  vant secret get brain
  vant secret info github
`);
        return;
    }
    
    console.error('Unknown command:', subcmd);
    console.error('Run "vant secret --help" for usage');
    process.exit(1);
}

main();
