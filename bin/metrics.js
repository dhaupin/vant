#!/usr/bin/env node
/**
 * Vant Metrics CLI
 * Metrics and statistics dashboard
 * 
 * Usage:
 *   vant metrics                    # Show all metrics
 *   vant metrics get <key>         # Get metric value
 *   vant metrics increment <key>   # Increment counter
 *   vant metrics gauge <key> <val> # Set gauge value
 *   vant metrics timing <key> <ms> # Record timing
 *   vant metrics clear             # Clear all metrics
 */

const metrics = require('../lib/metrics');

const args = process.argv.slice(2);
const subcmd = args[0] || 'stats';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Metrics CLI - Metrics and statistics

Usage:
  vant metrics                    Show all metrics (default)
  vant metrics get <key>         Get metric value
  vant metrics increment <key>   Increment counter
  vant metrics gauge <key> <val> Set gauge value
  vant metrics timing <key> <ms>  Record timing in ms
  vant metrics clear             Clear all metrics
`);
    process.exit(0);
}

function run() {
    if (subcmd === 'stats' || subcmd === 'show' || !subcmd) {
        const stats = metrics.getStats();
        console.log(JSON.stringify(stats, null, 2));
    } else if (subcmd === 'get') {
        const key = args[1];
        if (!key) {
            console.error('Usage: vant metrics get <key>');
            process.exit(1);
        }
        const stats = metrics.getStats();
        console.log(stats[key] || 'not found');
    } else if (subcmd === 'increment' || subcmd === 'inc') {
        const key = args[1];
        if (!key) {
            console.error('Usage: vant metrics increment <key>');
            process.exit(1);
        }
        metrics.increment(key);
        console.log('Incremented:', key);
    } else if (subcmd === 'gauge') {
        const key = args[1];
        const val = parseFloat(args[2]);
        if (!key || isNaN(val)) {
            console.error('Usage: vant metrics gauge <key> <value>');
            process.exit(1);
        }
        metrics.gauge(key, val);
        console.log('Set gauge:', key, '=', val);
    } else if (subcmd === 'timing') {
        const key = args[1];
        const ms = parseInt(args[2]);
        if (!key || isNaN(ms)) {
            console.error('Usage: vant metrics timing <key> <ms>');
            process.exit(1);
        }
        metrics.timing(key, ms);
        console.log('Recorded timing:', key, '=', ms, 'ms');
    } else if (subcmd === 'clear') {
        metrics.clear();
        console.log('Metrics cleared');
    } else {
        console.log('Available: get, increment, gauge, timing, clear');
        process.exit(1);
    }
}

run();
