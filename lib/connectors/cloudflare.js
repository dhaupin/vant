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

// Config
let _cfg = {
  accountId: process.env.CF_ACCOUNT_ID,
  kvNamespace: process.env.CF_KV_NAMESPACE,
  r2Bucket: process.env.CF_R2_BUCKET,
  workerName: process.env.CF_WORKER_NAME,
  pagesUrl: process.env.CF_PAGES_URL,
};

// Functions
function configure(o) { _cfg = { ..._cfg, ...o }; }
function getConfig() { return { ..._cfg }; }
function getStatus() {
  return { connected: !!_cfg.pagesUrl, config: {
    hasAccountId: !!_cfg.accountId, hasPagesUrl: !!_cfg.pagesUrl,
    hasKvNamespace: !!_cfg.kvNamespace, hasR2Bucket: !!_cfg.r2Bucket
  }};
}
function getLayerStatus() { return { name: 'Cloudflare', type: 'connector', version: '0.9.0', connected: !!_cfg.pagesUrl }; }
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
  const txt = await _getNetwork().fetch("https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/storage/kv/namespaces/" + _cfg.kvNamespace + "/values/" + encodeURIComponent(key), { method: 'GET' });
  _emit('cf:kv:get', { key, timestamp: Date.now() });
  return txt;
}

async function kvPut(key, val, opt) {
  if (!_cfg.accountId || !_cfg.kvNamespace) throw new (_getErrors().Error)('KV not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  let b = 'value=' + encodeURIComponent(val);
  if (opt && opt.expiration) b += '&expiration=' + opt.expiration;
  await _getNetwork().fetch("https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/storage/kv/namespaces/" + _cfg.kvNamespace + "/values/" + encodeURIComponent(key), { method: 'PUT', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b });
  _emit('cf:kv:put', { key, timestamp: Date.now() });
  return { ok: true };
}

async function kvDelete(key) {
  if (!_cfg.accountId || !_cfg.kvNamespace) throw new (_getErrors().Error)('KV not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  await _getNetwork().fetch("https://api.cloudflare.com/client/v4/accounts/" + _cfg.accountId + "/storage/kv/namespaces/" + _cfg.kvNamespace + "/values/" + encodeURIComponent(key), { method: 'DELETE' });
  _emit('cf:kv:delete', { key, timestamp: Date.now() });
  return { ok: true };
}

// R2
async function r2Get(key) {
  if (!_cfg.accountId || !_cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const body = await _getNetwork().fetch("https://r2.cloudflarestorage.com/" + _cfg.r2Bucket + "/" + key, { method: 'GET' });
  _emit('cf:r2:get', { key, timestamp: Date.now() });
  return { body, contentType: 'application/octet-stream' };
}

async function r2Put(key, body, opt) {
  if (!_cfg.accountId || !_cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  await _getNetwork().fetch("https://r2.cloudflarestorage.com/" + _cfg.r2Bucket + "/" + key, { method: 'PUT', headers: { 'Content-Type': (opt && opt.contentType) || 'application/octet-stream' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  _emit('cf:r2:put', { key, timestamp: Date.now() });
  return { ok: true };
}

async function r2List(pref) {
  pref = pref || '';
  if (!_cfg.accountId || !_cfg.r2Bucket) throw new (_getErrors().Error)('R2 not configured', { code: _getErrors().CODES.STORAGE_NOT_FOUND });
  const xml = await _getNetwork().fetch("https://r2.cloudflarestorage.com/" + _cfg.r2Bucket + "?list-type=2&prefix=" + encodeURIComponent(pref), { method: 'GET' });
  const objs = []; var re = /<Key>([^<]+)<\/Key>/g, m;
  while ((m = re.exec(xml))) objs.push({ key: m[1] });
  _emit('cf:r2:list', { prefix: pref, count: objs.length, timestamp: Date.now() });
  return { objects: objs, prefix: pref };
}

// Workers
async function workerCall(name, body) {
  const wrkr = name || _cfg.workerName;
  if (!wrkr) throw new (_getErrors().Error)('Worker required', { code: _getErrors().CODES.RUNTIME_EXECUTION_FAILED });
  const data = await _getNetwork().fetch("https://" + wrkr + ".workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  _emit('cf:worker:call', { worker: wrkr, timestamp: Date.now() });
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