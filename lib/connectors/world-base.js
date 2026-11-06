/**
 * WorldBase (wave E, vant#337) — the world-shaped connector contract.
 *
 * lib/connectors/base.js defines the language-compute connector (spawn /
 * timeout / ping); connectors/index.js ships hosted-service connectors.
 * The shape a downstream integrator needs that is NEITHER a code path nor
 * a hosted service: a foreign WORLD whose state vant should read and
 * transact with. vant stays world-agnostic — the connector lives
 * downstream — but the CONTRACT is declared here so a downstream world
 * and the transit machinery speak the same three verbs:
 *
 *   identities()   — the principal map (agents [<->] foreign principals)
 *   inventory()    — a scoped read/export of the foreign inventory surface
 *   txForward()    — the tx-root stream a consuming ledger can adopt
 *
 * The base class is the SUPPLIED CONTRACT, not a half-implementation:
 * instantiating it without an implementation and calling a verb refuses
 * typed (a contract that silently no-ops is not a contract). The
 * downstream connector subclasses and implements; nothing in vant's core
 * requires this door to exist.
 */
const { VantError } = require('../error');

const WORLD_VERBS = ['identities', 'inventory', 'txForward'];

class BaseWorldConnector {
    /**
     * @param {object} spec - { name (connector id, required), version }
     */
    constructor(spec = {}) {
        if (!spec.name || typeof spec.name !== 'string') {
            throw new VantError('world connector spec.name required', { code: 'WORLD_CONNECTOR_INVALID' });
        }
        this.name = String(spec.name).slice(0, 80);
        this.version = typeof spec.version === 'number' ? spec.version : 1;
    }

    /**
     * The principal map: which foreign principal each agent identity
     * speaks for. Contract shape: { identities: [ { agentId, foreignId,
     * kind } ], mapVersion } — implementations MUST return this shape.
     */
    identities() {
        throw new VantError(
            'world connector "' + this.name + '" did not implement identities() — the contract is the downstream implementation, the base refuses to silently no-op',
            { code: 'WORLD_CONNECTOR_UNIMPLEMENTED' });
    }

    /**
     * A scoped read/export of the foreign inventory surface. Contract
     * shape: { inventory: [ { id, quantity, ownerForeignId, revision } ],
     * scope, revision } — implementations MUST return this shape.
     */
    inventory(scope) {
        throw new VantError(
            'world connector "' + this.name + '" did not implement inventory(scope) — a scoped read, never a full-dump trust assumption',
            { code: 'WORLD_CONNECTOR_UNIMPLEMENTED' });
    }

    /**
     * The tx-root stream a consuming ledger (lib/ledger.js) can adopt.
     * Contract shape: { txRoots: [ { txRoot, at, ref } ], cursor } —
     * in-order, replay-safe (the cursor names where the consumer left
     * off; re-adopting a root is downstream idempotency, upstream
     * duplication is the connector's bug).
     */
    txForward(cursor) {
        throw new VantError(
            'world connector "' + this.name + '" did not implement txForward(cursor) — ride the wave-E credit ledger through refs, never bespoke scraping',
            { code: 'WORLD_CONNECTOR_UNIMPLEMENTED' });
    }

    /** The declared contract surface (machine-readable manifest). */
    contract() {
        return { name: this.name, version: this.version, verbs: WORLD_VERBS.slice(), kind: 'world-base' };
    }
}

module.exports = { BaseWorldConnector, WORLD_VERBS };
