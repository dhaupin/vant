#!/usr/bin/env node
/**
 * Vant Citations CLI
 * Citation management
 * 
 * Usage:
 *   vant citations list              # List citations
 *   vant citations add <ref>       # Add citation
 *   vant citations verify <ref>    # Verify citation
 *   vant citations search <query>  # Search citations (commit/context)
 *   vant citations export           # Export citations as JSON
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Citations CLI - Citation management

Usage:
  vant citations list                List all citations
  vant citations add <ref>          Record a source (ref = commit hash)
  vant citations verify <ref>       Check whether a ref has been cited
  vant citations search <query>     Search by commit prefix or context text
  vant citations export [--json]    Export the citation file (JSON)
`);
    process.exit(0);
}

async function run() {
    try {
        const citations = require('../lib/citations');
        
        if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
            const all = citations.getAll();
            console.log('Citations:');
            if (all.length === 0) {
                console.log('  (none)');
            } else {
                all.forEach(c => console.log('  -', c));
            }
        } else if (subcmd === 'add' || subcmd === 'create' || subcmd === 'new') {
            const ref = args[1];
            if (!ref) {
                console.error('Usage: vant citations add <ref>');
                process.exit(1);
            }
            const src = citations.addSource(ref, '');
            if (!src) {
                console.error('Could not record citation (lock busy or write denied).');
                process.exit(1);
            }
            console.log(`Added citation #${src.id} [Source: ${ref.substring(0, 7)}]`);
        } else if (subcmd === 'verify' || subcmd === 'check' || subcmd === 'validate') {
            const ref = args[1];
            if (!ref) {
                console.error('Usage: vant citations verify <ref>');
                process.exit(1);
            }
            const cited = citations.verify(ref);
            if (cited) {
                console.log(`✓ Cited: [Source: ${ref.substring(0, 7)}]`);
            } else {
                console.error(`✗ Not cited: ${ref}`);
                process.exit(1);
            }
        } else if (subcmd === 'search' || subcmd === 'find' || subcmd === 'query') {
            // (pass 188) Wired to lib/citations.js: a source matches when the
            // query hits its commit hash (anywhere — prefix or full hash) or
            // its context text (case-insensitive substring).
            const query = args.slice(1).join(' ');
            if (!query) {
                console.error('Usage: vant citations search <query>');
                process.exit(1);
            }
            const all = citations.getAll();
            const q = query.toLowerCase();
            const hits = all.filter(s =>
                (typeof s.commit === 'string' && s.commit.toLowerCase().includes(q)) ||
                (typeof s.context === 'string' && s.context.toLowerCase().includes(q)));
            if (hits.length === 0) {
                console.error(`✗ No citations match: ${query} (searched ${all.length})`);
                process.exit(1);
            }
            console.log(`Matching citations (${hits.length}):`);
            for (const s of hits) {
                console.log(`  #${s.id}  ${citations.formatCitation(s)}  (${s.timestamp || 'no timestamp'})`);
            }
        } else if (subcmd === 'export' || subcmd === 'dump') {
            // (pass 188) Wired to lib/citations.js: prints the citation file
            // (version + sources) as JSON. getAll() is already the gated read.
            const sources = citations.getAll();
            console.log(JSON.stringify({ version: '1.0', exported: new Date().toISOString(), count: sources.length, sources }, null, 2));
        } else {
            console.log('Usage: vant citations <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
