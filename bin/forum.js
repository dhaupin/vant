#!/usr/bin/env node
/**
 * Vant Forum CLI — agora over lib/forum.js
 *
 * (pass 87) REBUILT ON THE REAL SUBSYSTEM. The pre-87 CLI was a facade in
 * the pass-81 genre: `post` printed "✅ Posted" without touching
 * lib/forum.js, `list` always printed "(No discussions)". Every subcommand
 * now routes through the singleton, and list/view are tenancy-aware —
 * anonymous sees the global commons only; tenant-tagged posts need the
 * workspace (or a registry role there).
 *
 * Usage:
 *   vant forum list                  Tenancy-filtered publications
 *   vant forum post <title> [body]   Publish (workspace auto-stamped
 *                                    from the current agent identity)
 *   vant forum view <barcode>        Read one (tenancy-checked)
 *   vant forum message <agent> <text> Direct forum message
 */

const args = process.argv.slice(2);
const action = args[0] || 'list';

if (action === '-h' || action === '--help' || action === 'help') {
    console.log(`
Vant Forum CLI — agora over lib/forum.js (real, tenancy-aware)

Usage:
  vant forum list                   Publications visible to YOUR tenancy
  vant forum post <title> [body]    Publish (workspace stamped from identity)
  vant forum view <barcode>         Read one publication
  vant forum message <agent> <text> Direct forum message

Tenancy (pass 87): anonymous sees the global commons only; workspace-
tagged posts are visible to their tenant (+ registry admins).
`);
    process.exit(0);
}

function forum() { return require('../lib/forum').forum; }

async function main() {
    const f = forum();

    switch (action) {
        case 'list':
        case 'ls': {
            const r = await f.list({});
            if (!r.publications.length) {
                console.log('Forum Publications: (none visible)');
            } else {
                console.log(`Forum Publications (${r.publications.length} visible):`);
                for (const p of r.publications) {
                    const ws = p.workspace ? ' [ws:' + p.workspace + ']' : '';
                    console.log('  -', p.id, p.title + ws, 'by', p.author);
                }
            }
            if (r.tenancy && r.tenancy.workspace) {
                console.log('  (tenancy: ' + r.tenancy.workspace + ')');
            }
            break;
        }

        case 'post': {
            const title = args[1];
            const body = args.slice(2).join(' ');
            if (!title) { console.error('Usage: vant forum post <title> [body]'); process.exit(1); }
            const r = await f.publish(title, body || '');
            if (!r.published) {
                console.error('✗ Not published:', r.reason || 'unknown');
                process.exit(1);
            }
            console.log('✅ Published:', r.publication.id, '-', r.publication.title);
            if (r.publication.workspace) console.log('   tenancy:', r.publication.workspace);
            break;
        }

        case 'view': {
            const id = args[1];
            if (!id) { console.error('Usage: vant forum view <barcode>'); process.exit(1); }
            const r = await f.get(id, {});
            if (!r.found) {
                console.error('✗ Not found' + (r.reason === 'tenancy' ? ' (tenancy: not visible to you)' : ''));
                process.exit(1);
            }
            console.log('[' + r.publication.id + ']', r.publication.title,
                r.publication.workspace ? '(ws:' + r.publication.workspace + ')' : '');
            console.log(r.publication.content);
            break;
        }

        case 'message': {
            const [agent, ...rest] = args.slice(1);
            const text = rest.join(' ');
            if (!agent || !text) { console.error('Usage: vant forum message <agent> <text>'); process.exit(1); }
            const r = await f.message(agent, text);
            console.log('✅ Message queued for', agent + ':', JSON.stringify(r).slice(0, 200));
            break;
        }

        default:
            console.log('Usage: vant forum <list|post|view|message> (try -h)');
            process.exit(1);
    }
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
