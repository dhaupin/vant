/**
 * Deprecated - use lib/pool instead
 * Re-exports for backward compatibility
 */
const pool = require('./pool');

module.exports = {
    createBuffer: pool.createBuffer,
    allocate: pool.allocate,
    free: pool.free,
    getStatus: pool.getStatus
};
