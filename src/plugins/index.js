/**
 * VANT Plugin Architecture
 * 
 * Plugins extend VANT's capabilities without modifying core code.
 * Each plugin is a directory in src/plugins/
 * 
 * Structure:
 *   src/plugins/{plugin-name}/
 *     index.js      - Main entry, exports hook()
 *     config.json   - Plugin config
 *     README.md     - Documentation
 * 
 * Plugin Interface:
 *   hook(ctx) => {
 *     onLoad: (brain) => void,
 *     onMessage: (msg) => string|void,
 *     onSave: () => void,
 *     onUnload: () => void
 *   }
 */

// Plugin registry
const PLUGINS = {};

function loadPlugin(name, path) {
    try {
        const plugin = require(path);
        PLUGINS[name] = plugin;
        console.log(`[Plugin] Loaded: ${name}`);
        return plugin;
    } catch (e) {
        console.error(`[Plugin] Failed to load ${name}: ${e.message}`);
        return null;
    }
}

function getPlugin(name) {
    return PLUGINS[name];
}

function getAllPlugins() {
    return Object.keys(PLUGINS);
}

// Built-in plugins
const BUILTIN_PLUGINS = {
    brain: require('./plugins/brain'),
    mood: require('./plugins/mood'),
    config: require('./plugins/config')
};

module.exports = { loadPlugin, getPlugin, getAllPlugins, BUILTIN_PLUGINS };