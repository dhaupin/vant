/**
 * Event Types Catalogue (pass 206, issue #183 Part A - Nervous System)
 *
 * ONE SOURCE OF TRUTH for the event bus's channels. The engine (lib/event.js)
 * stays dynamics-free: emit stays duck-typed, the catalogue is the CONSUMER-
 * and-DOC side contract that declares what the bus carries, who emits it,
 * what the payload looks like, and how a subscriber should receive it.
 *
 * Structure (same honesty contract the crew-bus envelope table uses):
 *   FAMILY  : string       - the prefix before the FIRST colon (e.g. 'brain')
 *   CATALOG : { [name]: { type, payload, emitters, delivery, since } }
 *
 * Delivery semantics per the #183 spec:
 *   'at-most-once'  - default; zero cost; in-process handler invocation only
 *   'durable-ok'    - subscriber MAY opt in to durable delivery via
 *                     lib/bus-durable.js (watermark + persisted tail); the
 *                     OPT-IN is the subscriber's choice, never global
 *
 * `route(name)` maps a channel to its era field (the #178 FIELD_FOR_EVENT
 * contract generalized): brain/memory -> memory, sync/agent/task ->
 * threads, escrow/market -> spend, forum/consensus/msg/node-registry ->
 * social, succession/horcrux/universe/audit -> stones, era -> NEVER.
 * Unrouted (unknown) families return undefined - subscribers skip, never
 * guess (Era's own rule).
 */

const _stateStore = require('./state-store');
const errors = require('./error');

const FAMILY = {
    // --- life & identity -------------------------------------------------
    brain:       'life',       // load/switch/stack events
    memory:      'memory',     // learn/recall surface
    era:         'life',       // closed ONLY (self-guard: never folded)

    // --- work ------------------------------------------------------------
    sync:        'work',       // pull/push lifecycle
    agent:       'work',       // spawn/complete/delegate
    task:        'work',
    spring:      'work',
    pipe:        'work',
    pipeline:    'work',
    compute:     'work',
    sidecar:     'work',
    stream:      'work',
    retry:       'work',
    act:         'work',
    dream:       'work',
    think:       'work',
    onboard:     'work',

    // --- money -----------------------------------------------------------
    escrow:      'money',      // holds/releases/debits - the SPEND spine
    market:      'money',
    trust:       'money',      // cooperation records feed settlement

    // --- social ----------------------------------------------------------
    forum:       'social',
    consensus:   'social',
    vote:        'social',
    msg:         'social',
    team:        'social',
    'node-registry': 'social',
    resolution:  'social',
    registry:    'social',
    crew:        'social',
    habitat:     'social',

    // --- stones ----------------------------------------------------------
    succession:  'stones',
    horcrux:     'stones',
    universe:    'stones',
    audit:       'stones',
    state:       'stones',    // anchors/hydrates = archaeology
    backup:      'stones',
    wal:         'stones',
    'brain-lock': 'stones',
    stego:       'stones',

    // --- security chain --------------------------------------------------
    auth:        'security',
    vaf:         'security',
    qos:         'security',
    rls:         'security',
    'api:auth':  'security',
    secret:      'security',
    sandbox:     'security',
    prune:       'security',

    // --- infrastructure --------------------------------------------------
    boot:        'infra',
    server:      'infra',
    api:         'infra',
    webhook:     'infra',
    cache:       'infra',
    config:      'infra',
    search:      'infra',
    embed:       'infra',
    citations:   'infra',
    watch:       'infra',
    connector:   'infra',
    theme:       'infra',
    canvas:      'infra',
    telegram:    'infra',
    update:      'infra',
    system:      'infra',
    shell:       'infra',
    tmp:         'infra',
    context:     'infra',
    consciousness: 'infra',
    brain:       'infra'      // NOTE: brain is listed under 'life' above; the
                               // infra family map is a Cartesian VIEW - the
                               // authoritative family for 'brain:' is 'life'
};

// (pass 206) The FAMILY table above intentionally keeps one entry per NAME
// (the object literal collapses duplicates: the LAST key wins). The
// authoritative family for any name is computed by FAMILY_OF below, which
// owns the precedence: 'brain' -> life (identity events), everything else
// by this map's value.

const FAMILY_FIXES = { brain: 'life' };

/** Family for a channel or channel name; undefined when unrouted. */
function familyFor(name) {
    if (typeof name !== 'string' || !name) return undefined;
    const fam = name.split(':')[0];
    return FAMILY_FIXES[fam] || FAMILY[fam];
}

/**
 * Era-field routing (the #178 FIELD_FOR_EVENT contract, generalized here as
 * the nervous-system route table). Returns the era FIELD name, or undefined
 * for unrouted families (subscribers skip - never guess), or null for the
 * NEVER-fold guard (era itself).
 */
function route(name) {
    if (typeof name !== 'string' || !name) return undefined;
    const family = name.split(':')[0];
    // The era contract keys are PREFIXES ('brain:'), so an exact-prefix hit
    // means we must look up family + ':' - a bare channel name
    // ('brain:loaded') matches by its family prefix.
    if (FIELD_FOR_EVENT[name] !== undefined) return FIELD_FOR_EVENT[name];          // 'era:' as a name
    if (FIELD_FOR_EVENT[family + ':'] !== undefined) return FIELD_FOR_EVENT[family + ':'];
    // Longest-prefix walk for the same behavior as era's prefix matcher:
    const keys = Object.keys(FIELD_FOR_EVENT);
    let best = undefined;
    for (const k of keys) {
        if (name.startsWith(k) && (best === undefined || k.length > best.length)) best = k;
    }
    return best === undefined ? undefined : FIELD_FOR_EVENT[best];
}

const FIELD_FOR_EVENT = {
    'brain:':        'memory',
    'memory:':       'memory',
    'sync:':         'threads',
    'node-registry:':'social',
    'agent:':        'threads',
    'task:':         'threads',
    'escrow:':       'spend',
    'market:':       'spend',
    'forum:':        'social',
    'consensus:':    'social',
    'msg:':          'social',
    'succession:':   'stones',
    'horcrux:':      'stones',
    'universe:':     'stones',
    'audit:':        'stones',
    'era:':          null          // never self-fold
};

// ---------------------------------------------------------------------------
// CATALOG: the high-value channels, named and typed. This is the DOC-GRADE
// list (like the crew-bus envelope table): every entry that a subscriber or
// operator depends on. Channels not listed here are still emittable (the bus
// is duck-typed) but carry no catalogue guarantee - a channel must join this
// catalogue before a subscriber may DURABLY consume it.
// ---------------------------------------------------------------------------

const CATALOG = {
    // life
    'brain:loaded':            { type: 'life',    payload: '{ name, path }',                                        emitters: ['lib/brain.js'],        delivery: 'at-most-once', since: '0.8.5' },
    'memory:learned':          { type: 'memory',  payload: '{ key, category, brain }',                              emitters: ['lib/memory.js'],       delivery: 'at-most-once', since: '0.8.5' },

    // work
    'sync:pull:starting':      { type: 'work',    payload: '{ remote?, branch }',                                   emitters: ['lib/sync.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'sync:pull:complete':      { type: 'work',    payload: '{ commit?, files? }',                                   emitters: ['lib/sync.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'sync:pull:failed':        { type: 'work',    payload: '{ error }',                                             emitters: ['lib/sync.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'sync:push:starting':      { type: 'work',    payload: '{ remote?, branch, message }',                          emitters: ['lib/sync.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'sync:push:complete':      { type: 'work',    payload: '{ commit?, files? }',                                   emitters: ['lib/sync.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'sync:push:failed':        { type: 'work',    payload: '{ error }',                                             emitters: ['lib/sync.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'agent:spawn':             { type: 'work',    payload: '{ id, name, role }',                                    emitters: ['lib/agents.js'],       delivery: 'at-most-once', since: '0.8.5' },
    'agent:complete':          { type: 'work',    payload: '{ id, status }',                                        emitters: ['lib/agents.js'],       delivery: 'at-most-once', since: '0.8.5' },

    // money
    'escrow:held':             { type: 'money',   payload: '{ key, amount, agentId }',                              emitters: ['lib/escrow.js'],       delivery: 'at-most-once', since: '0.8.5' },
    'escrow:released':         { type: 'money',   payload: '{ key }',                                               emitters: ['lib/escrow.js'],       delivery: 'at-most-once', since: '0.8.5' },
    'market:skills:loaded':    { type: 'money',   payload: '{ count }',                                             emitters: ['lib/market.js'],       delivery: 'at-most-once', since: '0.8.6' },
    'trust:trade':             { type: 'money',   payload: '{ from, to?, value, reason }',                          emitters: ['lib/trust.js'],        delivery: 'at-most-once', since: '0.8.5' },

    // social
    'forum:publish':           { type: 'social',  payload: '{ topic, author, body }',                               emitters: ['lib/forum.js'],        delivery: 'at-most-once', since: '0.8.5' },
    'forum:decision':          { type: 'social',  payload: '{ topic, winner, votes, percentage, decidedAt }',       emitters: ['lib/forum.js'],        delivery: 'at-most-once', since: '0.8.5' },
    'vote:cast':               { type: 'social',  payload: '{ topic, voter }',                                      emitters: ['lib/consensus.js'],    delivery: 'at-most-once', since: '0.8.5' },
    'vote:consensus':          { type: 'social',  payload: '{ topic, winner, votes, percentage }',                  emitters: ['lib/consensus.js'],    delivery: 'at-most-once', since: '0.8.5' },
    'msg:new':                 { type: 'social',  payload: '{ to, from, body }',                                    emitters: ['lib/msg.js'],          delivery: 'at-most-once', since: '0.8.5' },
    'team:created':            { type: 'social',  payload: '{ id, name, dept }',                                    emitters: ['lib/teams.js'],        delivery: 'at-most-once', since: '0.8.5' },

    // stones
    'era:closed':              { type: 'stones',  payload: '{ id, next?, path }',                                   emitters: ['lib/era.js'],          delivery: 'at-most-once', since: '0.8.6' },
    'era:succession':          { type: 'stones',  payload: '{ id, next? }',                                         emitters: ['lib/era.js'],          delivery: 'at-most-once', since: '0.8.6' },
    'state:hydrated':          { type: 'stones',  payload: "{ moduleName }",                                        emitters: ['lib/state-store.js'],  delivery: 'at-most-once', since: '0.8.6' },
    'state:saved':             { type: 'stones',  payload: '{ moduleName, bytes? }',                                emitters: ['lib/state-store.js'],  delivery: 'at-most-once', since: '0.8.6' },
    'state:anchored':          { type: 'stones',  payload: '{ root_hash?, path }',                                  emitters: ['lib/state/anchor.js'], delivery: 'at-most-once', since: '0.8.6' },
    'horcrux:created':         { type: 'stones',  payload: '{ path, password? }',                                   emitters: ['lib/horcrux.js'],      delivery: 'at-most-once', since: '0.8.6' },

    // security
    'auth:validated':          { type: 'security', payload: '{ valid, reason }',                                    emitters: ['lib/auth.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'auth:failed':             { type: 'security', payload: '{ reason }',                                           emitters: ['lib/auth.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'vaf:blocked':             { type: 'security', payload: '{ input?, rule }',                                     emitters: ['lib/vaf.js'],          delivery: 'at-most-once', since: '0.8.5' },
    'qos:rate-limit':          { type: 'security', payload: '{ clientId, limit }',                                  emitters: ['lib/qos.js'],          delivery: 'at-most-once', since: '0.8.5' },
    'secret:set':              { type: 'security', payload: '{ key }',                                              emitters: ['lib/secret.js'],       delivery: 'at-most-once', since: '0.8.6' },
    'secret:accessed':         { type: 'security', payload: '{ key }',                                              emitters: ['lib/secret.js'],       delivery: 'at-most-once', since: '0.8.6' },

    // infra
    'boot:complete':           { type: 'infra',   payload: '{ layers, ms }',                                        emitters: ['lib/boot.js'],         delivery: 'at-most-once', since: '0.8.5' },
    'server:start':            { type: 'infra',   payload: '{ port }',                                              emitters: ['lib/server.js'],       delivery: 'at-most-once', since: '0.8.5' },
    'server:stop':             { type: 'infra',   payload: '{}',                                                    emitters: ['lib/server.js'],       delivery: 'at-most-once', since: '0.8.5' },
    'cache:hit':               { type: 'infra',   payload: '{ key }',                                               emitters: ['lib/cache.js'],        delivery: 'at-most-once', since: '0.8.5' },
    'cache:miss':              { type: 'infra',   payload: '{ key }',                                               emitters: ['lib/cache.js'],        delivery: 'at-most-once', since: '0.8.5' },
    'search:empty':            { type: 'infra',   payload: '{ query }',                                             emitters: ['lib/search.js'],       delivery: 'at-most-once', since: '0.8.6' }
};

// (pass 207c, #197) Tempo's channels declare through the additive API so
// durable subscribers can register against them like every other
// catalogue entry (this module wasn't in line when the table shipped).
const _cat = CATALOG;
function _tempoEntry(name, payload, family) {
    return { [name]: { type: family, payload, emitters: ['lib/tempo.js'], delivery: 'at-most-once', since: '0.8.6' } };
}
Object.assign(_cat,
    _tempoEntry('tempo:budget-start', '{ id, duration, sliceMs, slicesTotal, label }', 'life'),
    _tempoEntry('tempo:slice', '{ id, k, of, remaining, note? }', 'life'),
    _tempoEntry('tempo:budget-end', '{ id, expired, reason? }', 'life'),
    _tempoEntry('tempo:budget-cancelled', '{ id, reason }', 'life'),
    _tempoEntry('tempo:paced', '{ want, ok, at }', 'life')
);

/**
 * Declare a channel into the catalogue (additive registration - used by
 * modules that grow a NEW high-value channel after this file shipped).
 * Returns the entry. Unknown delivery strings are rejected (typo guard).
 */
function declare(name, entry) {
    if (!/^[a-z][a-z0-9-]*(:[a-z0-9-]+)+$/.test(name)) {
        throw new errors.VantError('event-types: channel must be family:subtype: ' + name, {
            code: 'INPUT_VALIDATION_FAILED', statusCode: 400
        });
    }
    const valid = ['at-most-once', 'durable-ok'];
    if (!entry || !valid.includes(entry.delivery)) {
        throw new errors.VantError('event-types: delivery must be at-most-once|durable-ok', {
            code: 'INPUT_VALIDATION_FAILED', statusCode: 400
        });
    }
    CATALOG[name] = { type: entry.type || familyFor(name) || 'infra', ...entry };
    return CATALOG[name];
}

/** All declared channels, optionally filtered by family. */
function channels(family) {
    return Object.keys(CATALOG).filter(ch => !family || familyFor(ch) === family);
}

/** One channel's entry, or undefined. */
function describe(name) { return CATALOG[name]; }

module.exports = { FAMILY, FAMILY_FIXES, CATALOG, familyFor, route, declare, channels, describe };
