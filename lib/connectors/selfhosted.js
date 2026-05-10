class SelfHostedProvider extends require("../remotes").GitProvider {
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

    // ========== ISSUES ==========
    async getIssues(options = {}) {
        throw new Error('Issues not supported on self-hosted git. Use GitHub/GitLab/Bitbucket provider.');
    }

    async createIssue(options) {
        throw new Error('Issues not supported on self-hosted git.');
    }

    async closeIssue(id) {
        throw new Error('Issues not supported on self-hosted git.');
    }

    async getIssue(id) {
        throw new Error('Issues not supported on self-hosted git.');
    }

    // ========== COMMENTS ==========
    async getComments(issueId) {
        throw new Error('Issues not supported on self-hosted git.');
    }

    async addComment(issueId, body) {
        throw new Error('Issues not supported on self-hosted git.');
    }

    // ========== PULL REQUESTS ==========
    async listPRs(options = {}) {
        throw new Error('PRs not supported on self-hosted git. Use GitHub/GitLab/Bitbucket provider.');
    }

    async getPR(id) {
        throw new Error('PRs not supported on self-hosted git.');
    }

    async mergePR(id, options) {
        throw new Error('PRs not supported on self-hosted git.');
    }

    // ========== REPO INFO ==========
    async getRepoDetails() {
        const info = await this.getRepoInfo();
        const branches = await this.listBranches();
        const branch = await this.currentBranch();
        return {
            owner: info.owner,
            repo: info.repo,
            url: info.url,
            defaultBranch: 'main',
            branches: branches.length,
            currentBranch: branch
        };
    }

    async getLanguages() {
        return { unknown: true };
    }

    async getTags() {
        const { execSync } = require('child_process');
        try {
            const output = execSync('git tag', { encoding: 'utf8' });
            return output.split('\n').map(t => t.trim()).filter(t => t);
        } catch (e) {
            return [];
        }
    }

    async getContributors() {
        const { execSync } = require('child_process');
        try {
            const output = execSync("git shortlog -sne", { encoding: 'utf8' });
            return output.split('\n').map(l => l.trim()).filter(l => l);
        } catch (e) {
            return [];
        }
    }

    // ========== STATUS ==========
    async getStatus() {
        const info = await this.getRepoInfo();
        const branches = await this.listBranches();
        const current = await this.currentBranch();
        return {
            owner: info.owner,
            repo: info.repo,
            type: 'selfhosted',
            defaultBranch: 'main',
            branches: branches.length,
            currentBranch: current,
            openPRs: 'N/A',
            private: null,
            updated: new Date().toISOString()
        };
    }

    getType() {
        return 'selfhosted';
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

module.exports = { SelfHostedProvider };


module.exports = { SelfHostedProvider };