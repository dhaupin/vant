/**
 * Vant Multi-Repo - Distributed Brain System
 *
 * Allow Vant to pull from a network of repositories.
 * Mount repos like drives for different skill domains.
 *
 * Usage:
 *   const repos = require('./lib/repos');
 *   await repos.mount('skills', 'https://github.com/user/skills-repo');
 *   await repos.pull('skills');
 *   const hasSkills = repos.has('github');
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

const MODELS_PATH = path.join(__dirname, '..', 'models');
const REPOS_FILE = path.join(MODELS_PATH, '.repos.json');

/**
 * Default skill repos
 */
const DEFAULT_REPOS = {
    github: {
        name: 'GitHub Skills',
        url: null, // User configures
        type: 'skills',
        domain: 'github',
        autoMount: false
    },
    herbalism: {
        name: 'Herbalism Data',
        url: null,
        type: 'data',
        domain: 'herbalism',
        autoMount: false
    },
    vesc: {
        name: 'VESC Configs',
        url: null,
        type: 'data',
        domain: 'vesc',
        autoMount: false
    }
};

/**
 * Get repos config
 * @returns {object} Repos config
 */
function getRepos() {
    if (fs.existsSync(REPOS_FILE)) {
        return JSON.parse(fs.readFileSync(REPOS_FILE, 'utf8'));
    }
    return { version: '1.0', repos: DEFAULT_REPOS, mounted: [] };
}

/**
 * Save repos config
 * @param {object} config
 */
function saveRepos(config) {
    fs.writeFileSync(REPOS_FILE, JSON.stringify(config, null, 2));
}

/**
 * Register a repo
 * @param {string} name - Repo name
 * @param {string} url - Repo URL
 * @param {object} options - { type, domain }
 */
function register(name, url, options = {}) {
    const config = getRepos();
    
    // Validate URL
    try {
        const parsed = new URL(url);
        if (!['https:', 'git:'].includes(parsed.protocol)) {
            throw new Error('Invalid URL protocol');
        }
    } catch (e) {
        throw new Error('Invalid URL: ' + url);
    }
    
    config.repos[name] = {
        name: name,
        url: url,
        type: options.type || 'skills',
        domain: options.domain || name,
        autoMount: options.autoMount || false,
        registered: new Date().toISOString()
    };
    
    saveRepos(config);
    return { success: true, repo: name };
}

/**
 * Mount a repo (prepare for use)
 * @param {string} name - Repo name
 * @returns {object} Mount result
 */
async function mount(name) {
    const config = getRepos();
    const repo = config.repos[name];
    
    if (!repo) {
        throw new Error('Unknown repo: ' + name);
    }
    
    if (!repo.url) {
        throw new Error('Repo ' + name + ' not configured. Set URL first.');
    }
    
    // Create mount point
    const mountPath = path.join(MODELS_PATH, 'repos', name);
    if (!fs.existsSync(mountPath)) {
        fs.mkdirSync(mountPath, { recursive: true });
    }
    
    // Add to mounted list
    if (!config.mounted.includes(name)) {
        config.mounted.push(name);
    }
    config.repos[name].mounted = true;
    config.repos[name].mountedAt = new Date().toISOString();
    
    saveRepos(config);
    console.log('[Repos] Mounted: ' + name);
    
    return { success: true, repo: name, path: mountPath };
}

/**
 * Unmount a repo
 * @param {string} name - Repo name
 */
function unmount(name) {
    const config = getRepos();
    config.mounted = config.mounted.filter(n => n !== name);
    if (config.repos[name]) {
        config.repos[name].mounted = false;
    }
    saveRepos(config);
    console.log('[Repos] Unmounted: ' + name);
}

/**
 * Pull from repo
 * @param {string} name - Repo name (optional, pulls all mounted)
 */
async function pull(name = null) {
    const config = getRepos();
    const toPull = name ? [name] : config.mounted;
    
    const results = {};
    
    for (const repoName of toPull) {
        const repo = config.repos[repoName];
        
        if (!repo || !repo.mounted) {
            results[repoName] = { success: false, error: 'Not mounted' };
            continue;
        }
        
        try {
            console.log('[Repos] Pulling: ' + repoName);
            // In a full implementation, this would git clone/pull
            // Simplified for now:
            results[repoName] = { success: true };
        } catch (e) {
            results[repoName] = { success: false, error: e.message };
        }
    }
    
    return results;
}

/**
 * Check if repo is mounted
 * @param {string} name - Repo name
 * @returns {boolean}
 */
function has(name) {
    const config = getRepos();
    return config.mounted.includes(name);
}

/**
 * Get mounted repos
 * @returns {string[]}
 */
function getMounted() {
    const config = getRepos();
    return config.mounted;
}

/**
 * Get repo info
 * @param {string} name - Repo name
 * @returns {object|null}
 */
function getRepo(name) {
    const config = getRepos();
    return config.repos[name] || null;
}

/**
 * List available repos
 * @returns {string[]}
 */
function list() {
    const config = getRepos();
    return Object.keys(config.repos);
}

module.exports = {
    register,
    mount,
    unmount,
    pull,
    has,
    getMounted,
    getRepo,
    list,
    getRepos,
    DEFAULT_REPOS
};