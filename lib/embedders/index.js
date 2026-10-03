/**
 * Embedders Index
 *
 * Auto-detects and loads the best available embedding provider
 * Priority: OpenAI > Local (transformers) > Hash (fallback)
 */

const { HashEmbedder: HashEmbedderClass, create: createHash } = require('./hash');
const { OpenAIEmbedder: OpenAIEmbedderClass, create: createOpenAI } = require('./openai');
const { LocalEmbedder: LocalEmbedderClass, create: createLocal } = require('./local');

// Provider instances
const providers = {
    hash: createHash(),
    openai: null,  // Lazy load
    local: null   // Lazy load
};

// Current provider
let currentProvider = null;

/**
 * Detect and return the best available provider
 * @returns {Object} Provider instance
 */
function detect() {
    // Priority 1: OpenAI (if API key available)
    const openai = createOpenAI();
    if (openai.isAvailable()) {
        return openai;
    }

    // Priority 2: Local transformers (if installed)
    const local = createLocal();
    if (local.isAvailable()) {
        return local;
    }

    // Priority 3: Hash (always works)
    return providers.hash;
}

/**
 * Get the current provider
 * @returns {Object} Current provider instance
 */
function getProvider() {
    if (!currentProvider) {
        currentProvider = detect();
    }
    return currentProvider;
}

/**
 * Set a specific provider
 * @param {string} name - Provider name: 'openai', 'local', 'hash'
 */
function setProvider(name) {
    if (name === 'openai') {
        currentProvider = createOpenAI();
    } else if (name === 'local') {
        currentProvider = createLocal();
    } else if (name === 'hash') {
        currentProvider = createHash();
    } else {
        throw new Error(`Unknown provider: ${name}`);
    }

    return currentProvider;
}

/**
 * List available providers
 * @returns {string[]} Array of available provider names
 */
function listProviders() {
    const available = ['hash'];

    const openai = createOpenAI();
    if (openai.isAvailable()) {
        available.push('openai');
    }

    const local = createLocal();
    if (local.isAvailable()) {
        available.push('local');
    }

    return available;
}

/**
 * Get provider info
 * @returns {Object} Current provider info
 */
function getInfo() {
    const provider = getProvider();
    return {
        name: provider.name,
        dimension: provider.dimension,
        available: listProviders()
    };
}

module.exports = {
    // Providers
    HashEmbedder: HashEmbedderClass,
    OpenAIEmbedder: OpenAIEmbedderClass,
    LocalEmbedder: LocalEmbedderClass,

    // Functions
    detect,
    getProvider,
    setProvider,
    listProviders,
    getInfo
};
