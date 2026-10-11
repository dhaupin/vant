'use strict';

/**
 * One Addressing Spine (#165) — mesh/distributed, 2/2
 * ====================================================
 *
 * Three overlapping address spaces (geometry cells, RAID fragments, mesh
 * nodes) each had their own key derivation, hash, and id format — every
 * crossover was a bespoke adapter. The spine:
 *
 *   - SPACE ID = a path (/world/<w>, /mesh/<region>, /raid/<doc>) — the
 *     state tree IS the namespace,
 *   - CELL/ADDRESS = derived from (spaceId, index) via the SAME PRF
 *     (lib/state/seeds.js — no second imul/hash chain in the repo),
 *   - HASH = one canonical encoder (lib/state/canonical.js) for everything
 *     content-addressed.
 *
 * The honesty test: a fact referenced from two spaces stores ONCE (the
 * #150 rebate) and its hash is identical from both sides.
 *
 * Engine-parity series (mesh/distributed, 2/2).
 */

const crypto = require('crypto');
const { SeedChain } = require('./seeds');
const canonical = require('./canonical');

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/** The three consumers' canonical space-path grammar. */
const SPACE_CONSUMERS = Object.freeze({
    world: /^\/world\/[A-Za-z0-9][A-Za-z0-9._-]*$/,
    mesh: /^\/mesh\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/,
    raid: /^\/raid\/[A-Za-z0-9][A-Za-z0-9._-]*$/
});

class AddressingSpine {
    /**
     * @param {object} [options] - SeedChain options ({ universe, configPath })
     */
    constructor(options = {}) {
        this.seeds = new SeedChain(options);
    }

    /**
     * Validate a space id against its consumer's grammar. One spine means
     * one namespace: space ids are tree paths, full stop.
     */
    spaceId(consumer, name) {
        if (!SPACE_CONSUMERS[consumer]) {
            throw _vantErr('spine: unknown consumer ' + consumer, 'E_SPINE_CONSUMER');
        }
        const id = '/' + consumer + '/' + String(name || '').replace(/^\/+/, '');
        if (!SPACE_CONSUMERS[consumer].test(id)) {
            throw _vantErr('spine: invalid space id ' + JSON.stringify(id.slice(0, 60)), 'E_SPINE_SPACE');
        }
        return id;
    }

    /**
     * Derive the Nth cell address in a space via the ONE PRF. Any consumer
     * deriving an address uses THIS — a fragment that lives on a mesh node
     * at a geometry cell is just three derivations over three paths, no
     * bespoke adapter.
     */
    cellAddress(spacePath, index) {
        if (!Number.isInteger(index) || index < 0) {
            throw _vantErr('spine.cellAddress: index must be a non-negative integer', 'E_SPINE_INPUT');
        }
        const seed = this.seeds.seedHex(spacePath.replace(/\//g, ':').replace(/^:/, ''));
        const h = require('../hash').sha256H();
        h.update(Buffer.from('vant-spine\x00cell\x00' + seed + '\x00' + index, 'utf8'));
        return h.digest('hex');
    }

    /**
     * Content hash via the ONE canonical encoder (#165 acceptance: "one
     * canonical encoder for everything content-addressed").
     */
    factHash(fact) {
        return canonical.hash(fact);
    }

    /**
     * THE HONESTY TEST, as a primitive: write a fact under two spaces and
     * confirm it stores once (CellStore rebate) with identical hashes. Used
     * by tests and available to runtime callers.
     */
    writeSharedFact(cellStore, fact, spaces) {
        if (!Array.isArray(spaces) || spaces.length < 1) {
            throw _vantErr('spine.writeSharedFact: spaces required', 'E_SPINE_INPUT');
        }
        const results = spaces.map(s => cellStore.put(s, this.cellAddress(s, 0), fact));
        const stored = results.filter(r => r.stored).length;
        const hashes = results.map(r => r.hash);
        return {
            storedOnce: stored === 1,
            identicalHashes: hashes.every(h => h === hashes[0]),
            hash: hashes[0],
            results
        };
    }
}

module.exports = { AddressingSpine, SPACE_CONSUMERS };
