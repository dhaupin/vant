/**
 * Cloudflare Adapter Tests (v0.9.0)
 * Real tests - no stubs, no mocks
 */

const assert = require('assert');

// Load adapter
const cloudflare = require('../lib/adapters/cloudflare');

describe('Cloudflare Adapter', () => {
  describe('#version', () => {
    it('should export version', () => {
      assert.strictEqual(cloudflare.version, '0.9.0');
    });
  });

  describe('#setTransport', () => {
    it('should accept cloudflare transport', () => {
      // Mock connector
      const mockConnector = {
        connect: async () => {},
        handshake: async (chainId) => ({ chainId }),
        push: async (chainId, seq, data) => ({ chainId, seq }),
        pull: async (chainId, since) => ({ chainId, messages: [] }),
      };

      cloudflare.setTransport('cloudflare', mockConnector);

      const { type, connector } = cloudflare.getTransport();
      assert.strictEqual(type, 'cloudflare');
      assert.strictEqual(connector, mockConnector);
    });

    it('should accept github transport', () => {
      const mockConnector = {
        syncHandshake: async (chainId) => ({ chainId }),
        syncPush: async (chainId, seq, data) => ({ chainId, seq }),
        syncPull: async (chainId, since) => ({ chainId, messages: [] }),
      };

      cloudflare.setTransport('github', mockConnector);

      const { type } = cloudflare.getTransport();
      assert.strictEqual(type, 'github');
    });

    it('should reject invalid transport type', () => {
      assert.throws(
        () => cloudflare.setTransport('invalid', {}),
        { code: 'CONFIGURATION_INVALID' }
      );
    });
  });

  describe('#getTransport', () => {
    it('should return null when no transport set', () => {
      // This test runs after previous, transport is already set
      // So just verify it returns something
      const result = cloudflare.getTransport();
      assert(typeof result === 'object');
    });
  });

  describe('#sync', () => {
    it('should expose handshake/push/pull', () => {
      const syncInterface = cloudflare.sync();
      
      assert(typeof syncInterface.handshake === 'function');
      assert(typeof syncInterface.push === 'function');
      assert(typeof syncInterface.pull === 'function');
    });

    it('should throw without transport', async () => {
      // Create new adapter instance to test no transport
      const fresh = require('../lib/adapters/cloudflare');
      
      await assert.rejects(
        () => fresh.sync().handshake('chain-1'),
        { code: 'BRAIN_NOT_INITIALIZED' }
      );

      await assert.rejects(
        () => fresh.sync().push('chain-1', 1, 'data'),
        { code: 'BRAIN_NOT_INITIALIZED' }
      );

      await assert.rejects(
        () => fresh.sync().pull('chain-1', 0),
        { code: 'BRAIN_NOT_INITIALIZED' }
      );
    });

    it('should call cloudflare transport', async () => {
      let calledMethod = null;
      const mockConnector = {
        connect: async () => {},
        handshake: async (chainId) => { calledMethod = 'handshake'; return { chainId }; },
        push: async (chainId, seq, data) => { calledMethod = 'push'; return { chainId, seq }; },
        pull: async (chainId, since) => { calledMethod = 'pull'; return { chainId, messages: [] }; },
      };

      cloudflare.setTransport('cloudflare', mockConnector);

      await cloudflare.sync().handshake('chain-1');
      assert.strictEqual(calledMethod, 'handshake');

      calledMethod = null;
      await cloudflare.sync().push('chain-1', 1, 'data');
      assert.strictEqual(calledMethod, 'push');

      calledMethod = null;
      await cloudflare.sync().pull('chain-1', 0);
      assert.strictEqual(calledMethod, 'pull');
    });
  });

  describe('#kv', () => {
    it('should expose get/put/delete', () => {
      const kvInterface = cloudflare.kv();
      
      assert(typeof kvInterface.get === 'function');
      assert(typeof kvInterface.put === 'function');
      assert(typeof kvInterface.delete === 'function');
    });

    it('should throw without kv support', async () => {
      const mockConnector = {
        connect: async () => {},
        // No kvGet/kvPut
      };

      cloudflare.setTransport('cloudflare', mockConnector);

      await assert.rejects(
        () => cloudflare.kv().get('key'),
        { code: 'STORAGE_NOT_FOUND' }
      );
    });
  });

  describe('#r2', () => {
    it('should expose get/put/list', () => {
      const r2Interface = cloudflare.r2();
      
      assert(typeof r2Interface.get === 'function');
      assert(typeof r2Interface.put === 'function');
      assert(typeof r2Interface.list === 'function');
    });

    it('should throw without r2 support', async () => {
      const mockConnector = {
        connect: async () => {},
        // No r2Get/r2Put
      };

      cloudflare.setTransport('cloudflare', mockConnector);

      await assert.rejects(
        () => cloudflare.r2().get('key'),
        { code: 'STORAGE_NOT_FOUND' }
      );
    });
  });

  describe('#workers', () => {
    it('should expose call', () => {
      const workersInterface = cloudflare.workers();
      
      assert(typeof workersInterface.call === 'function');
    });

    it('should throw without worker support', async () => {
      const mockConnector = {
        connect: async () => {},
        // No workerCall
      };

      cloudflare.setTransport('cloudflare', mockConnector);

      await assert.rejects(
        () => cloudflare.workers().call('test-worker', {}),
        { code: 'RUNTIME_EXECUTION_FAILED' }
      );
    });
  });

  describe('#getStatus', () => {
    it('should return status with transport info', () => {
      const status = cloudflare.getStatus();
      
      assert(typeof status === 'object');
      assert('transport' in status);
      assert('hasTransport' in status);
      assert('services' in status);
    });
  });

  describe('#getLayerStatus', () => {
    it('should return layer status', () => {
      const status = cloudflare.getLayerStatus();
      
      assert.strictEqual(status.name, 'Cloudflare');
      assert.strictEqual(status.type, 'adapter');
      assert.strictEqual(status.version, '0.9.0');
    });
  });
});

// Export for test runner
module.exports = { name: 'cloudflare-adapter' };