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

    // ========== ISSUES ==========
    async getIssues(options = {}) {
        const state = options.state || 'open';
        return await this._request(`/issues?state=${state}`);
    }

    async createIssue(options) {
        const { title, description, kind, priority, assignee } = options;
        return await this._request(`/issues`, {
            method: 'POST',
            body: JSON.stringify({
                title,
                content: description,
                kind: kind || 'bug',
                priority: priority || 'major',
                assignee: assignee ? { uuid: assignee } : undefined
            })
        });
    }

    async closeIssue(id) {
        return await this._request(`/issues/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ state: 'closed' })
        });
    }

    async getIssue(id) {
        return await this._request(`/issues/${id}`);
    }

    // ========== COMMENTS ==========
    async getComments(issueId) {
        return await this._request(`/issues/${issueId}/comments`);
    }

    async addComment(issueId, body) {
        return await this._request(`/issues/${issueId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content: body })
        });
    }

    // ========== REPO INFO ==========
    async getRepoDetails() {
        return await this._request(`/`);
    }

    async getLanguages() {
        return await this._request(`/languages`);
    }

    async getTags() {
        return await this._request(`/refs/tags?pagelen=100`);
    }

    async getContributors() {
        return await this._request(`/commits?pagelen=100`).then(data => {
            // Dedupe by author
            const authors = new Map();
            data.values.forEach(c => {
                const a = c.author;
                if (!authors.has(a.raw)) authors.set(a.raw, { ...a, count: 0 });
                authors.get(a.raw).count++;
            });
            return Array.from(authors.values());
        });
    }

    // ========== STATUS ==========
    async getStatus() {
        const details = await this.getRepoDetails();
        const branches = await this.listBranches();
        const prs = await this.listPRs();
        return {
            owner: this.owner,
            repo: this.repoName,
            defaultBranch: details.mainbranch,
            branches: branches.length,
            openPRs: prs.length,
            private: details.is_private,
            updated: details.updated_on
        };
    }
}

module.exports = { BitbucketProvider };