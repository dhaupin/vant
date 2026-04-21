#!/usr/bin/env node
const vaf = require("../lib/vaf");
// VAF: No user input - fixed config only
/**
 * Vant Update Check
 * Check for new releases
 *
 * Usage: vant update
 */

const update = require('../lib/update-check');
update.check().catch(console.error);
