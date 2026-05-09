/**
 * Deprecated - use lib/search instead
 * Re-exports for backward compatibility
 */
const search = require('./search');

module.exports = {
    rerank: search.rerank,
    getLayerStatus: search.getLayerStatus,
    isOperationAllowed: search.isOperationAllowed,
    getStatus: search.getStatus
};
