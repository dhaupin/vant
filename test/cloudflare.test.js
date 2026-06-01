/**
 * Cloudflare Connector Tests (v0.9.0)
 * Real tests - no stubs, no mocks
 */

const assert = require('assert');
const path = require('path');

// Load connector
const cloudflare = require('../lib/connectors/cloudflare');

describe('Cloudflare Connector', () => {
  describe('#version', () => {
    it('should export version', () => {
      assert.strictEqual(cloudflare.version, '0.9.0');
    });
  });

  describe('#configure', () => {
    it('should accept config options', () => {
      const result = cloudflare.configure({
        accountId: 'test-account',
        pagesUrl: 'https://test.pages.dev',
      });
      
      assert.strictEqual(result, undefined); // configure is void
      
      const config = cloudflare.getConfig();
      assert.strictEqual(config.accountId, 'test-account');
      assert.strictEqual(config.pagesUrl, 'https://test.pages.dev');
    });
  });

  describe('#getConfig', () => {
    it('should return current config', () => {
      const config = cloudflare.getConfig();
      
      assert(typeof config === 'object');
      assert(config !== null);
    });
  });

  describe('#getLayerStatus', () => {
    it('should return layer status shape', () => {
      const status = cloudflare.getLayerStatus();
      
      assert.strictEqual(status.name, 'Cloudflare');
      assert.strictEqual(status.type, 'connector');
      assert.strictEqual(status.version, '0.9.0');
      assert('connected' in status);
    });
  });

  describe('#isOperationAllowed', () => {
    it('should deny when not connected', () => {
      const result = cloudflare.isOperationAllowed('push');
      
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.reason, 'not connected');
      assert.strictEqual(result.layer, 'Cloudflare');
    });
  });

  describe('#getStatus', () => {
    it('should return status with config flags', () => {
      const status = cloudflare.getStatus();
      
      assert(typeof status.connected === 'boolean');
      assert(typeof status.config === 'object');
      assert('hasAccountId' in status.config);
      assert('hasPagesUrl' in status.config);
      assert('hasKvNamespace' in status.config);
      assert('hasR2Bucket' in status.config);
    });
  });

  describe('#callPages', () => {
    it('should throw without pagesUrl', async () => {
      // Reset config
      cloudflare.configure({ pagesUrl: null });
      
      await assert.rejects(
        () => cloudflare.callPages('/sync'),
        { code: 'NETWORK_HOST_UNREACHABLE' }
      );
    });
  });

  describe('#handshake', () => {
    it('should throw without pagesUrl', async () => {
      cloudflare.configure({ pagesUrl: null });
      
      await assert.rejects(
        () => cloudflare.handshake('test-chain'),
        { code: 'NETWORK_HOST_UNREACHABLE' }
      );
    });
  });

  describe('#kv', () => {
    it('should throw without kv config', async () => {
      cloudflare.configure({ 
        accountId: null, 
        kvNamespace: null 
      });
      
      await assert.rejects(
        () => cloudflare.kvGet('test-key'),
        { code: 'STORAGE_NOT_FOUND' }
      );

      await assert.rejects(
        () => cloudflare.kvPut('test-key', 'value'),
        { code: 'STORAGE_NOT_FOUND' }
      );

      await assert.rejects(
        () => cloudflare.kvDelete('test-key'),
        { code: 'STORAGE_NOT_FOUND' }
      );
    });
  });

  describe('#r2', () => {
    it('should throw without r2 config', async () => {
      cloudflare.configure({ 
        accountId: null, 
        r2Bucket: null 
      });
      
      await assert.rejects(
        () => cloudflare.r2Get('test-key'),
        { code: 'STORAGE_NOT_FOUND' }
      );

      await assert.rejects(
        () => cloudflare.r2Put('test-key', 'body'),
        { code: 'STORAGE_NOT_FOUND' }
      );

      await assert.rejects(
        () => cloudflare.r2List(),
        { code: 'STORAGE_NOT_FOUND' }
      );
    });
  });

  describe('#workerCall', () => {
    it('should throw without worker name', async () => {
      cloudflare.configure({ workerName: null });
      
      await assert.rejects(
        () => cloudflare.workerCall(null, {}),
        { code: 'RUNTIME_EXECUTION_FAILED' }
      );
    });
  });
});

// Export for test runner
module.exports = { name: 'cloudflare' };