#!/usr/bin/env node
/**
 * Vant Citations CLI
 * Citation management
 * 
 * Usage:
 *   vant citations list              # List citations
 *   vant citations add <ref>       # Add citation
 *   vant citations verify <ref>    # Verify citation
 *   vant citations search <query>  # Search citations
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
  vant citations search <query>     Placeholder — not wired yet
  vant citations export             Placeholder — not wired yet
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
            const query = args.slice(1).join(' ');
            if (!query) {
                console.error('Usage: vant citations search <query>');
                process.exit(1);
            }
            console.log('search is a placeholder — not wired to the lib yet.');
        } else if (subcmd === 'export' || subcmd === 'dump') {
            console.log('export is a placeholder — not wired to the lib yet.');
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
