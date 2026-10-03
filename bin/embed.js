#!/usr/bin/env node
/**
 * Vant Embed CLI
 * Embedding/vector operations
 * 
 * Usage:
 *   vant embed list                       # List available providers
 *   vant embed generate <text>           # Generate embedding
 *   vant embed set <provider>            # Set default provider
 *   vant embed info                       # Show provider info
 */

const embed = require('../lib/embed');

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Embed CLI - Embedding/vector operations

Usage:
  vant embed list                       List available providers
  vant embed generate <text>           Generate embedding for text
  vant embed set <provider>            Set default provider (openai, local, hash)
  vant embed info                       Show current provider info
  vant embed batch <text1> <text2>...  Generate embeddings for multiple texts

Providers:
  - hash:   Word-hashing (free, always works)
  - local:  Local transformers (requires @xenova/transformers)
  - openai: OpenAI ada-002 (requires OPENAI_API_KEY)
`);
    process.exit(0);
}

async function run() {
    if (subcmd === 'list' || subcmd === 'ls') {
        const list = embed.listProviders();
        console.log('Available providers:', list.join(', '));
    } else if (subcmd === 'set') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant embed set <provider>');
            process.exit(1);
        }
        embed.setProvider(name);
        console.log('Set provider:', name);
    } else if (subcmd === 'info') {
        const info = embed.getProviderInfo();
        console.log(JSON.stringify(info, null, 2));
    } else if (subcmd === 'generate') {
        const text = args.slice(1).join(' ');
        if (!text) {
            console.error('Usage: vant embed generate <text>');
            process.exit(1);
        }
        const embedding = await embed.generate(text);
        console.log(JSON.stringify(embedding, null, 2));
    } else if (subcmd === 'batch') {
        const texts = args.slice(1);
        if (texts.length === 0) {
            console.error('Usage: vant embed batch <text1> <text2> ...');
            process.exit(1);
        }
        const embeddings = await embed.generateBatch(texts);
        console.log(JSON.stringify(embeddings, null, 2));
    } else {
        console.log('Available: list, generate, set, info, batch');
        console.log('Run with --help for usage');
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
