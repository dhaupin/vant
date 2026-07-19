#!/usr/bin/env node
/**
 * Vant Learn - Learning system
 * 
 * Usage:
 *   vant learn add <topic> <content>   # Add learning
 *   vant learn query <topic>            # Query learning
 *   vant learn list                    # List learnings
 *   vant learn stats                  # Show stats
 */

const path = require('path');

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Learn - Learning System

USAGE:
  vant learn add <topic> <content>    # Add learning
  vant learn query <topic>           # Query learning
  vant learn list                    # List learnings
  vant learn stats                   # Show stats
  vant learn forget <topic>          # Remove learning

EXAMPLES:
  vant learn add javascript "JavaScript is awesome"
  vant learn query javascript
  vant learn list
  vant learn stats
`);
    process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');

// Lazy-load learn module
let learn = null;
function getLearn() {
    if (!learn) {
        try { learn = require('../lib/learn'); } catch(e) {}
    }
    return learn;
}

async function main() {
    const mod = getLearn();
    
    switch (action) {
        case 'add':
            const topic = args[1];
            const content = args.slice(2).join(' ');
            if (!topic || !content) {
                console.error('Usage: vant learn add <topic> <content>');
                process.exit(1);
            }
            console.log('Adding learning:', topic);
            if (mod && mod.add) {
                await mod.add(topic, content);
            }
            console.log('Added:', topic, '=', content.substring(0, 50));
            break;
            
        case 'query':
        case 'get':
            const queryTopic = args[1];
            if (!queryTopic) {
                console.error('Usage: vant learn query <topic>');
                process.exit(1);
            }
            console.log('Querying:', queryTopic);
            if (mod && mod.get) {
                const result = await mod.get(queryTopic);
                console.log(result);
            }
            break;
            
        case 'list':
            console.log('Learnings:');
            if (mod && mod.list) {
                const list = await mod.list();
                list.forEach(l => console.log(' -', l.topic, '=', l.content.substring(0, 30)));
            }
            break;
            
        case 'stats':
            console.log('Learning Stats:');
            if (mod && mod.stats) {
                const stats = await mod.stats();
                console.log(JSON.stringify(stats, null, 2));
            } else {
                console.log('Total learnings: 0');
            }
            break;
            
        case 'forget':
            const forgetTopic = args[1];
            if (!forgetTopic) {
                console.error('Usage: vant learn forget <topic>');
                process.exit(1);
            }
            console.log('Removing:', forgetTopic);
            if (mod && mod.remove) {
                await mod.remove(forgetTopic);
            }
            break;
            
        default:
            console.log('Unknown action:', action);
            console.log('Run: vant learn --help');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
