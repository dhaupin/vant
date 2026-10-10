// Extracted verbatim from lib/storage.js (Wave D split — factory lib/storage.js re-exports). Requires flow through lib/storage/shared.js so the SECURITY PLUMBING stays single-source.
'use strict';
const _ = require('./shared');
const { fs, path, errors, _emit, _getSandbox, _getFormat, STORAGE_VERSION, MODELS_PATH, atomicWrite } = require('./shared');

// ==================== BRAIN STORAGE ====================
class BrainStorage {
    constructor(options = {}) {
        this.basePath = options.basePath || MODELS_PATH();
        this.version = STORAGE_VERSION;
    }

    _getFilePath(category, key) {
        // (R-4 audit) REJECT traversal instead of silently rewriting it:
        // the old sanitizer stripped '/' and '..' (turning '../../evil' into
        // 'evil'), which made the containment check below dead code and could
        // mask caller bugs. Legit category/key names never contain separators.
        const _trav = /(^|\/|\\)\.\.($|\/|\\)|^\.\.$/;
        if (_trav.test(category) || _trav.test(key) || /[\/\\]/.test(String(category)) || category === '.' || key === '.' || key === '..') {
            throw new errors.VantError('Path traversal blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL, retryable: false });
        }
        const safeCategory = String(category).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 50);
        const safeKey = String(key).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100);
        if (!safeCategory || !safeKey) {
            throw new errors.VantError('Invalid category/key', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
        }

        const dir = path.join(this.basePath, safeCategory);
        const fullPath = path.join(dir, safeKey);

        // CONTAINMENT: Verify path is within basePath (belt-and-suspenders —
        // reachable now that traversal is rejected above)
        const resolved = path.resolve(fullPath);
        const baseResolved = path.resolve(this.basePath);
        if (!resolved.startsWith(baseResolved + path.sep)) {
            throw new errors.VantError('Path traversal blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL, retryable: false });
        }

        return fullPath;
    }

    get(category, key = null) {
        if (!category) return null;

        // Check sandbox capability (canRead for read operations)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canRead')) {
            _emit('storage:error', { op: 'get', category, key, error: 'canRead denied' });
            return { error: 'Sandbox: capability not allowed - canRead is false' };
        }

        if (!key) {
            // Return list of categories
            if (!fs.existsSync(this.basePath)) return [];
            return fs.readdirSync(this.basePath).filter(f =>
                fs.statSync(path.join(this.basePath, f)).isDirectory()
            );
        }

        const filePath = this._getFilePath(category, key);
        if (!fs.existsSync(filePath)) {
            _emit('storage:miss', { category, key });
            return null;
        }

        const content = fs.readFileSync(filePath, 'utf8');

        // EVENT: storage:loaded
        _emit('storage:loaded', { category, key, path: filePath, size: content.length, timestamp: Date.now() });

        return content;
    }

    write(category, key, content, opts = {}) {
        if (!key) return false;

        // Check sandbox capability (canWrite for write operations)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) {
            _emit('storage:error', { op: 'write', category, key, error: 'canWrite denied' });
            return { error: 'Sandbox: capability not allowed - canWrite is false' };
        }

        // NEW (v0.8.6): Support format option for auto-serialization
        let finalContent = content;
        if (opts.format && typeof content === 'object') {
            const format = _getFormat();
            if (format?.serialize) {
                finalContent = format.serialize(content, opts.format, opts);
            } else {
                finalContent = JSON.stringify(content, null, 2);
            }
        }

        // Determine extension based on format or default to .md
        let ext = '.md';
        if (opts.format === 'json') ext = '.json';
        else if (opts.format === 'yaml') ext = '.yaml';
        else if (opts.format === 'txt') ext = '.txt';

        // Add extension if not present
        if (!key.endsWith(ext)) {
            key = key + ext;
        }

        const dir = path.join(this.basePath, category);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const filePath = this._getFilePath(category, key);
        atomicWrite(filePath, finalContent);

        // EVENT: storage:saved
        _emit('storage:saved', { category, key, path: filePath, size: finalContent.length, timestamp: Date.now() });

        return true;
    }

    append(category, key, content) {
        const existing = this.get(category, key) || '';
        return this.write(category, key, existing + content);
    }

    has(category, key) {
        const filePath = this._getFilePath(category, key);
        const exists = fs.existsSync(filePath);

        // EVENT: storage:checked (non-blocking)
        if (exists) {
            _emit('storage:checked', { category, key, exists: true });
        }

        return exists;
    }

    // Brain-friendly: accepts full path or category+key
    brainHas(filePath) {
        // Block external path traversal
        if (filePath.includes('/') || filePath.includes('\\')) {
            // Full path given - BLOCK external access
            return false;
        }
        // Use safe internal method
        return this.has(filePath, '');
    }

    // Brain-friendly: accepts full path or category+key
    brainRead(filePath) {
        // Block external path traversal
        if (filePath.includes('/') || filePath.includes('\\')) {
            // Full path given - BLOCK external access
            return null;
        }
        // Use safe internal method
        return this.get(filePath, '');
    }

    // Brain-friendly: list brains - BLOCK external dirs
    brainList(dirPath) {
        // Block external path access - only list internal brains
        if (!dirPath || dirPath.includes('/') || dirPath.includes('\\')) {
            return [];  // Return empty for safety
        }
        // Internal listing only
        if (!fs.existsSync(path.join(this.basePath, dirPath))) return [];
        const dir = path.join(this.basePath, dirPath);
        return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    }

    list(category) {
        const dir = path.join(this.basePath, category);
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    }

    query(query) {
        // Simple text search in brain files
        const results = [];
        const queryLower = query.toLowerCase();

        if (!fs.existsSync(this.basePath)) return results;

        for (const category of fs.readdirSync(this.basePath)) {
            const catDir = path.join(this.basePath, category);
            if (!fs.statSync(catDir).isDirectory()) continue;

            for (const file of fs.readdirSync(catDir)) {
                if (!file.endsWith('.md')) continue;

                const content = fs.readFileSync(path.join(catDir, file), 'utf8');
                if (content.toLowerCase().includes(queryLower)) {
                    results.push({
                        category,
                        file,
                        content: content.substring(0, 500)
                    });
                }
            }
        }

        return results;
    }
}


module.exports = { BrainStorage: BrainStorage };
