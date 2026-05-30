const { execSync } = require('child_process');
const path = require('path');
const vaf = require('./vaf');
const network = require('./network');

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

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
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async commit(message, options = {}) {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async push(branch = null) {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async pull(branch = null) {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async listBranches() {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async currentBranch() {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async createPR(options) {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async getPRStatus(prId) {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async getRepoInfo() {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    isConfigured() {
        return false;
    }

    async updateAvatar(imagePath) {
        throw new errors.Error('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
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
