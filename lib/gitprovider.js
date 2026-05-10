/**
 * GitProvider Base Class
 * Base class for all Git remote providers
 */
class GitProvider {
    constructor(config = {}) {
        this.config = config;
        this.type = config.type || 'git';
    }

    getType() {
        return this.type;
    }

    async checkout(branchName, create = true) {
        throw new Error('Not implemented');
    }

    async commit(message, options = {}) {
        throw new Error('Not implemented');
    }

    async push(branch = null) {
        throw new Error('Not implemented');
    }

    async pull(branch = null) {
        throw new Error('Not implemented');
    }

    async listBranches() {
        throw new Error('Not implemented');
    }

    async currentBranch() {
        throw new Error('Not implemented');
    }

    async createPR(options) {
        throw new Error('Not implemented');
    }

    async getPRStatus(prId) {
        throw new Error('Not implemented');
    }

    async getRepoInfo() {
        throw new Error('Not implemented');
    }

    isConfigured() {
        return false;
    }

    async updateAvatar(imagePath) {
        throw new Error('Not implemented');
    }
}

module.exports = { GitProvider };
