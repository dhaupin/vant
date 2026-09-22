/**
 * Cloudflare Connector (v0.8.6)
 * WITH EVENT EMISSIONS
 * Uses OS: network.fetch (returns text, throws on HTTP error)
 */

// Lazy-load OS modules (like brain.js pattern)
let _network = null;
function _getNetwork() {
  if (!_network) _network = require('../network');
  return _network;
}

let _errors = null;
function _getErrors() {
  if (!_errors) _errors = require('../error');
  return _errors;
}

let _event = null;
function _emit(event, data) {
  if (!_event) { try { _event = require('../event'); } catch (e) { return; } }
  if (_event && _event.emit) _event.emit(event, data);
}

// Config
// R2 auth split (v0.9.0-axolotl): R2 OBJECT ops use S3 access keys
// (CF_R2_ACCESS_KEY_ID / CF_R2_SECRET_ACCESS_KEY, optional
// CF_R2_JURISDICTION / CF_R2_ENDPOINT) via the S3-API client in
// connectors/s3.js. CF_API_TOKEN remains the CONTROL-plane credential
// (KV/Pages/Workers) — it never authorized object-store ops correctly.
let _cfg = {
  accountId: process.env.CF_ACCOUNT_ID,
  apiToken: process.env.CF_API_TOKEN,
  r2AccessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
  r2Jurisdiction: process.env.CF_R2_JURISDICTION,
  r2Endpoint: process.env.CF_R2_ENDPOINT,
  pagesUrl: process.env.CF_PAGES_URL,
  kvNamespace: process.env.CF_KV_NAMESPACE,
  r2Bucket: process.env.CF_R2_BUCKET,
  workerUrl: process.env.CF_WORKER_URL,
  workerName: process.env.CF_WORKER_NAME,
};

// Auth helper
function _auth(opts = {}) {
  if (!_cfg.apiToken) return opts;
  return {
    ...opts,
    headers: {
      ...opts.headers,
      'Authorization': `Bearer ${_cfg.apiToken}`,
      'Content-Type': 'application/json',
    }
  };
}

// Functions
function configure(o) { _cfg = { ..._cfg, ...o }; }
// getConfig(): secrets REDACTED (set/unset booleans) — config summary,
// never a credential source. getStatus() reports has* flags only.
function getConfig() {
  return {
    ..._cfg,
    apiToken: _cfg.apiToken ? '***set***' : undefined,
    r2SecretAccessKey: _cfg.r2SecretAccessKey ? '***set***' : undefined
  };
}
function getStatus() {
  return { connected: !!_cfg.pagesUrl, config: {
    hasAccountId: !!_cfg.accountId, hasApiToken: !!_cfg.apiToken, hasPagesUrl: !!_cfg.pagesUrl,
    hasKvNamespace: !!_cfg.kvNamespace, hasR2Bucket: !!_cfg.r2Bucket, hasR2Keys: !!(_cfg.r2AccessKeyId && _cfg.r2SecretAccessKey), hasWorkerUrl: !!_cfg.workerUrl
  }};
}
function getLayerStatus() { return { name: 'Cloudflare', type: 'connector', version: '0.8.6', connected: !!_cfg.pagesUrl }; }
function isOperationAllowed(op) { return { allowed: !!_cfg.pagesUrl, layer: 'Cloudflare' }; }

function _parse(t) { try { return JSON.parse(t); } catch { return t; } }

// Pages Functions
async function callPages(path, opts) {
  const { method = 'POST', body } = opts || {};
  if (!_cfg.pagesUrl) throw new (_getErrors().Error)('CF_PAGES_URL not set', { code: _getErrors().CODES.NETWORK_HOST_UNREACHABLE, retryable: false });
  const txt = await _getNetwork().fetch(_cfg.pagesUrl + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, circuit: false });
  _emit('cf:pages:call', { path, method, timestamp: Date.now() });
  return { ok: true, data: _parse(txt) };
}

async function handshake(cid, idy) { return (await callPages('/sync', { body: { action: 'handshake', chainId: cid, identity: idy } })).data; }
async function push(cid, seq, data) { return (await callPages('/sync', { body: { action: 'push', chainId: cid, seq, data } })).data; }
async function pull(cid, since) { return (await callPages('/sync', { body: { action: 'pull', chainId: cid, since } })).data; }

// KV
async function kvGet(key) {
  if (!_cfg.accountId || !_cfg.kvNamespace) throw new (_getErrors().Error)('KV not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/storage/kv/namespaces/" + _cfg.kvNamespace + "/values/" + encodeURIComponent(key);
  const txt = await _getNetwork().fetch(url, _auth({ method: 'GET' }));
  _emit('cf:kv:get', { key, timestamp: Date.now() });
  return txt;
}

async function kvPut(key, val, opt) {
  if (!_cfg.accountId || !_cfg.kvNamespace) throw new (_getErrors().Error)('KV not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/storage/kv/namespaces/" + _cfg.kvNamespace + "/values/" + encodeURIComponent(key);
  const body = JSON.stringify({ value: val, expiration: opt?.expiration });
  await _getNetwork().fetch(url, _auth({ method: 'PUT', body }));
  _emit('cf:kv:put', { key, timestamp: Date.now() });
  return { ok: true };
}

async function kvDelete(key) {
  if (!_cfg.accountId || !_cfg.kvNamespace) throw new (_getErrors().Error)('KV not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/storage/kv/namespaces/" + _cfg.kvNamespace + "/values/" + encodeURIComponent(key);
  await _getNetwork().fetch(url, _auth({ method: 'DELETE' }));
  _emit('cf:kv:delete', { key, timestamp: Date.now() });
  return { ok: true };
}

// R2 object ops (v0.9.0-axolotl): delegated to the S3-API client in
// connectors/s3.js against R2's NATIVE S3 endpoint (SigV4 with R2 access
// keys). Replaces the old control-plane implementation (api.cloudflare.com
// + CF_API_TOKEN Bearer) which had no delete op and conflated the CF
// control token with object-store credentials. NOTE: r2Get now returns
// body: null for missing keys (S3 404 normalization) instead of throwing.
// TEST DI: _r2TestClient injection point (test/cloudflare-r2.test.js).
let _r2TestClient = null;
function _r2Client() {
  if (_r2TestClient) return _r2TestClient;
  if (!_cfg.r2Bucket || !_cfg.r2AccessKeyId || !_cfg.r2SecretAccessKey) {
    throw new (_getErrors().Error)('R2 not configured (need CF_R2_BUCKET, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY)', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  }
  const { createClient } = require('./s3');
  return createClient({
    provider: 'r2',
    bucket: _cfg.r2Bucket,
    region: _cfg.r2Jurisdiction || _cfg.accountId,
    endpoint: _cfg.r2Endpoint || undefined,
    accessKeyId: _cfg.r2AccessKeyId,
    secretAccessKey: _cfg.r2SecretAccessKey
  });
}

/** TEST DI: inject a fake S3 client (test/cloudflare-r2.test.js). */
function _setR2TestClient(c) { _r2TestClient = c; }

async function r2Get(key) {
  const c = _r2Client();
  const body = await c.get(key);
  _emit('cf:r2:get', { key, timestamp: Date.now() });
  return { body, contentType: 'application/octet-stream' };
}

async function r2Put(key, body, opt) {
  const c = _r2Client();
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  await c.put(key, payload, { contentType: (opt && opt.contentType) || 'application/octet-stream' });
  _emit('cf:r2:put', { key, timestamp: Date.now() });
  return { ok: true };
}

async function r2List(prefix = '') {
  const c = _r2Client();
  const items = await c.list(prefix);
  const objs = items.map(o => ({ key: o.key, size: o.size, etag: o.etag }));
  _emit('cf:r2:list', { prefix, count: objs.length, timestamp: Date.now() });
  return { objects: objs, prefix };
}

// NEW: the control-plane API had no delete — the S3 client does.
async function r2Delete(key) {
  const c = _r2Client();
  const deleted = await c.delete(key);
  _emit('cf:r2:delete', { key, deleted, timestamp: Date.now() });
  return { ok: true, deleted };
}

// Workers
async function workerCall(name, body) {
  // Priority: name param > workerUrl config > workerName config
  const url = name || _cfg.workerUrl || (_cfg.workerName ? "https://" + _cfg.workerName + ".workers.dev" : null);
  if (!url) throw new (_getErrors().Error)('Worker required', { code: _getErrors().CODES.RUNTIME_EXECUTION_FAILED });
  const data = await _getNetwork().fetch(url, _auth({ method: 'POST', body: JSON.stringify(body) }));
  _emit('cf:worker:call', { worker: url, timestamp: Date.now() });
  return data;
}

// Connection
async function connect(opt) {
  if (opt) configure(opt);
  try { await callPages('/sync', { method: 'GET' }); } catch (e) { throw new (_getErrors().Error)('CF connect: ' + e.message, { code: _getErrors().CODES.NETWORK_HOST_UNREACHABLE, retryable: true }); }
  _emit('cf:connect', { timestamp: Date.now() });
  return { connected: true };
}

async function disconnect() { _emit('cf:disconnect', { timestamp: Date.now() }); return { disconnected: true }; }

module.exports = { version: '0.8.6', configure, getConfig, getStatus, getLayerStatus, isOperationAllowed, connect, disconnect, callPages, handshake, push, pull, kvGet, kvPut, kvDelete, r2Get, r2Put, r2List, r2Delete, workerCall, _r2Client, _setR2TestClient };