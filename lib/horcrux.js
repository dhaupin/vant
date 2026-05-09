/**
 * Deprecated - use lib/stego instead
 * Re-exports for backward compatibility
 */
const stego = require('./stego');

module.exports = {
    encode: stego.encode,
    decode: stego.decode,
    embed: stego.embed,
    extract: stego.extract,
    getLayerStatus: stego.getLayerStatus,
    isOperationAllowed: stego.isOperationAllowed,
    getStatus: stego.getStatus
};
