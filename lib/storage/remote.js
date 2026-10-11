// Extracted verbatim from lib/storage.js (Wave D split — factory lib/storage.js re-exports). Requires flow through lib/storage/shared.js so the SECURITY PLUMBING stays single-source.
'use strict';
const _ = require('./shared');
const { fs, path, errors, metrics, STORAGE_VERSION, _recordStoreOp, _checkReadSafe, _checkWriteSafe, _getVaf, _getFormat, _emit, MODELS_PATH, readJson, writeJson } = require('./shared');

// ==================== REPOS STORAGE ====================
class ReposStorage {
    constructor(options = {}) {
        this.reposDir = options.reposDir || MODELS_PATH() + '/repos';
        this.version = STORAGE_VERSION;
        if (!fs.existsSync(this.reposDir)) {
            fs.mkdirSync(this.reposDir, { recursive: true });
        }
    }

    _load() {
        const configPath = path.join(this.reposDir, 'config.json');
        return readJson(configPath) || { mounted: [], repos: {} };
    }

    _save(config) {
        const configPath = path.join(this.reposDir, 'config.json');
        writeJson(configPath, config);
    }

    register(name, url, options = {}) {
        const config = this._load();
        config.repos[name] = { url, ...options };
        this._save(config);
        return true;
    }

    async mount(name) {
        // WARNING: This may violate GitHub ToS if used as auto-sync database
        // See docs/reference/storage.md for GitHub ToS guidelines
        const config = this._load();
        if (!config.repos[name]) return null;
        config.mounted.push(name);
        this._save(config);
        return config.repos[name];
    }

    unmount(name) {
        const config = this._load();
        config.mounted = config.mounted.filter(n => n !== name);
        this._save(config);
        return true;
    }

    async pull(name = null) {
        // WARNING: Auto-sync may violate GitHub ToS
        // Config opt-in required: storage.autoSync
        const configStorage = getStorage('config');
        if (configStorage.get('storage.autoSync') !== true) {
            throw new errors.VantError('Auto-sync disabled. Set config storage.autoSync=true to enable.');
        }

        const config = this._load();
        const repos = name ? [name] : config.mounted;

        for (const repo of repos) {
            if (!config.repos[repo]) continue;
            // Full implementation would git clone/pull here
            audit.info('[Storage] Pull from', config.repos[repo].url);
        }

        return repos;
    }

    has(name) {
        const config = this._load();
        return !!config.repos[name];
    }

    list() {
        const config = this._load();
        return Object.keys(config.repos);
    }

    getMounted() {
        const config = this._load();
        return config.mounted;
    }
}

/**
 * RemoteStorage — FileStorage-shaped store backed by the S3-API client in
 * lib/connectors/s3.js. ONE implementation covers AWS S3, Cloudflare R2, MinIO, and
 * Backblaze B2 (all speak the S3 REST API; only endpoint shape + region vary).
 *
 * Config sources, in order: constructor options → env
 * (VANT_REMOTE_PROVIDER, VANT_REMOTE_BUCKET, VANT_REMOTE_REGION,
 * VANT_REMOTE_KEY, VANT_REMOTE_SECRET, VANT_REMOTE_PREFIX,
 * VANT_REMOTE_ENDPOINT). Credentials are NEVER echoed by remoteStatus() or
 * error paths.
 *
 * Contract deltas vs FileStorage (pinned by tests):
 * - All I/O methods are async (network store).
 * - Keys are remote-store keys; lib/remote._safeKey enforces a tighter
 *   charset than the fs (traversal/absolute/backslash refused BEFORE any
 *   network call).
 * - read() → string|null (null = 404); network/auth failures throw.
 * - list() returns store-relative keys (a remote prefix has no fs dirname);
 *   default RECURSIVE (FileStorage shallow-list is a readdir limitation,
 *   not a network contract), {recursive:false} for one-level parity.
 * - Local-only FileStorage features (WAL, mirrors, encryption-at-rest,
 *   snapshots) do not apply here; remote is a replication TARGET.
 * - Capability-gated through the same shared gate (B-2) as FileStorage;
 *   readRaw/writeRaw/deleteRaw are the explicit bypass, mirroring FileStorage.
 * - options.client injects a test double (DI point) — no network in tests.
 */
class RemoteStorage {
    constructor(options = {}) {
        this.version = STORAGE_VERSION;
        this.backend = 'remote';
        const env = process.env;
        this.provider = options.provider || env.VANT_REMOTE_PROVIDER || 's3';
        this.bucket = options.bucket || env.VANT_REMOTE_BUCKET || null;
        this.region = options.region || env.VANT_REMOTE_REGION || undefined;
        this.prefix = (options.prefix || env.VANT_REMOTE_PREFIX || '').replace(/\/+$/, '');
        this.endpoint = options.endpoint || env.VANT_REMOTE_ENDPOINT || undefined;
        this.accessKeyId = options.accessKeyId || env.VANT_REMOTE_KEY || null;
        this.secretAccessKey = options.secretAccessKey || env.VANT_REMOTE_SECRET || null;
        this.timeoutMs = options.timeoutMs;
        this._injectedClient = options.client || null;

        // Pseudo-path for metrics/debug display (never a real fs location):
        // remote://provider/bucket[/prefix]
        this.basePath = 'remote://' + this.provider + '/' + (this.bucket || '?') +
            (this.prefix ? '/' + this.prefix : '');

        // Lazy client: a misconfigured remote must not break module load or
        // unrelated factory calls — the error surfaces on first use.
        this._client = null;
        this._lazyError = null;
        if (!this.bucket || !this.accessKeyId || !this.secretAccessKey) {
            this._lazyError = 'remote storage not configured (need bucket + access key id + secret)';
        }
    }

    _getClient() {
        if (this._injectedClient) return this._injectedClient;
        if (this._lazyError) {
            throw new errors.VantError(this._lazyError, { code: 'STORAGE_REMOTE_NOT_CONFIGURED', retryable: false });
        }
        if (!this._client) {
            const remote = require('./connectors/s3');
            this._client = remote.createClient({
                provider: this.provider,
                bucket: this.bucket,
                region: this.region,
                endpoint: this.endpoint,
                prefix: this.prefix,
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
                timeoutMs: this.timeoutMs
            });
        }
        return this._client;
    }

    // Store-relative key → remote key (prefix + key).
    // HARDENING (contract symmetry with FileStorage): absolute and
    // backslash-bearing keys are refused BEFORE any mapping/network call,
    // on every path including the raw bypass.
    _remoteKey(k) {
        const s = String(k || '');
        if (s.startsWith('/') || s.includes('\\') || s.split('/').some(p => p === '.' || p === '..')) {
            throw new errors.VantError('Security: absolute/backslash/traversal remote key refused', { code: errors.CODES.SECURITY_PATH_ESCAPE, retryable: false });
        }
        return this.prefix ? this.prefix + '/' + s : s;
    }

    // Remote key → store-relative key (strip prefix; pass through unknowns)
    _fromRemoteKey(rk) {
        return this.prefix && String(rk).startsWith(this.prefix + '/')
            ? String(rk).slice(this.prefix.length + 1)
            : String(rk);
    }

    _vafCheck(k) {
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(k);
            if (check.blocked) {
                throw new errors.VantError('Security: Path blocked', { code: 'VAF_PATH_BLOCKED', retryable: false });
            }
        }
    }

    async read(k) {
        _checkReadSafe();
        this._vafCheck(k);
        const _t0 = process.hrtime.bigint();
        try {
            const out = await this._getClient().get(this._remoteKey(k));
            _recordStoreOp(this.basePath, 'read', true, out ? out.length : 0, _t0);
            return out;
        } catch (e) {
            _recordStoreOp(this.basePath, 'read', false, undefined, _t0);
            throw e;
        }
    }

    // Explicit bypass (caller has validated inputs) — mirrors FileStorage.readRaw.
    async readRaw(k) {
        const _t0 = process.hrtime.bigint();
        try {
            const out = await this._getClient().get(this._remoteKey(k));
            _recordStoreOp(this.basePath, 'read', true, out ? out.length : 0, _t0, true);
            return out;
        } catch (e) {
            _recordStoreOp(this.basePath, 'read', false, undefined, _t0, true);
            throw e;
        }
    }

    async write(k, content, opts = {}) {
        _checkWriteSafe();
        this._vafCheck(k);

        let finalContent = content;
        if (opts.format && typeof content === 'object') {
            const format = _getFormat();
            finalContent = format?.serialize
                ? format.serialize(content, opts.format, opts)
                : JSON.stringify(content, null, 2);
        }
        if (typeof finalContent !== 'string' && !Buffer.isBuffer(finalContent)) {
            finalContent = String(finalContent);
        }

        const _t0 = process.hrtime.bigint();
        try {
            await this._getClient().put(this._remoteKey(k), finalContent);
            _recordStoreOp(this.basePath, 'write', true,
                typeof finalContent === 'string' ? finalContent.length : Buffer.byteLength(finalContent), _t0);
            return true;
        } catch (e) {
            _recordStoreOp(this.basePath, 'write', false, undefined, _t0);
            throw e;
        }
    }

    // Explicit bypass — mirrors FileStorage.writeRaw.
    async writeRaw(k, content) {
        const _t0 = process.hrtime.bigint();
        try {
            await this._getClient().put(this._remoteKey(k), content);
            _recordStoreOp(this.basePath, 'write', true,
                typeof content === 'string' ? content.length : Buffer.byteLength(content), _t0, true);
            return true;
        } catch (e) {
            _recordStoreOp(this.basePath, 'write', false, undefined, _t0, true);
            throw e;
        }
    }

    async has(k) {
        _checkReadSafe();
        this._vafCheck(k);
        try {
            const st = await this._getClient().stat(this._remoteKey(k));
            // Not-found is a normal has() outcome — record ok with flag in bytes slot.
            _recordStoreOp(this.basePath, 'has', true, st ? 1 : 0);
            return st !== null;
        } catch (e) {
            _recordStoreOp(this.basePath, 'has', false);
            throw e;
        }
    }

    async delete(k) {
        _checkReadSafe();
        _checkWriteSafe();
        this._vafCheck(k);
        try {
            const deleted = await this._getClient().delete(this._remoteKey(k));
            if (deleted) _emit('storage:deleted', { path: this.basePath + '/' + k, remote: true, timestamp: Date.now() });
            _recordStoreOp(this.basePath, 'delete', true);
            return deleted;
        } catch (e) {
            _recordStoreOp(this.basePath, 'delete', false);
            throw e;
        }
    }

    // Explicit bypass — mirrors FileStorage.deleteRaw.
    async deleteRaw(k) {
        const deleted = await this._getClient().delete(this._remoteKey(k));
        _recordStoreOp(this.basePath, 'delete', true);
        return deleted;
    }

    // list(): FileStorage.list's shallow one-level semantics are a local
    // readdir limitation, not a contract worth carrying over a network
    // store — remote list defaults to RECURSIVE (whole key tree under the
    // pattern's "directory"), with {recursive:false} for shallow parity.
    async list(pattern, opts = {}) {
        _checkReadSafe();
        const pat = String(pattern || '');
        let dir = '', base = '';
        if (pat === '') {
            dir = '';
        } else if (!pat.includes('/')) {
            // 'a' means "everything under a/" over the network — a bare
            // basename filter would be near-useless remotely.
            dir = pat + '/';
        } else {
            const cut = pat.lastIndexOf('/');
            dir = pat.slice(0, cut + 1);
            base = pat.slice(cut + 1).replace(/\*/g, '');
        }
        let keys;
        if (opts.recursive === false) {
            keys = (await this._getClient().list(dir)).map(r => r.key);
        } else {
            keys = await this._listRecursive(dir);
        }
        return keys
            .filter(k => !k.endsWith('/')) // CommonPrefix markers are not objects
            .map(k => this._fromRemoteKey(k))
            .filter(k => {
                if (opts.recursive === false) {
                    if (k.slice(dir.length).includes('/')) return false; // direct children only
                }
                return !base || k.slice(dir.length).split('/').pop().includes(base);
            });
    }

    async _listRecursive(sub) {
        const out = [];
        for (const r of await this._getClient().list(sub || '')) {
            if (r.key.endsWith('/')) out.push(...(await this._listRecursive(r.key)));
            else out.push(r.key);
        }
        return out;
    }

    /** Head an object → {key,size,etag,lastModified} | null (no gate — metadata only). */
    async stat(k) {
        return this._getClient().stat(this._remoteKey(k));
    }

    /** Connectivity/config summary for CLI + tests. Never includes secrets. */
    remoteStatus() {
        return {
            configured: !this._lazyError,
            provider: this.provider,
            bucket: this.bucket,
            region: this.region || null,
            prefix: this.prefix || null,
            endpoint: this.endpoint || null,
            basePath: this.basePath
        };
    }

    /**
     * Push a local FileStorage tree into this remote store.
     * files: explicit rel list, or localStore._walkRel() when omitted.
     * Returns {pushed, skipped, errors, dryRun}.
     */
    async pushFrom(localStore, opts = {}) {
        const files = opts.files || (typeof localStore._walkRel === 'function' ? localStore._walkRel() : []);
        const r = { pushed: 0, skipped: 0, errors: 0, dryRun: opts.dryRun === true };
        for (const rel of files) {
            try {
                if (opts.dryRun) { r.pushed++; continue; }
                const content = localStore.read(rel);
                if (content === null) { r.skipped++; continue; }
                await this.write(rel, content);
                r.pushed++;
            } catch (e) { r.errors++; }
        }
        return r;
    }

    /**
     * Pull remote objects into a local FileStorage store.
     * files: explicit rel list, or this.list() when omitted.
     * Returns {pulled, skipped, errors, dryRun}.
     */
    async pullTo(localStore, opts = {}) {
        const files = opts.files || (await this.list(''));
        const r = { pulled: 0, skipped: 0, errors: 0, dryRun: opts.dryRun === true };
        for (const rel of files) {
            try {
                if (opts.dryRun) { r.pulled++; continue; }
                const content = await this.read(rel);
                if (content === null) { r.skipped++; continue; }
                localStore.write(rel, content);
                r.pulled++;
            } catch (e) { r.errors++; }
        }
        return r;
    }
}


module.exports = { ReposStorage, RemoteStorage };
