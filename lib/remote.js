const errors = require('./error');
// Wave G: the shared seam. Direct require is safe — remote-transport.js
// depends only on lib/error.js; the cycle lives between connectors and
// remote (connectors → remote), not remote-transport.
const { RemoteTransport } = require('./remote-transport');
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
 *
 * (pass 195 — canonization Wave G adoption, prd-canonicalization §7 wave 3)
 * GitProvider now EXTENDS RemoteTransport — the Wave F seam. The connector
 * keeps its domain surface (checkout/commit/push/pull/listBranches…) but
 * inherits the shared contract:
 *   - auth() is the ONE credential door: it resolves the provider token
 *     live (config layer first, then env through config's registry entries)
 *     instead of the old constructor snapshot. The token NEVER lands on an
 *     instance field (`this.token` is gone — redaction by construction).
 *   - verify() is honest via the base (false unless overridden); sync's
 *     verifyProvider() already treats unreachable as unverified.
 *   - classifyError/retryPolicy semantics line up with the connector's
 *     own retryable flags (both read VantError.retryable).
 * Read paths unchanged: isConfigured() now consults auth(); _requestJson,
 * _gitExec, _gitRef keep their existing behavior (the adversarial suite
 * pins those, and RemoteTransport's validators are the same template).
 */
class GitProvider extends RemoteTransport {
    // Wave G note: RemoteTransport's constructor sets name/retryPolicy/
    // counters — call it first. `config` keeps the provider's own local
    // surface (repo/url overrides); tokens NEVER go on the instance.
    constructor(config = {}) {
        super({ name: config.type || 'git' });
        this.config = config;
        this.type = config.type || 'git';
    }

    /**
     * THE ONE CREDENTIAL DOOR (Wave G). Resolves the provider token live:
     * 1. a token handed explicitly in config (test/operator override),
     * 2. the config layer's githubToken()/registry resolution.
     * Returns null when unset (callers decide what anonymous means).
     * Overridden per connector ONLY for the connector's own env var name.
     */
    auth() {
        const cfg = this.config || {};
        if (typeof cfg.token === 'string' && cfg.token.length > 0) return cfg.token;
        try {
            const t = require('./config').githubToken();
            return typeof t === 'string' && t.length > 0 ? t : null;
        } catch (e) {
            return null;
        }
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
        try { return require('./config').gitTimeoutMs(); } catch (e) {
            const raw = parseInt(process.env.VANT_GIT_TIMEOUT_MS || '', 10);
            if (Number.isFinite(raw) && raw > 0) return raw;
            return 60000; // git ops can legitimately stream bigger payloads
        }
    }

    _gitOpts() {
        return { timeout: this._gitTimeoutMs(), stdio: 'pipe' };
    }

    /**
     * Safe git CLI execution: argv-array only, NO shell. Every provider git
     * op goes through here so branch names / commit messages / file lists
     * (which can originate in brain-file content) can never interpolate into
     * a shell command string — the same injection class fixed in
     * bin/branch-manager.js (R-6/O-9), which previously lived on in the
     * connectors as `execSync(`git commit -m "${message}"`)`.
     * @param {string[]} args - git arguments, one string per argv element
     * @param {object} opts - forwarded to execFileSync (encoding default utf8)
     * @returns {string} stdout
     */
    _gitExec(args, opts = {}) {
        if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) {
            throw new errors.VantError('git exec requires an argv array of strings', { code: errors.CODES.GIT_ERROR, retryable: false });
        }
        const { execFileSync } = require('child_process');
        try {
            return execFileSync('git', args, {
                encoding: 'utf8',
                ...this._gitOpts(),
                ...opts
            });
        } catch (e) {
            const err = new errors.VantError('Git error: ' + (e.message || String(e)), { code: errors.CODES.GIT_ERROR, retryable: true });
            err.cause = e;
            throw err;
        }
    }

    /**
     * Validate a git remote/branch name for use as a single argv element.
     * Blocks option-injection (values starting with '-') and whitespace
     * smuggles; segment charset matches bin/branch-manager.js brain names.
     */
    _gitRef(name, what = 'git ref') {
        // Wave G hardening: bound the argv element. Unbounded length was the
        // one hole an env-fuzz probe found (`'x'.repeat(500)` passed) — argv
        // values have no hard OS cap but E2BIG and API path limits do, and a
        // 150-char ceiling matches RemoteTransport's ALLOWED_NAME template.
        if (typeof name !== 'string' || name.length > 150
            || !/^[a-zA-Z0-9][a-zA-Z0-9._\/-]*$/.test(name) || name.includes('..')) {
            throw new errors.VantError('Invalid ' + what + ': ' + String(name).slice(0, 40), { code: errors.CODES.VAF_PATH_BLOCKED, retryable: false });
        }
        return name;
    }

    async _requestJson(url, options = {}) {
        let fallback = null;
        try { fallback = require('./config').httpTimeoutMs(); } catch (e) {}
        if (!Number.isFinite(fallback) || fallback <= 0) {
            const envRaw = parseInt(process.env.VANT_HTTP_TIMEOUT_MS || '', 10);
            fallback = Number.isFinite(envRaw) && envRaw > 0 ? envRaw : 15000;
        }
        const timeoutMs = (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0)
            ? options.timeoutMs
            : fallback;

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
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async commit(message, options = {}) {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async push(branch = null) {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async pull(branch = null) {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async listBranches() {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async currentBranch() {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async createPR(options) {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async getPRStatus(prId) {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    async getRepoInfo() {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
    }

    isConfigured() {
        return false;
    }

    async updateAvatar(imagePath) {
        throw new errors.VantError('Not implemented', { code: errors.CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED', retryable: false });
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
