/**
 * Cloudflare Connector (v0.9.0-axolotl) — R2 object storage ONLY
 *
 * Scope decision (dhaupin, 2026-09-22): the legacy Pages-sync relay,
 * Workers KV, and Workers-invoke halves were museum pieces — no consumers
 * ever wired them, and their server-side counterpart (srv/cloudflare/
 * Pages Functions) was never deployed. They are removed; git history
 * keeps them. The adapter layer (lib/adapters/cloudflare.js) that
 * transported over them is removed with them.
 *
 * What remains is the one piece that earns its place: R2 object ops,
 * delegated to the S3-API client in connectors/s3.js against R2's native
 * S3 endpoint (SigV4 with R2 access keys — the legacy control-plane
 * Bearer token never authorized object-store ops correctly). For general
 * S3-compatible storage
 * (S3/MinIO/B2 too) use require('./connectors/s3').createClient directly;
 * RemoteStorage (getStorage('remote')) is the store-level integration.
 *
 * NOTE: r2Get returns body: null for missing keys (S3 404 normalization).
 * TEST DI: _setR2TestClient injection point (test/cloudflare-r2.test.js).
 */

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

// Config: R2 credentials + bucket. accountId doubles as the R2 endpoint
// account id (region fallback) — it is NOT a secret.
let _cfg = {
  accountId: process.env.CF_ACCOUNT_ID,
  r2Bucket: process.env.CF_R2_BUCKET,
  r2AccessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
  r2Jurisdiction: process.env.CF_R2_JURISDICTION,
  r2Endpoint: process.env.CF_R2_ENDPOINT,
};

function _r2Ready() { return !!(_cfg.r2Bucket && _cfg.r2AccessKeyId && _cfg.r2SecretAccessKey); }

// Functions
function configure(o) { _cfg = { ..._cfg, ...o }; }
// getConfig(): secrets REDACTED (set/unset markers) — config summary,
// never a credential source. getStatus() reports boolean flags only.
function getConfig() {
  return {
    ..._cfg,
    r2SecretAccessKey: _cfg.r2SecretAccessKey ? '***set***' : undefined
  };
}
function getStatus() {
  return { connected: _r2Ready(), config: {
    hasAccountId: !!_cfg.accountId,
    hasR2Bucket: !!_cfg.r2Bucket,
    hasR2Keys: !!(_cfg.r2AccessKeyId && _cfg.r2SecretAccessKey),
    hasR2Jurisdiction: !!_cfg.r2Jurisdiction,
    hasR2Endpoint: !!_cfg.r2Endpoint
  }};
}
function getLayerStatus() { return { name: 'Cloudflare', type: 'connector', version: '0.8.6', connected: _r2Ready() }; }
function isOperationAllowed(op) { return { allowed: _r2Ready(), layer: 'Cloudflare' }; }

// R2 object ops via the S3-API client (connectors/s3.js)
let _r2TestClient = null;
function _r2Client() {
  if (_r2TestClient) return _r2TestClient;
  if (!_r2Ready()) {
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

async function r2Delete(key) {
  const c = _r2Client();
  const deleted = await c.delete(key);
  _emit('cf:r2:delete', { key, deleted, timestamp: Date.now() });
  return { ok: true, deleted };
}

module.exports = { version: '0.8.6', configure, getConfig, getStatus, getLayerStatus, isOperationAllowed, r2Get, r2Put, r2List, r2Delete, _r2Client, _setR2TestClient };
