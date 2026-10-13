#!/usr/bin/env node
/**
 * Msg Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n💬 MSG MODULE TESTS\n');

test('msg module loads', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: !!msg };
});

test('msg has Msg class', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: !!msg.Msg };
});

test('msg has create function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.create === 'function' };
});

test('msg has send function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.send === 'function' };
});

test('msg has post function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.post === 'function' };
});

test('msg has reply function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.reply === 'function' };
});

test('msg has messages function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.messages === 'function' };
});

test('msg has list function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.list === 'function' };
});

test('msg has delete function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.delete === 'function' };
});

test('msg has clear function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.clear === 'function' };
});

test('msg has getStatus function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.getStatus === 'function' };
});

test('msg has isOperationAllowed function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('msg has listStack function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.listStack === 'function' };
});

test('msg has getStackStats function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.getStackStats === 'function' };
});

test('msg has getStackMessages function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.getStackMessages === 'function' };
});

test('listStack returns array', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    const convos = msg.listStack();
    return { success: Array.isArray(convos) };
});

test('getStackStats returns object with source stack', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    const stats = msg.getStackStats();
    return { success: stats && stats.source === 'stack' };
});

// ==================== pass 212 H3 pins (#185 era-context tagging) ====================

const ERA_PATH = path.join(ROOT, 'lib', 'era.js');
function loadEra() {
    delete require.cache[require.resolve(ERA_PATH)];
    return require(ERA_PATH);
}
function loadMsg() {
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'msg'))];
    return require(path.join(ROOT, 'lib', 'msg'));
}

// Era lifecycle helper: close any open era, then open one and return its id.
function openEra(intent) {
    const era = loadEra();
    return (async () => {
        const cur = era.current();
        if (cur.open) await era.close({ next: 'test teardown' });
        const opened = await era.start(intent);
        const after = era.current();
        return after.open ? after.era.id : null;
    })();
}

(async () => {
    // Async-aware pin runner for the H3 block (era lifecycle is async).
    async function testA(name, fn) {
        try {
            const r = await fn();
            if (r === true || (r && r.success)) {
                results.passed++;
                console.log('  ✓ ' + name);
            } else {
                results.failed++;
                console.log('  ✗ ' + name + ': ' + ((r && r.error) || 'assertion failed'));
            }
        } catch (e) {
            results.failed++;
            console.log('  ✗ ' + name + ': ' + e.message);
        }
    }

    const era = loadEra();

    await testA('H3: create({era}) tags the conversation; info() shows era + task', async () => {
        const msg = require(path.join(ROOT, 'lib', 'msg'));
        const eraId = await openEra('H3: tagging pin');
        const c = msg.create({ era: eraId, task: 'task-h3-tag' });
        const i = msg.info(c.id);
        return { success: i && i.era === eraId && i.task === 'task-h3-tag', error: JSON.stringify(i) };
    });

    test('H3: hostile era tag (>100 chars) rejected loudly, conversation not created', () => {
        const msg = require(path.join(ROOT, 'lib', 'msg'));
        try {
            msg.create({ era: 'x'.repeat(101) });
            return { success: false, error: 'oversized era tag was accepted' };
        } catch (e) {
            return { success: /era/.test(e.message), error: 'wrong error: ' + e.message };
        }
    });

    test('H3: eraContext on an untagged conversation = honest absence', () => {
        const msg = require(path.join(ROOT, 'lib', 'msg'));
        const c = msg.create({});
        const ec = msg.eraContext(c.id);
        return { success: ec && ec.era === null && ec.eraState === 'untagged' && ec.rollup === null, error: JSON.stringify(ec) };
    });

    await testA('H3: eraContext on the OPEN era = live rollup with honest bucket counts', async () => {
        const msg = require(path.join(ROOT, 'lib', 'msg'));
        const ev = require(path.join(ROOT, 'lib', 'event'));
        const eraId = await openEra('H3: open-rollup pin');
        const c = msg.create({ era: eraId, task: 'task-h3-open' });
        // Fold one real line-item in through the bus (era-fam events route to memory).
        ev.emit('memory:learned', { probe: 'h3-open-rollup' });
        const ec = msg.eraContext(c.id);
        const ok = ec && ec.eraState === 'open'
            && ec.rollup && ec.rollup.id === eraId
            && typeof ec.rollup.startedAt === 'number'
            && ec.rollup.integrity === true
            && ec.rollup.lines && typeof ec.rollup.lines.memory === 'number';
        return { success: ok, error: JSON.stringify(ec) };
    });

    test('H3: eraContext with a tag matching NO known era = unknown, rollup null (no fabricated zeros)', () => {
        const msg = require(path.join(ROOT, 'lib', 'msg'));
        const c = msg.create({ era: 'era-never-existed-anywhere' });
        const ec = msg.eraContext(c.id);
        return { success: ec && ec.eraState === 'unknown' && ec.rollup === null, error: JSON.stringify(ec) };
    });

    await testA('H3: eraContext after era close = closed state with archived rollup', async () => {
        const msg = require(path.join(ROOT, 'lib', 'msg'));
        const eraId = await openEra('H3: closed-rollup pin');
        const c = msg.create({ era: eraId, task: 'task-h3-closed' });
        // Close with the LIVE cache instance — the IIFE-scope `era` const was
        // evicted by openEra's loadEra calls; closing through it would close
        // a stale module copy whose _current is a leftover era, and the pin
        // would then observe its REAL era still 'open'.
        await loadEra().close({ next: 'H3 pin: folded and archived' });
        const ec = msg.eraContext(c.id);
        const ok = ec && ec.eraState === 'closed'
            && ec.rollup && ec.rollup.id === eraId
            && ec.rollup.next === 'H3 pin: folded and archived'
            && typeof ec.rollup.closedAt === 'number';
        return { success: ok, error: JSON.stringify(ec) };
    });

    await testA('H3: era tag survives a RESTART (module evict + rehydrate from disk)', async () => {
        const eraId = await openEra('H3: restart pin');
        // Fresh module context per RESTART simulation: evict msg AND era,
        // re-require, then read the conversation back from the state file.
        const msg = loadMsg();
        const era2 = loadEra();
        const c = msg.create({ era: eraId, task: 'task-h3-restart' });
        const again = loadMsg();
        const i = again.info(c.id);
        const ec = again.eraContext(c.id);
        // The era module rehydrated too: 'open' (still folding) is valid in a
        // fresh process; 'closed' would mean the era also survived closure.
        const ok = i && i.era === eraId && i.task === 'task-h3-restart'
            && ec && ec.era === eraId && (ec.eraState === 'open' || ec.eraState === 'closed')
            && ec.rollup !== null && ec.rollup.id === eraId;
        return { success: ok, error: JSON.stringify({ i, ec }) };
    });

    await testA('H3: cross-era honesty — an open era does NOT make a conversation tagged with a DIFFERENT era "open"', async () => {
        // Regression pin for the era.current() contract: it takes no args and
        // answers {open, era, integrity} for the CURRENT era. A naive
        // implementation calling era.current() for truthiness reports every
        // tagged conversation 'open' while ANY era folds — that was the H3 bug.
        const msg = loadMsg();
        // Era 1: open then close → archived.
        const era1 = await openEra('H3: first era');
        const c = msg.create({ era: era1, task: 'task-cross-era' });
        // (Same stale-instance rule as the closed-era pin: close through a
        // FRESH loadEra(); anything captured before openEra evicted it.)
        await loadEra().close({ next: 'first done' });
        // Era 2: a DIFFERENT era now open.
        await openEra('H3: second era');
        const ec = msg.eraContext(c.id);
        const ok = ec && ec.era === era1 && ec.eraState === 'closed'
            && ec.rollup && ec.rollup.next === 'first done';
        return { success: ok, error: JSON.stringify(ec) };
    });

    // ==================== pass 214: channel-scope (owner concept) ====================
    // Channels gain a claim-once OWNER ref (org:/dept:/team:/agent:<id>).
    // Unscoped channels stay PUBLIC (the lib/scope legacy read rule); scoped
    // ones answer visitors through guests.tenantVisible at the door. The unit
    // contract: stamp-on-create, loud invalid refs, typed steal refusal,
    // idempotent same-owner claim, owner dies WITH the channel, and the owner
    // rides the arch-A snapshot (restart survival).

    const u214 = Date.now().toString(36);

    test('CS: send stamp-on-create binds a NEW channel; accessor answers; invalid ref throws loud', () => {
        const msg0 = require(path.join(ROOT, 'lib', 'msg'));
        const ch = 'cs_new_' + u214;
        msg0.send(ch, { from: 'x', content: 'y' }, { scopeOwner: 'team:cs_' + u214 });
        if (msg0.channelOwner(ch) !== 'team:cs_' + u214) {
            return { success: false, error: 'owner not stamped: ' + msg0.channelOwner(ch) };
        }
        try {
            msg0.send('cs_bad_' + u214, { a: 1 }, { scopeOwner: 'not-a-ref' });
            return { success: false, error: 'invalid scopeOwner accepted' };
        } catch (e) {
            return { success: /org:\/dept|scopeOwner/.test(e.message) };
        }
    });

    test('CS: setChannelOwner claims an unowned channel and refuses to steal a claimed one (typed)', () => {
        const msg0 = require(path.join(ROOT, 'lib', 'msg'));
        const ch = 'cs_claim_' + u214;
        msg0.send(ch, { from: 'x', content: 'y' });   // unscoped so far
        const c1 = msg0.setChannelOwner(ch, 'org:cs_' + u214);
        if (!c1.ok) return { success: false, error: 'claim refused: ' + JSON.stringify(c1) };
        const c2 = msg0.setChannelOwner(ch, 'team:other_' + u214);
        if (c2.ok !== false || c2.code !== 'E_CHANNEL_OWNED' || c2.ownerRef !== 'org:cs_' + u214) {
            return { success: false, error: 'steal not refused: ' + JSON.stringify(c2) };
        }
        const c3 = msg0.setChannelOwner(ch, 'org:cs_' + u214);
        return { success: c3.ok === true && c3.created === false, error: JSON.stringify(c3) };
    });

    test('CS: clear() drops the owner WITH the channel', () => {
        const msg0 = require(path.join(ROOT, 'lib', 'msg'));
        const ch = 'cs_del_' + u214;
        msg0.send(ch, { from: 'x', content: 'y' }, { scopeOwner: 'agent:cs_' + u214 });
        msg0.clear(ch);
        return { success: msg0.channelOwner(ch) === null, error: 'owner=' + msg0.channelOwner(ch) };
    });

    await testA('CS: the owner rides the snapshot — survives a module restart', async () => {
        const msg0 = loadMsg();
        const ch = 'cs_persist_' + u214;
        msg0.send(ch, { from: 'x', content: 'y' }, { scopeOwner: 'dept:cs_' + u214 });
        const again = loadMsg();
        return { success: again.channelOwner(ch) === 'dept:cs_' + u214, error: 'owner=' + again.channelOwner(ch) };
    });

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('H3 PIN BLOCK ERROR:', e.stack || e.message);
    process.exit(1);
});