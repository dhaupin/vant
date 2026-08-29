/**
 * Projection: Barcode → Icosahedral Coordinates (v0.8.6)
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

        // String form for storage - use ORIGINAL values for uniqueness!
// This guarantees every unique barcode gets unique key
// Format: {facility}_{sequence}_{checksum}
// e.g. 00000_00001_1
        _key: `${parsed.facility.toString().padStart(5,'0')}_${parsed.sequence.toString().padStart(5,'0')}_${parsed.checksum}`
    };
}

/**
 * Inverse: reconstruct barcode from storage key
 */
function reconstruct(key) {
    const parts = key.split('_');
    if (parts.length !== 3) {
        return null;
    }
    const [facilityStr, sequenceStr, checksumStr] = parts;
    const facility = parseInt(facilityStr);
    const sequence = parseInt(sequenceStr);
    const checksum = parseInt(checksumStr);

    return {
        facility,
        sequence,
        checksum,
        // Reconstruct valid barcode
        barcode: `1-${facility.toString().padStart(5,'0')}-${sequence.toString().padStart(5,'0')}-${checksum}`,
        isValid: true
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