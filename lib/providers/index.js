/**
 * Git Provider Abstraction
 * Universal git provider interface for GitHub, GitLab, Bitbucket, and self-hosted
 * 
 * Usage:
 *   const { getProvider } = require('./providers');
 *   const provider = getProvider(); // Auto-detect from git remote
 *   await provider.checkout('agent-1');
 *   await provider.commit('agent-1', 'Made changes');
 *   await provider.push();
 *   const pr = await provider.createPR({ title: 'PR Title', body: 'Description' });
 */

const fs = require('fs');
const path = require('path');
const vaf = require('../vaf');

/**
 * Abstract base class for git providers
 * Each provider implements these methods for git operations
 */
class GitProvider {
    constructor(config = {}) {
        this.config = config;
        this.type = 'git'; // 'github', 'gitlab', 'bitbucket', 'selfhosted'
    }

    /**
     * Get provider type
     */
    getType() {
        return this.type;
    }

    /**
     * Checkout or create branch
     * @param {string} branchName - Branch name
     * @param {boolean} create - Create if not exists
     */
    async checkout(branchName, create = true) {
        throw new Error('Not implemented');
    }

    /**
     * Commit changes
     * @param {string} message - Commit message
     * @param {object} options - { all: boolean, files: string[] }
     */
    async commit(message, options = {}) {
        throw new Error('Not implemented');
    }

    /**
     * Push current branch to remote
     * @param {string} branch - Branch name (optional)
     */
    async push(branch = null) {
        throw new Error('Not implemented');
    }

    /**
     * Pull changes from remote
     * @param {string} branch - Branch name (optional)
     */
    async pull(branch = null) {
        throw new Error('Not implemented');
    }

    /**
     * Get list of branches
     * @returns {string[]} Array of branch names
     */
    async listBranches() {
        throw new Error('Not implemented');
    }

    /**
     * Get current branch name
     * @returns {string} Current branch
     */
    async currentBranch() {
        throw new Error('Not implemented');
    }

    /**
     * Create pull/merge request
     * @param {object} options - { source, target, title, body }
     */
    async createPR(options) {
        throw new Error('Not implemented');
    }

    /**
     * Get PR/MR status
     * @param {string} prId - PR number or ID
     */
    async getPRStatus(prId) {
        throw new Error('Not implemented');
    }

    /**
     * Get repository info
     * @returns {object} { owner, repo, url }
     */
    async getRepoInfo() {
        throw new Error('Not implemented');
    }

    /**
     * Check if provider is configured
     * @returns {boolean}
     */
    isConfigured() {
        return false;
    }

    /**
     * Update avatar/profile picture
     * @param {string} imagePath - Path to image file
     */
    async updateAvatar(imagePath) {
        throw new Error('Not implemented');
    }
}

/**
 * GitHub Provider Implementation
 */
class GitHubProvider extends GitProvider {
    constructor(config = {}) {
        super({ ...config, type: 'github' });
        this.token = config.token || process.env.GITHUB_TOKEN;
        this.repo = config.repo || process.env.GITHUB_REPO;
        this.owner = '';
        this.repoName = '';
        
        if (this.repo) {
            const parts = this.repo.split('/');
            this.owner = parts[0];
            this.repoName = parts[1];
        }
    }

    isConfigured() {
        return !!(this.token && this.repo);
    }

    async _request(endpoint, options = {}) {
        const url = `https://api.github.com${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GitHub API error: ${response.status} - ${error}`);
        }
        
        return response.json();
    }

    async getRepoInfo() {
        return {
            owner: this.owner,
            repo: this.repoName,
            url: `https://github.com/${this.owner}/${this.repoName}`
        };
    }

    async listBranches() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/branches`);
        return data.map(b => b.name);
    }

    async currentBranch() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}`);
        return data.default_branch;
    }

    async checkout(branchName, create = true) {
        // Uses git CLI - this is a wrapper for CLI operations
        const { execSync } = require('child_process');
        
        try {
            execSync(`git checkout ${branchName}`, { stdio: 'pipe' });
            return branchName;
        } catch (e) {
            if (create && e.message.includes('did not match')) {
                execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
                return branchName;
            }
            throw e;
        }
    }

    async commit(message, options = {}) {
        const { execSync } = require('child_process');
        
        if (options.all !== false) {
            execSync(`git add -A`, { stdio: 'pipe' });
        } else if (options.files?.length) {
            execSync(`git add ${options.files.join(' ')}`, { stdio: 'pipe' });
        }
        
        execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
        return true;
    }

    async push(branch = null) {
        const { execSync } = require('child_process');
        const branchName = branch || await this.currentBranch();
        execSync(`git push -u origin ${branchName}`, { stdio: 'pipe' });
        return branchName;
    }

    async pull(branch = null) {
        const { execSync } = require('child_process');
        const branchName = branch || await this.currentBranch();
        execSync(`git pull origin ${branchName}`, { stdio: 'pipe' });
        return branchName;
    }

    async createPR(options) {
        const { source, target = 'main', title, body } = options;
        
        // First push the branch
        await this.push(source);
        
        // Create PR via API
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/pulls`, {
            method: 'POST',
            body: JSON.stringify({
                title,
                body,
                head: source,
                base: target
            })
        });
        
        return {
            id: data.number,
            url: data.html_url,
            state: data.state
        };
    }

    async getPRStatus(prId) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/pulls/${prId}`);
        return {
            id: data.number,
            state: data.state,
            url: data.html_url,
            title: data.title,
            body: data.body
        };
    }

    async updateAvatar(imagePath) {
        // GitHub doesn't support profile picture API - use stego snapshot instead
        throw new Error('GitHub does not support profile picture API. Use stego snapshot instead.');
    }
}

/**
 * GitLab Provider Implementation
 */
class GitLabProvider extends GitProvider {
    constructor(config = {}) {
        super({ ...config, type: 'gitlab' });
        this.token = config.token || process.env.GITLAB_TOKEN;
        this.url = config.url || process.env.GITLAB_URL || 'https://gitlab.com';
        this.repo = config.repo || process.env.GITLAB_REPO;
        this.projectId = encodeURIComponent(this.repo);
    }

    isConfigured() {
        return !!(this.token && this.repo);
    }

    async _request(endpoint, options = {}) {
        const url = `${this.url}/api/v4${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'PRIVATE-TOKEN': this.token,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GitLab API error: ${response.status} - ${error}`);
        }
        
        return response.json();
    }

    async getRepoInfo() {
        const data = await this._request(`/projects/${this.projectId}`);
        return {
            owner: data.namespace.name,
            repo: data.name,
            url: data.web_url
        };
    }

    async listBranches() {
        const data = await this._request(`/projects/${this.projectId}/repository/branches`);
        return data.map(b => b.name);
    }

    async currentBranch() {
        const data = await this._request(`/projects/${this.projectId}`);
        return data.default_branch;
    }

    async checkout(branchName, create = true) {
        const { execSync } = require('child_process');
        
        try {
            execSync(`git checkout ${branchName}`, { stdio: 'pipe' });
            return branchName;
        } catch (e) {
            if (create) {
                execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
                return branchName;
            }
            throw e;
        }
    }

    async commit(message, options = {}) {
        const { execSync } = require('child_process');
        
        if (options.all !== false) {
            execSync(`git add -A`, { stdio: 'pipe' });
        }
        
        execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
        return true;
    }

    async push(branch = null) {
        const { execSync } = require('child_process');
        const branchName = branch || await this.currentBranch();
        execSync(`git push -u origin ${branchName}`, { stdio: 'pipe' });
        return branchName;
    }

    async pull(branch = null) {
        const { execSync } = require('child_process');
        const branchName = branch || await this.currentBranch();
        execSync(`git pull origin ${branchName}`, { stdio: 'pipe' });
        return branchName;
    }

    async createMR(options) {
        const { source, target = 'main', title, description } = options;
        
        await this.push(source);
        
        const data = await this._request(`/projects/${this.projectId}/merge_requests`, {
            method: 'POST',
            body: JSON.stringify({
                source_branch: source,
                target_branch: target,
                title,
                description
            })
        });
        
        return {
            id: data.id,
            iid: data.iid,
            url: data.web_url,
            state: data.state
        };
    }

    async getPRStatus(mrId) {
        const data = await this._request(`/projects/${this.projectId}/merge_requests/${mrId}`);
        return {
            id: data.id,
            iid: data.iid,
            state: data.state,
            url: data.web_url,
            title: data.title
        };
    }

    // Alias for createPR (GitLab calls them merge requests)
    async createPR(options) {
        return this.createMR(options);
    }

    async updateAvatar(imagePath) {
        // GitLab doesn't support avatar API - use stego snapshot instead
        throw new Error('GitLab does not support avatar API. Use stego snapshot instead.');
    }
}

/**
 * Bitbucket Provider Implementation
 */
class BitbucketProvider extends GitProvider {
    constructor(config = {}) {
        super({ ...config, type: 'bitbucket' });
        this.token = config.token || process.env.BITBUCKET_TOKEN;
        this.workspace = config.workspace || process.env.BITBUCKET_WORKSPACE;
        this.repoSlug = config.repo || process.env.BITBUCKET_REPO;
    }

    isConfigured() {
        return !!(this.token && this.workspace && this.repoSlug);
    }

    async _request(endpoint, options = {}) {
        const url = `https://api.bitbucket.org/2.0/repositories/${this.workspace}/${this.repoSlug}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Bitbucket API error: ${response.status} - ${error}`);
        }
        
        return response.json();
    }

    async getRepoInfo() {
        return {
            owner: this.workspace,
            repo: this.repoSlug,
            url: `https://bitbucket.org/${this.workspace}/${this.repoSlug}`
        };
    }

    async listBranches() {
        const data = await this._request('/refs/branches');
        return data.values.map(b => b.name);
    }

    async currentBranch() {
        const data = await this._request('');
        return data.mainbranch.name;
    }

    async checkout(branchName, create = true) {
        const { execSync } = require('child_process');
        
        try {
            execSync(`git checkout ${branchName}`, { stdio: 'pipe' });
            return branchName;
        } catch (e) {
            if (create) {
                execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
                return branchName;
            }
            throw e;
        }
    }

    async commit(message, options = {}) {
        const { execSync } = require('child_process');
        
        if (options.all !== false) {
            execSync(`git add -A`, { stdio: 'pipe' });
        }
        
        execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
        return true;
    }

    async push(branch = null) {
        const { execSync } = require('child_process');
        const branchName = branch || await this.currentBranch();
        execSync(`git push -u origin ${branchName}`, { stdio: 'pipe' });
        return branchName;
    }

    async pull(branch = null) {
        const { execSync } = require('child_process');
        const branchName = branch || await this.currentBranch();
        execSync(`git pull origin ${branchName}`, { stdio: 'pipe' });
        return branchName;
    }

    async createPR(options) {
        const { source, target = 'main', title, description } = options;
        
        await this.push(source);
        
        const data = await this._request('/pullrequests', {
            method: 'POST',
            body: JSON.stringify({
                title,
                description,
                source: { branch: { name: source } },
                destination: { branch: { name: target } }
            })
        });
        
        return {
            id: data.id,
            url: data.links.html.href,
            state: data.state
        };
    }

    async getPRStatus(prId) {
        const data = await this._request(`/pullrequests/${prId}`);
        return {
            id: data.id,
            state: data.state,
            url: data.links.html.href,
            title: data.title
        };
    }

    async updateAvatar(imagePath) {
        throw new Error('Bitbucket does not support avatar API. Use stego snapshot instead.');
    }
}

/**
 * Self-Hosted Provider (generic git)
 * Works with any git remote that supports SSH or HTTPS
 */
class SelfHostedProvider extends GitProvider {
    constructor(config = {}) {
        super({ ...config, type: 'selfhosted' });
        this.url = config.url || config.remoteUrl || 'origin';
        this.token = config.token || process.env.GIT_TOKEN;
    }

    isConfigured() {
        return true; // Always viable - uses generic git CLI
    }

    async getRepoInfo() {
        const { execSync } = require('child_process');
        
        const remoteUrl = execSync(`git remote get-url ${this.url}`, { encoding: 'utf8' }).trim();
        
        // Parse owner/repo from URL
        let owner = '', repo = '';
        
        if (remoteUrl.includes('github.com')) {
            const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
            if (match) { owner = match[1]; repo = match[2]; }
        } else if (remoteUrl.includes('gitlab.com')) {
            const match = remoteUrl.match(/gitlab\.com[/:]([^/]+)\/([^/.]+)/);
            if (match) { owner = match[1]; repo = match[2]; }
        } else {
            // Generic - use directory name
            repo = execSync('basename $(pwd)', { encoding: 'utf8' }).trim();
        }
        
        return { owner, repo, url: remoteUrl };
    }

    async listBranches() {
        const { execSync } = require('child_process');
        const output = execSync('git branch -a', { encoding: 'utf8' });
        return output.split('\n').map(b => b.trim()).filter(b => b);
    }

    async currentBranch() {
        const { execSync } = require('child_process');
        return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    }

    async checkout(branchName, create = true) {
        const { execSync } = require('child_process');
        
        try {
            execSync(`git checkout ${branchName}`, { stdio: 'pipe' });
            return branchName;
        } catch (e) {
            if (create) {
                execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
                return branchName;
            }
            throw e;
        }
    }

    async commit(message, options = {}) {
        const { execSync } = require('child_process');
        
        if (options.all !== false) {
            execSync(`git add -A`, { stdio: 'pipe' });
        } else if (options.files?.length) {
            execSync(`git add ${options.files.join(' ')}`, { stdio: 'pipe' });
        }
        
        execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
        return true;
    }

    async push(branch = null) {
        const { execSync } = require('child_process');
        const branchName = branch || await this.currentBranch();
        execSync(`git push -u ${this.url} ${branchName}`, { stdio: 'pipe' });
        return branchName;
    }

    async pull(branch = null) {
        const { execSync } = require('child_process');
        const branchName = branch || await this.currentBranch();
        execSync(`git pull ${this.url} ${branchName}`, { stdio: 'pipe' });
        return branchName;
    }

    async createPR(options) {
        // Self-hosted doesn't have PRs - just push
        await this.push(options.source);
        return { url: null, message: 'Self-hosted - branch pushed, no PR API' };
    }

    async getPRStatus(prId) {
        return { message: 'Self-hosted - no PR API' };
    }

    async updateAvatar(imagePath) {
        throw new Error('Self-hosted does not support avatar API. Use stego snapshot instead.');
    }
}

/**
 * Detect provider from git remote URL
 * @returns {string} Provider type
 */
function detectProvider() {
    try {
        const { execSync } = require('child_process');
        const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
        
        if (remoteUrl.includes('github.com') || remoteUrl.includes('github')) {
            return 'github';
        } else if (remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab')) {
            return 'gitlab';
        } else if (remoteUrl.includes('bitbucket.org') || remoteUrl.includes('bitbucket')) {
            return 'bitbucket';
        } else {
            return 'selfhosted';
        }
    } catch (e) {
        return 'selfhosted'; // Default fallback
    }
}

/**
 * Get provider instance
 * @param {string} type - Provider type override
 * @param {object} config - Configuration override
 * @returns {GitProvider}
 */
function getProvider(type = null, config = {}) {
    const providerType = type || detectProvider();
    
    switch (providerType) {
        case 'github':
            return new GitHubProvider(config);
        case 'gitlab':
            return new GitLabProvider(config);
        case 'bitbucket':
            return new BitbucketProvider(config);
        case 'selfhosted':
        default:
            return new SelfHostedProvider(config);
    }
}

/**
 * Get all available providers
 * @returns {object} Provider instances
 */
function getAllProviders(config = {}) {
    return {
        github: new GitHubProvider(config),
        gitlab: new GitLabProvider(config),
        bitbucket: new BitbucketProvider(config),
        selfhosted: new SelfHostedProvider(config)
    };
}

module.exports = {
    GitProvider,
    GitHubProvider,
    GitLabProvider,
    BitbucketProvider,
    SelfHostedProvider,
    detectProvider,
    getProvider,
    getAllProviders
};