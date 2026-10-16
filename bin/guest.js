#!/usr/bin/env node
/**
 * Guests CLI — the per-identity multi-guest auth door (H1 of #185, pass 211).
 *
 * Usage:
 *   vant guest issue --name <name> [--role human|agent|observer]
 *                    [--scope org:|dept:|team:|agent:<x>] [--trust high|medium|low|none]
 *                    [--expires <spec>] [--brain <name>]
 *   vant guest list                              Roster (no secrets, ever)
 *   vant guest revoke <id|name>                  Denylist: dead at once, forever
 *   vant guest pair --code <code>                Redeem `vant headless`'s pairing code
 *
 * Tokens are `vguest_<id>_<secret>` randoms, hashed at rest (SHA-256); the
 * raw secret prints ONCE at issue time. Roles map onto the sandbox
 * capability vocabulary; scopes/trust ride lib/scope.js + lib/trust.js —
 * never a fourth permission system. Spec: docs/security/multi-guest-auth.md
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';
const guests = require('../lib/guests');

if (subcmd === '-h' || subcmd === '--help' || subcmd === 'help') {
    console.log(`
Guests — per-identity multi-guest auth for the MCP door (#185 H1).

Usage:
  vant guest issue --name <name> [--role human|agent|observer]
      [--scope org:|dept:|team:|agent:<x>] [--trust high|medium|low|none]
      [--expires 7d] [--brain <name>]
  vant guest list                       Roster (raw tokens never shown)
  vant guest revoke <id|name>           Revoke (denylist: dead now + forever)
  vant guest pair --code <code>         Redeem the headless pairing code

Roles ride the sandbox capability vocabulary (observer: read-only;
human: +write +spawn — the operator dashboard; agent: +exec). Trust levels
RESTRICT only: none -> read-only, low -> no exec/spawn. Guest tokens cannot
manage guests (guest_issue/list/revoke are admin-only).
`);
    process.exit(0);
}

const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : undefined;
};
const brain = flag('--brain') !== undefined ? flag('--brain') : undefined;

if (subcmd === 'issue' || subcmd === 'i') {
    const name = flag('--name');
    if (!name) {
        console.error('Usage: vant guest issue --name <name> [--role human|agent|observer] [--scope <ref>] [--trust <level>] [--expires <spec>]');
        process.exit(1);
    }
    try {
        const issued = guests.issue(name, {
            role: flag('--role') === undefined ? undefined : flag('--role'),
            scopeOwner: flag('--scope') === undefined ? undefined : flag('--scope'),
            trustLevel: flag('--trust') === undefined ? undefined : flag('--trust'),
            expires: flag('--expires') === undefined ? undefined : flag('--expires'),
            brain
        });
        console.log('🎟️  Guest issued: ' + issued.guest.id + ' (' + issued.guest.name + ', ' + issued.guest.role + ', trust ' + issued.guest.trustLevel + ')');
        console.log('   TOKEN (shown ONCE — the roster stores only its SHA-256 hash):');
        console.log('   ' + issued.token);
        console.log('   hand it to the client as a Bearer header: Authorization: Bearer ' + issued.token.slice(0, 12) + '...');
        process.exit(0);
    } catch (e) {
        console.error('❌ ' + e.message);
        process.exit(1);
    }
}

if (subcmd === 'list' || subcmd === 'ls') {
    const roster = guests.list({ brain });
    if (roster.length === 0) {
        console.log('No guests on record (issue one with `vant guest issue --name ...`).');
        process.exit(0);
    }
    console.log('Guests (' + roster.length + '):\n');
    for (const g of roster) {
        const state = g.revokedAt ? 'REVOKED' : (g.expiresAt && Date.now() > g.expiresAt ? 'EXPIRED' : 'active');
        console.log('  ' + g.id + '  ' + g.name + '  role=' + g.role + '  trust=' + g.trustLevel
            + (g.scopeOwner ? '  scope=' + g.scopeOwner : '')
            + '  [' + state + ']'
            + (g.lastSeenAt ? '  last-seen ' + new Date(g.lastSeenAt).toISOString() : '  never-used'));
    }
    process.exit(0);
}

if (subcmd === 'revoke' || subcmd === 'rm') {
    const id = args[1];
    if (!id || id.startsWith('--')) {
        console.error('Usage: vant guest revoke <id|name>');
        process.exit(1);
    }
    const ok = guests.revoke(id, { brain });
    if (ok) console.log('🔒 Revoked: ' + id + ' — any hold of that token is locked out at once (denylist-backed).');
    else { console.error('❌ No such active guest: ' + id); process.exit(1); }
    process.exit(0);
}

if (subcmd === 'pair') {
    const code = flag('--code');
    if (!code) {
        console.error('Usage: vant guest pair --code <code from `vant headless` boot>');
        process.exit(1);
    }
    const out = guests.pair(code, { brain });
    if (out.ok) {
        console.log('🤝 Pairing redeemed → operator guest ' + out.guest.id + ' (' + out.guest.role + ', expires ' + new Date(out.guest.expiresAt).toISOString() + ')');
        console.log('   TOKEN (shown ONCE):');
        console.log('   ' + out.token);
        process.exit(0);
    }
    console.error('❌ ' + out.reason);
    process.exit(1);
}

console.error('Usage: vant guest <issue|list|revoke|pair> — run `vant guest --help` for the full surface.');
process.exit(1);
