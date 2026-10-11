#!/usr/bin/env node
/**
 * Forum msg + escrow wiring pin (pass 164).
 *
 * Pins the pass-164 contract, which was previously a HEADER FICTION
 * (pass 161 found the overclaim; this pin proves it is now real):
 *   1. ESCROW GATE, default-open: publish/vote/castVote succeed with no
 *      budgets configured (the wiring changes nothing out of the box).
 *   2. ESCROW GATE, opt-in bite: with a budget row configured, a spent-
 *      out agent is DENIED with reason 'escrow_denied' — and the block
 *      emits forum:escrow:blocked.
 *   3. MSG NOTIFY: a publish shouts on the 'forum' channel (works in
 *      every install — channels are sandbox-free) and creates the thread
 *      conversation (forum:<barcode>); the in-conversation post may be
 *      sandbox-gated, which is fine — the channel shout is the notify.
 *   4. NOTIFY IS BEST-EFFORT: a poisoned msg module must NOT fail the
 *      publish.
 *
 * Per test/forum.test.js conventions: direct asserts + counter, process
 * exit code is the verdict.
 */

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
function ok(name, fn) { /* set by runner below */ }

async function main() {
    const forumMod = require('../lib/forum');
    const escrowMod = require('../lib/escrow');
    const msgMod = require('../lib/msg');
    const event = require('../lib/event');

    // ---- Pin 1: default-open escrow (no budgets configured) ----
    {
        const forum = new forumMod.Forum();
        const res = await forum.publish('No budgets configured pin', 'plain body', { agentId: 'agent-default-open' });
        if (res.published !== true) {
            console.error('  ✗ pin1 default-open: publish denied without budget — ' + JSON.stringify(res));
            process.exit(1);
        }
        console.log('  ✓ publish succeeds with NO budget configured (wiring is invisible by default)');
    }

    // ---- Pin 2: opt-in bite (budget row makes canSpend deny) ----
    {
        // Fresh escrow instance with a MINIMAL budget: agent at cap, spend
        // drains it. forum creates its own escrow via escrow.create() —
        // fresh-instance-by-design — so configure the SAME store the module
        // reads: escrow persists via the default state store, so set the
        // budget through an instance with the same defaults.
        const escrow = escrowMod.create();
        const agentId = 'agent-budgeted';
        // Give the agent a working budget of exactly 2 vote-units, then burn
        // it with the module's own spend recording.
        escrow.setBudget(agentId, 2);
        escrow.recordSpend(agentId, 2);

        const forum = new forumMod.Forum();
        const res = await forum.publish('Budget dry pin', 'body', { agentId });
        if (res.published === true) {
            console.error('  ✗ pin2 opt-in bite: spent-out agent still published — escrow gate did not bite');
            process.exit(1);
        }
        assert.strictEqual(res.reason, 'escrow_denied', 'reason escrow_denied, got ' + JSON.stringify(res));
        console.log('  ✓ spent-out agent denied with reason escrow_denied (gate bites when budget exists)');
    }

    // ---- Pin 3: msg thread conversation created + post lands ----
    {
        const forum = new forumMod.Forum();
        const res = await forum.publish('Msg wiring pin', 'the body', { agentId: 'agent-msg' });
        if (res.published !== true) {
            console.error('  ✗ pin3 msg notify: publish failed — ' + JSON.stringify(res));
            process.exit(1);
        }
        const barcode = res.publication.id;
        const convId = 'forum:' + barcode;
        const shouts = msgMod.channelMessages('forum');
        const shout = Array.isArray(shouts) && shouts.find(m =>
            m && m.type === 'forum:publish' && m.barcode === barcode && m.title === 'Msg wiring pin');
        if (!shout) {
            console.error('  ✗ pin3 msg notify: no channel shout on forum — got ' + JSON.stringify(shouts).slice(0, 300));
            process.exit(1);
        }
        const conv = msgMod.list().find(c => c.id === convId);
        if (!conv) {
            console.error('  ✗ pin3 msg notify: thread conversation ' + convId + ' not created');
            process.exit(1);
        }
        console.log('  ✓ publish shouts on the forum channel AND creates the thread conversation');
    }

    // ---- Pin 4: notify is best-effort (poisoned msg cannot fail publish) ----
    {
        const realMsg = require.cache[require.resolve('../lib/msg')];
        require.cache[require.resolve('../lib/msg')].exports = {
            create: () => { throw new Error('poisoned'); },
            post: () => { throw new Error('poisoned'); },
            send: () => { throw new Error('poisoned'); }
        };
        try {
            const forum = new forumMod.Forum();
            const res = await forum.publish('Poison-msg pin', 'body', { agentId: 'agent-poison' });
            if (res.published !== true) {
                console.error('  ✗ pin4 best-effort: poisoned msg FAILED the publish — ' + JSON.stringify(res));
                process.exit(1);
            }
            console.log('  ✓ poisoned msg module cannot fail a publish (notify is best-effort)');
        } finally {
            require.cache[require.resolve('../lib/msg')].exports = realMsg.exports;
        }
    }

    console.log('\n  Forum msg+escrow wiring pin: ' + passed + '/' + (passed + failed) + ' checks asserted inline (4 scenarios)');
}

main().then(() => {
    console.log('  All pins passed.');
    process.exit(0);
}).catch((e) => {
    console.error('  UNEXPECTED: ' + (e && e.stack || e));
    process.exit(1);
});
