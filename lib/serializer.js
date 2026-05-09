/**
 * Deprecated - use lib/compression instead
 * Re-exports for backward compatibility
 */
const compression = require('./compression');

module.exports = {
    serialize: compression.serialize,
    deserialize: compression.deserialize,
    getStatus: compression.getStatus
};
