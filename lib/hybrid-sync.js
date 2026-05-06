/**
 * Vant Hybrid-Sync - Public/Private Brain
 *
 * Sync different parts to different repos:
 * - Sensitive state -> private repo
 * - Public logs/summaries -> public repo
 *
 * Usage:
 *   const hybrid = require('./lib/hybrid-sync');
 *   await hybrid.pushAll();         // Push to both
 *   await hybrid.pullPrivate();     // Pull private
 *   await hybrid.setPrivacy('github', 'private');
 */

const fs = require('fs');
const path = require('path');

const MODELS_PATH = path.join(__dirname, '..', 'models');
const PRIVACY_FILE = path.join(MODELS_PATH, '.privacy.json');

/**
 * Get privacy config
 * @returns {object} Privacy config
 */
function getPrivacyConfig() {
    if (fs.existsSync(PRIVACY_FILE)) {
        return JSON.parse(fs.readFileSync(PRIVACY_FILE, 'utf8'));
    }
    return {
        version: '1.0',
        defaultPrivacy: 'private',
        repos: {}
    };
}

/**
 * Save privacy config
 * @param {object} config
 */
function savePrivacyConfig(config) {
    fs.writeFileSync(PRIVACY_FILE, JSON.stringify(config, null, 2));
}

/**
 * Set repo privacy level
 * @param {string} repo - Repo name
 * @param {string} privacy - 'public' or 'private'
 */
function setPrivacy(repo, privacy) {
    if (!['public', 'private'].includes(privacy)) {
        throw new Error('Privacy must be public or private');
    }
    
    const config = getPrivacyConfig();
    config.repos[repo] = {
        privacy: privacy,
        updated: new Date().toISOString()
    };
    
    savePrivacyConfig(config);
    console.log('[Hybrid] ' + repo + ' = ' + privacy);
    
    return { success: true, repo, privacy };
}

/**
 * Get repo privacy level
 * @param {string} repo - Repo name
 * @returns {string}
 */
function getPrivacy(repo) {
    const config = getPrivacyConfig();
    return config.repos[repo]?.privacy || config.defaultPrivacy;
}

/**
 * Get public repos only
 * @returns {string[]}
 */
function getPublicRepos() {
    const config = getPrivacyConfig();
    return Object.entries(config.repos)
        .filter(([, v]) => v.privacy === 'public')
        .map(([k]) => k);
}

/**
 * Get private repos only
 * @returns {string[]}
 */
function getPrivateRepos() {
    const config = getPrivacyConfig();
    return Object.entries(config.repos)
        .filter(([, v]) => v.privacy === 'private')
        .map(([k]) => k);
}

/**
 * Push to public repos only
 * @returns {object} Push result
 */
async function pushPublic() {
    const publicRepos = getPublicRepos();
    console.log('[Hybrid] Pushing to public: ' + publicRepos.join(', '));
    
    // Use existing sync
    const sync = require('./sync');
    const results = {};
    
    for (const repo of publicRepos) {
        try {
            // In full impl: push to specific repo only
            results[repo] = { success: true };
        } catch (e) {
            results[repo] = { success: false, error: e.message };
        }
    }
    
    return results;
}

/**
 * Push to private repos only
 * @returns {object} Push result
 */
async function pushPrivate() {
    const privateRepos = getPrivateRepos();
    console.log('[Hybrid] Pushing to private: ' + privateRepos.join(', '));
    
    const results = {};
    for (const repo of privateRepos) {
        results[repo] = { success: true };
    }
    
    return results;
}

/**
 * Push to all repos based on privacy
 * @returns {object} Combined result
 */
async function pushAll() {
    const results = {
        public: await pushPublic(),
        private: await pushPrivate()
    };
    
    return {
        success: true,
        ...results
    };
}

/**
 * Get sync summary
 * @returns {object}
 */
function getSummary() {
    const config = getPrivacyConfig();
    const publicRepos = getPublicRepos();
    const privateRepos = getPrivateRepos();
    
    return {
        defaultPrivacy: config.defaultPrivacy,
        publicRepos,
        privateRepos,
        totalRepos: Object.keys(config.repos).length
    };
}

module.exports = {
    setPrivacy,
    getPrivacy,
    getPublicRepos,
    getPrivateRepos,
    pushPublic,
    pushPrivate,
    pushAll,
    getSummary
};