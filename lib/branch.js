/**
 * Agent Branch Manager
 * Git branch workflow via provider abstraction
 * 
 * Usage:
 *   const branch = require('./branch');
 *   await branch.checkout('agent-1');
 *   // do work
 *   await branch.commit('agent-1', 'Made changes');
 *   await branch.merge('agent-1');  // optional - merge to main
 * 
 * Provider Support:
 *   Uses lib/providers/index.js for multi-git provider abstraction
 *   Supports: GitHub, GitLab, Bitbucket, self-hosted
 */

// Try to use provider, fallback to CLI
const { getProvider, detectProvider } = require('./providers');

let provider = null;
let useProvider = false;

function _getProvider() {
    if (!provider) {
        try {
            provider = getProvider();
            useProvider = provider.isConfigured();
        } catch (e) {
            useProvider = false;
        }
    }
    return provider;
}
const path = require('path');
const vaf = require('./vaf');

const AGENTS_DIR = 'agents';

/**
 * Run git command (CLI fallback when provider unavailable)
 */
function git(args, options = {}) {
    // Use provider if configured
    if (useProvider && _getProvider()) {
        // Provider handles the operation internally
        throw new Error('Use provider methods directly');
    }
    
    // CLI fallback
    const { execSync } = require('child_process');
    try {
        const cmd = `git ${args.join(' ')}`;
        return execSync(cmd, { 
            encoding: 'utf8', 
            stdio: 'pipe',
            ...options 
        });
    } catch (e) {
        throw new Error(`Git error: ${e.message}`);
    }
}

/**
 * Get current branch name
 */
async function currentBranch() {
    // Try provider first
    if (useProvider && _getProvider()) {
        return await _getProvider().currentBranch();
    }
    // CLI fallback
    try {
        return git(['branch', '--show-current']).trim();
    } catch (e) {
        return 'main';
    }
}

/**
 * List all branches
 */
async function listBranches() {
    // Try provider first
    if (useProvider && _getProvider()) {
        return await _getProvider().listBranches();
    }
    // CLI fallback
    try {
        const output = git(['branch', '-a']);
        return output.split('\n').map(b => b.trim()).filter(b => b);
    } catch (e) {
        return [];
    }
}

/**
 * Checkout or create branch
 * @param {string} agentId - Agent identifier
 * @param {boolean} create - Whether to create if not exists
 */
async function checkout(agentId, create = true) {
    // VAF security validation
    vaf.check(agentId, {
        type: 'string',
        name: 'agentId',
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_\-]+$/
    });
    
    const branchName = `${AGENTS_DIR}/${agentId}`;
    
    // Use provider if available
    if (useProvider && _getProvider()) {
        const provider = _getProvider();
        const existingBranches = await provider.listBranches();
        const exists = existingBranches.includes(branchName);
        
        if (exists || create) {
            await provider.checkout(branchName, create);
            console.log(`[Branch] Checked out ${branchName}`);
            return branchName;
        }
        throw new Error(`Branch ${branchName} does not exist`);
    }
    
    // CLI fallback
    const current = currentBranch();
    console.log(`[Branch] Current: ${current}`);
    
    const branches = listBranches();
    const branchExists = branches.some(b => b === branchName || b === `origin/${branchName}`);
    
    if (branchExists) {
        git(['checkout', branchName]);
        console.log(`[Branch] Checked out ${branchName}`);
    } else if (create) {
        git(['checkout', '-b', branchName, 'main']);
        console.log(`[Branch] Created and checked out ${branchName}`);
    } else {
        throw new Error(`Branch ${branchName} does not exist`);
    }
    
    return branchName;
}

/**
 * Commit changes with agent message
 * @param {string} agentId - Agent identifier
 * @param {string} message - Commit message
 */
async function commit(agentId, message = 'Agent update') {
    // VAF validation for commit message
    vaf.check(message, {
        type: 'string',
        name: 'commit message',
        maxLength: 100000
    });
    vaf.check(agentId, {
        type: 'string',
        name: 'agentId',
        maxLength: 100
    });
    
    // Use provider if available
    if (useProvider && _getProvider()) {
        const provider = _getProvider();
        await provider.commit(message, { all: true });
        console.log(`[Branch] Committed: ${message}`);
        return true;
    }
    
    // CLI fallback
    const branch = currentBranch();
    
    try {
        git(['add', '-A']);
    } catch (e) {
        console.log('[Branch] No changes to commit');
        return null;
    }
    
    const status = git(['status', '--porcelain']);
    if (!status.trim()) {
        console.log('[Branch] No changes to commit');
        return null;
    }
    
    // Commit with agent prefix
    const fullMessage = `[agent:${agentId}] ${message}`;
    git(['commit', '-m', fullMessage]);
    
    console.log(`[Branch] Committed on ${branch}: ${message}`);
    return git(['rev-parse', 'HEAD']).trim();
}

/**
 * Push branch to remote
 * @param {string} branch - Branch name (default: current)
 */
async function push(branch = null) {
    // VAF validate branch name
    vaf.check(branch || '', {
        type: 'string',
        name: 'branch',
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_\-\/]+$/
    });
    
    // Use provider if available
    if (useProvider && _getProvider()) {
        const provider = _getProvider();
        const branchName = branch || await provider.currentBranch();
        await provider.push(branchName);
        console.log(`[Branch] Pushed ${branchName}`);
        return branchName;
    }
    
    // CLI fallback
    const current = branch || currentBranch();
    git(['push', '-u', 'origin', current]);
    console.log(`[Branch] Pushed ${current}`);
    return current;
}

/**
 * Merge agent branch to main
 * @param {string} agentId - Agent identifier
 * @param {boolean} forcePush - Force push after merge
 */
async function merge(agentId, forcePush = false) {
    // VAF validate agentId
    vaf.check(agentId, {
        type: 'string',
        name: 'agentId',
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_\-]+$/
    });
    
    const agentBranch = `${AGENTS_DIR}/${agentId}`;
    const current = currentBranch();
    
    if (current !== 'main') {
        // Switch to main first
        git(['checkout', 'main']);
        git(['pull', 'origin', 'main']);
    }
    
    // Merge agent branch
    try {
        git(['merge', '--no-ff', agentBranch, '-m', `Merge agent ${agentId} into main`]);
        console.log(`[Branch] Merged ${agentBranch} to main`);
    } catch (e) {
        console.log(`[Branch] Merge conflict - resolve manually`);
        throw e;
    }
    
    if (forcePush) {
        git(['push', 'origin', 'main']);
    }
    
    return true;
}

/**
 * Get branch status
 */
async function status() {
    // Use provider if available
    if (useProvider && _getProvider()) {
        const provider = _getProvider();
        const current = await provider.currentBranch();
        const branches = await provider.listBranches();
        const agentBranches = Array.isArray(branches) ? branches.filter(b => b.startsWith(AGENTS_DIR + '/')) : [];
        
        return {
            current,
            all: branches || [],
            agentBranches,
            provider: provider.getType()
        };
    }
    
    // CLI fallback
    const current = await currentBranch();
    const branches = await listBranches();
    const agentBranches = Array.isArray(branches) ? branches.filter(b => b.startsWith(AGENTS_DIR + '/')) : [];
    
    return {
        current,
        all: branches || [],
        agentBranches,
        provider: 'cli'
    };
}

/**
 * Create pull/merge request
 * @param {object} options - { source, target, title, body }
 */
async function createPR(options) {
    if (!options || !options.title) {
        throw new Error('Title required for PR');
    }
    
    // Use provider if available
    if (useProvider && _getProvider()) {
        const provider = _getProvider();
        return await provider.createPR(options);
    }
    
    // Fallback - use CLI (for self-hosted)
    return await push(options.source);
}

/**
 * Delete agent branch (cleanup)
 * @param {string} agentId - Agent identifier
 * @param {boolean} remote - Also delete remote
 */
async function deleteBranch(agentId, remote = false) {
    // VAF validate agentId
    vaf.check(agentId, {
        type: 'string',
        name: 'agentId',
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_\-]+$/
    });
    
    const branchName = `${AGENTS_DIR}/${agentId}`;
    
    // Use provider if available and remote delete
    if (remote && useProvider && _getProvider()) {
        try {
            // Provider-specific remote delete
            git(['push', 'origin', '--delete', branchName]);
            console.log(`[Branch] Deleted remote ${branchName}`);
        } catch (e) {
            console.log(`[Branch] No remote branch to delete`);
        }
    }
    
    // Local delete (CLI)
    try {
        git(['branch', '-d', branchName]);
        console.log(`[Branch] Deleted local ${branchName}`);
    } catch (e) {
        console.log(`[Branch] No local branch to delete`);
    }
}

/**
 * Fork from another agent's branch
 * @param {string} fromAgent - Source agent
 * @param {string} toAgent - Destination agent
 */
async function fork(fromAgent, toAgent) {
    // VAF validate both agent IDs
    vaf.check(fromAgent, {
        type: 'string',
        name: 'fromAgent',
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_\-]+$/
    });
    vaf.check(toAgent, {
        type: 'string',
        name: 'toAgent',
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_\-]+$/
    });
    
    const fromBranch = `${AGENTS_DIR}/${fromAgent}`;
    const toBranch = `${AGENTS_DIR}/${toAgent}`;
    
    // Fetch all
    git(['fetch', 'origin']);
    
    // Create new branch from source
    git(['checkout', '-b', toBranch, `origin/${fromBranch}`]);
    console.log(`[Branch] Forked ${toBranch} from ${fromBranch}`);
    
    return toBranch;
}

module.exports = {
    currentBranch,
    listBranches,
    checkout,
    commit,
    push,
    merge,
    status,
    deleteBranch,
    fork,
    createPR,
    // Aliases for API consistency
    switchBranch: checkout,
    getStatus: status,
    // Utility
    getProviderType: () => useProvider ? _getProvider().getType() : 'cli'
};