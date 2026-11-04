// Extracted verbatim from lib/storage.js (Wave D split — factory lib/storage.js re-exports). Requires flow through lib/storage/shared.js so the SECURITY PLUMBING stays single-source.
'use strict';
const _ = require('./shared');
const { fs, STORAGE_VERSION, atomicWrite, CONFIG_PATH } = require('./shared');

// ==================== CONFIG STORAGE ====================
class ConfigStorage {
    constructor(options = {}) {
        this.filePath = options.filePath || CONFIG_PATH;
        this.version = STORAGE_VERSION;
        this._config = this._load();
    }

    _load() {
        const defaultConfig = {
            version: STORAGE_VERSION,
            storage: { autoSync: false },
            github: { token: null },
            features: {}
        };

        if (!fs.existsSync(this.filePath)) return defaultConfig;

        try {
            // SECURITY (closes P0-7): configs are DATA, not code. The
            // context root is a null-prototype object and codeGeneration is
            // disabled; the module shim lives INSIDE the context so no host
            // object — and thus no host Function constructor — is reachable.
            // The old `{ module: { exports: {} } }` sandbox was escapable via
            // `module.constructor.constructor('return process')()`
            // (pinned in tests/audit-round4.test.js).
            const vm = require('vm');
            const context = vm.createContext(Object.create(null), {
                codeGeneration: { strings: false, wasm: false }
            });
            const source = fs.readFileSync(this.filePath, 'utf8');
            const wrapped = '(function(){ var module = { exports: {} };\n' + source + '\n;return module.exports; })()';
            const exported = vm.runInContext(wrapped, context, {
                filename: this.filePath,
                timeout: 1000
            });
            return { ...defaultConfig, ...(exported || {}) };
        } catch {
            return defaultConfig;
        }
    }

    get(key) {
        const parts = key.split('.');
        let value = this._config;
        for (const p of parts) {
            value = value?.[p];
            if (value === undefined) return null;
        }
        return value;
    }

    set(key, value) {
        const parts = key.split('.');
        let obj = this._config;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
        }

        obj[parts[parts.length - 1]] = value;
        this.save();
        return true;
    }

    getAll() {
        return { ...this._config };
    }

    save() {
        const content = 'module.exports = ' + JSON.stringify(this._config, null, 2);
        // Holds github.token and other credentials — owner-only on disk.
        atomicWrite(this.filePath, content, { mode: 0o600 });
    }

    load() {
        this._config = this._load();
        return this._config;
    }
}


module.exports = { ConfigStorage: ConfigStorage };
