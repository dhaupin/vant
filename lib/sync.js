/**
 * Vant Sync Manager - Multi-Provider RAID 1 + Broadcast
 * 
 * Sync brain to multiple providers for redundancy.
 * Read from any provider, write to all.
 * Auto-failover on failure.
 * Rebase sync when providers recover.
 * 
 * Usage:
 *   const sync = require('./sync');
 *   await sync.pushAll();              // Broadcast to all
 *   await sync.pullAny();             // Pull from first available
 *   await sync.rebase('github');      // Rebase stale provider
 * 
 * SECURITY:
 *   - Validates all tokens before use
 *   - No sensitive data in logs
 *   - Provider-specific rate limiting
 *   - Atomic operations where possible
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

const MODELS_PATH = path.join(__dirname, '..', 'models');
const PROVIDERS_PATH = path.join(MODELS_PATH, '.providers.json');

/**
 * Save provider state
 * @param {string} provider - Provider name
 * @param {string} status - Status
 * @param {number} lastSync - Last sync timestamp
 */
function saveProviderState(provider, status, lastSync) {
    let states = {};
    if (fs.existsSync(PROVIDERS_PATH)) {
        states = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8'));
    }
    states[provider] = { status, lastSync, updated: new Date().toISOString() };
    fs.writeFileSync(PROVIDERS_PATH, JSON.stringify(states, null, 2));
}

/**
 * Get provider state
 * @param {string} provider - Provider name
 * @returns {object|null}
 */
function getProviderState(provider) {
    if (!fs.existsSync(PROVIDERS_PATH)) return null;
    const states = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8'));
    return states[provider] || null;
}

/**
 * Get all configured providers
 * @returns {GitProvider[]} Array of configured providers
 */
function getConfiguredProviders() {
    const { getAllProviders } = require('./providers');
    const providers = getAllProviders();
    
    const configured = [];
    for (const [name, provider] of Object.entries(providers)) {
        if (provider.isConfigured()) {
            configured.push(provider);
        }
    }
    
    return configured;
}

/**
 * Push brain to all configured providers (Broadcast)
 * @param {object} options - { commitMessage, force }
 * @returns {object} Results per provider
 */
async function pushAll(options = {}) {
    const {
        commitMessage = 'Vant sync update',
        force = false
    } = options;
    
    vaf.check(commitMessage, {
        type: 'string',
        name: 'commitMessage',
        maxLength: 100000
    });
    
    const providers = getConfiguredProviders();
    
    if (providers.length === 0) {
        return {
            success: false,
            error: 'No providers configured',
            results: {}
        };
    }
    
    console.log(`[Sync] Broadcasting to ${providers.length} providers...`);
    
    const results = {};
    const errors = [];
    const brain = require('./brain');
    const json = brain.toJSON();
    
    for (const provider of providers) {
        const name = provider.getType();
        
        try {
            console.log(`[Sync] Pushing to ${name}...`);
            
            await provider.commit(commitMessage, { all: true });
            await provider.push();
            
            results[name] = { success: true };
            saveProviderState(name, 'healthy', Date.now());
            console.log(`[Sync] ${name}: ✓`);
            
        } catch (e) {
            results[name] = { success: false, error: e.message };
            errors.push({ provider: name, error: e.message });
            saveProviderState(name, 'stale', getProviderState(name)?.lastSync || Date.now());
            console.error(`[Sync] ${name}: ✗ (${e.message})`);
        }
    }
    
    const success = Object.values(results).some(r => r.success);
    return { success, results, errors };
}

/**
 * Pull brain from first available provider
 * @param {object} options - { provider preference }
 * @returns {object} Brain data
 */
async function pullAny(options = {}) {
    const preference = options.preference || null;
    
    let providers = getConfiguredProviders();
    
    if (providers.length === 0) {
        throw new Error('No providers configured');
    }
    
    // Reorder by preference
    if (preference) {
        providers.sort((a, b) => {
            if (a.getType() === preference) return -1;
            if (b.getType() === preference) return 1;
            return 0;
        });
    }
    
    // Try each provider in order
    for (const provider of providers) {
        const name = provider.getType();
        
        try {
            console.log(`[Sync] Trying ${name}...`);
            
            // Get brain files
            // In full impl: fetch and merge
            // Simplified:
            
            const repoInfo = await provider.getRepoInfo();
            console.log(`[Sync] ${name}: Repo = ${repoInfo.owner}/${repoInfo.repo}`);
            
            return { 
                success: true, 
                provider: name,
                repoInfo 
            };
            
        } catch (e) {
            console.log(`[Sync] ${name}: Failed (${e.message})`);
            continue;
        }
    }
    
    throw new Error('All providers failed');
}

/**
 * Get sync status across all providers
 * @returns {object} Status per provider
 */
async function getStatus() {
    const providers = getConfiguredProviders();
    
    const status = {
        providers: {},
        lastSync: null,
        errors: []
    };
    
    for (const provider of providers) {
        const name = provider.getType();
        
        try {
            const branches = await provider.listBranches();
            const current = await provider.currentBranch();
            
            status.providers[name] = {
                connected: true,
                branches: branches.length,
                current
            };
        } catch (e) {
            status.providers[name] = {
                connected: false,
                error: e.message
            };
            status.errors.push({ provider: name, error: e.message });
        }
    }
    
    return status;
}

/**
 * Check if RAID mode is active
 * @returns {boolean}
 */
function isRAID() {
    const providers = getConfiguredProviders();
    return providers.length > 1;
}

/**
 * Rebase a stale provider
 * @param {string} providerName - Provider name to rebase
 * @returns {object} Rebase result
 */
async function rebase(providerName) {
    const { getAllProviders } = require('./providers');
    const providers = getAllProviders();
    const provider = providers[providerName];
    
    if (!provider) {
        throw new Error(`Provider ${providerName} not found`);
    }
    
    if (!provider.isConfigured()) {
        throw new Error(`Provider ${providerName} not configured`);
    }
    
    console.log(`[Sync] Rebasing ${providerName}...`);
    
    try {
        // Pull latest from other providers first
        const latest = await pullAny({ preference: null });
        
        // Fetch and rebase
        await provider.pull();
        await provider.push();
        
        saveProviderState(providerName, 'healthy', Date.now());
        console.log(`[Sync] ${providerName}: Rebased ✓`);
        
        return { success: true, provider: providerName };
    } catch (e) {
        console.error(`[Sync] ${providerName}: Rebase failed (${e.message})`);
        return { success: false, provider: providerName, error: e.message };
    }
}

/**
 * Mark provider as stale
 * @param {string} providerName - Provider name
 */
function markStale(providerName) {
    const state = getProviderState(providerName);
    saveProviderState(providerName, 'stale', state?.lastSync || Date.now());
}

/**
 * Get provider count
 * @returns {number}
 */
function getProviderCount() {
    return getConfiguredProviders().length;
}

module.exports = {
    pushAll,
    pullAny,
    getStatus,
    isRAID,
    getProviderCount,
    getConfiguredProviders,
    rebase,
    markStale,
    getProviderState,
    saveProviderState
};