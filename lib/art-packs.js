/**
 * Art packs — deterministic generative math-art for horcrux stones (#195).
 *
 * The stego/horcrux half is production grade; this is the ART half. Before
 * this module a fresh `vant horcrux create` painted a carrier whose entire
 * visible surface was `<rect fill="#1a1a2e"/>` + two circles — the payload's
 * vehicle deserved the same care as the payload.
 *
 * Design rules (the crash-has-no-blog contract):
 * - NO Math.random, NO Date.now — fnv1a(seed) → mulberry32 makes every
 *   render reproducible: same seed + same style = byte-identical stone.
 * - Pure SVG string OUT, nothing else: no fs, no storage, no sandbox, no
 *   event side effects. A crash in art can never take a backup down.
 * - The four pack names are RESERVED in the style position (documented in
 *   .vant-art-packs.md); legacy canvas styles keep their exact historical
 *   output bytes.
 *
 * Packs (seeded from the brain name by default → per-brain distinct art,
 * zero config):
 *
 * | Pack    | Meaning       | Motif                                            |
 * |---------|---------------|--------------------------------------------------|
 * | backup  | AMBER-DEEP    | archive fossilization: phyllotaxis sunflower      |
 * |         |               | (220 pts, golden angle), amber field, gold motes  |
 * | stone   | INDIGO-VAULT  | sealed lattice: denser colony + violet accent ring|
 * | comms   | SIGNAL-TEAL   | radiating: colony + 6 decaying signal rings       |
 * | airgap  | MASK-MONO     | interference only: mono field + two grids,        |
 * |         |               | one seed-rotated                                  |
 */

// ---------- deterministic randomness (fnv1a → mulberry32) ----------

/** 32-bit FNV-1a hash — turns a seed string into a PRNG state. */
function _fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG; returns float in [0, 1). */
function _mulberry32(a) {
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The four reserved pack names, in gallery order. */
const PACKS = ['backup', 'stone', 'comms', 'airgap'];

function packNames() { return PACKS.slice(); }

/** Shared phyllotaxis colony — golden-angle sunflower points.
 *
 * (#195 determinism receipt) The seed reaches the geometry: each point's
 * angle and radius get a small PRNG jitter (`±0.16 rad` bounding the motif,
 * `±4%` radius) so per-brain seeds paint distinct stones while the
 * sunflower stays recognizable. Without the jitter the colony was pure
 * fixed math and only the motes carried the seed — `stone`/`comms` came
 * out byte-identical across brains (caught live by the test packet).
 */
function _colony(rand, count, cx, cy, radius, opts = {}) {
    const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996…the golden angle
    const pts = [];
    for (let i = 0; i < count; i++) {
        const r = radius * Math.sqrt((i + 0.5) / count) * (1 + (rand() - 0.5) * 0.04);
        const a = i * GOLDEN + (rand() - 0.5) * 0.16;
        pts.push({
            x: cx + r * Math.cos(a),
            y: cy + r * Math.sin(a),
            q: (i / count)
        });
    }
    return pts;
}

/** Render one pack. All style math lives here; nothing touches the world. */
function renderStoneArt(options = {}) {
    const style = options.style || 'backup';
    const seed = String(options.seed !== undefined ? options.seed : 'vant');
    const width = options.width || 400;
    const height = options.height || 400;
    const cx = width / 2, cy = height / 2;
    const radius = Math.min(width, height) * 0.42;

    if (!PACKS.includes(style)) {
        throw new Error('Unknown art pack "' + style + '" — reserved pack names: ' + PACKS.join(', '));
    }

    const rand = _mulberry32(_fnv1a(style + ':' + seed));

    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height
        + '" width="' + width + '" height="' + height + '">';

    if (style === 'backup') {
        // AMBER-DEEP · archive fossilization: warm amber void, phyllotaxis
        // colony in fossil gold, drifting motes for the archivist's dust.
        svg += '<rect width="' + width + '" height="' + height + '" fill="#140f05"/>';
        svg += '<defs><radialGradient id="p-fld" cx="50%" cy="46%" r="58%">'
            + '<stop offset="0%" stop-color="#b8860b" stop-opacity="0.55"/>'
            + '<stop offset="60%" stop-color="#7a5b10" stop-opacity="0.18"/>'
            + '<stop offset="100%" stop-color="#140f05" stop-opacity="0.0"/>'
            + '</radialGradient></defs>';
        svg += '<rect width="' + width + '" height="' + height + '" fill="url(#p-fld)"/>';
        const pts = _colony(rand, 220, cx, cy, radius);
        for (const p of pts) {
            const hue = 38 + p.q * 10;
            svg += '<circle cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2)
                + '" r="' + (1.1 + p.q * 2.2).toFixed(2)
                + '" fill="hsl(' + hue.toFixed(0) + ',80%,' + (52 - p.q * 22).toFixed(0)
                + '%)" opacity="0.66"/>';
        }
        for (let i = 0; i < 24; i++) {
            svg += '<circle cx="' + (rand() * width).toFixed(2) + '" cy="' + (rand() * height).toFixed(2)
                + '" r="' + (0.6 + rand() * 1.1).toFixed(2)
                + '" fill="#ffd700" opacity="' + (0.25 + rand() * 0.5).toFixed(2) + '"/>';
        }
    } else if (style === 'stone') {
        // INDIGO-VAULT · sealed lattice: cold indigo field, a denser colony,
        // one violet accent ring for the vault door.
        svg += '<rect width="' + width + '" height="' + height + '" fill="#0b0920"/>';
        svg += '<defs><radialGradient id="p-fld" cx="50%" cy="50%" r="55%">'
            + '<stop offset="0%" stop-color="#4b3f8f" stop-opacity="0.5"/>'
            + '<stop offset="100%" stop-color="#0b0920" stop-opacity="0.0"/>'
            + '</radialGradient></defs>';
        svg += '<rect width="' + width + '" height="' + height + '" fill="url(#p-fld)"/>';
        const pts = _colony(rand, 300, cx, cy, radius);
        for (const p of pts) {
            const hue = 248 + p.q * 16;
            svg += '<circle cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2)
                + '" r="' + (0.9 + p.q * 2.0).toFixed(2)
                + '" fill="hsl(' + hue.toFixed(0) + ',64%,' + (58 - p.q * 24).toFixed(0)
                + '%)" opacity="0.6"/>';
        }
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (radius * 1.04).toFixed(2)
            + '" fill="none" stroke="#a78bfa" stroke-width="1.6" opacity="0.75"/>';
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (radius * 0.35).toFixed(2)
            + '" fill="none" stroke="#8b5cf6" stroke-width="1.1" opacity="0.5"/>';
    } else if (style === 'comms') {
        // SIGNAL-TEAL · radiating rings: teal colony + six decaying rings —
        // a transmission going out from the vault.
        svg += '<rect width="' + width + '" height="' + height + '" fill="#04110f"/>';
        svg += '<defs><radialGradient id="p-fld" cx="50%" cy="50%" r="55%">'
            + '<stop offset="0%" stop-color="#14b8a6" stop-opacity="0.42"/>'
            + '<stop offset="100%" stop-color="#04110f" stop-opacity="0.0"/>'
            + '</radialGradient></defs>';
        svg += '<rect width="' + width + '" height="' + height + '" fill="url(#p-fld)"/>';
        const pts = _colony(rand, 220, cx, cy, radius * 0.72);
        for (const p of pts) {
            const hue = 168 + p.q * 22;
            svg += '<circle cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2)
                + '" r="' + (0.8 + p.q * 1.9).toFixed(2)
                + '" fill="hsl(' + hue.toFixed(0) + ',70%,' + (56 - p.q * 20).toFixed(0)
                + '%)" opacity="0.62"/>';
        }
        for (let i = 1; i <= 6; i++) {
            svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((radius * 0.72) + i * radius * 0.055).toFixed(2)
                + '" fill="none" stroke="#2dd4bf" stroke-width="' + (2.4 - i * 0.3).toFixed(2)
                + '" opacity="' + (0.62 - i * 0.09).toFixed(2) + '"/>';
        }
    } else {
        // MASK-MONO · airgap interference: an ink-white mono field with two
        // interfering grids, one seed-rotated. Nothing radiates; the art
        // only shows the shielding.
        svg += '<rect width="' + width + '" height="' + height + '" fill="#f5f2ea"/>';
        const cell = 14 + Math.floor(rand() * 6);
        for (let x = 0; x <= width; x += cell) {
            svg += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + height
                + '" stroke="#3d3a35" stroke-width="0.7" opacity="0.38"/>';
        }
        const rot = (rand() * 24 - 12).toFixed(2);
        const cellB = cell - 4;
        svg += '<g transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')">';
        for (let y = 0; y <= height; y += cellB) {
            svg += '<line x1="0" y1="' + y + '" x2="' + width + '" y2="' + y
                + '" stroke="#8a5cf5" stroke-width="0.8" opacity="0.32"/>';
        }
        svg += '</g>';
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (radius * 0.5).toFixed(2)
            + '" fill="none" stroke="#111" stroke-width="1.4" opacity="0.5"/>';
    }

    svg += '</svg>';
    return svg;
}

module.exports = { renderStoneArt, packNames, PACKS };
