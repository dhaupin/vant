/**
 * Vant Env - DEPRECATED (v0.8.6)
 *
 * All env functions moved to lib/config.js
 * Use require('./config') instead
 *
 * @deprecated v0.8.6
 */

const config = require('./config');

class Env {
    apiKey(options = {}) { return config.apiKey(options); }
    hasApiKey() { return config.hasApiKey(); }
    mcpPort() { return config.mcpPort(); }
    mcpBindAddress() { return config.mcpBindAddress(); }
    mcpRequireKey() { return config.mcpRequireKey(); }
    storagePath() { return config.storagePath(); }
    logLevel() { return config.logLevel(); }
    isProduction() { return config.isProduction(); }
    isDevelopment() { return config.isDevelopment(); }
}

const defaultEnv = new Env();

module.exports = { Env, env: defaultEnv, apiKey: config.apiKey, mcpPort: config.mcpPort, mcpBindAddress: config.mcpBindAddress };
