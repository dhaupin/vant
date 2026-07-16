#!/usr/bin/env node
/**
 * Vant Event CLI
 * Event handling and pub/sub
 * 
 * Usage:
 *   vant event emit <event> <data>    # Emit event
 *   vant event listen <event>        # Listen for event
 *   vant event list                  # List event types
 *   vant event history              # Show event history
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Event CLI - Event handling

Usage:
  vant event emit <event> <data>     Emit an event
  vant event listen <event>         Listen for event
  vant event list                   List event types
  vant event history                Show event history
  vant event clear                  Clear event history
`);
    process.exit(0);
}

async function run() {
    try {
        const event = require('../lib/event');
        
        if (subcmd === 'emit' || subcmd === 'send' || subcmd === 'post') {
            const eventName = args[1];
            const data = args.slice(2).join(' ');
            if (!eventName) {
                console.error('Usage: vant event emit <event> [data]');
                process.exit(1);
            }
            console.log('Emitting:', eventName);
            if (data) console.log('Data:', data);
        } else if (subcmd === 'listen' || subcmd === 'watch' || subcmd === 'subscribe') {
            const eventName = args[1];
            if (!eventName) {
                console.error('Usage: vant event listen <event>');
                process.exit(1);
            }
            console.log('Listening for:', eventName);
        } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'types') {
            console.log('Event types:');
            console.log('  - brain:load');
            console.log('  - brain:save');
            console.log('  - agent:spawn');
            console.log('  - agent:complete');
            console.log('  - sync:start');
            console.log('  - sync:complete');
        } else if (subcmd === 'history' || subcmd === 'log' || subcmd === 'events') {
            console.log('Event history: (use event.history() for actual events)');
        } else if (subcmd === 'clear' || subcmd === 'reset') {
            console.log('Clearing event history...');
        } else {
            console.log('Usage: vant event <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
