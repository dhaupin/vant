// Detect repo from git remote URL
function detectRepoFromRemote() {
    try {
        const { execSync } = require('child_process');
        const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
        // Handle git@ URLs
        const cleanUrl = remoteUrl.replace(/\.git$/, '').replace(/^git@/, 'https://');
        // Parse from gitlab.com/owner/repo or custom/owner/repo
        const match = cleanUrl.match(/gitlab[^/]+\/([^\/]+)\/([^\/]+)$/);
        if (match) return match[1] + '/' + match[2];
    } catch (e) {}
    return null;
}
class GitLabProvider extends require("../gitprovider").GitProvider {
    constructor(config = {}) {
        super({ ...config, type: 'gitlab' });
        this.token = config.token || process.env.GITLAB_TOKEN;
        this.url = config.url || process.env.GITLAB_URL || 'https://gitlab.com';
        this.repo = config.repo || process.env.GITLAB_REPO || detectRepoFromRemote();
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

    // ========== ISSUES ==========
    async getIssues(options = {}) {
        const state = options.state || 'opened';
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/issues?state=${state}`);
    }

    async createIssue(options) {
        const { title, description, labels, assignee_ids } = options;
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/issues`, {
            method: 'POST',
            body: JSON.stringify({ title, description, labels, assignee_ids })
        });
    }

    async closeIssue(issueIid) {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/issues/${issueIid}`, {
            method: 'PUT',
            body: JSON.stringify({ state_event: 'close' })
        });
    }

    async getIssue(issueIid) {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/issues/${issueIid}`);
    }

    // ========== COMMENTS ==========
    async getComments(issueIid) {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/issues/${issueIid}/notes`);
    }

    async addComment(issueIid, body) {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/issues/${issueIid}/notes`, {
            method: 'POST',
            body: JSON.stringify({ body })
        });
    }

    // ========== MERGE REQUESTS ==========
    async listMRs(options = {}) {
        const state = options.state || 'opened';
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/merge_requests?state=${state}`);
    }

    async getMR(mrIid) {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/merge_requests/${mrIid}`);
    }

    async mergeMR(mrIid, options = {}) {
        const { should_remove_source_branch } = options;
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/merge_requests/${mrIid}/merge`, {
            method: 'PUT',
            body: JSON.stringify({ should_remove_source_branch })
        });
    }

    // ========== REPO INFO ==========
    async getRepoDetails() {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}`);
    }

    async getLanguages() {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/languages`);
    }

    async getTags() {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/repository/tags`);
    }

    async getContributors() {
        return await this._request(`/projects/${encodeURIComponent(this.repo)}/repository/contributors`);
    }

    // ========== STATUS ==========
    async getStatus() {
        const details = await this.getRepoDetails();
        const branches = await this.listBranches();
        const mrs = await this.listMRs();
        return {
            owner: this.repo.split('/')[0],
            repo: this.repo.split('/')[1],
            defaultBranch: details.default_branch,
            branches: branches.length,
            openMRs: mrs.length,
            private: details.visibility === 'private',
            updated: details.last_activity_at
        };
    }
}

module.exports = { GitLabProvider };