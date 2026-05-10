class GitLabProvider extends require("../gitprovider").GitProvider {
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


module.exports = { GitLabProvider };