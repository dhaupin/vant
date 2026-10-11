// Extracted verbatim from lib/storage.js (Wave D split — factory lib/storage.js re-exports). Requires flow through lib/storage/shared.js so the SECURITY PLUMBING stays single-source.
'use strict';
const _ = require('./shared');
const { fs, path, STORAGE_VERSION, MODELS_PATH, readJson, writeJson } = require('./shared');

// ==================== ISLAND STORAGE ====================
class IslandStorage {
    constructor(options = {}) {
        this.basePath = options.basePath || MODELS_PATH();
        this.version = STORAGE_VERSION;
    }

    getManifest() {
        const manifestPath = path.join(this.basePath, 'islands.json');
        const data = readJson(manifestPath) || { version: '1.0', islands: {}, loaded: [] };
        // Ensure required fields exist
        if (!data.islands) data.islands = {};
        if (!data.loaded) data.loaded = [];
        if (!data.hydrated) data.hydrated = [];
        return data;
    }

    saveManifest(manifest) {
        const manifestPath = path.join(this.basePath, 'islands.json');
        writeJson(manifestPath, manifest);
        return true;
    }

    get(name) {
        const islandPath = path.join(this.basePath, name + '.json');
        return readJson(islandPath);
    }

    set(name, data) {
        const islandPath = path.join(this.basePath, name + '.json');
        writeJson(islandPath, data);
        return true;
    }

    has(name) {
        const islandPath = path.join(this.basePath, name + '.json');
        return fs.existsSync(islandPath);
    }
}


module.exports = { IslandStorage: IslandStorage };
