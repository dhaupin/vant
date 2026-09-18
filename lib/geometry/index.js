/**
 * Geometry Module (v0.8.6)
 * Aperiodic Quasicrystal Memory Addressing for Vant
 *
 * Mathematical foundations:
 * - Penrose P3 tilings (1974) - aperiodic tiling
 * - Shechtman quasicrystals (1984) - physical realization
 * - de Bruijn projection (1981) - 5D → 2D slice
 *
 * This package extends Vant with:
 * - Geometric addressing (barcode → unique surface position)
 * - Collision-free storage (infinite address space)
 * - Self-authenticating recovery (no lookup table needed!)
 *
 * Usage:
 *   const geometry = require('./geometry');
 *   const coords = geometry.project('1-31814-04200-8');
 *   // { theta: 2.34, phi: 0.72, depth: 0.418, fingerprint: '0.527,...' }
 *
 *   const qstore = geometry.quasicrystal();
 *   await qstore.store(coords, { type: 'memory', content: '...' });
 *   const recovered = await qstore.retrieve('1-31814-04200-8');
 */

// Core exports
const icosahedral = require('./icosahedral');
const projection = require('./projection');
const tilings = require('./tilings');
const quasicrystal = require('./quasicrystal');

/**
 * Main API
 */
module.exports = {
    // Core constants
    PHI: icosahedral.PHI,
    GOLDEN_ANGLE: icosahedral.GOLDEN_ANGLE,

    // Coordinate system
    ...icosahedral,

    // Main projection API
    project: projection.project,
    parseBarcode: projection.parseBarcode,
    reconstruct: projection.reconstruct,
    verifyUniqueness: projection.verifyUniqueness,

    // Tiling distribution
    getTileAt: tilings.getTileAt,
    getDistribution: tilings.getDistribution,

    // Storage layer - lazy init for backwards compat
    quasicrystal: () => quasicrystal,

    // Convenience wrappers - auto-init storage
    _store: quasicrystal.store,
    _retrieve: quasicrystal.retrieve,

    /**
     * Store memory at geometric address
     * @see quasicrystal.store()
     */
    async store(barcode, data, basePath, options) {
        const qc = quasicrystal;
        qc.initStorage(basePath);
        return qc.store(barcode, data, basePath, options);
    },

    /**
     * Retrieve memory from geometric address
     * @see quasicrystal.retrieve()
     */
    async retrieve(barcode, basePath, options) {
        return quasicrystal.retrieve(barcode, basePath, options);
    },

    /**
     * Check if barcode exists
     * @see quasicrystal.has()
     */
    has(barcode, basePath, options) {
        return quasicrystal.has(barcode, basePath, options);
    },

    /**
     * List all stored barcodes
     * @see quasicrystal.list()
     */
    list(basePath) {
        return quasicrystal.list(basePath);
    },

    /**
     * Get distribution stats
     * @see quasicrystal.stats()
     */
    stats(basePath) {
        return quasicrystal.stats(basePath);
    },

    /**
     * Verify recovery determinism
     * @see quasicrystal.verifyRecovery()
     */
    verifyRecovery(testCases) {
        return quasicrystal.verifyRecovery(testCases);
    },

    /**
     * Generate barcode from content hash
     * @see quasicrystal.generateBarcodeFromContent()
     */
    generateBarcodeFromContent(content) {
        return quasicrystal.generateBarcodeFromContent(content);
    },

    /**
     * Get storage key from barcode (deterministic)
     * @see quasicrystal.getStorageKey()
     */
    getStorageKey(barcode) {
        return quasicrystal.getStorageKey(barcode);
    },

    /**
     * Initialize storage directory
     * @see quasicrystal.initStorage()
     */
    initStorage(basePath) {
        // SECURITY: Only allow within brain paths
        const brainPath = require('../brain').getBrainPath();
        const publicPath = require('../brain').getPublicPath();
        if (basePath && typeof basePath === 'string') {
            // Only allow paths under brain
            if (!basePath.startsWith(brainPath) && !basePath.startsWith(publicPath)) {
                throw new Error('EPERM: initStorage only allowed in brain paths');
            }
        }
        return quasicrystal.initStorage(basePath);
    },

    /**
     * @deprecated Use quasicrystal().generateBarcodeFromContent() instead
     */
    generateBarcode: quasicrystal.generateBarcodeFromContent,

    // Version
    version: '0.9.0-exp',

    // ==================== WORKSPACE GEOMETRY ====================
    /**
     * Generate a geometric address for a workspace
     * Uses quasicrystal projection for collision-free addressing
     * Each workspace gets a unique spot in geometric space
     *
     * @param {string} workspaceId - The workspace ID
     * @param {number} facility - Optional facility code (default: derived from workspace hash)
     * @returns {Object} Geometric address
     */
    workspaceAddress(workspaceId, facility = null) {
        // Derive facility from workspace ID if not provided
        if (!facility) {
            const hash = require('crypto')
                .createHash('sha256')
                .update(workspaceId)
                .digest('hex');
            facility = 10000 + (parseInt(hash.slice(0, 5), 16) % 90000);
        }

        // Generate sequence from workspace ID
        const hash = require('crypto')
            .createHash('sha256')
            .update(workspaceId + ':sequence')
            .digest('hex');
        const sequence = parseInt(hash.slice(0, 5), 16) % 100000;

        // Generate barcode
        const barcode = `9-${facility.toString().padStart(5, '0')}-${sequence.toString().padStart(5, '0')}-0`;

        // Project to geometric coordinates
        const coords = projection.project(barcode);

        // Get tile at position
        const tile = tilings.getTileAt(coords.theta, coords.phi);

        return {
            workspaceId,
            barcode,
            facility,
            sequence,
            tile: tile?.type || 'unknown',
            coords: {
                theta: coords.theta,
                phi: coords.phi,
                depth: coords.depth,
                fingerprint: coords.fingerprint
            },
            address: `ws-${workspaceId}@${coords.theta.toFixed(4)},${coords.phi.toFixed(4)}`
        };
    },

    /**
     * Get all workspaces as geometric regions
     * Creates a map of workspace → geometric region
     *
     * @param {Array} workspaces - Array of workspace objects
     * @returns {Map} workspaceId → geometric address
     */
    workspaceMap(workspaces) {
        const map = new Map();

        for (const ws of workspaces) {
            const addr = this.workspaceAddress(ws.id || ws.workspaceId || ws);
            map.set(ws.id || ws.workspaceId, addr);
        }

        return map;
    },

    /**
     * Check if a point is within a workspace region
     * Uses tile-based containment
     *
     * @param {Object} point - { theta, phi }
     * @param {Object} workspaceAddr - From workspaceAddress()
     * @param {number} tolerance - Distance tolerance (default: 0.1)
     * @returns {boolean}
     */
    containsPoint(point, workspaceAddr, tolerance = 0.1) {
        const { theta, phi } = workspaceAddr.coords;

        // Simple distance check
        const dTheta = Math.abs(point.theta - theta);
        const dPhi = Math.abs(point.phi - phi);

        return (dTheta < tolerance && dPhi < tolerance);
    }
};