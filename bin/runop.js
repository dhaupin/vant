#!/usr/bin/env node
/**
 * Vant Runop CLI (v0.8.6)
 * Now uses pipeline.js (runop absorbed)
 *
 * Usage:
 *   vant runop init                  # Initialize layers
 *   vant runop start               # Start runtime
 *   vant runop status              # Check status
 *   vant runop stop                # Stop runtime
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Runop CLI (v0.8.6) - Pipeline Runtime
Runop absorbed into pipeline.js

Usage:
  vant runop init                  Initialize runtime layers
  vant runop start                Start runtime (alias for init)
  vant runop status               Check runtime status
  vant runop stop                 Stop runtime
`);
    process.exit(0);
}

async function run() {
    const pipeline = require('../lib/pipeline');
    
    if (subcmd === 'init' || subcmd === 'start') {
        const result = await pipeline.initLayers({ debug: true });
        console.log('Runtime initialized:', result);
    } else if (subcmd === 'status' || subcmd === 'stat') {
        const status = pipeline.getStatus();
        console.log('Pipeline status:');
        console.log('  Name:', status.name);
        console.log('  Version:', status.version);
        console.log('  Modes:', status.modes.join(', '));
        console.log('  Handlers:', Object.entries(status.handlers).map(([k,v]) => k + ':' + (v?'✓':'✗')).join(', '));
    } else if (subcmd === 'stop') {
        const result = await pipeline.stop();
        console.log('Runtime stopped:', result);
    } else {
        console.log('Usage: vant runop <init|start|status|stop>');
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
