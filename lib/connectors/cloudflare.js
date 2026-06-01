/**
 * Cloudflare Connector (v0.9.0)
 * WITH EVENT EMISSIONS - all operations emit globally
 * 
 * Connects vant to Cloudflare:
 * - CF Pages Functions (via /functions/*)
 * - CF Workers (via workers.dev or custom)
 * - CF KV (key-value)
 * - CF R2 (object storage)
 * - CF Durable Objects
 * 
 * Transport for adapters/cloudflare.js
 */

const fetch = require('node-fetch');
const errors = require('./error');
const encrypt = require('./encrypt');

// Event emission
let _event = null;
function _emit(event, data) {
  if (!_event) {
    try { _event = require('./event'); } catch (e) { return; }
  }
  if (_event && _event.emit) {
    _event.emit(event, data);
  }
}

// ==================== CONFIG ====================

const DEFAULT_CONFIG = {
  accountId: process.env.CF_ACCOUNT_ID,
  kvNamespace: process.env.CF_KV_NAMESPACE,
  r2Bucket: process.env.CF_R2_BUCKET,
  workerName: process.env.CF_WORKER_NAME,
  pagesUrl: process.env.CF_PAGES_URL,
};

let _config = { ...DEFAULT_CONFIG };
let _connected = false;

/**
 * Configure connector
 */
function configure(options = {}) {
  _config = { ..._config, ...options };
}

/**
 * Get config
 */
function getConfig() {
  return { ..._config };
}

/**
 * Get layer status
 */
function getLayerStatus() {
  return { 
    name: 'Cloudflare', 
    type: 'connector', 
    version: '0.9.0', 
    connected: _connected 
  };
}

/**
 * Check operation allowed
 */
function isOperationAllowed(operation) {
  if (!_connected) {
    return { allowed: false, reason: 'not connected', layer: 'Cloudflare' };
  }
  return { allowed: true, layer: 'Cloudflare' };
}

// ==================== PAGES FUNCTIONS ====================

/**
 * Call CF Pages Function endpoint
 */
async function callPages(path, options = {}) {
  const { method = 'POST', body, headers = {} } = options;
  
  if (!_config.pagesUrl) {
    throw new errors.Error('CF_PAGES_URL not configured', { 
      code: errors.CODES.NETWORK_HOST_UNREACHABLE, 
      retryable: false 
    });
  }

  const url = `${_config.pagesUrl}${path}`;
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data;
    
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    // EVENT: pages:call
    _emit('cf:pages:call', { path, method, status: response.status });

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (e) {
    throw new errors.Error('CF Pages call failed: ' + e.message, {
      code: errors.CODES.NETWORK_REQUEST_FAILED,
      retryable: true,
    });
  }
}

// ==================== SYNC API ====================

/**
 * Handshake - init sync chain
 */
async function handshake(chainId, identity = {}) {
  const result = await callPages('/sync', {
    method: 'POST',
    body: { action: 'handshake', chainId, identity },
  });
  
  _emit('cf:sync:handshake', { chainId, timestamp: Date.now() });
  
  return result.data;
}

/**
 * Push - save encrypted blob
 */
async function push(chainId, seq, data) {
  const result = await callPages('/sync', {
    method: 'POST',
    body: { action: 'push', chainId, seq, data },
  });
  
  _emit('cf:sync:push', { chainId, seq, timestamp: Date.now() });
  
  return result.data;
}

/**
 * Pull - fetch blobs since seq
 */
async function pull(chainId, since = 0) {
  const result = await callPages('/sync', {
    method: 'POST',
    body: { action: 'pull', chainId, since },
  });
  
  _emit('cf:sync:pull', { chainId, since, timestamp: Date.now() });
  
  return result.data;
}

// ==================== KV ====================

/**
 * Get value from KV
 */
async function kvGet(key) {
  if (!_config.accountId || !_config.kvNamespace) {
    throw new errors.Error('KV not configured', {
      code: errors.CODES.STORAGE_NOT_FOUND,
      retryable: false,
    });
  }

  // Using CF API
  const url = `https://api.cloudflare.com/client/v4/accounts/${_config.accountId}/storage/kv/namespaces/${_config.kvNamespace}/values/${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${_config.apiToken}`,
    },
  });

  if (!response.ok) {
    throw new errors.Error('KV get failed', {
      code: errors.CODES.STORAGE_READ_FAILED,
      retryable: true,
    });
  }

  _emit('cf:kv:get', { key, timestamp: Date.now() });

  return response.text();
}

/**
 * Put value to KV
 */
async function kvPut(key, value, options = {}) {
  const { expiration, expirationDelta } = options;

  if (!_config.accountId || !_config.kvNamespace) {
    throw new errors.Error('KV not configured', {
      code: errors.CODES.STORAGE_NOT_FOUND,
      retryable: false,
    });
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${_config.accountId}/storage/kv/namespaces/${_config.kvNamespace}/values/${encodeURIComponent(key)}`;

  const body = new URLSearchParams();
  body.append('value', value);

  if (expiration) {
    body.append('expiration', String(expiration));
  }
  if (expirationDelta) {
    body.append('expiration_delta', String(expirationDelta));
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${_config.apiToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new errors.Error('KV put failed', {
      code: errors.CODES.STORAGE_WRITE_FAILED,
      retryable: true,
    });
  }

  _emit('cf:kv:put', { key, timestamp: Date.now() });

  return { ok: true };
}

/**
 * Delete from KV
 */
async function kvDelete(key) {
  if (!_config.accountId || !_config.kvNamespace) {
    throw new errors.Error('KV not configured', {
      code: errors.CODES.STORAGE_NOT_FOUND,
      retryable: false,
    });
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${_config.accountId}/storage/kv/namespaces/${_config.kvNamespace}/values/${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${_config.apiToken}`,
    },
  });

  _emit('cf:kv:delete', { key, timestamp: Date.now() });

  return { ok: response.ok };
}

// ==================== R2 ====================

/**
 * Get object from R2
 */
async function r2Get(key) {
  if (!_config.accountId || !_config.r2Bucket) {
    throw new errors.Error('R2 not configured', {
      code: errors.CODES.STORAGE_NOT_FOUND,
      retryable: false,
    });
  }

  // R2 uses S3-compatible API
  const url = `https://r2.cloudflarestorage.com/${_config.r2Bucket}/${key}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${_config.r2Token}`,
    },
  });

  if (!response.ok) {
    throw new errors.Error('R2 get failed', {
      code: errors.CODES.STORAGE_READ_FAILED,
      retryable: true,
    });
  }

  _emit('cf:r2:get', { key, timestamp: Date.now() });

  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get('content-type'),
  };
}

/**
 * Put object to R2
 */
async function r2Put(key, body, options = {}) {
  const { contentType = 'application/octet-stream' } = options;

  if (!_config.accountId || !_config.r2Bucket) {
    throw new errors.Error('R2 not configured', {
      code: errors.CODES.STORAGE_NOT_FOUND,
      retryable: false,
    });
  }

  const url = `https://r2.cloudflarestorage.com/${_config.r2Bucket}/${key}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${_config.r2Token}`,
      'Content-Type': contentType,
    },
    body,
  });

  if (!response.ok) {
    throw new errors.Error('R2 put failed', {
      code: errors.CODES.STORAGE_WRITE_FAILED,
      retryable: true,
    });
  }

  _emit('cf:r2:put', { key, timestamp: Date.now() });

  return { ok: true };
}

/**
 * List R2 objects
 */
async function r2List(prefix = '') {
  if (!_config.accountId || !_config.r2Bucket) {
    throw new errors.Error('R2 not configured', {
      code: errors.CODES.STORAGE_NOT_FOUND,
      retryable: false,
    });
  }

  // Use S3 API list_objects_v2
  const url = `https://r2.cloudflarestorage.com/${_config.r2Bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${_config.r2Token}`,
    },
  });

  if (!response.ok) {
    throw new errors.Error('R2 list failed', {
      code: errors.CODES.STORAGE_LIST_FAILED,
      retryable: true,
    });
  }

  const xml = await response.text();

  // Simple XML parsing for objects
  const objects = [];
  const regex = /<Contents><Key>([^<]+)<\/Key><Size>([^<]+)<\/Size><\/Contents>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    objects.push({ key: match[1], size: parseInt(match[2], 10) });
  }

  _emit('cf:r2:list', { prefix, count: objects.length, timestamp: Date.now() });

  return { objects, prefix };
}

// ==================== WORKERS ====================

/**
 * Call CF Worker
 */
async function workerCall(name, body, options = {}) {
  const worker = name || _config.workerName;
  
  if (!worker) {
    throw new errors.Error('Worker name required', {
      code: errors.CODES.RUNTIME_EXECUTION_FAILED,
      retryable: false,
    });
  }

  const url = `https://${worker}.workers.dev`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    _emit('cf:worker:call', { worker, timestamp: Date.now() });

    return data;
  } catch (e) {
    throw new errors.Error('Worker call failed: ' + e.message, {
      code: errors.CODES.RUNTIME_EXECUTION_FAILED,
      retryable: true,
    });
  }
}

// ==================== CONNECTIVITY ====================

/**
 * Connect to Cloudflare
 */
async function connect(options = {}) {
  if (options) {
    configure(options);
  }

  // Verify connectivity
  try {
    await callPages('/sync', { method: 'GET' });
    _connected = true;
  } catch (e) {
    _connected = false;
    throw new errors.Error('CF connection failed: ' + e.message, {
      code: errors.CODES.NETWORK_HOST_UNREACHABLE,
      retryable: true,
    });
  }

  _emit('cf:connect', { timestamp: Date.now() });

  return { connected: true };
}

/**
 * Disconnect
 */
async function disconnect() {
  _connected = false;
  _emit('cf:disconnect', { timestamp: Date.now() });
  return { disconnected: true };
}

/**
 * Get status
 */
function getStatus() {
  return {
    connected: _connected,
    config: {
      hasAccountId: !!_config.accountId,
      hasPagesUrl: !!_config.pagesUrl,
      hasKvNamespace: !!_config.kvNamespace,
      hasR2Bucket: !!_config.r2Bucket,
    },
  };
}

module.exports = {
  version: '0.9.0',
  // Config
  configure,
  getConfig,
  // Status
  getStatus,
  getLayerStatus,
  isOperationAllowed,
  // Connectivity
  connect,
  disconnect,
  // Pages (sync)
  callPages,
  handshake,
  push,
  pull,
  // KV
  kvGet,
  kvPut,
  kvDelete,
  // R2
  r2Get,
  r2Put,
  r2List,
  // Workers
  workerCall,
};