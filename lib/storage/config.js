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
            // SECURITY (closes P0-7): evaluate config in a bare vm context -
            // no require/process/fs available. Configs are data, not code.
            const vm = require('vm');
            const sandbox = { module: { exports: {} } };
            vm.createContext(sandbox);
            vm.runInContext(fs.readFileSync(this.filePath, 'utf8'), sandbox, {
                filename: this.filePath,
                timeout: 1000
            });
            return { ...defaultConfig, ...(sandbox.module.exports || {}) };
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
        atomicWrite(this.filePath, content);
    }

    load() {
        this._config = this._load();
        return this._config;
    }
}


module.exports = { ConfigStorage: ConfigStorage };
