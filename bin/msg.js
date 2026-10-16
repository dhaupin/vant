#!/usr/bin/env node
/**
 * Vant Msg CLI
 * Messaging system
 * 
 * Usage:
 *   vant msg send <to> <message>  # Send message
 *   vant msg list                  # List messages
 *   vant msg read <id>            # Read message
 *   vant msg channels             # List channels
 *   vant msg join <channel>       # Join channel
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Msg CLI - Messaging system

Usage:
  vant msg send <to> <message>    Send message to user/channel
  vant msg list                  List recent messages
  vant msg read <id>             Read message by ID
  vant msg channels              List available channels
  vant msg join <channel>        Join a channel
  vant msg leave <channel>       Leave a channel
  vant msg inbox                 Show inbox
  vant msg unread                Show unread count
`);
    process.exit(0);
}

async function run() {
    try {
        // (Issue #170 QC) The conversation write path needs canWrite; the
        // operator CLI gets session caps like the other gate-demanding CLIs
        // (market/org/scenario). Session-only, never persisted.
        try {
            require('../lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true });
        } catch (e) { /* sandbox unavailable — gates open default */ }
        const msg = require('../lib/msg');
        
        if (subcmd === 'send' || subcmd === 'post' || subcmd === 'write') {
            const to = args[1];
            const message = args.slice(2).join(' ');
            if (!to || !message) {
                console.error('Usage: vant msg send <to> <message>');
                process.exit(1);
            }
            // (Issue #170 QC) The old verb was a print-and-exit no-op — the
            // message never landed anywhere (msg list stayed empty). Wire it
            // to the REAL conversation surface: auto-create the conversation
            // keyed by the recipient, then post. Only print on a real
            // envelope; nonzero on refusal (pass-131 CLI contract).
            const conv = typeof msg.create === 'function' ? msg.create({ id: 'to:' + to }) : null;
            const convId = (conv && conv.id) || 'to:' + to;
            const r = msg.post(convId, message, { author: 'cli' });
            if (r && r.error) {
                console.error('Send refused: ' + r.error);
                process.exit(1);
            }
            console.log('Sent to ' + to + ' (' + convId + '): message ' + (r && r.id ? r.id : 'ok'));
        } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'inbox') {
            const conversations = msg.list();
            console.log('Messages:', conversations.reduce((n, c) => n + c.messageCount, 0));
            // (Issue #170 QC) Show the RECENT tail — slice(0,10) on the
            // insertion-ordered array hid everything except the oldest ten
            // (526 convs = ten stale forum threads, zero live ones).
            conversations
                .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
                .slice(0, 10)
                .forEach(c => {
                console.log('  ' + c.id + '  ' + c.messageCount + ' message(s), last activity ' + (c.lastActivity ? new Date(c.lastActivity).toISOString() : '?'));
            });
        } else if (subcmd === 'read' || subcmd === 'show' || subcmd === 'view') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant msg read <id>');
                process.exit(1);
            }
            // (Issue #170 QC) No msg.get exists — search every conversation's
            // messages() for the id (also covers the reply tree).
            const conversations = msg.list();
            for (const c of conversations) {
                const found = (msg.messages(c.id, { limit: 200 }) || []).find(m => m.id === id);
                if (found) {
                    console.log('[' + found.id + '] from ' + found.author + ' at ' + new Date(found.timestamp).toISOString());
                    console.log('  conv: ' + c.id);
                    console.log(found.content);
                    return;
                }
            }
            console.error('✗ No message with id: ' + id + ' (searched ' + conversations.length + ' conversation(s))');
            process.exit(1);
        } else if (subcmd === 'channels' || subcmd === 'chans') {
            // (Issue #170 QC) The old code dereferenced a null info() — the
            // module returns null when no platform is booted. Read the REAL
            // channel surface (IPC-style send() stores into _channels).
            const n = msg.stats ? (msg.stats().channels || 0) : 0;
            console.log('Channels:', n);
        } else if (subcmd === 'join' || subcmd === 'subscribe') {
            const channel = args[1];
            if (!channel) {
                console.error('Usage: vant msg join <channel>');
                process.exit(1);
            }
            const result = await msg.join(channel);
            console.log('Joined channel:', channel);
        } else if (subcmd === 'leave' || subcmd === 'unsubscribe') {
            const channel = args[1];
            if (!channel) {
                console.error('Usage: vant msg leave <channel>');
                process.exit(1);
            }
            console.log('Leaving channel:', channel);
        } else if (subcmd === 'unread' || subcmd === 'count') {
            // (Issue #170 QC) info() returns null (or per-conversation stats,
            // never a global unread count). Compute unread from the stats
            // surface instead of dereferencing null.
            const st = msg.stats ? msg.stats() : {};
            console.log('Unread:', st.unread || 0);
        } else {
            console.log('Usage: vant msg <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
