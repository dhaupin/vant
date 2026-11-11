'use strict';

/**
 * Synmergia + Leisure — the play plug (the vant-side ledger seam).
 *
 * Leisure (lib/leisure.js) keeps an agent's WANT-LIST: things it would do
 * when free. This plug points that want-list at a gamestruct world
 * (Synmergia first), so an idle agent's free time is spent PLAYING the world
 * through the SAME four primitives — not a second protocol, just the lane
 * used without an objective.
 *
 * Division of labor (the composition law, vant#363/#364): the transport and
 * the choose-one-affordance step are owned by gamestruct; this file is the
 * vant-side seam and nothing else. gamestruct ships the generic
 * `pursueOne(client, opts)` (one play move, no objective, the same lane);
 * vant owns the want-list — recording wants, picking the next one, and
 * marking it pursued with the world's own result as the receipt. The
 * affordance choice is NOT re-implemented here.
 *
 * The loop (leisure's own shape, wired to a world):
 *   want (recorded here) -> idle (consult) -> pursueOne (gamestruct, one act)
 *   -> markPursued (the act is its own receipt).
 *
 * Deliberately small and honest: this is a seam, not an autonomy engine. It
 * never invents a want the agent did not record, and it never fabricates a
 * "learned" line — the world's own result is the receipt.
 *
 * Usage:
 *   const world = require('./adapters/synmergia').connect({ door, token });
 *   const play = require('./adapters/synmergia-leisure');
 *   play.seedWants(['explore the road', 'greet someone']);
 *   const out = await play.pursueOne(world);   // one want, one act
 */

const leisure = require('../leisure');

/**
 * A default want-list an agent can start from — ordinary, non-instrumental
 * things to do in a world. The agent (or its operator) may record its own.
 */
const DEFAULT_WANTS = [
    'look around the zone I am standing in',
    'greet a nearby player',
    'walk the road for a while',
];

/** Load (and cache) gamestruct's play plug once per process. */
let _pursuePromise = null;
function _pursueOne() {
    if (!_pursuePromise) {
        _pursuePromise = import('gamestruct/adapters/vant').then((m) => m.pursueOne);
    }
    return _pursuePromise;
}

/**
 * Record wants on the current brain's list. Idempotent per want string
 * (leisure.want dedupes), so seeding twice is safe.
 *
 * @param {string[]} wants
 * @returns {number} how many wants are on the list now
 */
function seedWants(wants = DEFAULT_WANTS) {
    for (const w of wants) {
        if (typeof w === 'string' && w.trim()) leisure.want(w.trim(), { note: 'synmergia play' });
    }
    return leisure.wantsToDo().length;
}

/**
 * Pursue exactly ONE want: consult the list, take one act in the world that
 * serves it (gamestruct's `pursueOne`), and mark the want pursued. Returns an
 * honest record.
 *
 * @param {SynmergiaWorld} world - a connected gamestruct world
 * @param {object} [opts] { want? }
 * @returns {Promise<object>} { ok, want?, act?, learned?, reason? }
 */
async function pursueOne(world, opts = {}) {
    if (!world || typeof world.observe !== 'function' || typeof world.act !== 'function') {
        return { ok: false, reason: 'pursueOne: a gamestruct world is required' };
    }
    const pick = (typeof opts.want === 'string' && opts.want.trim())
        ? { want: opts.want.trim() }
        : leisure.suggest();
    if (!pick) return { ok: false, reason: 'the want-list is empty - record a want first (seedWants)' };

    // The world's own affordance list is the only source of valid ids; the
    // door serves `actions[]`, so the node list is folded with the SAME
    // normalizer the catalog rides (exposed by the world as find()).
    const snap = await world.observe();
    if (!snap || snap.ok === false) {
        return { ok: false, want: pick.want, reason: 'the world could not be observed (' + ((snap && snap.reason) || '?') + ')' };
    }

    // gamestruct owns the choose-one-act step. It reads a client's
    // `observe()` and `act()` directly, so it is handed a thin view whose
    // `observe()` is the door's node tree (via the same `doorNodes` normalizer
    // the catalog rides) - no second affordance model, no transport of ours.
    const view = {
        observe: async () => ({ ok: true, nodes: await world.nodes() }),
        act: (id, verb, value) => world.act(id, verb, value),
    };
    const pursue = await _pursueOne();
    const res = await pursue(view, { role: opts.role, not: opts.not, verb: opts.verb, value: opts.value });
    if (!res || res.ok === false) {
        const why = (res && res.reason) || 'nothing to do here';
        // A world with nothing to offer is honest, not a fabricated act; the
        // want is NOT marked pursued (it was not).
        return { ok: false, want: pick.want, reason: why, result: res };
    }
    const learned = 'did ' + (res.handle || '?') + ' (' + (res.verb || '?') + ') for want: ' + pick.want;
    leisure.markPursued(pick.want, { note: learned });
    return { ok: true, want: pick.want, act: res.handle, verb: res.verb, learned, result: res.detail };
}

module.exports = { seedWants, pursueOne, DEFAULT_WANTS };
