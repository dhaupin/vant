#!/usr/bin/env node
/**
 * Vant Search CLI - Hybrid + Basic + RAG + Rerank
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
  vant search <query> -r          # All modes support --rerank

Options:
  --mode basic|rag|hybrid  Search mode
  -l, --limit <N>         Max results (default: 5)
  --compact              Summaries only (skip full rehydration)
  -r, --rerank           Rerank results after search
  -t, --max-tokens <N>   Max tokens for rerank (default: 2000)
`);
        process.exit(0);
    }

    // Parse flags
    let mode = null;
    let limit = 5;
    let query = action;
    let compact = false;
    let rerank = false;
    let maxTokens = 2000;
    
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--mode' && args[i+1]) {
            mode = args[i+1];
            i++;
        } else if ((args[i] === '-l' || args[i] === '--limit') && args[i+1]) {
            limit = parseInt(args[i+1]) || 5;
            i++;
        } else if (args[i] === '--compact') {
            compact = true;
        } else if (args[i] === '-r' || args[i] === '--rerank') {
            rerank = true;
        } else if ((args[i] === '-t' || args[i] === '--max-tokens') && args[i+1]) {
            maxTokens = parseInt(args[i+1]) || 2000;
            i++;
        }
    }

    // Helper: apply rerank to results
    function applyRerank(memories, q, lim, tok) {
        const rerankLib = require(path.join(DIR, 'lib', 'search'));
        const ranked = rerankLib.rerank(memories, q, lim);
        const compressed = rerankLib.compress(ranked, tok);
        return compressed;
    }

    // Basic mode
    if (mode === 'basic') {
        const searchLib = require(path.join(DIR, 'lib', 'search'));
        const results = await searchLib.searchLTC(query, { limit, compact });
        
        if (rerank && results.length > 0) {
            const memories = results.map(r => ({
                id: r.type || r.file || 'unknown',
                title: r.type?.substring(0, 20),
                content: r.content || r.summary || '',
                date: r.date || new Date().toISOString()
            }));
            const compressed = applyRerank(memories, query, limit, maxTokens);
            
            console.log('\n[Basic + Rerank] Query:', query);
            console.log('Search Results:', results.length);
            console.log('Reranked:', compressed.length, 'memories');
            
            for (let i = 0; i < compressed.length; i++) {
                const r = compressed[i];
                console.log((i+1) + '.', r.title?.substring(0, 20), '[' + (r.rerankScore || 0).toFixed(1) + ']');
            }
        } else {
            console.log('\n=== Basic Search: ' + query + ' ===');
            console.log('Results:', results.length);
            for (const r of results) {
                console.log(' -', r.type, r.summary?.substring(0, 60));
            }
        }
        process.exit(0);
    }

    // RAG mode
    if (mode === 'rag') {
        const searchLib = require(path.join(DIR, 'lib', 'search'));
        const { results, context } = await searchLib.query(query, { limit, compact });
        const settings = searchLib.getSettings();
        
        if (rerank && results.length > 0) {
            const memories = results.map(r => ({
                id: r.type || 'unknown',
                title: r.type?.substring(0, 20),
                content: r.content || r.summary || '',
                date: r.date || new Date().toISOString()
            }));
            const compressed = applyRerank(memories, query, limit, maxTokens);
            
            console.log('\n[RAG + Rerank] Query:', query);
            console.log('Search Results:', results.length);
            console.log('Reranked:', compressed.length, 'memories');
            console.log('Context:', context.length, 'bytes');
            
            for (let i = 0; i < compressed.length; i++) {
                const r = compressed[i];
                console.log((i+1) + '.', r.title?.substring(0, 20), '[' + (r.rerankScore || 0).toFixed(1) + ']');
            }
        } else {
            console.log('\n=== RAG Search: ' + query + ' ===');
            console.log('Results:', results.length);
            console.log('Context:', context.length, 'bytes');
            console.log('Settings:', JSON.stringify(settings));
        }
        process.exit(0);
    }

    // Hybrid mode (explicit)
    if (mode === 'hybrid') {
        const searchLib = require(path.join(DIR, 'lib', 'search'));
        const results = await searchLib.hybrid(query);
        
        if (rerank && results.fused.length > 0) {
            const memories = results.fused.map(r => ({
                id: r.id,
                title: r.id?.substring(0, 20),
                content: r.content || r.summary || '',
                date: r.date || new Date().toISOString()
            }));
            const compressed = applyRerank(memories, query, limit, maxTokens);
            
            console.log('\n[Hybrid + Rerank] Query:', query);
            console.log('Search Results:', results.fused.length);
            console.log('Reranked:', compressed.length, 'memories');
            
            for (let i = 0; i < compressed.length; i++) {
                const r = compressed[i];
                console.log((i+1) + '.', r.title?.substring(0, 20), '[' + (r.rerankScore || 0).toFixed(1) + ']');
            }
        } else {
            console.log('\n=== Hybrid Search: ' + query + ' ===');
            console.log('Sparse:', results.sparse.length);
            console.log('Dense:', results.dense.length);
            console.log('Fused:', results.fused.length);
            for (const r of results.fused.slice(0, 5)) {
                console.log(' -', r.id?.substring(0, 8), r.rrf?.toFixed(3), r.content?.substring(0, 50));
            }
        }
        process.exit(0);
    }

    // Hybrid mode (default via --hybrid flag)
    if (action === '--hybrid' || action === '-H') {
        // Filter out flags from args, keep only the query words
        const queryArgs = args.slice(1).filter(a => !a.startsWith('-'));
        query = queryArgs.join(' ') || query;
    }

    // Stats
    if (action === '--stats') {
        const searchLib = require(path.join(DIR, 'lib', 'search'));
        console.log(searchLib.getStats());
        process.exit(0);
    }

    // HyDE
    if (action === '--hyde') {
        const searchLib = require(path.join(DIR, 'lib', 'search'));
        const result = await searchLib.hyde(query);
        console.log('\n=== HyDE: ' + query + ' ===\n');
        console.log('Fake Answer:\n' + result.fake + '\n');
        console.log('Results:', result.results.length);
        process.exit(0);
    }

    // Default: hybrid search with optional rerank
    const searchLib = require(path.join(DIR, 'lib', 'search'));
    const results = await searchLib.hybrid(query);
    
    if (rerank && results.fused.length > 0) {
        const memories = results.fused.map(r => ({
            id: r.id,
            title: r.id?.substring(0, 20),
            content: r.content || r.summary || '',
            date: r.date || new Date().toISOString()
        }));
        const compressed = applyRerank(memories, query, limit, maxTokens);
        
        console.log('\n[Hybrid + Rerank] Query:', query);
        console.log('Search Results:', results.fused.length);
        console.log('Reranked:', compressed.length, 'memories');
        
        for (let i = 0; i < compressed.length; i++) {
            const r = compressed[i];
            console.log((i+1) + '.', r.title?.substring(0, 20), '[' + (r.rerankScore || 0).toFixed(1) + ']');
        }
    } else {
        console.log('\n=== Hybrid Search: ' + query + ' ===');
        console.log('Fused:', results.fused.length);
        for (const r of results.fused.slice(0, limit)) {
            console.log(' -', r.id?.substring(0, 8), r.rrf?.toFixed(3));
        }
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
