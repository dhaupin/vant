#!/usr/bin/env node
/**
 * Vant rate - rate module
 *
 * Usage: vant rate
 */
const vaf = require("../lib/vaf");

// -h/--help
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log("'Usage: vant rate [-h|--help] [-s|--status] [-r|--reset]'");
    process.exit(0);
}
/**
 * Vant Rate
 * Check rate limit status
 * 
 * Usage: vant rate
 *        vant rate status
 *        vant rate reset
 */

const rateLimit = require('../lib/rate-limit');

const cmd = process.argv[2] || 'status';
if (cmd) vaf.check(cmd, {type: "string", name: "cmd", maxLength: 20});

switch (cmd) {
    case 'status':
    case 's': {
        
        const status = rateLimit.getStatus();
        console.log(`
╔═══════════════════════════════════════╗
║         Rate Limit Status            ║
╚═══════════════════════════════════════╝
  Remaining: ${status.remaining}/${status.maxPerHour} per hour
  Resets in: ~${status.resetIn} minutes
`);
        break;
    }
        
    case 'reset':
    case 'r':
        rateLimit.reset();
        break;
        
    default:
        console.log('Usage: vant rate [status|reset]');
}