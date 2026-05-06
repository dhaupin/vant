#!/usr/bin/env node
const vaf = require("../lib/vaf");

// -h/--help
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log("'Usage: vant update [-h|--help] [options]'");
    process.exit(0);
}
// VAF: No user input - fixed config only
/**
 * Vant Update Check
 * Check for new releases
 *
 * Usage: vant update [-h|--help]
 */

const update = require('../lib/update-check');
update.check().catch(console.error);
