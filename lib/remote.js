const errors = require('./error');
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

    // ==================== P2 #25: PROVIDER-OP TIMEOUTS ====================
    // Every HTTP op a provider makes MUST go through _requestJson (never the
    // bare global fetch): it aborts hung sockets and throws a coded,
    // retryable NETWORK_TIMEOUT instead of hanging sync.pushAll/pullAny/rebase
    // forever. Git CLI ops MUST pass _gitOpts() to execSync so dead remotes
    // get killed instead of blocking the event loop's child.

    _gitTimeoutMs() {
        const raw = parseInt(process.env.VANT_GIT_TIMEOUT_MS || '', 10);
        if (Number.isFinite(raw) && raw > 0) return raw;
        return 60000; // git ops can legitimately stream bigger payloads
    }

    _gitOpts() {
        return { timeout: this._gitTimeoutMs(), stdio: 'pipe' };
    }

    async _requestJson(url, options = {}) {
        const fallback = parseInt(process.env.VANT_HTTP_TIMEOUT_MS || '', 10);
        const timeoutMs = (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0)
            ? options.timeoutMs
            : (Number.isFinite(fallback) && fallback > 0 ? fallback : 15000);

        // Route through the network layer (P2 #25 follow-up): SSRF walls
        // (private-IP + DNS-rebinding), domain whitelist, shared circuit
        // breaker, events. `system: true` is the DOCUMENTED bypass for
        // system-initiated ops — defaultSandbox.canNetwork() is false by
        // default and would brick every configured sync install; provider
        // authorization happens at the entry point (explicit config, escrow,
        // recursion guard, per-provider circuits, wall-clock caps).
        // cache OFF: the network cache is not auth-keyed — a cached authed
        // response could cross tokens/repos.
        try {
            const text = await Promise.race([
                network.fetch(url, {
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body,
                    cache: false,
                    system: true,
                    timeout: timeoutMs
                }),
                new Promise((_, reject) => setTimeout(() => reject(
                    new errors.VantError(`Provider API request timed out after ${timeoutMs}ms`, {
                        code: errors.CODES.NETWORK_TIMEOUT,
                        retryable: true,
                        details: { url, timeoutMs }
                    })), timeoutMs))
            ]);
            try { return JSON.parse(text); } catch { return text; }
        } catch (e) {
            if (e instanceof errors.VantError) throw e;
            const msg = String((e && e.message) || e);
            const statusMatch = msg.match(/HTTP (\d{3})/);
            if (statusMatch) {
                const status = parseInt(statusMatch[1], 10);
                throw new errors.VantError(`Provider API error: ${msg}`, {
                    code: 'NETWORK_HTTP_ERROR',
                    retryable: status >= 500 || status === 429,
                    details: { url, status }
                });
            }
            if (/not allowed|blocked|internal IP|DNS rebinding|capability not allowed/i.test(msg)) {
                throw new errors.VantError(`Provider API request blocked: ${msg}`, {
                    code: 'NETWORK_BLOCKED',
                    retryable: false,
                    details: { url }
                });
            }
            throw e;
        }
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

// Extend exports instead of overwriting to preserve early GitProvider export for connectors
Object.assign(module.exports, {
    getProvider,
    detectProvider,
    getAllProviders,
    GitProvider,
    GitHubProvider,
    GitLabProvider,
    BitbucketProvider,
    SelfHostedProvider,
    GiteaProvider,

    // Multibrain
    getBrainRemoteConfig,
    setBrainRemoteConfig,

    // Multibrain Stack
    getStackRemoteConfigs
});

// ==================== MULTIBRAIN SUPPORT ====================

const _brainRemoteConfigs = {};

function getBrainRemoteConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainRemoteConfigs[brainName] || { provider: 'github' };
}

function setBrainRemoteConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainRemoteConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackRemoteConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainRemoteConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
