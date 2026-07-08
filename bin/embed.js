#!/usr/bin/env node
/**
 * Vant Embed CLI
 * Embedding/vector operations
 * 
 * Usage:
 *   vant embed register <name> <module>  # Register embedder
 *   vant embed list                       # List available embedders
 *   vant embed embed <text> [provider]   # Generate embedding
 */

const embed = require('../lib/embed');

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Embed CLI - Embedding/vector operations

Usage:
  vant embed register <name> <module>  Register embedder
  vant embed list                       List available embedders
  vant embed embed <text> [provider]   Generate embedding
  vant embed set <name>               Set default embedder
`);
    process.exit(0);
}

function run() {
    if (subcmd === 'list' || subcmd === 'ls') {
        const list = embed.listEmbedders();
        console.log('Available embedders:', list.join(', '));
    } else if (subcmd === 'register') {
        const name = args[1];
        const module = args[2];
        if (!name || !module) {
            console.error('Usage: vant embed register <name> <module>');
            process.exit(1);
        }
        embed.register(name, module);
        console.log('Registered embedder:', name);
    } else if (subcmd === 'set') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant embed set <name>');
            process.exit(1);
        }
        embed.setEmbedder(name);
        console.log('Set default embedder:', name);
    } else if (subcmd === 'embed') {
        const text = args[1];
        const provider = args[2];
        if (!text) {
            console.error('Usage: vant embed embed <text> [provider]');
            process.exit(1);
        }
        const embedding = embed.embed(text, provider);
        console.log(JSON.stringify(embedding, null, 2));
    } else {
        console.log('Available: list, register, set, embed');
        process.exit(1);
    }
}

run();
