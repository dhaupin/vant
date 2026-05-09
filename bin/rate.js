#!/usr/bin/env node
/**
 * Vant rate - rate module
 *
 * Usage: vant rate [-h|--help] [-s|--status] [reset <clientId>]
 */
const vaf = require("../lib/vaf");
const { QoS } = require('../lib/qos');

// -h/--help
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log("Usage: vant rate [-h|--help] [-s|--status] [reset <clientId>]");
    process.exit(0);
}

const qos = new QoS();

const cmd = args[0] || 'status';
vaf.check(cmd, {type: "string", name: "cmd", maxLength: 20});

switch (cmd) {
    case 'status':
    case 's': {
        const status = qos.getRateLimiterStatus();
        console.log(`
╔═══════════════════════════════════════╗
║         Rate Limit Status            ║
╚═══════════════════════════════════════
  Enabled: ${status.enabled}
  Max/Min: ${status.config.maxPerMinute}
  Clients: ${status.state.uniqueClients}
`);
        break;
    }
    
    case 'reset':
    case 'r':
        if (args[1]) {
            qos.resetRateLimiter(args[1]);
            console.log('Rate limit reset for: ' + args[1]);
        } else {
            console.log('Usage: vant rate reset <clientId>');
            process.exit(1);
        }
        break;
        
    default:
        console.log('Usage: vant rate [status|reset <clientId>]');
}
