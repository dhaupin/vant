// Detect repo from git remote URL
function detectRepoFromRemote() {
    try {
        const { execSync } = require('child_process');
        const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
        // Remove .git suffix and git@ prefix
        const cleanUrl = remoteUrl.replace(/\.git$/, '').replace(/^git@/, 'https://');
        // Parse owner/repo from end of URL
        const parts = cleanUrl.split('/');
        const last = parts[parts.length - 1];
        const owner = parts[parts.length - 2];
        if (owner && last && owner !== 'https:') return owner + '/' + last;
    } catch (e) {}
    return null;
}
class GitHubProvider extends require("../remotes").GitProvider {
    constructor(config = {}) {
        super({ ...config, type: 'github' });
        this.token = config.token || process.env.GITHUB_TOKEN;
        this.repo = config.repo || process.env.GITHUB_REPO || detectRepoFromRemote();
        this.owner = '';
        this.repoName = '';
        
        if (this.repo) {
            const parts = this.repo.split('/');
            this.owner = parts[0];
            this.repoName = parts[1];
        }
    }

    isConfigured() {
        return !!(this.token && this.owner && this.repoName);
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

    // ========== ISSUES ==========
    async getIssues(options = {}) {
        const state = options.state || 'open';
        return await this._request(`/repos/${this.owner}/${this.repoName}/issues?state=${state}`);
    }

    async createIssue(options) {
        const { title, body, labels, assignees } = options;
        return await this._request(`/repos/${this.owner}/${this.repoName}/issues`, {
            method: 'POST',
            body: JSON.stringify({ title, body, labels, assignees })
        });
    }

    async closeIssue(issueNumber) {
        return await this._request(`/repos/${this.owner}/${this.repoName}/issues/${issueNumber}`, {
            method: 'PATCH',
            body: JSON.stringify({ state: 'closed' })
        });
    }

    async getIssue(issueNumber) {
        return await this._request(`/repos/${this.owner}/${this.repoName}/issues/${issueNumber}`);
    }

    // ========== COMMENTS ==========
    async getComments(issueNumber) {
        return await this._request(`/repos/${this.owner}/${this.repoName}/issues/${issueNumber}/comments`);
    }

    async addComment(issueNumber, body) {
        return await this._request(`/repos/${this.owner}/${this.repoName}/issues/${issueNumber}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body })
        });
    }

    // ========== PULL REQUESTS ==========
    async listPRs(options = {}) {
        const state = options.state || 'open';
        return await this._request(`/repos/${this.owner}/${this.repoName}/pulls?state=${state}`);
    }

    async getPR(prNumber) {
        return await this._request(`/repos/${this.owner}/${this.repoName}/pulls/${prNumber}`);
    }

    async mergePR(prNumber, options = {}) {
        const { method = 'merge', title, description } = options;
        return await this._request(`/repos/${this.owner}/${this.repoName}/pulls/${prNumber}/merge`, {
            method: 'PUT',
            body: JSON.stringify({ merge_method: method, title, description })
        });
    }

    // ========== REPO INFO ==========
    async getRepoDetails() {
        return await this._request(`/repos/${this.owner}/${this.repoName}`);
    }

    async getLanguages() {
        return await this._request(`/repos/${this.owner}/${this.repoName}/languages`);
    }

    async getTags() {
        return await this._request(`/repos/${this.owner}/${this.repoName}/tags`);
    }

    async getContributors() {
        return await this._request(`/repos/${this.owner}/${this.repoName}/contributors`);
    }

    // ========== WORKFLOWS ==========
    async getWorkflows() {
        return await this._request(`/repos/${this.owner}/${this.repoName}/actions/workflows`);
    }

    async getWorkflowRuns(workflowId) {
        return await this._request(`/repos/${this.owner}/${this.repoName}/actions/workflows/${workflowId}/runs`);
    }

    async triggerWorkflow(workflowId, ref = 'main') {
        return await this._request(`/repos/${this.owner}/${this.repoName}/actions/workflows/${workflowId}/dispatches`, {
            method: 'POST',
            body: JSON.stringify({ ref })
        });
    }

    // ========== CHECKS ==========
    async getCheckRuns(sha) {
        return await this._request(`/repos/${this.owner}/${this.repoName}/check-runs?ref=${sha}`);
    }

    // ========== STATUS ==========
    async getStatus() {
        const [repo, branches, prs] = await Promise.all([
            this.getRepoDetails(),
            this.listBranches(),
            this.listPRs()
        ]);
        return {
            owner: this.owner,
            repo: this.repoName,
            defaultBranch: repo.default_branch,
            branches: branches.length,
            openPRs: prs.length,
            private: repo.private,
            updated: repo.updated_at
        };
    }
}

module.exports = { GitHubProvider };