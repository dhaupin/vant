/**
 * Sync Wrapper - bridges runtime to lib/sync.js
 * Uses existing frame, doesn't recreate
 */
const sync = require('../lib/sync');

module.exports = {
    sync: sync.sync,
    push: sync.sync,
    pull: sync.sync,
    setPrivacy: sync.hybrid_setPrivacy,
    getPrivacy: sync.hybrid_getPrivacy,
    getSummary: () => ({ uptime: Date.now() }),
    getLayerStatus: () => ({ name: 'Hybrid', type: 'sync', version: '0.8.9', enabled: true }),
    isOperationAllowed: sync.isOperationAllowed || (() => ({ allowed: true }))
};
