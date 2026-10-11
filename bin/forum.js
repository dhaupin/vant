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
 *
 * (Wave U4, prd-universe.md) Deliberation→decision trail:
 *   vant forum decisions <barcode>   Decision trail of a thread: linked
 *                                    consensus vote, ballots, escrow
 *                                    holds touched, voted outcome
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
  vant forum decisions <barcode>    Decision trail of a thread (Wave U4):
                                    linked vote, ballots, escrow holds,
                                    voted outcome
  vant forum links                  Threads with linked votes

Options:
  --json                            Machine-readable output (decisions/links)

Tenancy (pass 87): anonymous sees the global commons only; workspace-
tagged posts are visible to their tenant (+ registry admins).
`);
    process.exit(0);
}

const jsonOut = args.includes('--json');

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

        case 'decisions': {
            // (Wave U4 / U4.2) Inspect the decision trail of a thread:
            // votes, escrow holds touched, outcome. Read-only.
            const barcode = args[1];
            if (!barcode) { console.error('Usage: vant forum decisions <barcode>'); process.exit(1); }
            const trail = f.threadDecisionTrail(barcode);
            if (!trail.ok) {
                console.error('✗ ' + (trail.code === 'E_FORUM_ABSENT' ? 'no vote linked to thread ' + barcode : (trail.error || 'unknown')));
                process.exit(1);
            }
            if (jsonOut) {
                console.log(JSON.stringify(trail, null, 2));
                break;
            }
            console.log('\nDecision trail: ' + trail.thread + ' → vote ' + trail.topic);
            console.log('  proposal: ' + (trail.proposal || '(unstamped)'));
            console.log('  author:   ' + (trail.author || '(unknown)'));
            if (trail.ledger) {
                console.log('  ledger:   ' + trail.ledger.status + (trail.ledger.hash ? ' (hash ' + String(trail.ledger.hash).slice(0, 12) + '…)' : ''));
                console.log('  ballot:   ' + (Array.isArray(trail.ledger.ballot) ? trail.ledger.ballot.join(' / ') : '(n/a)'));
            } else {
                console.log('  ledger:   (not visible / absent)');
            }
            console.log('  votes:    ' + (trail.votes.length ? trail.votes.map(v => v.voter + '→' + v.outcome).join(', ') : '(none cast)'));
            console.log('  holds:    ' + (trail.holds.length ? trail.holds.map(h => h.holdId + (h.held ? ' (held)' : '')).join(', ') : '(none touched / all released)'));
            if (trail.decision) {
                console.log('  outcome:  ' + trail.decision.winner + ' (' + trail.decision.percentage + '% of ' + trail.decision.votes + ' ballots)');
            } else {
                console.log('  outcome:  ' + (trail.outcome || 'undecided') + ' (no decision record yet)');
            }
            break;
        }

        case 'links': {
            const links = f.listThreadLinks();
            if (jsonOut) { console.log(JSON.stringify(links, null, 2)); break; }
            if (!links.length) { console.log('No thread→vote links (create a vote with a thread: the forum layer links it automatically).'); break; }
            console.log(`Thread→vote links (${links.length}):`);
            for (const l of links) {
                console.log('  -', l.thread, '→', l.topic, l.decided ? '(decided)' : '(open)');
            }
            break;
        }

        default:
            console.log('Usage: vant forum <list|post|view|message|decisions|links> (try -h)');
            process.exit(1);
    }
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
