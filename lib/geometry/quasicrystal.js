/**
 * Quasicrystal Storage (v0.8.6)
 * Aperiodic tiling-based storage for Vant memories
 *
 * Architecture:
 * - barcode → geometric projection (unique surface position)
 * - Data stored at position on P3 tiling grid
 * - Reconstruction from barcode (no lookup table needed!)
 *
 * Advantages over linear addressing:
 * - ∞ address space (aperiodic tiling)
 * - No birthday paradox collisions
 * - Self-authenticating (position computed, not stored)
 */

const crypto = require('crypto');
const errors = require('../error');  // (pass 169) backbone wiring: coded errors

// Lazy-load Encrypt for optional encryption at rest
let _Encrypt = null;
function _getEncrypt() {
    if (!_Encrypt) {
        try { _Encrypt = require('../encrypt'); } catch (e) {}
    }
    return _Encrypt;
}

// Lazy-load RLS for optional per-record ACL

// Auto-chain through sandbox for capability + RLS
function _getSandbox() {
    let s = null;
    try { s = require('../sandbox'); } catch (e) {}
    return s;
}

function _checkWrite(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check
    if (sandbox && sandbox.can && !sandbox.can('canWrite')) {
        throw new errors.VantError('ECAP: write not allowed', { code: errors.CODES.STORAGE_WRITE_DENIED });
    }
    // Auto-chain to RLS
    if (userCtx && sandbox && sandbox._rls) {
        sandbox._rls.checkWrite(userCtx, resource, 'write');
    }
}

function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('ECAP: read not allowed', { code: errors.CODES.STORAGE_READ_DENIED });
    }
    // Auto-chain to RLS
    if (userCtx && sandbox && sandbox._rls) {
        sandbox._rls.checkRead(userCtx, resource, 'read');
    }
}

let _rls = null;
function _getRLS() {
    if (!_rls) {
        try { _rls = require('../rls'); } catch (e) {}
    }
    return _rls;
}

/**
 * Generate a UNIQUE barcode from content hash
 * Uses NSC "9" to mark as Vant automation-reserved (GS1 reserved range)
 *
 * Global UPC/EAN Number System Characters (NSC):
 * - 0: Standard retail (groceries)
 * - 1: Reserved (was our first version)
 * - 2: Variable weight (in-store)
 * - 3: Pharmaceuticals
 * - 4: Restricted distribution
 * - 5: Coupons
 * - 6-9: Reserved for future use ← NOW OUR FLAG!
 *
 * NSC "9" is the PERFECT choice:
 * - Officially reserved by GS1 (never assigned to any product)
 * - Zero risk of collision with real inventory
 * - Self-documenting: means "virtual/automation system"
 *
 * Format: 9-FACILITY-SEQUENCE-CHECK (12 digits without dashes)
 *
 * (pass 176 — the LAST un-spined hash chain retired, WIRING.md step ⑤
 * complete) The content hash now rides the ONE canonical encoder
 * (lib/state/canonical.js, #146): the same logical object hashes
 * identically regardless of key order, so two stores of equal content
 * get the SAME barcode instead of two aliases of the #146 disease. The
 * old raw `sha256(JSON.stringify(content))` keyed off property
 * insertion order — a real collision-class, not a style point.
 * Safe to re-derive: storage addressing is barcode → position
 * (self-authenticating recovery recomputes from the barcode, never
 * from content), so previously stored records stay reachable via the
 * barcode they were stored under; only NEW barcode generation changes.
 *
 * (pass 185) #157 parity HARNESS against the REAL engine functions —
 * `engineParity()` cross-checks the quantized projections/design-space
 * values through algebraically-distinct evaluation orders (the actual
 * drift class a sidecar introduces) and returns the mismatch list; a
 * pinned golden leg lives in test/geometry-parity.test.js. julia being
 * off-PATH skips the live-srv leg (same policy as julia-sidecar-live).
 */
function generateBarcodeFromContent(content) {
    const canonical = require('../state/canonical');
    const hash = canonical.hash(content);

    // NSC 9 = automation-reserved (GS1 reserved range)
    // Safe facility range: 10000-99999 (avoids manufacturer codes 01000-09999)
    const raw = parseInt(hash.slice(0, 5), 16);
    const facility = 10000 + (raw % 90000);

    const sequence = parseInt(hash.slice(5, 10), 16) % 100000;
    const checksum = parseInt(hash.slice(-1), 16) % 10;

    return `9-${facility.toString().padStart(5, '0')}-${sequence.toString().padStart(5, '0')}-${checksum}`;
}

/**
 * Quasicrystal Storage (v0.8.6)
 * Aperiodic tiling-based storage for Vant memories
 */
const path = require('path');
const fs = require('fs');
const { project } = require('./projection');
const { getTileAt, getDistribution } = require('./tilings');
// (pass 185) φ for the engineParity drift probe (the projection's constant)
const PHI = (1 + Math.sqrt(5)) / 2;

// Default storage - falls back to brain path + canvas subfolder
// (pass 24) anchor: models/ of the INSTALL tree (VANT_REPO_ROOT-aware);
// was a fragile '../../../' count that broke if the module moved a level.
const DEFAULT_DATA_PATH = path.join(require('../anchor').getRepoRoot(), 'models', 'private', 'canvas');

// Initialize data directory
function initStorage(basePath = DEFAULT_DATA_PATH) {
    if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
    }
    return basePath;
}

/**
 * Compute storage key from barcode
 * This IS the addressing - no lookup table!
 */
function getStorageKey(barcode) {
    const proj = project(barcode);
    // Key is the _key field from projection
    return proj._key;
}

/**
 * Compute file path from barcode
 */
function getFilePath(barcode, basePath) {
    const key = getStorageKey(barcode);
    const dir = path.join(basePath, key.substring(0, 2));
    return path.join(dir, `${key}.json`);
}

/**
 * Store data with barcode as key
 * Uses geometric addressing, not hash table
 */
async function store(barcode, data, basePath = DEFAULT_DATA_PATH, options = {}) {
    // RLS per-record ACL check (optional - skip if no userCtx)
    const rls = _getRLS();
    if (rls && options.userCtx) {
        await _checkWrite(options.userCtx, '_geometry:' + barcode);
    }
    // SECURITY: Validate barcode format
    if (!barcode || typeof barcode !== 'string' || barcode.length > 50) {
        throw new errors.VantError('EINVAL: invalid barcode', { code: errors.CODES.VAF_INPUT_INVALID });
    }

    // Validate data is not massive (prevent DoS)
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 10 * 1024 * 1024) {
        throw new errors.VantError('EFBIG: data too large (max 10MB)', { code: errors.CODES.VAF_TOO_LONG });
    }


    // OPTIONAL: Encrypt data at rest
    let storedData = data;
    let encrypted = false;
    if (options.encryptKey) {
        const Encrypt = _getEncrypt();
        if (Encrypt) {
            storedData = Encrypt.encrypt(JSON.stringify(data), options.encryptKey);
            encrypted = true;
        }
    }

    initStorage(basePath);

    const proj = project(barcode);
    const filePath = getFilePath(barcode, basePath);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Store with metadata
    // (pass 185) #157 WIRED — the precision contract makes the QUANTIZED form
    // the address-bearing fields: position components and the angular
    // coordinates ride the deterministic quantizer (grid 1e-9, EXACT integer
    // grid values). The storage KEY was always integer-safe (that's the
    // collision story); these metadata fields are what a cross-engine
    // re-derivation compares — last-ulp drift between two engine paths must
    // never become two different cells. Position is stored as the quantized
    // integer grid triple (the projection's cartesian vertex array), keeping
    // per-contract honesty AND byte-stability across the Node/Julia split.
    const precision = require('./precision');
    const record = {
        barcode,
        _key: proj._key,
        fingerprint: proj.fingerprint,
        position: {
            x: precision.quantize(proj.position[0]),
            y: precision.quantize(proj.position[1]),
            z: precision.quantize(proj.position[2])
        },
        theta: precision.quantize(proj.theta),
        phi: precision.quantize(proj.phi),
        depth: precision.quantize(proj.depth),
        data: storedData,
        _stored: Date.now(),
        _encrypted: encrypted
    };

    // (P2 #27) atomic — helper is fs-only; same-call await keeps the async contract
    await require('../primitives').atomicWriteFile(
        filePath,
        JSON.stringify(record, null, 2),
        'utf8'
    );

    return {
        stored: true,
        key: proj._key,
        fingerprint: proj.fingerprint,
        encrypted
    };
}

/**
 * Retrieve data from barcode
 * Any node can recompute position - no central index!
 */
async function retrieve(barcode, basePath = DEFAULT_DATA_PATH, options = {}) {
    // SECURITY: Validate barcode
    if (!barcode || typeof barcode !== 'string' || barcode.length > 50) {
        throw new errors.VantError('EINVAL: invalid barcode', { code: errors.CODES.VAF_INPUT_INVALID });
    }

    const filePath = getFilePath(barcode, basePath);

    if (!fs.existsSync(filePath)) {
        return { error: 'not found', barcode };
    }

    const content = await fs.promises.readFile(filePath, 'utf8');
    const record = JSON.parse(content);

    // OPTIONAL: Decrypt data at rest
    if (record._encrypted && options.decryptKey) {
        const Encrypt = _getEncrypt();
        if (Encrypt) {
            try {
                record.data = JSON.parse(Encrypt.decrypt(record.data, options.decryptKey));
            } catch (e) {
                return { error: 'decryption failed', barcode };
            }
        }
    }

    return record;
}

/**
 * Check if barcode exists in storage
 */
async function has(barcode, basePath = DEFAULT_DATA_PATH, options = {}) {
    // OPTIONAL: RLS check
    if (options.userCtx) {
        const rls = _getRLS();
        if (rls) {
            await _checkRead(options.userCtx, '_geometry:' + barcode);
        }
    }
    // SECURITY: Validate barcode
    if (!barcode || typeof barcode !== 'string' || barcode.length > 50) {
        throw new errors.VantError('EINVAL: invalid barcode', { code: errors.CODES.VAF_INPUT_INVALID });
    }

    const filePath = getFilePath(barcode, basePath);
    return fs.existsSync(filePath);
}

/**
 * List all stored barcodes
 */
async function list(basePath = DEFAULT_DATA_PATH) {
    const barcodes = [];

    async function walk(dir) {
        if (!fs.existsSync(dir)) return;

        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.name.endsWith('.json')) {
                const key = entry.name.replace('.json', '');
                barcodes.push(key);
            }
        }
    }

    await walk(basePath);
    return barcodes;
}

/**
 * Get distribution stats for all stored memories
 */
async function stats(basePath = DEFAULT_DATA_PATH) {
    const all = await list(basePath);
    const addresses = all.map(key => {
        const parts = key.split('_');
        return {
            theta: parseInt(parts[0]) / 100,
            phi: parseInt(parts[1]) / 100,
            depth: parseInt(parts[2]) / 1000
        };
    });

    return getDistribution(addresses);
}

/**
 * (pass 185) #157 ENGINE PARITY over the real engine.js math.
 *
 * vecs: [{ re, im }]. For each vector, computes the projection-relevant
 * quantized values through: (a) engine.js's complexMultiply path, and
 * (b) an algebraically-distinct equivalent written in a different
 * evaluation order (the drift class the sidecar's floats introduce —
 * (a+b)*c distributes differently than a*c + b*c in the last ulps).
 * Both sides are then run through the #157 quantizer + parityHarness.
 * Empty result = both orders land on the same cells.
 *
 * Returns { ok, checked, mismatches[] } — parity REPORTED, never asserted
 * in-process; the suite turns mismatches into a red test.
 */
function engineParity(vecs) {
    const precision = require('./precision');
    const vectors = Array.isArray(vecs) ? vecs : [{ re: 0.1, im: 0.2 }, { re: 1.5, im: -2.5 }];
    // Both paths compute the complex ROTATION z·e^{iφ} (the projection's
    // golden-angle step) through a different evaluation order — the drift
    // class a sidecar introduces:
    //   (a) direct:  rot(z) = (x·cosφ − y·sinφ, x·sinφ + y·cosφ) with
    //       cos(5·φ)/… — full-real-arithmetic angle composition
    //   (b) angle-sum identities applied FIRST, then one float multiply —
    //       algebraically identical, differently rounded.
    // Parity holds ONLY if the #157 quantizer absorbs last-ulp drift.
    const GOLDEN_ANGLE = 2 * Math.PI * (PHI - 1);   // the projection's step
    const cA = Math.cos(GOLDEN_ANGLE), sA = Math.sin(GOLDEN_ANGLE);
    const jsPath = vectors.map(z => ({
        re: z.re * cA - z.im * sA,
        im: z.re * sA + z.im * cA
    }));
    // (b) angle-sum decomposition: the SAME rotation applied as two half-
    // angle sub-steps (cos(2h)=ch²−sh² — computed through a different
    // rounding path than the direct libm coefficients).
    const half = GOLDEN_ANGLE / 2;
    const ch = Math.cos(half), sh = Math.sin(half);
    const altPath = vectors.map(z => {
        const inner = { re: z.re * ch - z.im * sh, im: z.re * sh + z.im * ch };
        return { re: inner.re * ch - inner.im * sh, im: inner.re * sh + inner.im * ch };
    });
    // parityHarness calls the fns per-vector (no index arg) — run one
    // harness per vector pair with the precomputed values closed over.
    const mismatches = [];
    for (let i = 0; i < vectors.length; i++) {
        const mi = precision.parityHarness([vectors[i]], () => jsPath[i], () => altPath[i]);
        for (const m of mi) mismatches.push({ index: i, ...m });
    }
    return { ok: mismatches.length === 0, checked: vectors.length, mismatches };
}

/**
 * Verify recovery capability
 * Tests that barcode → position is deterministic
 */
function verifyRecovery(testCases) {
    const results = testCases.map(barcode => {
        const key1 = getStorageKey(barcode);
        const key2 = getStorageKey(barcode); // Call again to verify

        return {
            barcode,
            key1,
            key2,
            deterministic: key1 === key2
        };
    });

    const allDeterministic = results.every(r => r.deterministic);

    return {
        verifiable: results.length,
        allDeterministic,
        results
    };
}

module.exports = {
    generateBarcodeFromContent,
    initStorage,
    getStorageKey,
    getFilePath,
    store,
    retrieve,
    has,
    list,
    stats,
    verifyRecovery,
    engineParity,
    // Re-export core functions
    project,
    getTileAt
};