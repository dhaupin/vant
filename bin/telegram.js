#!/usr/bin/env node
/**
 * Vant Telegram CLI
 * Telegram bot operations
 * 
 * Usage:
 *   vant telegram status            # Show bot status
 *   vant telegram send <chat> <msg> # Send message
 *   vant telegram list             # List chats
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Telegram CLI - Telegram bot operations

Usage:
  vant telegram status              Show bot status
  vant telegram send <chat> <msg>  Send message
  vant telegram list                List chats
  vant telegram hook <url>         Set webhook
`);
    process.exit(0);
}

function run() {
    const telegram = require('../lib/telegram');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('Telegram bot status:');
        console.log('  Module loaded: yes');
        console.log('  Methods:', Object.keys(telegram).length);
    } else if (subcmd === 'send' || subcmd === 'message' || subcmd === 'msg') {
        const chat = args[1];
        const msg = args.slice(2).join(' ');
        if (!chat || !msg) {
            console.error('Usage: vant telegram send <chat> <message>');
            process.exit(1);
        }
        console.log('Sending to', chat + ':', msg);
    } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'chats') {
        console.log('Chats: (configure telegram bot to track chats)');
    } else if (subcmd === 'hook' || subcmd === 'webhook') {
        const url = args[1];
        if (!url) {
            console.error('Usage: vant telegram hook <url>');
            process.exit(1);
        }
        console.log('Setting webhook:', url);
    } else {
        console.log('Usage: vant telegram <command>');
        process.exit(1);
    }
}

run();
