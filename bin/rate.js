#!/usr/bin/env node
const vaf = require("../lib/vaf");
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