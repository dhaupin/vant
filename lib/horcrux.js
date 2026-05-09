/**
 * Horcrux Manifest - DEPRECATED (v0.8.6)
 *
 * Re-exports from lib/stego.js for backward compatibility.
 * All horcrux functions now live in stego.js.
 *
 * @deprecated v0.8.6 - Use require('./stego') instead
 */

const stego = require('./stego');

module.exports = {
    generateManifest: stego.generateManifest,
    createBootstrap: stego.createBootstrap,
    parseBootstrap: stego.parseBootstrap,
    embedInBrain: stego.embedInBrain,
    extractFromBrain: stego.extractFromBrain,
    validateManifest: stego.validateManifest
};
