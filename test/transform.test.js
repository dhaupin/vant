/**
 * Transform module tests
 */
const assert = require('assert');

describe('transform', () => {
    const transform = require('../lib/transform');
    
    describe('gather()', () => {
        it('should gather all components by default', async () => {
            const data = await transform.gather();
            
            // Should have all keys (timestamp/version moved to wrapper level in toHorcrux)
            assert(data.agents, 'should have agents');
            assert(data.islands, 'should have islands');
            assert(data.runtime, 'should have runtime');
            assert(data.boot, 'should have boot');
            assert(data.config, 'should have config');
            assert(data.corpus, 'should have corpus');
            assert(data.neurons, 'should have neurons');
            assert(data.brainStorage, 'should have brainStorage');
            assert(data.privateBrains, 'should have privateBrains');
            assert(data.metrics, 'should have metrics');
            assert(data.handlers, 'should have handlers');
            assert(data.configStorage, 'should have configStorage');
            assert(data.islandState, 'should have islandState');
            assert(data.mode, 'should have mode');
        });
        
        it('should allow selective gathering', async () => {
            const data = await transform.gather({
                agents: true,
                islands: false,
                runtime: false
            });
            
            assert(data.agents, 'should have agents');
            assert(!data.islands, 'should not have islands');
            assert(!data.runtime, 'should not have runtime');
        });
    });
    
    describe('toHorcrux()', () => {
        it('should return JSON string without path', async () => {
            const json = await transform.toHorcrux();
            
            assert(typeof json === 'string', 'should return string');
            const data = JSON.parse(json);
            assert(data.timestamp, 'should have timestamp');
            assert(data.version, 'should have version');
            assert(data.type === 'vant-horcrux', 'should have vant-horcrux type');
            assert(data.payload, 'should have payload');
            assert(data.payload.agents, 'payload should have agents');
        });
    });
    
    describe('restore()', () => {
        it('should restore full data including brainStorage', async () => {
            // Create sample data
            const data = {
                timestamp: Date.now(),
                version: '0.8.6',
                mode: { loaded: false },
                brainStorage: { loaded: false },
                neurons: { loaded: false },
                configStorage: { loaded: false },
                islandState: { loaded: false },
                agents: null,
                islands: { manifests: null },
                config: null,
                runtime: null,
                boot: null
            };
            
            // Should not throw
            const result = await transform.restore(data);
            assert(result.restored, 'should have restored array');
            assert(Array.isArray(result.restored), 'restored should be array');
        });
    });
    
    describe('inspectHorcrux()', () => {
        it('should exist and be a function', () => {
            assert(typeof transform.inspectHorcrux === 'function');
        });
        
        it('should have inspect alias', () => {
            assert(typeof transform.inspect === 'function');
            assert(transform.inspect === transform.inspectHorcrux);
        });
    });
});

console.log('Run with: npx mocha test/transform.test.js');
