const { execSync } = require('child_process');
const path = require('path');
const vaf = require('./vaf');
const network = require('./network');

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

// Export early to avoid circular dependency with connectors
module.exports = { GitProvider };

const { GitHubProvider } = require('./connectors/github');
const { GitLabProvider } = require('./connectors/gitlab');
const { BitbucketProvider } = require('./connectors/bitbucket');
const { SelfHostedProvider } = require('./connectors/selfhosted');
const { GiteaProvider } = require('./connectors/gitea');

function detectProvider() {
    try {
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
        return 'selfhosted';
    }
}

function getProvider(type = null, config = {}) {
    const providerType = type || detectProvider();
    switch (providerType) {
        case 'github':
            return new GitHubProvider(config);
        case 'gitlab':
            return new GitLabProvider(config);
        case 'bitbucket':
            return new BitbucketProvider(config);
        case 'gitea':
            return new GiteaProvider(config);
        case 'selfhosted':
        default:
            return new SelfHostedProvider(config);
    }
}

function getAllProviders(config = {}) {
    return {
        github: new GitHubProvider(config),
        gitlab: new GitLabProvider(config),
        bitbucket: new BitbucketProvider(config),
        gitea: new GiteaProvider(config),
        selfhosted: new SelfHostedProvider(config)
    };
}

module.exports = {
    getProvider,
    detectProvider,
    getAllProviders,
    GitProvider,
    GitHubProvider,
    GitLabProvider,
    BitbucketProvider,
    SelfHostedProvider,
    GiteaProvider
};
