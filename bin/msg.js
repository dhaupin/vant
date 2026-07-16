#!/usr/bin/env node
/**
 * Vant Msg CLI
 * Messaging system
 * 
 * Usage:
 *   vant msg send <to> <message>  # Send message
 *   vant msg list                  # List messages
 *   vant msg read <id>            # Read message
 *   vant msg channels             # List channels
 *   vant msg join <channel>       # Join channel
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Msg CLI - Messaging system

Usage:
  vant msg send <to> <message>    Send message to user/channel
  vant msg list                  List recent messages
  vant msg read <id>             Read message by ID
  vant msg channels              List available channels
  vant msg join <channel>        Join a channel
  vant msg leave <channel>       Leave a channel
  vant msg inbox                 Show inbox
  vant msg unread                Show unread count
`);
    process.exit(0);
}

async function run() {
    try {
        const msg = require('../lib/msg');
        
        if (subcmd === 'send' || subcmd === 'post' || subcmd === 'write') {
            const to = args[1];
            const message = args.slice(2).join(' ');
            if (!to || !message) {
                console.error('Usage: vant msg send <to> <message>');
                process.exit(1);
            }
            console.log('Sending to:', to);
            console.log('Message:', message);
        } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'inbox') {
            console.log('Messages: (use msg.list() for actual messages)');
        } else if (subcmd === 'read' || subcmd === 'show' || subcmd === 'view') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant msg read <id>');
                process.exit(1);
            }
            console.log('Reading message:', id);
        } else if (subcmd === 'channels' || subcmd === 'chans') {
            console.log('Channels: (use msg.channels() to list)');
        } else if (subcmd === 'join' || subcmd === 'subscribe') {
            const channel = args[1];
            if (!channel) {
                console.error('Usage: vant msg join <channel>');
                process.exit(1);
            }
            console.log('Joining channel:', channel);
        } else if (subcmd === 'leave' || subcmd === 'unsubscribe') {
            const channel = args[1];
            if (!channel) {
                console.error('Usage: vant msg leave <channel>');
                process.exit(1);
            }
            console.log('Leaving channel:', channel);
        } else if (subcmd === 'unread' || subcmd === 'count') {
            console.log('Unread: 0');
        } else {
            console.log('Usage: vant msg <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
