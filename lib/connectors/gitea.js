// Detect repo from git remote URL
function detectRepoFromRemote() {
    try {
        const { execSync } = require('child_process');
        const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
        // Remove .git suffix and git@ prefix
        const cleanUrl = remoteUrl.replace(/\.git$/, '').replace(/^git@/, 'https://');
        // Parse owner/repo from end of URL (works for Gitea/Forgejo custom installs)
        const parts = cleanUrl.split('/');
        const last = parts[parts.length - 1];
        const owner = parts[parts.length - 2];
        if (owner && last && owner !== 'https:') return owner + '/' + last;
    } catch (e) {}
    return null;
}

class GiteaProvider extends require("../remotes").GitProvider {
    constructor(config = {}) {
        super({ ...config, type: 'gitea' });
        this.token = config.token || process.env.GITEA_TOKEN;
        this.url = config.url || process.env.GITEA_URL || 'https://gitea.com';
        this.repo = config.repo || process.env.GITEA_REPO || detectRepoFromRemote();
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
        const url = `${this.url}/api/v1${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `token ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gitea API error: ${response.status} - ${error}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    async getRepoInfo() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}`);
        return {
            owner: data.owner.login,
            repo: data.name,
            description: data.description || '',
            url: data.html_url,
            defaultBranch: data.default_branch,
            private: data.private,
            forked: data.fork,
            stars: data.stars_count,
            forks: data.forks_count,
            openIssues: data.open_issues_count,
            language: data.language
        };
    }

    async getBranches() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/branches`);
        return data.map(b => ({
            name: b.name,
            commit: b.commit.sha
        }));
    }

    async getBranch(branch) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/branches/${branch}`);
        return {
            name: data.name,
            commit: data.commit.sha,
            protected: data.protected
        };
    }

    async getCommits(options = {}) {
        const params = new URLSearchParams({
            sha: options.sha || '',
            path: options.path || '',
            limit: options.limit || 30
        });
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/commits?${params}`);
        return data.map(c => ({
            sha: c.commit.sha,
            message: c.commit.message,
            author: c.commit.author.login,
            date: c.commit.date
        }));
    }

    async getCommit(sha) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/git/commits/${sha}`);
        return {
            sha: data.sha,
            message: data.message,
            author: data.author.name,
            date: data.timestamp
        };
    }

    async getTree(sha = 'HEAD', recursive = false) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/git/trees/${sha}?recursive=${recursive ? 1 : 0}`);
        return data.tree.map(t => ({
            path: t.path,
            type: t.type,
            sha: t.sha
        }));
    }

    async getBlob(sha) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/git/blobs/${sha}`);
        return {
            sha: data.sha,
            content: Buffer.from(data.content, 'base64').toString('utf8'),
            encoding: data.encoding
        };
    }

    async getFileContent(path, ref = 'HEAD') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/contents/${path}?ref=${ref}`);
        return Buffer.from(data.content, 'base64').toString('utf8');
    }

    async createFile(path, content, message, branch = 'main') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/contents/${path}`, {
            method: 'POST',
            body: JSON.stringify({
                content: Buffer.from(content).toString('base64'),
                message: message,
                branch: branch
            })
        });
        return { sha: data.commit.sha, url: data.content.html_url };
    }

    async updateFile(path, content, message, sha, branch = 'main') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/contents/${path}`, {
            method: 'PUT',
            body: JSON.stringify({
                content: Buffer.from(content).toString('base64'),
                message: message,
                sha: sha,
                branch: branch
            })
        });
        return { sha: data.commit.sha, url: data.content.html_url };
    }

    async deleteFile(path, message, sha, branch = 'main') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/contents/${path}`, {
            method: 'DELETE',
            body: JSON.stringify({
                message: message,
                sha: sha,
                branch: branch
            })
        });
        return { sha: data.commit.sha };
    }

    async getPullRequests(options = {}) {
        const params = options.state ? `?state=${options.state}` : '';
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/pulls${params}`);
        return data.map(pr => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            body: pr.body,
            user: pr.user.login,
            created: pr.created_at,
            updated: pr.updated_at,
            closed: pr.closed_at,
            merged: pr.merged_at,
            url: pr.html_url,
            base: pr.base.ref,
            head: pr.head.ref
        }));
    }

    async getPullRequest(number) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/pulls/${number}`);
        return {
            number: data.number,
            title: data.title,
            state: data.state,
            body: data.body,
            user: data.user.login,
            created: data.created_at,
            updated: data.updated_at,
            closed: data.closed_at,
            merged: data.merged_at,
            url: data.html_url,
            base: data.base.ref,
            head: data.head.ref,
            baseSha: data.base.sha,
            headSha: data.head.sha
        };
    }

    async createPullRequest(title, body, head, base = 'main') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/pulls`, {
            method: 'POST',
            body: JSON.stringify({
                title: title,
                body: body,
                head: head,
                base: base
            })
        });
        return {
            number: data.number,
            url: data.html_url
        };
    }

    async updatePullRequest(number, title, body, state) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/pulls/${number}`, {
            method: 'PATCH',
            body: JSON.stringify({
                title: title,
                body: body,
                state: state
            })
        });
        return { number: data.number, state: data.state, url: data.html_url };
    }

    async mergePullRequest(number, title, method = 'merge') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/pulls/${number}/merge`, {
            method: 'POST',
            body: JSON.stringify({
                title: title,
                merge_method: method
            })
        });
        return { sha: data.sha, merged: data.merged };
    }

    async getIssues(options = {}) {
        const params = new URLSearchParams();
        if (options.state) params.append('state', options.state);
        if (options.labels) params.append('labels', options.labels);
        const q = params.toString() ? `?${params}` : '';
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/issues${q}`);
        return data.map(issue => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            body: issue.body,
            user: issue.user.login,
            labels: issue.labels.map(l => l.name),
            created: issue.created_at,
            updated: issue.updated_at,
            closed: issue.closed_at,
            url: issue.html_url
        }));
    }

    async getIssue(number) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/issues/${number}`);
        return {
            number: data.number,
            title: data.title,
            state: data.state,
            body: data.body,
            user: data.user.login,
            labels: data.labels.map(l => l.name),
            created: data.created_at,
            updated: data.updated_at,
            closed: data.closed_at,
            url: data.html_url
        };
    }

    async createIssue(title, body, labels = []) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/issues`, {
            method: 'POST',
            body: JSON.stringify({
                title: title,
                body: body,
                labels: labels
            })
        });
        return { number: data.number, url: data.html_url };
    }

    async updateIssue(number, title, body, state) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/issues/${number}`, {
            method: 'PATCH',
            body: JSON.stringify({
                title: title,
                body: body,
                state: state
            })
        });
        return { number: data.number, state: data.state, url: data.html_url };
    }

    async getIssueComments(number) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/issues/${number}/comments`);
        return data.map(c => ({
            id: c.id,
            body: c.body,
            user: c.user.login,
            created: c.created_at,
            updated: c.updated_at
        }));
    }

    async createIssueComment(number, body) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/issues/${number}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body: body })
        });
        return { id: data.id, url: data.html_url };
    }

    async getLabels() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/labels`);
        return data.map(l => ({
            id: l.id,
            name: l.name,
            color: l.color,
            description: l.description
        }));
    }

    async createLabel(name, color, description = '') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/labels`, {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                color: color,
                description: description
            })
        });
        return { id: data.id, name: data.name };
    }

    async getReleases() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/releases`);
        return data.map(r => ({
            id: r.id,
            tag: r.tag_name,
            name: r.name,
            body: r.body,
            draft: r.draft,
            prerelease: r.prerelease,
            created: r.created_at,
            published: r.published_at,
            url: r.html_url
        }));
    }

    async getRelease(tag) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/releases/tags/${tag}`);
        return {
            id: data.id,
            tag: data.tag_name,
            name: data.name,
            body: data.body,
            draft: data.draft,
            prerelease: data.prerelease,
            created: data.created_at,
            published: data.published_at,
            url: data.html_url
        };
    }

    async createRelease(tag, name, body, draft = false, prerelease = false, target = 'main') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/releases`, {
            method: 'POST',
            body: JSON.stringify({
                tag_name: tag,
                name: name,
                body: body,
                draft: draft,
                prerelease: prerelease,
                target_commitish: target
            })
        });
        return { id: data.id, url: data.html_url };
    }

    async getTags() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/tags`);
        return data.map(t => ({
            name: t.name,
            sha: t.commit.sha,
            zipball: t.zipball_url,
            tarball: t.tarball_url
        }));
    }

    async getReadme(branch = 'main') {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/readme?ref=${branch}`);
        return Buffer.from(data.content, 'base64').toString('utf8');
    }

    async getLanguages() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/languages`);
        return Object.entries(data).reduce((acc, [lang, bytes]) => {
            acc[lang] = bytes;
            return acc;
        }, {});
    }

    async getContributors() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/contributors`);
        return data.map(c => ({
            login: c.login,
            contributions: c.contributions
        }));
    }

    async getStargazers() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/stargazers`);
        return data.map(s => ({
            login: s.login,
            date: s.starred_at
        }));
    }

    async getWatchers() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/subscribers`);
        return data.map(s => ({
            login: s.login
        }));
    }

    async getHooks() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/hooks`);
        return data.map(h => ({
            id: h.id,
            type: h.type,
            active: h.active,
            events: h.events
        }));
    }

    async createHook(config, events = ['push'], active = true) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/hooks`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'web',
                config: config,
                events: events,
                active: active
            })
        });
        return { id: data.id, url: data.config.url };
    }

    async deleteHook(id) {
        await this._request(`/repos/${this.owner}/${this.repoName}/hooks/${id}`, {
            method: 'DELETE'
        });
        return { deleted: true };
    }

    async getDeployKeys() {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/keys`);
        return data.map(k => ({
            id: k.id,
            title: k.title,
            key: k.key,
            verified: k.verified
        }));
    }

    async addDeployKey(title, key, readOnly = false) {
        const data = await this._request(`/repos/${this.owner}/${this.repoName}/keys`, {
            method: 'POST',
            body: JSON.stringify({
                title: title,
                key: key,
                read_only: readOnly
            })
        });
        return { id: data.id };
    }
}

module.exports = { GiteaProvider, detectRepoFromRemote };