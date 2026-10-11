/**
 * Sidecar Connector (pass 166) — the hybrid polyglot bridge.
 *
 * Extends BaseConnector with a persistent local HTTP sidecar so JIT-heavy
 * languages (Julia) pay their startup cost ONCE instead of per eval, with
 * automatic FALLBACK to the subprocess connector when the sidecar cannot
 * start (language missing, srv script missing, port trouble). The caller
 * never has to know which mode served a given eval; the result shape is
 * identical ({ code, stdout, stderr, success }).
 *
 * Modes (options.mode):
 *   'sidecar'    — sidecar only; throws if it cannot start (explicit intent)
 *   'auto'       (default) — try sidecar, fall back to subprocess on any
 *                  startup/transport failure, emit sidecar:fallback event
 *   'subprocess' — legacy behavior, never spawns a sidecar
 *
 * The srv half lives in lib/connectors/<lang>-srv.jl (julia-srv.jl ships
 * in this pass; rust-srv follows the same contract). Shared runtime:
 * lib/sidecar.js — deliberately shared with lib/adapters/ (parity).
 */

const { BaseConnector } = require('./base');
const sidecar = require('../sidecar');

class SidecarConnector extends BaseConnector {
    /**
     * @param {object} options - BaseConnector options + { mode?, sidecar? }
     *   sidecar: { port?, host?, token?, srvPath?, env?, startTimeout? }
     */
    constructor(options = {}) {
        super(options);
        this.lang = options.lang || 'unknown';
        this.mode = options.mode || 'auto';
        this._spec = null;
        this._handle = null;
        this._sidecarOptions = options.sidecar || {};
    }

    getLang() { return this.lang; }

    /**
     * Ensure a healthy sidecar exists. Returns the live spec or throws.
     * Reuses the running instance across evals (that is the whole point).
     */
    async _ensureSidecar() {
        if (this._handle && this._handle.proc && this._handle.proc.exitCode === null) {
            if (await sidecar.healthy(this._handle.spec)) {
                return this._handle.spec;
            }
            // crashed — drop the handle and respawn below
            this._handle = null;
        }
        const spec = sidecar.buildSpec(this.lang, this._sidecarOptions);
        this._handle = await sidecar.spawnAndWait(spec);
        return this._handle.spec;
    }

    async eval(code, options = {}) {
        const timeout = options.timeout || 30000;

        if (this.mode !== 'subprocess') {
            try {
                const spec = await this._ensureSidecar();
                return await sidecar.evalOn(spec, code, timeout);
            } catch (e) {
                this._handle = null;
                if (this.mode === 'sidecar') {
                    // explicit intent — surface the failure honestly
                    return {
                        code: 1,
                        stdout: '',
                        stderr: 'sidecar unavailable: ' + e.message,
                        success: false
                    };
                }
                this._options.onFallback && this._options.onFallback(e.message);
            }
        }

        // Subprocess fallback (or explicit subprocess mode). Delegate to the
        // language's OWN connector when one exists — it knows the right
        // command (python3 vs python) and interpreter flags; spawning bare
        // getLang() here would guess wrong (pin-caught, pass 166).
        try {
            const langMod = require('./' + this.lang);
            const LangCtor = langMod[this.lang.charAt(0).toUpperCase() + this.lang.slice(1) + 'Connector'];
            if (LangCtor) {
                const inst = new LangCtor(this._options);
                return await inst.eval(code, options);
            }
            if (langMod && typeof langMod.eval === 'function') {
                return await langMod.eval(code, options);
            }
        } catch (e) {
            // fall through to BaseConnector spawn
        }
        return await super.eval(code, options);
    }

    /**
     * Stop the sidecar (clean shutdown via /stop + SIGTERM backstop).
     * Called by compute.stopSidecars() / tests.
     */
    async stop() {
        if (this._handle) {
            await sidecar.stop(this._handle.spec);
            if (this._handle.proc.exitCode === null) {
                this._handle.proc.kill();
            }
            this._handle = null;
        }
    }
}

module.exports = { SidecarConnector };
