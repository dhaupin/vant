#!/usr/bin/env node
/**
 * Vant Zen - Zen utilities
 * 
 * Usage:
 *   vant zen quote              # Show zen quote
 *   vant zen breathe            # Breathing exercise
 *   vant zen clear              # Clear mind
 */

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Zen - Zen utilities

USAGE:
  vant zen quote              # Show zen quote
  vant zen breathe [seconds]  # Breathing exercise
  vant zen clear              # Clear mind

EXAMPLES:
  vant zen quote
  vant zen breathe 4
  vant zen clear
`);
    process.exit(0);
}

const quotes = [
    "The journey of a thousand miles begins with a single step.",
    "Be here now.",
    "What you are is what you have been. What you'll be is what you do now.",
    "The mind is everything. What you think you become.",
    "Silence is a source of great strength.",
    "In the midst of movement and chaos, keep stillness inside of you.",
    "Everything that has a beginning has an ending.",
    "Don't seek, don't search, don't ask, don't knock, don't demand.",
    "When you realize nothing is lacking, the whole world belongs to you.",
    "To understand everything is to forgive everything."
];

function main() {
    switch (action) {
        case 'quote':
        case 'q':
            const quote = quotes[Math.floor(Math.random() * quotes.length)];
            console.log('\n' + quote + '\n');
            break;
            
        case 'breathe':
        case 'b':
            const seconds = parseInt(args[1]) || 4;
            console.log('\nBreathing exercise:');
            console.log('Inhale...', seconds);
            console.log('Hold...', seconds);
            console.log('Exhale...', seconds);
            console.log('\n');
            break;
            
        case 'clear':
        case 'c':
            console.log('\nClearing mind...');
            console.log('🧘\n');
            break;
            
        default:
            console.log('Unknown action:', action);
            console.log('Run: vant zen --help');
    }
}

main();
