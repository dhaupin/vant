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


module.exports = { GitProvider };