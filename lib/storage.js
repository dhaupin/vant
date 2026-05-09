/**
 * Deprecated - use lib/pool instead  
 * Re-exports for backward compatibility
 */
const pool = require('./pool');

module.exports = {
    createStorage: pool.createStorage,
    get: pool.get,
    set: pool.set,
    del: pool.del,
    getStatus: pool.getStatus
};
