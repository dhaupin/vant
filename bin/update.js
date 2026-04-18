#!/usr/bin/env node
/**
 * Vant Update Check
 * Check for new releases
 *
 * Usage: vant update
 */

const update = require('../lib/update-check');
update.check().catch(console.error);
