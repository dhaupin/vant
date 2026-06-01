/**
 * Cloudflare Adapter (v0.9.0)
 * WITH EVENT EMISSIONS - all operations emit globally
 * 
 * Abstractor for Cloudflare services:
 * - sync (via CF Pages Functions)
 * - kv (key-value store)
 * - r2 (object storage)  
 * - workers (edge compute)
 * 
 * Provides unified interface, swappable connectors.
 * Can use cloudflare or github as transport.
 */

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

// ==================== TRANSPORT ====================

let _transport = null;
let _transportType = null;

/**
 * Set transport connector
 * @param {string} type - 'cloudflare' or 'github'
 * @param {object} connector - Connector instance
 */
function setTransport(type, connector) {
  const validTypes = ['cloudflare', 'github'];
  
  if (!validTypes.includes(type)) {
    throw new errors.Error('Invalid transport type: ' + type, {
      code: errors.CODES.CONFIGURATION_INVALID,
      retryable: false,
    });
  }

  _transportType = type;
  _transport = connector;
  
  _emit('cf:transport:set', { type, timestamp: Date.now() });
}

/**
 * Get current transport
 */
function getTransport() {
  return { type: _transportType, connector: _transport };
}

// ==================== PROMISES ====================

/**
 * Ensure connected
 */
async function _ensureConnected() {
  if (!_transport) {
    throw new errors.Error('No transport set', {
      code: errors.CODES.BRAIN_NOT_INITIALIZED,
      retryable: false,
    });
  }

  if (_transport.connect && typeof _transport.connect === 'function') {
    await _transport.connect();
  }
}

// ==================== SYNC ====================

/**
 * Get sync interface
 */
function sync(options = {}) {
  return {
    /**
     * Handshake - init sync chain
     */
    async handshake(chainId, identity = {}) {
      await _ensureConnected();

      let result;
      
      if (_transportType === 'cloudflare') {
        result = await _transport.handshake(chainId, identity);
      } else if (_transportType === 'github') {
        result = await _transport.syncHandshake(chainId, identity);
      } else {
        throw new errors.Error('Unsupported transport for sync', {
          code: errors.CODES.RUNTIME_EXECUTION_FAILED,
          retryable: false,
        });
      }

      _emit('cf:sync:handshake', { chainId, transport: _transportType });

      return result;
    },

    /**
     * Push - save encrypted blob
     */
    async push(chainId, seq, data) {
      await _ensureConnected();

      let result;
      
      if (_transportType === 'cloudflare') {
        result = await _transport.push(chainId, seq, data);
      } else if (_transportType === 'github') {
        result = await _transport.syncPush(chainId, seq, data);
      } else {
        throw new errors.Error('Unsupported transport for sync', {
          code: errors.CODES.RUNTIME_EXECUTION_FAILED,
          retryable: false,
        });
      }

      _emit('cf:sync:push', { chainId, seq, transport: _transportType });

      return result;
    },

    /**
     * Pull - fetch blobs since seq
     */
    async pull(chainId, since = 0) {
      await _ensureConnected();

      let result;
      
      if (_transportType === 'cloudflare') {
        result = await _transport.pull(chainId, since);
      } else if (_transportType === 'github') {
        result = await _transport.syncPull(chainId, since);
      } else {
        throw new errors.Error('Unsupported transport for sync', {
          code: errors.CODES.RUNTIME_EXECUTION_FAILED,
          retryable: false,
        });
      }

      _emit('cf:sync:pull', { chainId, since, transport: _transportType });

      return result;
    },
  };
}

// ==================== KV ====================

/**
 * Get KV interface
 */
function kv() {
  return {
    /**
     * Get value
     */
    async get(key) {
      await _ensureConnected();

      if (_transportType !== 'cloudflare' || !_transport.kvGet) {
        throw new errors.Error('Transport does not support KV', {
          code: errors.CODES.STORAGE_NOT_FOUND,
          retryable: false,
        });
      }

      const value = await _transport.kvGet(key);

      _emit('cf:kv:get', { key, transport: _transportType });

      return value;
    },

    /**
     * Put value
     */
    async put(key, value, options = {}) {
      await _ensureConnected();

      if (_transportType !== 'cloudflare' || !_transport.kvPut) {
        throw new errors.Error('Transport does not support KV', {
          code: errors.CODES.STORAGE_NOT_FOUND,
          retryable: false,
        });
      }

      await _transport.kvPut(key, value, options);

      _emit('cf:kv:put', { key, transport: _transportType });

      return { ok: true };
    },

    /**
     * Delete value
     */
    async delete(key) {
      await _ensureConnected();

      if (_transportType !== 'cloudflare' || !_transport.kvDelete) {
        throw new errors.Error('Transport does not support KV', {
          code: errors.CODES.STORAGE_NOT_FOUND,
          retryable: false,
        });
      }

      await _transport.kvDelete(key);

      _emit('cf:kv:delete', { key, transport: _transportType });

      return { ok: true };
    },
  };
}

// ==================== R2 ====================

/**
 * Get R2 interface
 */
function r2() {
  return {
    /**
     * Get object
     */
    async get(key) {
      await _ensureConnected();

      if (_transportType !== 'cloudflare' || !_transport.r2Get) {
        throw new errors.Error('Transport does not support R2', {
          code: errors.CODES.STORAGE_NOT_FOUND,
          retryable: false,
        });
      }

      const result = await _transport.r2Get(key);

      _emit('cf:r2:get', { key, transport: _transportType });

      return result;
    },

    /**
     * Put object
     */
    async put(key, body, options = {}) {
      await _ensureConnected();

      if (_transportType !== 'cloudflare' || !_transport.r2Put) {
        throw new errors.Error('Transport does not support R2', {
          code: errors.CODES.STORAGE_NOT_FOUND,
          retryable: false,
        });
      }

      await _transport.r2Put(key, body, options);

      _emit('cf:r2:put', { key, transport: _transportType });

      return { ok: true };
    },

    /**
     * List objects
     */
    async list(prefix = '') {
      await _ensureConnected();

      if (_transportType !== 'cloudflare' || !_transport.r2List) {
        throw new errors.Error('Transport does not support R2', {
          code: errors.CODES.STORAGE_NOT_FOUND,
          retryable: false,
        });
      }

      const result = await _transport.r2List(prefix);

      _emit('cf:r2:list', { prefix, count: result.objects?.length, transport: _transportType });

      return result;
    },
  };
}

// ==================== WORKERS ====================

/**
 * Get Workers interface
 */
function workers() {
  return {
    /**
     * Call worker
     */
    async call(name, body, options = {}) {
      await _ensureConnected();

      if (_transportType !== 'cloudflare' || !_transport.workerCall) {
        throw new errors.Error('Transport does not support Workers', {
          code: errors.CODES.RUNTIME_EXECUTION_FAILED,
          retryable: false,
        });
      }

      const result = await _transport.workerCall(name, body, options);

      _emit('cf:worker:call', { worker: name, transport: _transportType });

      return result;
    },
  };
}

// ==================== STATUS ====================

/**
 * Get adapter status
 */
function getStatus() {
  return {
    transport: _transportType,
    hasTransport: !!_transport,
    services: {
      sync: !!_transport && (!!_transport.handshake || !!_transport.syncHandshake),
      kv: !!_transport && !!_transport.kvGet,
      r2: !!_transport && !!_transport.r2Get,
      workers: !!_transport && !!_transport.workerCall,
    },
  };
}

/**
 * Get layer status
 */
function getLayerStatus() {
  return {
    name: 'Cloudflare',
    type: 'adapter',
    version: '0.9.0',
    transport: _transportType,
  };
}

module.exports = {
  version: '0.9.0',
  // Transport
  setTransport,
  getTransport,
  // Services (unified interface)
  sync,
  kv,
  r2,
  workers,
  // Status
  getStatus,
  getLayerStatus,
};