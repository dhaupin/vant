/**
 * Deprecated - use lib/audit instead
 * Re-exports for backward compatibility
 */
const audit = require('./audit');

module.exports = {
    log: audit.log,
    query: audit.query,
    getStatus: audit.getStatus
};
