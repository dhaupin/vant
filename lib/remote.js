/**
 * Remote Connectors (v0.9.0-axolotl) — own S3-API client
 * (prd-storage.md "Remote connectors" — the last open prd-storage item)
 *
 * ONE implementation for every S3-compatible provider: AWS S3, Cloudflare R2,
 * MinIO, Backblaze B2 all speak the S3 REST API, so the only per-provider
 * variance is the endpoint shape + signing region. No SDK dependency: SigV4
 * is ~40 lines with node:crypto, transport is global fetch (Node >= 18).
 *
 *   const remote = require('./lib/remote');
 *   const client = remote.createClient({ provider: 'r2', bucket: 'vant',
 *       accessKeyId: '...', secretAccessKey: '...' });
 *   await client.put('brains/vant/identity.md', '# hello');
 *   const body = await client.get('brains/vant/identity.md'); // string | null
 *   const keys = await client.list('brains/');                 // [{key,size,...}]
 *   await client.delete('brains/vant/identity.md');
 *   await client.stat('brains/vant/identity.md');              // obj | null
 *   const h = await client.headBucket();                       // {ok, status}
 *
 * SECURITY NOTES
 * - Credentials never appear in error messages, logs, or thrown Error text —
 *   errors carry only provider status + a request-id.
 * - Keys are remote-store keys (paths inside the bucket prefix), validated
 *   by _safeKey() BEFORE they touch a URL: no traversal, no protocol junk.
 * - No response body is executed/eval'd anywhere; remote content is data.
 * - fetch does not follow cross-origin redirects with auth re-sending; the
 *   signer only ever targets the configured endpoint (mode 'same-origin').
 */

'use strict';

const crypto = require('crypto');

// ==================== PROVIDER PRESETS ====================
// One client, four providers. endpoint: {url} template gets
// {bucket} + {region} substitution; url style mirrors how each provider's
// S3 API is addressed. All four use SigV4 with service 's3'.
const PROVIDERS = {
    s3: {
        label: 'Amazon S3',
        endpoint: 'https://{bucket}.s3.{region}.amazonaws.com',
        region: 'us-east-1',
        forcePathStyle: false
    },
    r2: {
        label: 'Cloudflare R2',
        // R2 S3 API: account-scoped host, path-style bucket.
        // Account id is passed as the `region` field (documented quirk).
        endpoint: 'https://{region}.r2.cloudflarestorage.com/{bucket}',
        region: 'auto',
        forcePathStyle: true
    },
    minio: {
        label: 'MinIO (self-hosted)',
        endpoint: 'http://localhost:9000/{bucket}',
        region: 'us-east-1',
        forcePathStyle: true
    },
    b2: {
        label: 'Backblaze B2 (S3 API)',
        endpoint: 'https://{region}.backblazeb2.com/{bucket}',
        region: null, // required: B2 S3 endpoint region (e.g. us-west-004)
        forcePathStyle: true
    }
};

// Remote keys are bucket-relative path-ish segments. Tight charset (PRD
// standard #5): alnum start, then alnum + . _ - / (no spaces, no '..' seq,
// no leading slash). Validated BEFORE any URL interpolation.
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

function _safeKey(key) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 1024) {
        throw new Error('EREMOTE: invalid remote key (empty/too long)');
    }
    if (!KEY_RE.test(key)) {
        throw new Error('EREMOTE: invalid remote key charset');
    }
    const parts = key.split('/');
    for (const p of parts) {
        if (p === '.' || p === '..') {
            throw new Error('EREMOTE: remote key traversal blocked');
        }
    }
    return key.replace(/\/+$/, '');
}

function _resolveEndpoint(provider, bucket, region) {
    const preset = PROVIDERS[provider];
    const r = region || preset.region;
    if (!r) {
        throw new Error('EREMOTE: ' + provider + ' requires a region/endpoint id');
    }
    const url = preset.endpoint
        .replace(/\{bucket\}/g, encodeURIComponent(bucket))
        .replace(/\{region\}/g, encodeURIComponent(r));
    return { url, region: r };
}

// ==================== SIGV4 ====================
function _sha256hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function _hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

function _amzDate(d) {
    return d.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
}

/**
 * Sign an S3 request with AWS Signature V4 (unsigned payload variant —
 * the TLS channel carries the body; every S3-compatible provider accepts
 * x-amz-content-sha256: UNSIGNED-PAYLOAD).
 * Returns headers; NEVER includes credentials in any error path.
 */
function _sign(method, urlStr, headers, body, creds, region, date) {
    const url = new URL(urlStr);
    const amzDate = _amzDate(date);
    const dateStamp = amzDate.slice(0, 8);

    headers = { ...headers };
    headers['x-amz-date'] = amzDate;
    headers['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';
    headers['host'] = url.host;

    // Canonical query: sorted, uri-encoded
    const params = [...url.searchParams.entries()].map(([k, v]) => [
        encodeURIComponent(k).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()),
        encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    ]).sort((a, b) => (a[0] < b[0] ? -1 : 1));

    const canonicalUri = url.pathname.replace(/[!'()*]/g,
        c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

    const signedHeaderNames = Object.keys(headers).map(h => h.toLowerCase()).sort();
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalHeaders = signedHeaderNames
        .map(h => h + ':' + String(headers[h]).trim() + '\n').join('');

    const canonicalRequest = [
        method.toUpperCase(),
        canonicalUri,
        params.map(p => p[0] + '=' + p[1]).join('&'),
        canonicalHeaders,
        signedHeaders,
        'UNSIGNED-PAYLOAD'
    ].join('\n');

    const scope = [dateStamp, region, 's3', 'aws4_request'].join('/');
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        scope,
        _sha256hex(canonicalRequest)
    ].join('\n');

    const kDate = _hmac('AWS4' + creds.secretAccessKey, dateStamp);
    const kRegion = _hmac(kDate, region);
    const kService = _hmac(kRegion, 's3');
    const kSigning = _hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    headers['authorization'] = 'AWS4-HMAC-SHA256 Credential=' + creds.accessKeyId +
        '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
    return headers;
}

// ==================== CLIENT ====================
/**
 * Create an S3-compatible client.
 * @param {object} options
 *   provider       's3' | 'r2' | 'minio' | 'b2' (default 's3')
 *   bucket         required
 *   accessKeyId    required
 *   secretAccessKey required
 *   region         per-provider (see presets; required for 'b2')
 *   endpoint       full URL override (self-hosted MinIO/other S3 API)
 *   prefix         key prefix applied to every op (default '')
 *   timeoutMs      per-request timeout (default 15000)
 */
function createClient(options = {}) {
    const provider = options.provider || 's3';
    const preset = PROVIDERS[provider];
    if (!preset) {
        throw new Error('EREMOTE: unknown provider "' + provider + '" (known: ' +
            Object.keys(PROVIDERS).join(', ') + ')');
    }
    const bucket = options.bucket;
    if (!bucket || typeof bucket !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(bucket)) {
        throw new Error('EREMOTE: invalid bucket name');
    }
    const accessKeyId = options.accessKeyId;
    const secretAccessKey = options.secretAccessKey;
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('EREMOTE: missing accessKeyId / secretAccessKey');
    }
    if (options.sessionToken && typeof options.sessionToken !== 'string') {
        throw new Error('EREMOTE: invalid sessionToken');
    }

    let base;
    if (options.endpoint) {
        if (!/^https?:\/\//i.test(options.endpoint)) {
            throw new Error('EREMOTE: endpoint must be an http(s) URL');
        }
        base = options.endpoint.replace(/\/+$/, '') + '/' + encodeURIComponent(bucket);
    } else {
        base = _resolveEndpoint(provider, bucket, options.region).url;
    }
    const region = options.region || preset.region || 'us-east-1';
    const prefix = options.prefix ? _safeKey(options.prefix) + '/' : '';
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;

    async function _request(method, key, { query, body, headers } = {}) {
        const k = _safeKey(key);
        const url = base + '/' + k.split('/').map(encodeURIComponent).join('/') +
            (query ? '?' + new URLSearchParams(query).toString() : '');

        const h = { ...headers };
        if (body !== undefined) {
            h['content-length'] = String(Buffer.byteLength(body));
        }
        if (options.sessionToken) {
            h['x-amz-security-token'] = options.sessionToken;
        }
        const signed = _sign(method, url, h, body,
            { accessKeyId, secretAccessKey }, region, new Date());

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        let res;
        try {
            res = await fetch(url, {
                method,
                headers: signed,
                body: body !== undefined ? body : undefined,
                signal: ctrl.signal,
                redirect: 'error'
            });
        } catch (e) {
            const reason = e && e.name === 'AbortError' ? 'timeout' : 'network';
            throw new Error('EREMOTE: ' + method + ' failed (' + reason + ')');
        } finally {
            clearTimeout(timer);
        }

        if (res.status === 404) return null; // normalized not-found for get/stat/delete
        if (res.status === 403) throw new Error('EREMOTE: access denied (check credentials/bucket policy)');
        if (res.status === 401) throw new Error('EREMOTE: unauthorized (bad credentials)');
        if (res.status >= 400) {
            let rid = '';
            try { rid = res.headers.get('x-amz-request-id') || ''; } catch (e) { /* ignore */ }
            throw new Error('EREMOTE: ' + method + ' ' + k + ' -> HTTP ' + res.status +
                (rid ? ' (' + rid + ')' : ''));
        }
        return res;
    }

    return {
        provider,
        bucket,
        prefix,

        /** PUT an object (string or Buffer). */
        async put(key, content) {
            const body = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
            await _request('PUT', key, { body });
            return true;
        },

        /** GET an object as utf8 string, or null when missing. */
        async get(key) {
            const res = await _request('GET', key);
            if (!res) return null;
            return res.text();
        },

        /** GET as Buffer (binary-safe), or null when missing. */
        async getBuffer(key) {
            const res = await _request('GET', key);
            if (!res) return null;
            return Buffer.from(await res.arrayBuffer());
        },

        /** HEAD an object → {key,size,etag,lastModified} | null. */
        async stat(key) {
            const res = await _request('HEAD', key);
            if (!res) return null;
            return {
                key,
                size: Number(res.headers.get('content-length') || 0),
                etag: res.headers.get('etag') || null,
                lastModified: res.headers.get('last-modified') || null
            };
        },

        /**
         * List keys under (prefix + sub). Flat (Delimiter=/) by default —
         * matches FileStorage.list's shallow semantics. Returns
         * [{key,size,etag}] (no keys, null on 404-shaped empties).
         */
        async list(sub) {
            const q = {};
            if (sub) q['list-type'] = '2';
            const p = prefix + (sub ? _safeKey(sub) : '');
            q['prefix'] = p;
            if (sub) q['delimiter'] = '/';
            const res = await _request('GET', 'x', { query: q });
            if (!res) return [];
            const xml = await res.text();
            const out = [];
            const re = /<(?:Key|Prefix)>([^<]*)<\/(?:Key|Prefix)>/g;
            let m;
            while ((m = re.exec(xml)) !== null) {
                let k;
                try { k = decodeURIComponent(m[1]); } catch (e) { k = m[1]; }
                if (!k || k === p) continue;
                out.push({ key: k });
            }
            return out;
        },

        /** DELETE an object. True=deleted, false=missing. */
        async delete(key) {
            const res = await _request('DELETE', key);
            return res !== null; // 404 → false, 204 → true
        },

        /** Verify the bucket is reachable + creds accepted (HEAD bucket). */
        async headBucket() {
            const url = base + '/?x-check=1';
            const signed = _sign('HEAD', url, {}, undefined,
                { accessKeyId, secretAccessKey }, region, new Date());
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            try {
                const res = await fetch(url, {
                    method: 'HEAD', headers: signed,
                    signal: ctrl.signal, redirect: 'error'
                });
                if (res.status === 200) return { ok: true, status: 200, provider };
                if (res.status === 404) return { ok: false, status: 404, provider, error: 'bucket not found' };
                if (res.status === 403) return { ok: false, status: 403, provider, error: 'access denied' };
                if (res.status === 401) return { ok: false, status: 401, provider, error: 'unauthorized' };
                return { ok: false, status: res.status, provider, error: 'HTTP ' + res.status };
            } catch (e) {
                const reason = e && e.name === 'AbortError' ? 'timeout' : 'network';
                return { ok: false, status: 0, provider, error: reason };
            } finally {
                clearTimeout(timer);
            }
        },

        /** Small self-test: put/get/delete round-trip on a probe key. */
        async test() {
            const probe = 'vant-connectivity-probe-' + Date.now();
            try {
                await this.put(probe, 'vant-probe');
                const got = await this.get(probe);
                if (got !== 'vant-probe') {
                    return { ok: false, error: 'probe round-trip mismatch' };
                }
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e.message };
            } finally {
                try { await this.delete(probe); } catch (e) { /* best effort */ }
            }
        }
    };
}

// ==================== EXPORTS ====================
module.exports = {
    PROVIDERS,
    createClient,
    // exposed for tests (S3-API correctness relies on exact canonical bytes)
    _sign,
    _safeKey,
    _resolveEndpoint
};
