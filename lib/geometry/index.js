/**
 * Geometry Module (v0.9.0-exp)
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
    async store(barcode, data, basePath) {
        const qc = quasicrystal;
        qc.initStorage(basePath);
        return qc.store(barcode, data, basePath);
    },
    
    /**
     * Retrieve memory from geometric address
     * @see quasicrystal.retrieve()
     */
    async retrieve(barcode, basePath) {
        return quasicrystal.retrieve(barcode, basePath);
    },
    
    /**
     * Check if barcode exists
     * @see quasicrystal.has()
     */
    has(barcode, basePath) {
        return quasicrystal.has(barcode, basePath);
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
        return quasicrystal.initStorage(basePath);
    },
    
    /**
     * @deprecated Use quasicrystal().generateBarcodeFromContent() instead
     */
    generateBarcode: quasicrystal.generateBarcodeFromContent,
    
    // Version
    version: '0.9.0-exp'
};