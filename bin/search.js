#!/usr/bin/env node
/**
 * Vant Search CLI - Hybrid + Basic + RAG
 */

const path = require('path');
const DIR = path.join(__dirname, '..');

const args = process.argv.slice(2);
const action = args[0];

async function run() {
    if (!action || action === '-h' || action === '--help') {
        console.log(`
╔═══════════════════════════════════════╗
║        Vant Search CLI             ║
╚═══════════════════════════════════════╝

Usage:
  vant search <query>              # Default: hybrid search
  vant search <query> --mode basic # Text search
  vant search <query> --mode rag    # Semantic LTC
  vant search --hybrid <query>     # BM25+Vector RRF
  vant search --hyde <query>       # HyDE transform
  vant search --stats             # Index stats

Options:
  --mode basic|rag|hybrid  Search mode
  -l, --limit <N>         Max results (default: 5)
`);
        process.exit(0);
    }

    // Parse flags
    let mode = null;
    let limit = 5;
    let query = action;
    
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--mode' && args[i+1]) {
            mode = args[i+1];
            i++;
        } else if ((args[i] === '-l' || args[i] === '--limit') && args[i+1]) {
            limit = parseInt(args[i+1]) || 5;
            i++;
        }
    }

    // Basic mode
    if (mode === 'basic') {
        const searchLib = require(path.join(DIR, 'lib', 'search'));
        const results = await searchLib.searchLTC(query, { limit });
        console.log('\n=== Basic Search: ' + query + ' ===');
        console.log('Results:', results.length);
        for (const r of results) {
            console.log(' -', r.type, r.summary?.substring(0, 60));
        }
        process.exit(0);
    }

    // RAG mode
    if (mode === 'rag') {
        const searchLib = require(path.join(DIR, 'lib', 'search'));
        const { results, context } = await searchLib.query(query, { limit });
        const settings = searchLib.getSettings();
        console.log('\n=== RAG Search: ' + query + ' ===');
        console.log('Results:', results.length);
        console.log('Context:', context.length, 'bytes');
        console.log('Settings:', JSON.stringify(settings));
        process.exit(0);
}

    // Mode: hybrid (via unified search lib)
    if (mode === 'hybrid') {
        const searchLib = require(path.join(DIR, 'lib', 'search'));
        const results = await searchLib.hybrid(query);
        console.log('\n=== Hybrid Search: ' + query + ' ===');
        console.log('Sparse:', results.sparse.length);
        console.log('Dense:', results.dense.length);
        console.log('Fused:', results.fused.length);
        for (const r of results.fused.slice(0, 5)) {
            console.log(' -', r.id?.substring(0, 8), r.rrf?.toFixed(3), r.content?.substring(0, 50));
        }
        process.exit(0);
    }

    // End mode handlers

    // Hybrid mode (default)
    if (action === '--hybrid' || action === '-H') {
        query = args.slice(1).join(' ') || query;
    }

    if (action === '--stats') {
        const hs = require(path.join(DIR, 'lib', 'hybrid-search'));
        console.log(hs.getStats());
        process.exit(0);
    }

    if (action === '--hyde') {
        const q = require(path.join(DIR, 'lib', 'query'));
        const result = await q.hyde(query);
        console.log('\n=== HyDE: ' + query + ' ===\n');
        console.log('Fake Answer:\n' + result.fake + '\n');
        console.log('Results:', result.results.length);
        process.exit(0);
    }

    // Default: hybrid search
    const hs = require(path.join(DIR, 'lib', 'hybrid-search'));
    const results = await hs.search(query);

    console.log('\nResults:', results.fused.length);
    for (const r of results.fused.slice(0, 5)) {
        console.log('  -', r.id?.substring(0, 8), r.rrf?.toFixed(3));
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
