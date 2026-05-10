class GitHubProvider extends require("../gitprovider").GitProvider {
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


module.exports = { GitHubProvider };