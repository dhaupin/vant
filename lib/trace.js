/**
 * Trace - per-wake execution spans (pass 206, issue #183 Part B)
 *
 * The cost of no trace, measured (issue #183): a cross-subsystem bug took an
 * hour of manual node -e live-injection to isolate. Every future bug of that
 * class pays the same tax. Spans fix it at the boundary:
 *
 *   span shape: { span_id, parent, subsystem, verb, started, ended,
 *                 duration_ms, ok, error_code }
 *
 * NOT auto-invasive: modules adopt it incrementally; an unused trace is
 * invisible (zero emits, zero writes, no behavior change). The tail rides
 * the era record via lib/era (the execution trace is the era's flight
 * recorder); the rollup lands in the brain's state store
 * (state/trace-spans.json), bounded at SPAN_CAP (oldest dropped).
 *
 * API:
 *   const trace = require('./lib/trace');
 *   const sp = trace.begin('memory', 'learn');       // returns span handle
 *   ...work...
 *   trace.endSpan(sp, { ok: true });                  // success
 *   trace.endSpan(sp, { ok: false, errorCode: 'E_LAYOUT' }); // failure
 *   trace.spans();                                    // current wake spans
 *   trace.render(eraId);                              // waterfall text
 *
 * Spans persist THROUGH the era close (lib/era calls trace.tail() and files
 * it as era.execution); between eras the span log lives in the brain state
 * store and survives process death.
 */

const store = require('./state-store');
const Encrypt = require('./encrypt');
const errors = require('./error');

const SPAN_CAP = 500;           // bounded: the trace is a debug aid, not an archive

const STATE_FILE = 'state/trace-spans.json';
const MODULE = 'trace';

let _spans = [];                // current wake's spans (oldest first)
let _open = new Map();          // span_id -> span (unfinished)
let _hydrated = false;
let _eraId = null;              // current era binding (era start sets it)
let _prevSpans = [];            // spans from the PREVIOUS persisted session
                                // (hydrated at first begin(); cleared on clear())

function _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    try {
        store.hydrate({
            moduleName: MODULE,
            stateFile: STATE_FILE,
            apply: (snapshot) => {
                if (snapshot && Array.isArray(snapshot.spans)) {
                    _prevSpans = snapshot.spans.slice(-SPAN_CAP);
                    if (typeof snapshot.eraId === 'string') _eraId = snapshot.eraId;
                }
            }
        });
        // Rehydrate OPEN spans that never got an end (crash mid-span) as
        // failures with a 'crashed' marker so the waterfall never has holes.
        for (const sp of (_prevSpans || [])) {
            if (sp && sp.ok === undefined) sp.ok = false;
            if (sp && sp.error_code === undefined && sp.ok === false) sp.error_code = 'E_TRACE_UNENDED';
        }
    } catch (e) {
        // Missing file = fresh start; trace never blocks work
    }
}

function _persist() {
    try {
        // Current-wake spans + previous-session tail, bounded, one file.
        const tail = _prevSpans.length
            ? _prevSpans.slice(-Math.max(0, SPAN_CAP - _spans.length))
            : [];
        store.persist({
            moduleName: MODULE,
            stateFile: STATE_FILE,
            data: { spans: [...tail, ..._spans].slice(-SPAN_CAP), eraId: _eraId }
        });
    } catch (e) {
        // Persistence failure never breaks the traced work
    }
}

/**
 * Begin a span. subsystem is the module ('memory', 'escrow', 'forum');
 * verb is the operation ('learn', 'hold', 'publish'); parent links a child
 * span to its caller's span_id (the waterfall indents on parent).
 */
function begin(subsystem, verb, parent = null) {
    _hydrate();
    const span = {
        span_id: 'sp_' + Encrypt.generateShortId(6),
        parent: parent || null,
        subsystem: String(subsystem || 'unknown').slice(0, 64),
        verb: String(verb || 'unknown').slice(0, 64),
        started: Date.now(),
        ok: undefined,
        error_code: undefined
    };
    _open.set(span.span_id, span);
    // Do not persist the OPEN span: crash mid-span = un-ended = rehydrated
    // as failure (correct: the span really did not complete).
    return span;
}

/**
 * End a span. Overload-safe: takes the span handle returned by begin().
 *   { ok: true }                          - success
 *   { ok: false, errorCode: 'E_XYZ' }    - failure with typed code
 */
function endSpan(span, { ok = true, errorCode = null } = {}) {
    if (!span || typeof span !== 'object' || typeof span.span_id !== 'string' || !_open.has(span.span_id)) {
        if (span && typeof span === 'object' && typeof span.span_id === 'string') {
            // Already ended (double endSpan): idempotent no-op. Ending an
            // unknown span twice is a caller bug but must not corrupt others.
            span.ok = ok === true ? true : false;
            if (errorCode) span.error_code = errorCode;
            return span;
        }
        throw new errors.VantError('trace.endSpan: unknown span handle', {
            code: 'E_TRACE_UNKNOWN_SPAN', statusCode: 400, retryable: false
        });
    }
    _open.delete(span.span_id);
    span.ended = Date.now();
    span.duration_ms = span.ended - span.started;
    span.ok = !!ok;
    if (errorCode) span.error_code = String(errorCode).slice(0, 64);
    // Crash-mid-unend protection: persist on end so a wake that dies
    // between spans loses at most the un-ended span.
    _spans.push(span);
    if (_spans.length > SPAN_CAP) _spans = _spans.slice(-SPAN_CAP);
    _persist();
    return span;
}

/** Wrap a sync or async fn in a span. Returns fn' own value / rethrows. */
function span(subsystem, verb, fn, parent = null) {
    const sp = begin(subsystem, verb, parent);
    let result;
    try {
        result = fn(sp);
        if (result && typeof result.then === 'function') {
            return result.then(
                (v) => { endSpan(sp, { ok: true }); return v; },
                (e) => { endSpan(sp, { ok: false, errorCode: e.code || 'E_TRACE_ERROR' }); throw e; }
            );
        }
        endSpan(sp, { ok: true });
        return result;
    } catch (e) {
        try { endSpan(sp, { ok: false, errorCode: e.code || 'E_TRACE_ERROR' }); } catch (e2) { /* keep the original error */ }
        throw e;
    }
}

/** All spans visible to this process (previous tails + current wake). */
function spans() {
    _hydrate();
    return [..._prevSpans, ..._spans];
}

/** Just the current wake's spans. */
function currentSpans() { return [..._spans]; }

/** The tail lib/era folds into the era record: number, failures list, slowest. */
function tail(max = 50) {
    const all = spans().slice(-max);
    const failed = all.filter(s => s.ok === false);
    const slowest = all.filter(s => s.duration_ms !== undefined)
        .sort((a, b) => b.duration_ms - a.duration_ms)[0] || null;
    return { count: all.length, failed, slowest, spans: all };
}

/** Bind spans to an era id (era start / close writes the association). */
function setEraId(eraId) {
    _hydrate();
    _eraId = eraId || null;
}

function eraId() {
    _hydrate();
    return _eraId;
}

/**
 * Waterfall text: indented tree of spans with per-span durations, failures
 * highlighted with their error_code. No deps: plain string out.
 */
function render(spansIn = null) {
    const all = spansIn || spans();
    if (!all.length) return '(trace: no spans recorded)';
    const byParent = {};
    for (const s of all) {
        const key = s.parent || '(root)';
        byParent[key] = byParent[key] || [];
        byParent[key].push(s);
    }
    const lines = [];
    function walk(spanKey, depth) {
        const kids = byParent[spanKey] || [];
        for (const s of kids) {
            const dur = s.duration_ms !== undefined ? '+' + s.duration_ms + 'ms' : '(unended)';
            const mark = s.ok === false ? ' FAILED(' + (s.error_code || 'E_?') + ')' : (s.ok === true ? ' OK' : ' UNENDED');
            lines.push('  '.repeat(depth) + '- ' + s.verb + ' [' + s.subsystem + '] ' + dur + mark
                + '  (' + s.span_id + ')');
            walk(s.span_id, depth + 1);
        }
    }
    walk('(root)', 0);
    return lines.join('\n');
}

/** Drop ALL spans (new wake). Durable file cleared too. */
function clear() {
    _hydrate();
    _spans = [];
    _prevSpans = [];
    _open.clear();
    try { store.clear(STATE_FILE); } catch (e) { /* fresh start ok */ }
}

module.exports = {
    begin, endSpan, span, spans, currentSpans, tail, render, clear, setEraId, eraId,
    SPAN_CAP
};
