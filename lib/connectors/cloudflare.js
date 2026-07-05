/**
 * Cloudflare Connector (v0.9.0)
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

// Lazy-load config
let _config = null;
function _getConfig() {
  if (!_config) _config = require('../config');
  return _config;
}

// Config - uses config module for consistency
let _cfg = null;
function _loadConfig() {
  const cfg = _getConfig();
  return {
    accountId: cfg.cfAccountId(),
    apiToken: cfg.cfApiToken(),
    pagesUrl: cfg.cfPagesUrl(),
    kvNamespace: cfg.cfKvNamespace(),
    r2Bucket: cfg.cfR2Bucket(),
    workerUrl: cfg.cfWorkerUrl(),
    workerName: cfg.cfWorkerName(),
  };
}
function _getCfg() {
  if (!_cfg) _cfg = _loadConfig();
  return _cfg;
}

// Auth helper
function _auth(opts = {}) {
  const cfg = _getCfg();
  if (!cfg.apiToken) return opts;
  return {
    ...opts,
    headers: {
      ...opts.headers,
      'Authorization': `Bearer ${cfg.apiToken}`,
      'Content-Type': 'application/json',
    }
  };
}

// Functions
function configure(o) { _cfg = { ..._getCfg(), ...o }; }
function getConfig() { return { ..._getCfg() }; }
function getStatus() {
  const cfg = _getCfg();
  return { connected: !!cfg.pagesUrl, config: {
    hasAccountId: !!cfg.accountId, hasApiToken: !!cfg.apiToken, hasPagesUrl: !!cfg.pagesUrl,
    hasKvNamespace: !!cfg.kvNamespace, hasR2Bucket: !!cfg.r2Bucket, hasWorkerUrl: !!cfg.workerUrl
  }};
}
function getLayerStatus() { const cfg = _getCfg(); return { name: 'Cloudflare', type: 'connector', version: '0.9.0', connected: !!cfg.pagesUrl }; }
function isOperationAllowed(op) { const cfg = _getCfg(); return { allowed: !!cfg.pagesUrl, layer: 'Cloudflare' }; }

function _parse(t) { try { return JSON.parse(t); } catch { return t; } }

// Pages Functions
async function callPages(path, opts) {
  const cfg = _getCfg();
  const { method = 'POST', body } = opts || {};
  if (!cfg.pagesUrl) throw new (_getErrors().Error)('CF_PAGES_URL not set', { code: _getErrors().CODES.NETWORK_HOST_UNREACHABLE, retryable: false });
  const txt = await _getNetwork().fetch(cfg.pagesUrl + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, circuit: false });
  _emit('cf:pages:call', { path, method, timestamp: Date.now() });
  return { ok: true, data: _parse(txt) };
}

async function handshake(cid, idy) { return (await callPages('/sync', { body: { action: 'handshake', chainId: cid, identity: idy } })).data; }
async function push(cid, seq, data) { return (await callPages('/sync', { body: { action: 'push', chainId: cid, seq, data } })).data; }
async function pull(cid, since) { return (await callPages('/sync', { body: { action: 'pull', chainId: cid, since } })).data; }

// KV
async function kvGet(key) {
  const cfg = _getCfg();
  if (!cfg.accountId || !cfg.kvNamespace) throw new (_getErrors().Error)('KV not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + cfg.accountId + "/storage/kv/namespaces/" + cfg.kvNamespace + "/values/" + encodeURIComponent(key);
  const txt = await _getNetwork().fetch(url, _auth({ method: 'GET' }));
  _emit('cf:kv:get', { key, timestamp: Date.now() });
  return txt;
}

async function kvPut(key, val, opt) {
  const cfg = _getCfg();
  if (!cfg.accountId || !cfg.kvNamespace) throw new (_getErrors().Error)('KV not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + cfg.accountId + "/storage/kv/namespaces/" + cfg.kvNamespace + "/values/" + encodeURIComponent(key);
  const body = JSON.stringify({ value: val, expiration: opt?.expiration });
  await _getNetwork().fetch(url, _auth({ method: 'PUT', body }));
  _emit('cf:kv:put', { key, timestamp: Date.now() });
  return { ok: true };
}

async function kvDelete(key) {
  const cfg = _getCfg();
  if (!cfg.accountId || !cfg.kvNamespace) throw new (_getErrors().Error)('KV not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + cfg.accountId + "/storage/kv/namespaces/" + cfg.kvNamespace + "/values/" + encodeURIComponent(key);
  await _getNetwork().fetch(url, _auth({ method: 'DELETE' }));
  _emit('cf:kv:delete', { key, timestamp: Date.now() });
  return { ok: true };
}

// R2 (using Cloudflare API - S3-compatible with Bearer auth)
async function r2Get(key) {
  const cfg = _getCfg();
  if (!cfg.accountId || !cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + cfg.accountId + "/r2/buckets/" + cfg.r2Bucket + "/objects/" + encodeURIComponent(key);
  const res = await _getNetwork().fetch(url, _auth({ method: 'GET' }));
  _emit('cf:r2:get', { key, timestamp: Date.now() });
  return { body: res, contentType: 'application/octet-stream' };
}

async function r2Put(key, body, opt) {
  const cfg = _getCfg();
  if (!cfg.accountId || !cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + cfg.accountId + "/r2/buckets/" + cfg.r2Bucket + "/objects/" + encodeURIComponent(key);
  const contentType = (opt && opt.contentType) || 'application/octet-stream';
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  await _getNetwork().fetch(url, _auth({ method: 'PUT', headers: { 'Content-Type': contentType }, body: bodyStr }));
  _emit('cf:r2:put', { key, timestamp: Date.now() });
  return { ok: true };
}

async function r2List(prefix = '') {
  const cfg = _getCfg();
  if (!cfg.accountId || !cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const url = "https://api.cloudflare.com/client/v4/accounts/" + cfg.accountId + "/r2/buckets/" + cfg.r2Bucket + "/objects?prefix=" + encodeURIComponent(prefix);
  const res = await _getNetwork().fetch(url, _auth({ method: 'GET' }));
  const data = _parse(res);
  const objs = (data.objects || []).map(o => ({ key: o.key, size: o.size, etag: o.etag }));
  _emit('cf:r2:list', { prefix, count: objs.length, timestamp: Date.now() });
  return { objects: objs, prefix };
}

// Workers
async function workerCall(name, body) {
  const cfg = _getCfg();
  // Priority: name param > workerUrl config > workerName config
  const url = name || cfg.workerUrl || (cfg.workerName ? "https://" + cfg.workerName + ".workers.dev" : null);
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

module.exports = { version: '0.9.0', configure, getConfig, getStatus, getLayerStatus, isOperationAllowed, connect, disconnect, callPages, handshake, push, pull, kvGet, kvPut, kvDelete, r2Get, r2Put, r2List, workerCall };