/**
 * Penrose P3 Rhombus Tiling Generator
 * 
 * Implements subdivision/inflation rules based on golden ratio φ
 * to generate aperiodic Penrose P3 tilings
 * 
 * Based on: Robinson triangle decomposition
 * - Thin rhomb (36°/144°) = 2 acute triangles (36-72-72)
 * - Thick rhomb (72°/108°) = 2 obtuse triangles (36-36-108)
 */

const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Subdivide Robinson triangles using deflation rules
 * @param {Array} triangles - [{type: 'acute'|'obtuse'}] 
 * @returns subdivided triangles
 */
function subdivide(triangles) {
    const next = [];
    for (const tri of triangles) {
        if (tri.type === 'acute') {
            // 1 acute → 2 acute + 1 obtuse
            next.push({ type: 'acute' }, { type: 'acute' }, { type: 'obtuse' });
        } else {
            // 1 obtuse → 1 acute + 2 obtuse
            next.push({ type: 'acute' }, { type: 'obtuse' }, { type: 'obtuse' });
        }
    }
    return next;
}

/**
 * Generate Penrose P3 tiling for N iterations
 * @param {number} iterations - Number of subdivision steps
 * @param {string} start - 'thin' | 'thick' | 'both'
 * @returns {Object} { triangles, stats }
 */
function generate(iterations = 4, start = 'thin') {
    let current;
    
    switch (start) {
        case 'thin':
            // 1 thin rhomb = 2 acute triangles
            current = [{ type: 'acute' }, { type: 'acute' }];
            break;
        case 'thick':
            // 1 thick rhomb = 2 obtuse triangles  
            current = [{ type: 'obtuse' }, { type: 'obtuse' }];
            break;
        case 'both':
        default:
            // Sun pattern = 5 thick rhombi around center
            current = Array(10).fill({ type: 'obtuse' });
            break;
    }
    
    for (let i = 0; i < iterations; i++) {
        current = subdivide(current);
    }
    
    const acute = current.filter(t => t.type === 'acute').length;
    const obtuse = current.filter(t => t.type === 'obtuse').length;
    const thin = Math.floor(acute / 2);
    const thick = Math.floor(obtuse / 2);
    
    return {
        triangles: current,
        stats: {
            iterations,
            triangles: current.length,
            acute,
            obtuse,
            thinRhombi: thin,
            thickRhombi: thick,
            ratio: thick / thin || 0,
            expectedPhi: PHI
        }
    };
}

/**
 * Get vertices for rendering thin or thick rhombus
 * @param {string} type - 'thin' | 'thick'
 * @param {number} size - Side length
 * @returns {Array} [x,y] coordinates for 4 vertices
 */
function getRhombus(type, size = 1) {
    // All sides = size (normalized)
    // Thin: angles 36°, 144°
    // Thick: angles 72°, 108°
    const sin36 = Math.sin(36 * Math.PI / 180);
    const cos36 = Math.cos(36 * Math.PI / 180);
    const sin72 = Math.sin(72 * Math.PI / 180);
    const cos72 = Math.cos(72 * Math.PI / 180);
    
    if (type === 'thin') {
        return [
            [0, 0],
            [size * cos36, size * sin36],
            [size * (cos36 + cos72), size * (sin36 - sin72)],  // obtuse vertex
            [size * cos72, -size * sin72]
        ];
    } else {
        // Thick rhombus
        return [
            [0, 0],
            [size * cos72, size * sin72],
            [size * (cos72 + cos36), size * (sin72 + sin36)],
            [size * cos36, -size * sin36]
        ];
    }
}

module.exports = {
    PHI,
    subdivide,
    generate,
    getRhombus,
    version: '0.1.0'
};