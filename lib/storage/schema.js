// Extracted verbatim from lib/storage.js (Wave D split — factory lib/storage.js re-exports). Requires flow through lib/storage/shared.js so the SECURITY PLUMBING stays single-source.
'use strict';
const _ = require('./shared');
const { fs, path, STORAGE_VERSION, readJson, writeJson } = require('./shared');

// ==================== SCHEMA STORAGE ====================
class SchemaStorage {
    constructor(options = {}) {
        this.schemaDir = options.schemaDir || 'schema';
        this.version = STORAGE_VERSION;
    }

    get(name) {
        const filePath = path.join(this.schemaDir, name + '.json');
        return readJson(filePath);
    }

    set(name, schema) {
        const dir = this.schemaDir;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const filePath = path.join(dir, name + '.json');
        writeJson(filePath, schema);
        return true;
    }

    has(name) {
        const filePath = path.join(this.schemaDir, name + '.json');
        return fs.existsSync(filePath);
    }

    list() {
        if (!fs.existsSync(this.schemaDir)) return [];
        return fs.readdirSync(this.schemaDir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    }
}


module.exports = { SchemaStorage: SchemaStorage };
