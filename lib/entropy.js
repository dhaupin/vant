/**
 * Deprecated - use lib/compression instead
 * Re-exports for backward compatibility
 */
const compression = require('./compression');

module.exports = {
    calculateShannonEntropy: compression.calculateShannonEntropy,
    generateVpatch: compression.generateVpatch,
    hydrateVpatch: compression.hydrateVpatch,
    getLayerStatus: compression.getLayerStatus,
    isOperationAllowed: compression.isOperationAllowed,
    getStatus: compression.getStatus
};
