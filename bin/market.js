#!/usr/bin/env node
/**
 * Vant Market CLI — knowledge trading + (U6.5 productized) paid skills.
 *
 * Classic surface (knowledge trade):
 *   vant market list <type> <title>
 *   vant market bid <title>
 *   vant market search [type] [tag]
 *   vant market trade <listingId> <buyerId>
 *   vant market stats / get <id> / bids
 *
 * Skills surface (delivery-confirmed paid labor — gated by
 * market.skillsEnabled / VANT_MARKET_SKILLS_ENABLED):
 *   vant market skill-list <title> [--price N] [--kind text|code]
 *                            [--desc <text>] [--seller <agentId>]
 *   vant market skill-buy <listingId> [--buyer <agentId>]
 *   vant market skill-deliver <tradeId> <payload> [--seller <agentId>]
 *                              (payload '-' = read stdin)
 *   vant market skill-settle <tradeId> confirm|refute [--buyer <agentId>]
 *   vant market skill-status <listingId>
 *   vant market skill-sweep
 *   vant market skill-gate [on|off]
 *
 * Exit codes: 0 ok; 1 typed lib error (code on stderr); 2 usage error.
 */
const args = process.argv.slice(2);
const action = args[0];

function flagVal(flag) {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

const market = require('../lib/market');
const config = require('../lib/config');

function callerId() {
    // The CLI process identity: explicit flag > VANT_AGENT_ID > 'cli'
    const viaFlag = flagVal('--agent') || flagVal('--seller') || flagVal('--buyer');
    return viaFlag || process.env.VANT_AGENT_ID || 'cli';
}

function _fail(r) {
    console.error('Market refused: ' + (r.error || 'unknown'));
    if (r.code) console.error('  code: ' + r.code);
    process.exit(1);
}

// Give the CLI process the capabilities the market gates demand
// (same shape the other operator CLIs use — session only, never persisted).
require('../lib/sandbox').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canTrade: true, canSpawn: true
});

(async () => {
    const ctx = { agentId: callerId(), consentGiven: true, userCtx: { consentGiven: true } };

    switch (action) {
        case 'list': case 'bid': case 'search': case 'trade': case 'stats': case 'get': case 'bids': {
            // Classic surface unchanged (kept minimal here; see the old verbs)
            const mcp = require('../lib/mcp');
            const param1 = args[1], param2 = args[2];
            if (action === 'list') {
                if (!param1 || !param2) { console.error('Usage: vant market list <type> <title>'); process.exit(2); }
                console.log(JSON.stringify(await mcp.execute('market_list', {
                    type: param1, title: param2,
                    summary: args.slice(3).join(' ') || 'Listed via CLI',
                    seller: callerId(), tags: ['cli'], context: ctx
                }), null, 2));
            } else if (action === 'bid') {
                if (!param1) { console.error('Usage: vant market bid <title>'); process.exit(2); }
                console.log(JSON.stringify(await mcp.execute('market_bid', {
                    title: param1, description: args.slice(2).join(' ') || 'Bid via CLI',
                    bidder: callerId(), tags: ['cli'], context: ctx
                }), null, 2));
            } else if (action === 'search') {
                const filters = {};
                if (param1 && !param1.startsWith('-')) filters.type = param1;
                if (param2 && !param2.startsWith('-')) filters.tags = [param2];
                console.log(JSON.stringify(await mcp.execute('market_search', filters), null, 2));
            } else if (action === 'trade') {
                if (!param1 || !param2) { console.error('Usage: vant market trade <listingId> <buyerId>'); process.exit(2); }
                console.log(JSON.stringify(await mcp.execute('market_trade', { listingId: param1, buyerId: param2, context: ctx }), null, 2));
            } else if (action === 'stats') {
                console.log(JSON.stringify(await mcp.execute('market_stats', {}), null, 2));
            } else if (action === 'get') {
                if (!param1) { console.error('Usage: vant market get <listingId>'); process.exit(2); }
                console.log(JSON.stringify(await mcp.execute('market_get', { listingId: param1 }), null, 2));
            } else {
                console.log(JSON.stringify(await mcp.execute('market_getBids', {}), null, 2));
            }
            break;
        }

        case 'skill-list': {
            const title = args[1];
            if (!title) { console.error('Usage: vant market skill-list <title> [--price N] [--kind text|code] [--desc <text>] [--seller <id>]'); process.exit(2); }
            const payloadKind = flagVal('--kind') || 'text';
            const priceRaw = flagVal('--price');
            const price = priceRaw !== undefined ? Number(priceRaw) : undefined;
            if (priceRaw !== undefined && (!Number.isFinite(price))) { console.error('Market refused: --price must be a number\n  code: E_SKILL_PRICE'); process.exit(1); }
            // Payload is NOT accepted at listing time — payloads are validated
            // AT DELIVERY (the contract: delivery never blesses unverified bytes).
            const r = await market.listSkill({
                title, payloadKind, price,
                description: flagVal('--desc') || 'Listed via CLI'
            }, ctx);
            if (r && r.error) return _fail(r);
            console.log(`\n✓ Skill listed: ${r.listingId}`);
            console.log(`  title:       ${title}`);
            console.log(`  price:       ${r.listing.price} credits`);
            console.log(`  payloadKind: ${payloadKind} (payload validated at delivery)`);
            console.log(`  seller:      ${r.listing.seller || 'anonymous'}`);
            console.log(`\nBuyer pays BEFORE seeing the payload — settle only after delivery.`);
            break;
        }

        case 'skill-buy': {
            const listingId = args[1];
            if (!listingId) { console.error('Usage: vant market skill-buy <listingId> [--buyer <id>]'); process.exit(2); }
            const r = await market.buySkill(listingId, callerId(), { agentId: callerId(), workspace: flagVal('--workspace') });
            if (r && r.error) return _fail(r);
            console.log(`\n✓ Bought (escrow HELD, no debit yet): ${r.tradeId}`);
            console.log(`  hold: ${r.escrowHold}`);
            console.log(`  state: ${r.state} — seller delivers, then YOU settle (confirm|refute).`);
            break;
        }

        case 'skill-deliver': {
            const tradeId = args[1];
            let payload = args.slice(2).find((a, i, arr) => !a.startsWith('--') && (i === 0 || !arr[i - 1].startsWith('--')));
            if (!tradeId || payload === undefined) { console.error('Usage: vant market skill-deliver <tradeId> <payload|-> [--seller <id>]'); process.exit(2); }
            if (payload === '-') payload = require('fs').readFileSync(0, 'utf8');
            payload = String(payload);
            const r = await market.deliverSkill(tradeId, payload, { agentId: callerId() });
            if (r && r.error) return _fail(r);
            console.log(`\n✓ Delivered: ${r.tradeId}`);
            console.log(`  payloadHash: ${r.payloadHash}`);
            console.log(`  awaiting the buyer's settle (confirm|refute) — delivery verified nothing.`);
            break;
        }

        case 'skill-settle': {
            const tradeId = args[1];
            const decision = args[2];
            if (!tradeId || (decision !== 'confirm' && decision !== 'refute')) {
                console.error('Usage: vant market skill-settle <tradeId> confirm|refute [--buyer <id>]');
                process.exit(2);
            }
            const r = await market.settleSkill(tradeId, decision, { agentId: callerId() });
            if (r && r.error) return _fail(r);
            if (decision === 'confirm') {
                console.log(`\n✓ Settled (CONFIRM — escrow debited): ${r.tradeId}`);
                console.log(`  payloadHash: ${r.payloadHash}`);
                console.log(`  trust feed: ${r.trustWritten ? 'positive record written for the seller' : '⚠ record failed'}`);
            } else {
                console.log(`\n✓ Settled (REFUTE — hold released, NO debit): ${r.tradeId}`);
                console.log(`  trust feed: ${r.trustWritten ? 'negative record written for the seller' : '⚠ record failed'}`);
            }
            break;
        }

        case 'skill-status': {
            const listingId = args[1];
            if (!listingId) { console.error('Usage: vant market skill-status <listingId>'); process.exit(2); }
            const r = await market.skillStatus(listingId);
            if (r && r.error) return _fail(r);
            console.log(`\nSkill: ${r.title} (${r.listingId})`);
            console.log(`  price:       ${r.price} credits`);
            console.log(`  payloadKind: ${r.payloadKind}`);
            console.log(`  seller:      ${r.seller} (legacy rep: ${JSON.stringify(r.sellerReputation)})`);
            if (r.reputation) {
                console.log(`  market rep:  score=${r.reputation.score} tx=${r.reputation.transactions} buyers=${r.reputation.distinctBuyers}` + (r.reputation.shillSuspicion ? ` ALERT: ${r.reputation.shillSuspicion} (top buyer owns ${Math.round(r.reputation.maxBuyerShare * 100)}% of sales)` : ''));
            }
            console.log(`  revoked:     ${r.revoked}`);
            console.log(`  awaiting buyer confirmation: ${r.awaitingConfirmation}`);
            break;
        }

        case 'skill-sweep': {
            // (U6.6) on-demand evidence sweep: release stale pending_delivery
            // holds. Read-only on young trades; a sweep of nothing exits 0.
            const r = await market.skillSweep({ agentId: callerId() });
            if (r && r.error) return _fail(r);
            if (r.timedOut === 0) {
                console.log(`✓ sweep clean — no trades exceeded the TTL (${r.ttlMs}ms).`);
            } else {
                console.log(`✓ swept ${r.timedOut} stale trade(s) (TTL ${r.ttlMs}ms):`);
                for (const t of r.trades) console.log(`  - ${t.tradeId} (listing ${t.listingId}) aged ${t.agedMs}ms — hold released, NO debit, no trust penalty`);
            }
            break;
        }

        case 'skill-gate': {
            // Honest knob: turn the surface on/off for this brain. Reads the
            // LIVE value when queried (env alias > brain config > default off).
            const want = args[1];
            if (want === 'on' || want === 'true' || want === '1') {
                // (U6.5) config.set is setFlag (session-only); the persisted
                // write is setConfig (pass-95 precedent from vant config set).
                const setRes = config.setConfig('market.skillsEnabled', true);
                if (setRes && setRes.error) { console.error('Gate set failed: ' + setRes.error); process.exit(1); }
                console.log('✓ market.skillsEnabled = true' + (setRes.persisted ? ' (persisted to the ' + setRes.brain + ' brain config)' : ' (runtime only)'));
            } else if (want === 'off' || want === 'false' || want === '0') {
                const setRes = config.setConfig('market.skillsEnabled', false);
                if (setRes && setRes.error) { console.error('Gate set failed: ' + setRes.error); process.exit(1); }
                console.log('✓ market.skillsEnabled = false' + (setRes.persisted ? ' (persisted to the ' + setRes.brain + ' brain config)' : ' (runtime only)'));
            } else {
                const on = market.skillGate ? market.skillGate() : config.get('market.skillsEnabled');
                console.log(`market.skillsEnabled = ${on}`);
                console.log('  env alias: VANT_MARKET_SKILLS_ENABLED=true|1 (strongest)');
                console.log('  toggle:    vant market skill-gate on|off');
                if (!on) process.exit(3); // discoverable-not-active: distinct code
            }
            break;
        }

        default: {
            console.log(`Vant Market CLI — knowledge trading + paid skills

Knowledge trade:
  vant market list <type> <title>      List knowledge
  vant market bid <title>              Post a bid
  vant market search [type] [tag]      Search listings
  vant market trade <id> <buyer>       Execute trade
  vant market stats | get <id> | bids

Paid skills (delivery-confirmed; gated: market.skillsEnabled):
  vant market skill-list <title> [--price N] [--kind text|code] [--desc <t>]
                                 List a skill (payload comes at DELIVERY)
  vant market skill-buy <id> [--buyer <agentId>]
                                 Buy: escrow HOLD, no debit until you confirm
  vant market skill-deliver <tradeId> <payload|-> [--seller <agentId>]
                                 Seller delivers the payload (hash recorded)
  vant market skill-settle <tradeId> confirm|refute
                                 Buyer settles: confirm debits + rep-up;
                                 refute releases the hold (no debit) + rep-down
  vant market skill-status <listingId>
                                 Pre-trade snapshot incl. seller reputation
                                 + shill-resistant market rep (concentration flag)
  vant market skill-sweep        Release stale pending_delivery holds (TTL
                                 evidence rules; no debit, no trust penalty)
  vant market skill-gate [on|off]  Show/toggle the marketplace gate

Exit codes: 0 ok · 1 typed lib error · 2 usage · 3 skill gate off`);
        }
    }
})().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
