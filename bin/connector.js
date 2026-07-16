#!/usr/bin/env node
/**
 * Vant Connector CLI
 * External service connectors
 * 
 * Usage:
 *   vant connector list           # List available connectors
 *   vant connector status <name> # Check connector status
 *   vant connector connect <name> # Connect to service
 *   vant connector disconnect <name> # Disconnect
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Connector CLI - External service connectors

Usage:
  vant connector list             List available connectors
  vant connector status <name>   Check connector status
  vant connector connect <name>  Connect to service
  vant connector disconnect <name> Disconnect service

Available connectors:
  - qdrant (vector store)
  - pinecone (vector store)
  - elasticsearch (search)
  - postgresql (database)
  - redis (cache)
  - slack (messaging)
  - github (version control)
`);
    process.exit(0);
}

function run() {
    const { getConnector, VectorConnector, PineconeConnector, QdrantConnector, WeaviateConnector } = require('../lib/connector');
    
    const available = ['qdrant', 'pinecone', 'weaviate', 'vector'];
    
    if (subcmd === 'list' || subcmd === 'ls') {
        console.log('Available connectors:');
        available.forEach(c => console.log(' -', c));
    } else if (subcmd === 'status' || subcmd === 'info') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant connector status <name>');
            process.exit(1);
        }
        console.log('Connector:', name);
        console.log('Status: (use getConnector() to connect)');
    } else if (subcmd === 'connect') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant connector connect <name>');
            process.exit(1);
        }
        console.log('Connecting to:', name);
    } else if (subcmd === 'disconnect') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant connector disconnect <name>');
            process.exit(1);
        }
        console.log('Disconnecting:', name);
    } else {
        console.log('Usage: vant connector <command>');
        process.exit(1);
    }
}

run();
