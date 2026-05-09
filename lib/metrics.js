/**
 * Deprecated - use lib/audit instead
 * Re-exports for backward compatibility
 */
const audit = require('./audit');

module.exports = {
    increment: audit.increment,
    gauge: audit.gauge,
    timing: audit.timing,
    getStatus: audit.getStatus
};
