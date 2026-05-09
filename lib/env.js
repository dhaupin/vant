/**
 * Deprecated - use lib/config instead
 * Re-exports for backward compatibility
 */
const config = require('./config');

module.exports = {
    env: config,
    get: config.get,
    getAll: config.getAll,
    getGithub: config.getGithub,
    getStegoframe: config.getStegoframe,
    getLayerStatus: config.getLayerStatus,
    isOperationAllowed: config.isOperationAllowed,
    getStatus: config.getStatus
};
