#!/usr/bin/env node
/**
 * Vant Connector CLI - Vector-DB connectors (lib/connector.js)
 *
 * (pass 189) WIRED. `connect` printed 'Connecting to: <name>' and did
 * nothing; `status` printed a "(use getConnector() to connect)" hint.
 * Both verbs now work through the REAL getConnector() factory: status
 * instantiates the connector (no connection attempt), connect runs its
 * async connect() and reports honest readiness, disconnect runs close().
 * The fake catalog (elasticsearch/postgresql/redis/slack/github) is gone —
 * the factory supports exactly: pinecone | qdrant | weaviate.
 *
 * Usage:
 *   vant connector list                # List the connector types the factory supports
 *   vant connector status <name>       # Instantiate + describe config (no connect)
 *   vant connector connect <name>      # Real connect (runs the connector's connect())
 *   vant connector disconnect <name>   # Run the connector's close()
 *   vant connector configs             # Per-brain connector configs on the stack
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Connector CLI - Vector-DB connectors (lib/connector.js)

Usage:
  vant connector list                Types the factory supports
  vant connector status <name>       Instantiate + describe (no connect)
  vant connector connect <name>      Real connect(...)
  vant connector disconnect <name>   Real close()
  vant connector configs             Per-brain connector configs

Connectors: pinecone | qdrant | weaviate

Note: agent-format connectors (hermes, crewai, langchain) and the S3
wire are separate surfaces (lib/connectors/index.js, 'vant s3').
`);
    process.exit(0);
}

const TYPES = ['pinecone', 'qdrant', 'weaviate'];

function describe(c) {
    return `${c.type}: url=${c.url} collection=${c.collection} apiKey=${c.apiKey ? 'SET' : 'not set'}`;
}

async function run() {
    let lib;
    try {
        lib = require('../lib/connector');
    } catch (e) {
        console.error('Connector module not available: ' + e.message);
        process.exit(1);
    }

    if (subcmd === 'list' || subcmd === 'ls') {
        console.log('Supported connector types:');
        TYPES.forEach(c => console.log('  -', c));
    } else if (subcmd === 'status' || subcmd === 'info') {
        const name = args[1];
        if (!name) { console.error('Usage: vant connector status <name>'); process.exit(1); }
        try {
            const c = lib.getConnector(name, { apiKey: process.env[('PINECONE_API_KEY').toUpperCase()] });
            console.log('Connector (not connected):');
            console.log('  ' + describe(c));
        } catch (e) {
            console.error('✗ Unknown connector type: ' + name);
            process.exit(1);
        }
    } else if (subcmd === 'connect') {
        const name = args[1];
        if (!name) { console.error('Usage: vant connector connect <name>'); process.exit(1); }
        try {
            const c = lib.getConnector(name, {});
            await c.connect();
            console.log('✓ Connected:');
            console.log('  ' + describe(c));
        } catch (e) {
            console.error('✗ Connect failed: ' + e.message);
            process.exit(1);
        }
    } else if (subcmd === 'disconnect') {
        const name = args[1];
        if (!name) { console.error('Usage: vant connector disconnect <name>'); process.exit(1); }
        try {
            const c = lib.getConnector(name, {});
            if (typeof c.close !== 'function') {
                console.error('✗ This connector has no close() — nothing to disconnect.');
                process.exit(1);
            }
            await c.close();
            console.log('✓ Disconnected: ' + name);
        } catch (e) {
            console.error('✗ Disconnect failed: ' + e.message);
            process.exit(1);
        }
    } else if (subcmd === 'configs') {
        const configs = lib.getStackConnectorConfigs();
        console.log('Connector configs (source: ' + configs.source + ', ' + configs.brains.length + ' brains):');
        for (const [brainName, cfg] of Object.entries(configs.byBrain)) {
            console.log('  ' + brainName + ': ' + (cfg.error ? 'error: ' + cfg.error : JSON.stringify(cfg)));
        }
    } else {
        console.log('Usage: vant connector <command>');
        console.log('Commands: list | status <name> | connect <name> | disconnect <name> | configs');
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
