/**
 * Vant Boot - Core Boot System
 * 
 * Replaces monolithic brain with islands (lazy-loaded components)
 * Used by vant.js, api.js, mcp.js
 * 
 * @module boot
 */

const islands = require('./islands');
const state = require('./storage').get('state');

/**
 * Boot from prompt (auto-hydrate islands)
 * @param {string} prompt - User prompt
 * @returns {Promise<Object>} Boot result
 */
async function boot(prompt) {
    const toHydrate = islands.autoHydrate(prompt || 'identity');
    for (const name of toHydrate) {
        islands.hydrate(name);
    }
    return {
        mode: 'islands',
        hydrated: toHydrate,
        available: islands.getAvailable(),
        state: state.get('current')
    };
}

/**
 * Boot specific island
 * @param {string} name - Island name
 * @returns {string[]} Hydrated files
 */
async function hydrate(name) {
    return islands.hydrate(name);
}

/**
 * Get available islands
 * @returns {string[]} Island names
 */
function getAvailable() {
    return islands.getAvailable();
}

/**
 * Get hydrated islands
 * @returns {string[]} Hydrated island names
 */
function getHydrated() {
    return islands.getHydrated();
}

/**
 * Get islands manifest
 * @returns {Object} Manifest
 */
function getManifest() {
    return islands.getManifest();
}

/**
 * Boot with prompt (CLI compatible)
 * @param {string} prompt - User prompt
 * @returns {Promise<Object>} Boot result
 */
async function main(prompt) {
    console.log('[Boot] Componentized Brain');
    console.log('[Boot] =====================\n');
    
    const result = await boot(prompt);
    
    console.log('\n[Boot] Ready');
    return result;
}

module.exports = { boot, hydrate, getAvailable, getHydrated, getManifest, main };