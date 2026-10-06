#!/usr/bin/env node
/**
 * Vant Market CLI
 *
 * Usage:
 *   vant market list <type> <title>
 *   vant market bid <title>
 *   vant market search [type] [tag]
 *   vant market trade <listingId> <buyerId>
 *   vant market stats
 *   vant market get <listingId>
 */

const mcp = require('../lib/mcp');

const args = process.argv.slice(2);
const action = args[0];
const param1 = args[1];
const param2 = args[2];

// Context for market operations (defaults)
const ctx = { agentId: 'cli', consentGiven: true, userCtx: { consentGiven: true } };

async function main() {
    switch (action) {
        case 'list':
            if (!param1 || !param2) {
                console.log('Usage: vant market list <type> <title>');
                console.log('Example: vant market list knowledge "How to build AI"');
                process.exit(1);
            }
            const listing = await mcp.execute('market_list', {
                type: param1,
                title: param2,
                summary: args.slice(3).join(' ') || 'Listed via CLI',
                seller: 'cli-user',
                tags: ['cli'],
                context: ctx
            });
            console.log(JSON.stringify(listing, null, 2));
            break;

        case 'bid':
            if (!param1) {
                console.log('Usage: vant market bid <title>');
                console.log('Example: vant market bid "Looking for neural net tips"');
                process.exit(1);
            }
            const bid = await mcp.execute('market_bid', {
                title: param1,
                description: args.slice(2).join(' ') || 'Bid via CLI',
                bidder: 'cli-user',
                tags: ['cli'],
                context: ctx
            });
            console.log(JSON.stringify(bid, null, 2));
            break;

        case 'search':
            const filters = {};
            if (param1 && !param1.startsWith('-')) filters.type = param1;
            if (param2 && !param2.startsWith('-')) filters.tags = [param2];
            // Handle flags
            args.slice(2).forEach(arg => {
                if (arg.startsWith('-tag=')) filters.tags = [arg.replace('-tag=', '')];
                if (arg.startsWith('-query=')) filters.query = arg.replace('-query=', '');
            });
            const results = await mcp.execute('market_search', filters);
            console.log(JSON.stringify(results, null, 2));
            break;

        case 'trade':
            if (!param1 || !param2) {
                console.log('Usage: vant market trade <listingId> <buyerId>');
                console.log('Example: vant market trade listing_abc123 buyer-1');
                process.exit(1);
            }
            const trade = await mcp.execute('market_trade', {
                listingId: param1,
                buyerId: param2,
                context: ctx
            });
            console.log(JSON.stringify(trade, null, 2));
            break;

        case 'stats':
            const stats = await mcp.execute('market_stats', {});
            console.log(JSON.stringify(stats, null, 2));
            break;

        case 'get':
            if (!param1) {
                console.log('Usage: vant market get <listingId>');
                process.exit(1);
            }
            const getResult = await mcp.execute('market_get', { listingId: param1 });
            console.log(JSON.stringify(getResult, null, 2));
            break;

        case 'bids':
            const bids = await mcp.execute('market_getBids', {});
            console.log(JSON.stringify(bids, null, 2));
            break;

        default:
            console.log('Vant Market CLI - Knowledge Trading');
            console.log('');
            console.log('Usage:');
            console.log('  vant market list <type> <title>     List knowledge');
            console.log('  vant market bid <title>             Post a bid');
            console.log('  vant market search [type] [tag]    Search listings');
            console.log('  vant market trade <id> <buyer>     Execute trade');
            console.log('  vant market stats                   Market statistics');
            console.log('  vant market get <id>                Get listing');
            console.log('  vant market bids                    List all bids');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
