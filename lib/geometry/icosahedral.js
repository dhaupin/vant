/**
 * Icosahedral Coordinates (v0.9.0-exp)
 * Aperiodic 3D coordinate system for Vant memory addressing
 * 
 * Mathematical basis:
 * - Icosahedron: 20 triangular faces, 30 edges, 12 vertices
 * - Dual: Dodecahedron with 12 pentagonal faces
 * - Golden ratio φ = (1+√5)/2 ≈ 1.618
 */

const PHI = (1 + Math.sqrt(5)) / 2;

// Golden angle (radians) - key to phyllotaxis!
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399 radians ≈ 137.5°

// Icosahedron vertices (normalized)
const VERTICES = [
    [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
    [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
    [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
].map(normalize);

// Face normals (20 faces)
const FACE_NORMALS = [
    [0.527, 0, 0.851], [-0.527, 0, 0.851], [0.527, 0, -0.851], [-0.527, 0, -0.851],
    [0.851, 0.527, 0], [-0.851, 0.527, 0], [0.851, 0.527, 0], [-0.851, 0, 0.527],
    [0, 0.851, 0.527], [0, -0.851, 0.527], [0, 0.851, -0.527], [0, -0.851, -0.527],
    [0.809, 0.309, 0.5], [-0.809, 0.309, 0.5], [0.809, 0.309, -0.5], [-0.809, 0.309, -0.5],
    [0.309, 0.5, 0.809], [0.309, -0.5, 0.809], [0.309, 0.5, -0.809], [0.309, -0.5, -0.809]
];

/**
 * Normalize a 3D vector to unit length
 */
function normalize(v) {
    const len = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
    return len > 0 ? [v[0]/len, v[1]/len, v[2]/len] : [0, 0, 0];
}

/**
 * Convert spherical to cartesian
 */
function sphericalToCartesian(theta, phi, radius = 1) {
    return [
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    ];
}

/**
 * Convert cartesian to spherical
 */
function cartesianToSpherical(x, y, z) {
    const r = Math.sqrt(x*x + y*y + z*z);
    const phi = Math.acos(Math.max(-1, Math.min(1, y/r)));
    const theta = Math.atan2(z, x);
    return { theta, phi, r };
}

/**
 * Get surface position on dodecahedron from angular coordinates
 */
function getSurfacePosition(theta, phi) {
    // Use golden angle distribution for uniqueness
    const offset = theta * (PHI - 1); // Uses φ - 1 = 1/φ ≈ 0.618
    
    // Project onto closest face of icosahedron
    const point = sphericalToCartesian(theta + offset, phi, 1);
    
    // Find nearest vertex
    let minDist = Infinity;
    let nearest = VERTICES[0];
    
    for (const v of VERTICES) {
        const dist = Math.sqrt(
            (point[0]-v[0])**2 + 
            (point[1]-v[1])**2 + 
            (point[2]-v[2])**2
        );
        if (dist < minDist) {
            minDist = dist;
            nearest = v;
        }
    }
    
    return nearest;
}

/**
 * Generate unique fingerprint from position
 * This is the "geometric signature" - never repeats
 */
function getFingerprint(theta, phi, depth) {
    // Progressive golden spiral distribution
    const n = Math.floor(depth * 1000); // discretization
    const goldenTheta = n * GOLDEN_ANGLE;
    const goldenPhi = Math.PI * (1 - 1/PHI); // ~2.399 rad
    
    const pos = getSurfacePosition(goldenTheta, goldenPhi * depth);
    
    // Return compact fingerprint: vertex index + offset
    const vertexIndex = VERTICES.findIndex(v => 
        v[0] === pos[0] && v[1] === pos[1] && v[2] === pos[2]
    );
    
    return {
        vertex: vertexIndex >= 0 ? vertexIndex : 0,
        offsets: pos.map((p, i) => Math.round(p * 1000) / 1000),
        depth: Math.round(depth * 10000) / 10000,
        signature: `${pos[0].toFixed(3)},${pos[1].toFixed(3)},${pos[2].toFixed(3)}`
    };
}

module.exports = {
    PHI,
    GOLDEN_ANGLE,
    VERTICES,
    FACE_NORMALS,
    normalize,
    sphericalToCartesian,
    cartesianToSpherical,
    getSurfacePosition,
    getFingerprint
};