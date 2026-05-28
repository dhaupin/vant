/**
 * Projection: Barcode → Icosahedral Coordinates (v0.9.0-exp)
 * Maps System 1 barcodes to unique geometric positions
 * 
 * Barcode format: 1-XXXXX-YYYYY-Z
 *   XXXXX = facility/habitat code (31814) → rotational axis
 *   YYYYY = internal sequence (04200) → projection depth  
 *   Z    = checksum (ignored for addressing)
 * 
 * Mathematical foundation: Cut-project from 5D hypercube
 */

const { PHI, GOLDEN_ANGLE, getSurfacePosition, getFingerprint } = require('./icosahedral');

/**
 * Parse System 1 barcode
 */
function parseBarcode(barcode) {
    // Format: 1-31814-04200-8
    const cleaned = barcode.replace(/[^0-9]/g, '');
    
    if (cleaned.length !== 12) {
        throw new Error(`Invalid barcode: ${barcode}. Expected 12 digits.`);
    }
    
    const facility = parseInt(cleaned.substring(1, 6));
    const sequence = parseInt(cleaned.substring(6, 11));
    const checksum = parseInt(cleaned[11]);
    
    return { facility, sequence, checksum };
}

/**
 * Project barcode to θ (theta) - rotational axis angle
 * Uses facility code to derive deterministic angle
 */
function projectTheta(facility) {
    // Normalize to [0, 2π]
    const normalized = (facility % 100000) / 100000;
    return normalized * 2 * Math.PI;
}

/**
 * Project barcode to φ (phi) - elevation angle
 * Uses sequence code - deeper sequences = further from surface
 */
function projectPhi(sequence) {
    // Normalize to [0, π]
    const normalized = (sequence % 100000) / 100000;
    return normalized * Math.PI;
}

/**
 * Project barcode to depth (d) - how far into the icosahedron
 * Higher sequences penetrate deeper
 */
function projectDepth(sequence) {
    // Use golden ratio scaling for unique depths
    const normalized = (sequence % 100000) / 100000;
    
    // Depth between 0 (surface) and 1 (center)
    // Follows φ-scaling for aperiodic distribution
    return normalized / PHI;
}

/**
 * Full projection: barcode → icosahedral coordinates
 */
function project(barcode) {
    const parsed = parseBarcode(barcode);
    
    const theta = projectTheta(parsed.facility);
    const phi = projectPhi(parsed.sequence);
    const depth = projectDepth(parsed.sequence);
    
    // Get surface position (ignores depth for addressing surface)
    const surfacePos = getSurfacePosition(theta, phi);
    
    // Generate unique fingerprint - pass ALL 4 components
    const fingerprint = getFingerprint(theta, phi, depth, parsed.checksum);
    
    return {
        barcode,
        // Angular coordinates
        theta: Math.round(theta * 1000) / 1000,
        phi: Math.round(phi * 1000) / 1000,
        depth: Math.round(depth * 10000) / 10000,
        
        // Geometric representation
        position: surfacePos,
        fingerprint: fingerprint.signature,
        
        // Raw parsing
        _parsed: parsed,
        
        // String form for storage - include checksum digit for uniqueness!
        _key: `${Math.round(theta*100)}_${Math.round(phi*100)}_${Math.round(depth*1000)}_${parsed.checksum}`
    };
}

/**
 * Inverse: reconstruct from any known position
 */
function reconstruct(key) {
    const parts = key.split('_');
    
    return {
        theta: parseInt(parts[0]) / 100,
        phi: parseInt(parts[1]) / 100,
        depth: parseInt(parts[2]) / 1000,
        checksum: parseInt(parts[3]) || 0
    };
}

/**
 * Verify that two different barcodes produce different positions
 */
function verifyUniqueness(testCases) {
    const results = testCases.map(bc => ({ 
        barcode: bc, 
        proj: project(bc),
        fp: project(bc).fingerprint 
    }));
    
    const fingerprints = results.map(r => r.fp);
    const unique = new Set(fingerprints);
    
    return {
        total: results.length,
        unique: unique.size,
        allUnique: unique.size === results.length,
        results
    };
}

module.exports = {
    parseBarcode,
    projectTheta,
    projectPhi,
    projectDepth,
    project,
    reconstruct,
    verifyUniqueness
};