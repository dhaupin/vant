class BitbucketProvider extends require("../gitprovider").GitProvider {
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


module.exports = { BitbucketProvider };