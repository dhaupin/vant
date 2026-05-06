#!/usr/bin/env node
/**
 * Vant Search CLI - Hybrid + RAG
 */

const path = require('path');
const DIR = path.join(__dirname, '..');

const args = process.argv.slice(2);
const action = args[0];

async function run() {
    if (!action) {
        console.log(`
╔═══════════════════════════════════════╗
║        Vant RAG Search             ║
╚═══════════════════════════════════════╝

Usage: vant search <query>
       vant search --hyde <query>
       vant search --index <file>
`);
        process.exit(0);
    }
    
    if (action === '--hybrid' || action === '-H') {
        const query = args.slice(1).join(' ') || process.argv[3] || '';
        if (!query) {
            console.error('Usage: vant search --hybrid <query>');
            process.exit(1);
        }
        
        const hs = require(path.join(DIR, 'lib', 'hybrid-search'));
        const results = await hs.search(query);
        
        console.log('\n=== Hybrid Search: ' + query + ' ===\n');
        console.log('Sparse (BM25):', results.sparse.length);
        console.log('Dense (Vector):', results.dense.length);
        console.log('Fused:', results.fused.length);
        
        for (const r of results.fused.slice(0, 5)) {
            console.log('  -', r.id?.substring(0, 8), r.rrf?.toFixed(3), r.content?.substring(0, 50));
        }
        process.exit(0);
    }
    
    if (action === '--hyde') {
        const query = args.slice(1).join(' ') || process.argv[3] || '';
        if (!query) {
            console.error('Usage: vant search --hyde <query>');
            process.exit(1);
        }
        
        const q = require(path.join(DIR, 'lib', 'query'));
        const result = await q.hyde(query);
        
        console.log('\n=== HyDE: ' + query + ' ===\n');
        console.log('Fake Answer:\n' + result.fake + '\n');
        console.log('Results:', result.results.length);
        process.exit(0);
    }
    
    if (action === '--stats') {
        const hs = require(path.join(DIR, 'lib', 'hybrid-search'));
        const stats = hs.getStats();
        console.log(stats);
        process.exit(0);
    }
    
    // Default: search
    const hs = require(path.join(DIR, 'lib', 'hybrid-search'));
    const results = await hs.search(action);
    
    console.log('\nResults:', results.fused.length);
    for (const r of results.fused.slice(0, 5)) {
        console.log('  -', r.id?.substring(0, 8), r.rrf?.toFixed(3));
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});