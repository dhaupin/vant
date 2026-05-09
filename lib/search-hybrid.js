/**
 * Deprecated - use lib/search instead
 * Re-exports for backward compatibility
 */
const search = require('./search');

module.exports = {
    search: search.queryBrain,
    getLayerStatus: search.getLayerStatus,
    isOperationAllowed: search.isOperationAllowed,
    getStatus: search.getStatus
};
