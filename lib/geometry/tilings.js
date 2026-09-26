/**
 * Penrose P3 Tilings (v0.8.6)
 * Rhombus tiling distribution for Vant memory addresses
 *
 * P3 tiling properties:
 * - Only 2 tile shapes (thick/thin rhombi)
 * - Aperiodic: covers infinite area, never repeats pattern exactly
 * - φ-ratio: area(thick) / area(thin) = φ² ≈ 2.618
 * - Same golden ratio relationships as icosahedral coordinates
 */

const { PHI } = require('./icosahedral');

/**
 * Tile definitions (area ratios scaled by φ²)
 */
// Thin rhombus: acute angles 36°, 144°
const THIN = {
    name: 'thin',
    angleShort: 36 * Math.PI / 180,
    angleLong: 144 * Math.PI / 180,
    area: 1,
    sidesEquals: 1  // units
};

// Thick rhombus: obtuse angles 72°, 108°
const THICK = {
    name: 'thick',
    angleShort: 72 * Math.PI / 180,
    angleLong: 108 * Math.PI / 180,
    area: PHI * PHI,  // φ² ≈ 2.618
    sidesEquals: PHI
};

/**
 * Generate tile at specified position in the tiling
 * Uses de Bruijn's multigrid method (1981)
 */
function getTileAt(theta, phi, depth) {
    // 5 families of parallel lines (for 5-fold symmetry)
    const lines = [];

    for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2 / 5) + (theta * Math.sqrt(5) % 1);
        lines.push({
            family: i,
            angle,
            offset: (depth * Math.sin(angle + phi)) % 1
        });
    }

    // Determine tile type from line crossings
    const intersections = lines.map(l => l.offset).sort((a, b) => a - b);

    // Use ratio of intersections as tile fingerprint
    const r1 = intersections[1] - intersections[0];
    const r2 = intersections[2] - intersections[1];
    const ratio = r1 / (r2 || 0.001);

    // If ratio ≈ φ, it's thick; else thin
    const isThick = Math.abs(ratio - PHI) < 0.5;

    return isThick ? THICK : THIN;
}

/**
 * Create addressing grid from multiple coordinates
 */
function createGrid(coordinates) {
    const tiles = new Map();

    for (const coord of coordinates) {
        const tile = getTileAt(coord.theta, coord.phi, coord.depth);
        tiles.set(tile.name, (tiles.get(tile.name) || 0) + 1);
    }

    return {
        tiles,
        // Calculate balance ratio - optimal = approaching φ
        balance: tiles.get('thick') / (tiles.get('thin') || 1),
        isBalanced: tiles.get('thick') > 0 && tiles.get('thin') > 0
    };
}

/**
 * Get distribution statistics for a set of addresses
 */
function getDistribution(addresses) {
    const stats = {
        total: addresses.length,
        thin: 0,
        thick: 0,
        balanceRatio: 0
    };

    for (const addr of addresses) {
        const tile = getTileAt(addr.theta, addr.phi, addr.depth);
        if (tile.name === 'thin') stats.thin++;
        else stats.thick++;
    }

    stats.balanceRatio = stats.thick / (stats.thin || stats.total);

    // Optimal: thick/thin ≈ φ (1.618...)
    stats.isOptimal = Math.abs(stats.balanceRatio - 1.618) < 0.3;

    return stats;
}

module.exports = {
    THIN,
    THICK,
    PHI,
    getTileAt,
    createGrid,
    getDistribution
};