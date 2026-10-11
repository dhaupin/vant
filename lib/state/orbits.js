'use strict';

/**
 * Closed-Form Orbits (#159) + Phase Windows (#160) — world/clock, 2/4 + 3/4
 * =========================================================================
 *
 * Position = f(epoch). An orbiting body's position is pure, periodic, no
 * integration, no state. Two processes at the same epoch agree EXACTLY —
 * no clock sync protocol beyond agreeing what "now" is.
 *
 *   angle(t) = 2π · ((t - epoch0) mod period) / period + phase0
 *   pos(t)   = radius · [cos(angle), sin(angle)]
 *
 * #160 (the regression class): alignment is about PHASE RELATIONSHIP —
 * the angle between two bodies as seen from the pivot — NOT proximity.
 * The obvious "distance-based" implementation returns a CONSTANT for
 * circular coplanar parent/child pairs (distance is constant!) and every
 * window looks like "now". phase_rel(t) = normalize(angle(a,t) - angle(b,t))
 * oscillates with the SYNODIC period (relative angular rate), which is what
 * actually matters.
 *
 * Engine-parity series (world/clock, 2/4 + 3/4).
 */

const TAU = Math.PI * 2;

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/**
 * Normalize an angle into [0, TAU).
 */
function normalizeAngle(a) {
    return ((a % TAU) + TAU) % TAU;
}

/**
 * Validate a body declaration. Degenerate inputs (zero radius, missing
 * period) get a TYPED refusal — never NaN propagation (#159 acceptance #3).
 */
function validateBody(body) {
    if (!body || typeof body !== 'object') {
        throw _vantErr('orbits: body declaration required', 'E_ORBIT_BODY');
    }
    const { radius, period } = body;
    if (!Number.isFinite(radius) || radius <= 0) {
        throw _vantErr('orbits: body.radius must be a positive finite number', 'E_ORBIT_BODY');
    }
    if (!Number.isFinite(period) || period <= 0) {
        throw _vantErr('orbits: body.period must be a positive finite number', 'E_ORBIT_BODY');
    }
}

/**
 * Pure position at epoch t (ms). Depends ONLY on (t, declaration).
 * No side effects, no state, no NaN (#159 acceptance #1 + #3).
 *
 * @param {object} body - { radius, period, phase0?, epoch0? }
 * @returns {{ angle, pos: [x, y] }}
 */
function position(body, t) {
    validateBody(body);
    if (!Number.isFinite(t)) {
        throw _vantErr('orbits: t must be a finite epoch (ms)', 'E_ORBIT_EPOCH');
    }
    const epoch0 = body.epoch0 || 0;
    const phase0 = body.phase0 || 0;
    const angle = TAU * (((t - epoch0) % body.period) + body.period) / body.period % TAU + phase0;
    return {
        angle: normalizeAngle(angle),
        pos: [body.radius * Math.cos(angle), body.radius * Math.sin(angle)]
    };
}

/**
 * Relative phase of body a vs body b, pivot-relative (#160):
 * normalize(angle(a,t) - angle(b,t)). Oscillates with the SYNODIC period.
 */
function relativePhase(bodyA, bodyB, t) {
    const pa = position(bodyA, t);
    const pb = position(bodyB, t);
    return normalizeAngle(pa.angle - pb.angle);
}

/** Synodic period of two bodies: 1/|1/pa - 1/pb| (pure, exact). */
function synodicPeriod(bodyA, bodyB) {
    validateBody(bodyA);
    validateBody(bodyB);
    const rate = Math.abs(1 / bodyA.period - 1 / bodyB.period);
    if (rate === 0) return Infinity; // co-orbital: phase never changes
    return 1 / rate;
}

/**
 * Favorability of alignment (#160): 1 - angular_distance(phase_rel, ideal) /
 * max_span, where max_span is PIVOT-RELATIVE (the stated normalization
 * span), not a raw distance range. ∈ [0, 1] for all t.
 *
 * @param {object} opts - { bodyA, bodyB, ideal (rad), maxSpan (rad) }
 */
function favorability(opts, t) {
    const { bodyA, bodyB } = opts || {};
    if (!bodyA || !bodyB) throw _vantErr('windows: bodyA and bodyB required', 'E_WINDOW_INPUT');
    const ideal = Number.isFinite(opts.ideal) ? normalizeAngle(opts.ideal) : 0;
    const maxSpan = Number.isFinite(opts.maxSpan) && opts.maxSpan > 0 ? opts.maxSpan : Math.PI;
    const rel = relativePhase(bodyA, bodyB, t);
    // angular distance from ideal, in [0, TAU/2]
    let d = Math.abs(rel - ideal);
    if (d > Math.PI) d = TAU - d;
    const fav = 1 - Math.min(d, maxSpan) / maxSpan;
    // clamp guards float drift; contract is [0,1] for ALL t (#160 acceptance #2)
    return Math.max(0, Math.min(1, fav));
}

/**
 * Scan deterministically for the next window where favorability ≥
 * threshold, within a horizon. Step is derived from the synodic period so
 * the scan can't miss a full cycle. Pure: called twice with the same args,
 * finds the identical window twice (#160 acceptance #3).
 *
 * @returns {{ t, favorability } | null}
 */
function nextWindow(opts, from, { threshold = 0.5, horizonMs = 30 * 24 * 3600 * 1000, steps = 1440 } = {}) {
    const syn = synodicPeriod(opts.bodyA, opts.bodyB);
    if (!Number.isFinite(syn)) {
        // co-orbital: favorability is constant; answer immediately or never
        const f = favorability(opts, from);
        return f >= threshold ? { t: from, favorability: f } : null;
    }
    const step = Math.max(1, Math.min(syn / steps, horizonMs / 10));
    for (let t = from; t <= from + horizonMs; t += step) {
        const f = favorability(opts, t);
        if (f >= threshold) return { t, favorability: f };
    }
    return null;
}

module.exports = {
    TAU,
    normalizeAngle,
    validateBody,
    position,
    relativePhase,
    synodicPeriod,
    favorability,
    nextWindow
};
