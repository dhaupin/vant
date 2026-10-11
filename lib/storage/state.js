// Extracted verbatim from lib/storage.js (Wave D split — factory lib/storage.js re-exports). Requires flow through lib/storage/shared.js so the SECURITY PLUMBING stays single-source.
'use strict';
const _ = require('./shared');
const { fs, MODELS_PATH, PUBLIC_PATH, STORAGE_VERSION, readJson, writeJson } = require('./shared');

// ==================== STATE STORAGE ====================
// State with layered read (private overrides public)
class StateStorage {
    constructor(options = {}) {
        this.privatePath = options.privatePath || MODELS_PATH() + '/.state.json';
        this.publicPath = options.publicPath || PUBLIC_PATH() + '/.state.json';
        this.version = STORAGE_VERSION;
        this._state = this._load();
    }

    // Layered read: private first, then public fallback
    _load() {
        // Private has highest priority
        if (fs.existsSync(this.privatePath)) {
            return readJson(this.privatePath) || { static: {}, current: {}, temp: {} };
        }
        // Fall back to public (OSS templates)
        if (fs.existsSync(this.publicPath)) {
            return readJson(this.publicPath) || { static: {}, current: {}, temp: {} };
        }
        // Initialize both directories
        if (!fs.existsSync(MODELS_PATH())) {
            fs.mkdirSync(MODELS_PATH(), { recursive: true });
        }
        return { static: {}, current: {}, temp: {} };
    }

    // Always write to private (agent's brain)
    _save() {
        writeJson(this.privatePath, this._state);
    }

    get(key) {
        const s = this._load();
        return key ? s.current?.[key] : s.current;
    }

    set(key, value) {
        if (!this._state.current) this._state.current = {};
        this._state.current[key] = value;
        this._save();
        return true;
    }

    getCurrent(key) {
        const s = this._load();
        return key ? s.current?.[key] : s.current;
    }

    // Helper: Remove dangerous keys from object using vaf
    _sanitizeObject(obj) {
        return _vaf.sanitizeObject(obj);
    }

    setCurrent(key, value) {
        if (!this._state.current) this._state.current = {};
        // Handle setCurrent({ task: 'test' }) object form
        if (typeof key === 'object' && key !== null) {
            // SECURITY: Sanitize to prevent prototype pollution
            const safe = this._sanitizeObject(key);
            Object.assign(this._state.current, safe);
        } else {
            this._state.current[key] = value;
        }
        this._save();
        return true;
    }

    getStatic(key) {
        const s = this._load();
        return key ? s.static?.[key] : s.static;
    }

    setStatic(key, value) {
        if (!this._state.static) this._state.static = {};
        // Handle setStatic({ t: 'v' }) object form
        if (typeof key === 'object' && key !== null) {
            // SECURITY: Sanitize to prevent prototype pollution
            const safe = this._sanitizeObject(key);
            Object.assign(this._state.static, safe);
        } else {
            this._state.static[key] = value;
        }
        this._save();
        return true;
    }

    getTemp(key) {
        const s = this._load();
        return key ? s.temp?.[key] : s.temp;
    }

    setTemp(key, value) {
        if (!this._state.temp) this._state.temp = {};
        this._state.temp[key] = value;
        return true;
    }

    clearTemp() {
        this._state.temp = {};
        this._save();
        return true;
    }

    getSummary() {
        const s = this._load();
        return `static=${JSON.stringify(s.static)},current=${JSON.stringify(s.current)}`;
    }
}


module.exports = { StateStorage: StateStorage };
