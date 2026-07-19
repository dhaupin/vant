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
let learnInstance = null;
function getLearn() {
    if (!learn) {
        try { 
            learn = require('../lib/learn');
            if (learn.LearningSystem) {
                learnInstance = new learn.LearningSystem();
            }
        } catch(e) {}
    }
    return learnInstance;
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
            if (mod && mod.remember) {
                const result = await mod.remember(topic, { content });
                console.log('Added:', topic, '(total:', result.total + ')');
            } else {
                console.log('Learning module not available');
            }
            break;
            
        case 'query':
        case 'get':
            const queryTopic = args[1];
            if (!queryTopic) {
                console.error('Usage: vant learn query <topic>');
                process.exit(1);
            }
            console.log('Querying:', queryTopic);
            if (mod && mod.find) {
                const results = await mod.find(queryTopic);
                if (results && results.length) {
                    results.forEach(r => console.log(' -', r.type, ':', JSON.stringify(r.data).substring(0, 50)));
                } else {
                    console.log('Not found');
                }
            }
            break;
            
        case 'list':
            console.log('Learnings:');
            if (mod && mod.remember && mod.experiences) {
                const exps = mod.experiences || [];
                if (exps.length) {
                    exps.forEach(e => console.log(' -', e.type));
                } else {
                    console.log(' (No learnings)');
                }
            }
            break;
            
        case 'stats':
            console.log('Learning Stats:');
            if (mod && mod.getStats) {
                const stats = await mod.getStats();
                console.log(JSON.stringify(stats, null, 2));
            } else if (mod && mod.experiences) {
                console.log('Total experiences:', mod.experiences.length);
            } else {
                console.log('Learning system active');
            }
            break;
            
        case 'forget':
            const forgetTopic = args[1];
            if (!forgetTopic) {
                console.error('Usage: vant learn forget <topic>');
                process.exit(1);
            }
            console.log('Removing:', forgetTopic);
            if (mod && mod.patterns && mod.patterns.delete) {
                mod.patterns.delete(forgetTopic);
                console.log('Removed');
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
