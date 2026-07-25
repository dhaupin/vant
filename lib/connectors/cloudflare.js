/**
 * Cloudflare Connector (v0.8.6)
 * WITH EVENT EMISSIONS
 * Uses OS: network.fetch (returns text, throws on HTTP error)
 */

// Lazy-load OS modules (like brain.js pattern)
let _network = null;
function _getNetwork() {
  if (!_network) _network = require('./network');
  return _network;
}

let _errors = null;
function _getErrors() {
  if (!_errors) _errors = require('./error');
  return _errors;
}

let _event = null;
function _emit(event, data) {
  if (!_event) { try { _event = require('./event'); } catch (e) { return; } }
  if (_event && _event.emit) _event.emit(event, data);
}

// Config
let _cfg = {
  accountId: process.env.CF_ACCOUNT_ID,
  apiToken: process.env.CF_API_TOKEN,
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
function getConfig() { return { ..._cfg }; }
function getStatus() {
  return { connected: !!_cfg.pagesUrl, config: {
    hasAccountId: !!_cfg.accountId, hasApiToken: !!_cfg.apiToken, hasPagesUrl: !!_cfg.pagesUrl,
    hasKvNamespace: !!_cfg.kvNamespace, hasR2Bucket: !!_cfg.r2Bucket, hasWorkerUrl: !!_cfg.workerUrl
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

// R2 (using Cloudflare API - S3-compatible with Bearer auth)
async function r2Get(key) {
  if (!_cfg.accountId || !_cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/r2/buckets/" + _cfg.r2Bucket + "/objects/" + encodeURIComponent(key);
  const res = await _getNetwork().fetch(url, _auth({ method: 'GET' }));
  _emit('cf:r2:get', { key, timestamp: Date.now() });
  return { body: res, contentType: 'application/octet-stream' };
}

async function r2Put(key, body, opt) {
  if (!_cfg.accountId || !_cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/r2/buckets/" + _cfg.r2Bucket + "/objects/" + encodeURIComponent(key);
  const contentType = (opt && opt.contentType) || 'application/octet-stream';
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  await _getNetwork().fetch(url, _auth({ method: 'PUT', headers: { 'Content-Type': contentType }, body: bodyStr }));
  _emit('cf:r2:put', { key, timestamp: Date.now() });
  return { ok: true };
}

async function r2List(prefix = '') {
  if (!_cfg.accountId || !_cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/r2/buckets/" + _cfg.r2Bucket + "/objects?prefix=" + encodeURIComponent(prefix);
  const res = await _getNetwork().fetch(url, _auth({ method: 'GET' }));
  const data = _parse(res);
  const objs = (data.objects || []).map(o => ({ key: o.key, size: o.size, etag: o.etag }));
  _emit('cf:r2:list', { prefix, count: objs.length, timestamp: Date.now() });
  return { objects: objs, prefix };
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

module.exports = { version: '0.8.6', configure, getConfig, getStatus, getLayerStatus, isOperationAllowed, connect, disconnect, callPages, handshake, push, pull, kvGet, kvPut, kvDelete, r2Get, r2Put, r2List, workerCall };