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
    
    // Storage layer
    quasicrystal: () => quasicrystal,
    store: quasicrystal.store,
    retrieve: quasicrystal.retrieve,
    has: quasicrystal.has,
    list: quasicrystal.list,
    stats: quasicrystal.stats,
    verifyRecovery: quasicrystal.verifyRecovery,
    
    // Version
    version: '0.9.0-exp'
};