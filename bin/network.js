#!/usr/bin/env node
/**
 * Vant Network CLI - connectivity surface (lib/network.js)
 *
 * (pass 189) WIRED. connect/disconnect printed canned strings for a P2P
 * fantasy (lib/network is a fetch/whitelist/latency layer — peers live in
 * node-registry/crew-bus, seen via `vant nodes`). ping now does a REAL
 * latency measurement through lib/network.measureLatency(whitelist-gated),
 * status runs the live checkOnline() probe, and latency prints
 * getLatencyStats(). The fantasy peer verbs are retired with a pointer.
 *
 * Usage:
 *   vant network status             # Online probe + allowed domains
 *   vant network latency            # Latency stats
 *   vant network ping <url>         # Real latency measure (whitelist-gated)
 *   vant network domains            # Allowed domains list
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Network CLI - connectivity surface (lib/network.js)

Usage:
  vant network status          Online FLAG + allowed-domain count (instant)
  vant network probe           The LIVE online probe (outbound HTTP, 5s)
  vant network latency         Recorded latency stats
  vant network ping <url>      Measure real latency to a whitelisted host
  vant network domains         Allowed domains

Note: this module is the HTTP fetch/whitelist/latency layer. Peer/mesh
transport lives elsewhere: vant nodes, vant node-registry, crew-bus.
`);
    process.exit(0);
}

async function run() {
    const network = require('../lib/network');

    if (subcmd === 'status' || subcmd === 'info' || subcmd === 'stat') {
        // FLAG-ONLY by default: checkOnline() does a real outbound HTTP probe
        // (5s timeout) which raced the CI 5s smoke watchdog. The live probe
        // is its own verb (probe) — status stays instant.
        const lat = network.getLatencyStats();
        console.log('Network status (flag-only view; probe = vant network probe):');
        console.log('  Online flag:', network.isOnline());
        console.log('  Allowed domains:', network.getAllowedDomains().length);
        console.log('  Last latency: ' + (network.getLatency() !== null ? network.getLatency() + 'ms' : 'not measured'));
        if (lat && lat.samples) console.log('  Samples: ' + lat.samples + (lat.avg ? ', avg ' + lat.avg.toFixed(1) + 'ms' : ''));
    } else if (subcmd === 'probe') {
        // The live checkOnline() probe (outbound HTTP, 5s cap).
        try {
            const online = await network.checkOnline();
            console.log(online ? '✓ Online (live probe)' : '✗ Offline (live probe reached no answer)');
            if (!online) process.exit(1);
        } catch (e) {
            console.error('✗ Probe failed: ' + e.message);
            process.exit(1);
        }
    } else if (subcmd === 'latency') {
        const stats = network.getLatencyStats();
        console.log('Latency stats:');
        console.log(JSON.stringify(stats, null, 2));
    } else if (subcmd === 'ping' || subcmd === 'check') {
        const url = args[1];
        if (!url) {
            console.error('Usage: vant network ping <url>');
            process.exit(1);
        }
        const target = /^https?:\/\//.test(url) ? url : 'https://' + url;
        try {
            const ms = await network.measureLatency(target);
            console.log('✓ ' + target + ' — ' + ms + 'ms');
        } catch (e) {
            console.error('✗ Latency measure failed: ' + e.message);
            process.exit(1);
        }
    } else if (subcmd === 'domains') {
        console.log('Allowed domains (' + network.getAllowedDomains().length + '):');
        for (const d of network.getAllowedDomains()) console.log('  ' + d);
    } else if (subcmd === 'connect' || subcmd === 'join' || subcmd === 'disconnect' || subcmd === 'leave' || subcmd === 'peers') {
        console.log('Peer connect/disconnect is not part of this module (it is a fetch/whitelist/latency layer).');
        console.log('Peer transport lives in: vant nodes, vant node-registry, crew-bus.');
        process.exit(1);
    } else {
        console.log('Usage: vant network <command>');
        console.log('Commands: status | probe | latency | ping <url> | domains');
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
