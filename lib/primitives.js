/**
 * Vant Primitives (v0.9.0-axolotl)
 * Dependency-free building blocks.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * HARD CONTRACT: this module requires NODE BUILTINS ONLY — zero `./` Vant
 * requires, ever. That is its entire reason to exist: anything in lib/ —
 * including code inside the brain↔storage↔gate require cycle and boot-time
 * bootstrap windows — may require it at LOAD TIME without risk of a partial
 * module. Adding a single Vant require here reintroduces the partial-cache
 * bug class (see the 5b3ca91 gate/storage fix). Enforced by
 * test/primitives.test.js.
 *
 * GATED vs UNGATED (read before "upgrading" callers):
 * primitives write WITHOUT the sandbox capability gate — that is the point,
 * the gate is unusable mid-cycle. Anything OUTSIDE a bootstrap window that
 * wants capability-gated writes uses storage.atomicWrite() instead. stego.js
 * and backup.js deliberately STAY on storage.atomicWrite (they are sandbox-
 * relevant artifact writers); do not migrate them here.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Contents:
 *   atomicWriteFile(filePath, content) — crash-safe write: hidden same-dir
 *     temp file, fsync, atomic rename. A crash can leave the temp behind
 *     (harmless, swept by `vant clean cache`) but never a truncated FINAL
 *     file. (Audit P2 #27; briefly lived in error.js — moved here because
 *     error.js says nothing about file I/O.)
 *   sleep(ms) — timing primitive, not an error concern.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Atomic file write — temp file + fsync + rename.
 * @param {string} filePath - final destination path
 * @param {string|Buffer} content
 */
function atomicWriteFile(filePath, content) {
    if (typeof filePath !== 'string' || !filePath) {
        throw new Error('atomicWriteFile: filePath required');
    }
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tempPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
    let fd = null;
    try {
        fd = fs.openSync(tempPath, 'w');
        fs.writeFileSync(fd, content);
        try { fs.fsyncSync(fd); } catch (e) { /* some filesystems refuse fsync on files */ }
    } finally {
        if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* already closed */ } }
    }
    fs.renameSync(tempPath, filePath);
}

/**
 * Sleep for `ms` milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    atomicWriteFile,
    sleep
};
