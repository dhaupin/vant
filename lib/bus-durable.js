/**
 * Durable Bus Subscribers (pass 206, issue #183 Part A - Nervous System)
 *
 * Delivery semantics per the #183 spec: at-most-once is the DEFAULT (the
 * plain lib/event.js emit); a subscriber may OPT IN to durable delivery.
 * A durable subscriber:
 *   - records its own WATERMARK (a monotonically increasing event sequence)
 *   - events persist under the SUBSCRIBER's stateFile via the arch-A state
 *     store (models/private/<brain>/<stateFile>) - no new storage engine
 *   - replay() reads the event tail from the sink (lib/event.js observability
 *     sink, enabled explicitly) past the watermark and invokes the handler
 *     ONLY for entries it has not seen (bounded replay, the sync-pull
 *     watermark pattern)
 *
 * Contract:
 *   const sub = durableSubscriber(bus, {
 *       subscriber: 'my-sink',          // state key in the subscriber's file
 *       stateFile: 'state/my-sink.json' // brain-scoped persistence location
 *   });
 *   sub.attach('era:closed', handler);   // live in-process delivery
 *   const replayed = sub.replay();       // drain unseen events from the tail
 *
 * The sequence counter lives in the SAME subscriber state file, so the
 * watermark survives process death; replay is IDEMPOTENT (a re-drained
 * event whose seq <= watermark is skipped, not re-delivered).
 */

const store = require('./state-store');

const MAX_TAIL = 500;       // replay reads at most this many tail events
const MAX_LOGGED_EVENTS = 500; // per-subscriber event log cap (FIFO)

function durableSubscriber(_bus, options = {}) {
    const subscriberName = options.subscriber || 'durable';
    const stateFile = options.stateFile || ('state/' + subscriberName + '.json');
    const moduleName = options.moduleName || 'bus-durable';

    // Live-bound handlers: { channel: [fn] } (mirrors bus.on semantics)
    const handlers = {};

    // Hydrate subscriber state: { watermark, log: [{ seq, type, data }] }
    let state = { watermark: 0, log: [] };
    let hydrated = false;
    function hydrate() {
        if (hydrated) return;
        hydrated = true;
        try {
            store.hydrate({
                moduleName,
                stateFile,
                apply: (snapshot) => {
                    if (snapshot && typeof snapshot === 'object'
                        && Number.isFinite(snapshot.watermark)) {
                        state.watermark = snapshot.watermark;
                        if (Array.isArray(snapshot.log)) state.log = snapshot.log.slice(-MAX_LOGGED_EVENTS);
                    }
                }
            });
        } catch (e) {
            // Missing file = fresh start (state-store classifies corruption as
            // loud warn + fresh). Replay then starts at 0 - safe, idempotent.
        }
    }

    function persist() {
        try {
            store.persist({ moduleName, stateFile, data: { subscriber: subscriberName, ...state } });
        } catch (e) {
            // Persistence failure degrades to at-most-once, never blocks the bus
        }
    }

    // (pass 206 fix) Live-delivery dedupe: when the subscriber is attached
    // AND the sink records seq, a live emit reaches the handler through the
    // bus AND would be re-delivered by replay. The attach wrapper confirms
    // the seq as seen (watermark advances on live delivery), so replay only
    // delivers what the subscriber MISSED while it was not attached.
    function attach(channel, handler) {
        const wrapped = (data) => {
            try {
                // The engine stamps seq into the sink record, not the payload.
                // We tail the sink's LAST wanted entry for the matching seq.
                if (typeof _bus.sinkPath === 'function' && _bus.sinkPath()) {
                    const tail = _bus.sinkTail({ max: 1, nameFilter: channel });
                    const rec = (tail.events || [])[0];
                    if (rec && rec.seq) {
                        hydrate();
                        state.watermark = Math.max(state.watermark, rec.seq);
                        // Live delivery IS the durable ledger entry too.
                        state.log.push({ seq: rec.seq, type: channel, data: data || {}, t: rec.t || Date.now(), live: true });
                        if (state.log.length > MAX_LOGGED_EVENTS) state.log = state.log.slice(-MAX_LOGGED_EVENTS);
                        persist();
                    }
                }
            } catch (e) { /* dedupe is best-effort */ }
            handler(data);
        };
        handlers[channel] = handlers[channel] || [];
        handlers[channel].push(handler);
        _bus.on(channel, wrapped);
        return () => detach(channel, handler);
    }

    function detach(channel, handler) {
        const arr = handlers[channel];
        if (arr) {
            const i = arr.indexOf(handler);
            if (i > -1) arr.splice(i, 1);
        }
        _bus.off(channel, handler);
    }

    /** Accept one event from the ingress splice: sequence + log + deliver. */
    function ingest(channel, data) {
        hydrate();
        const seq = state.watermark + 1;
        state.watermark = seq;
        state.log.push({ seq, type: channel, data: data || {}, t: Date.now() });
        if (state.log.length > MAX_LOGGED_EVENTS) {
            state.log = state.log.slice(-MAX_LOGGED_EVENTS);
        }
        persist();
        return seq;
    }

    /**
     * Replay: drain events from the sink tail PAST the subscriber's
     * watermark, then re-deliver (handler wrapped in a try/catch, like the
     * engine's emit). Bounded by the sink tail (MAX_TAIL newest events).
     *
     * Watermark semantics: the subscriber's watermark LOCAL to its channels
     * (per-subscriber, monotonic as the sink seq of the last event on its
     * channels it has seen). First replay: seeding marks every wanted event
     * in the CURRENT tail as the from-now-on point unless caller opts into
     * { fromStart: true } - the #183 bounded-replay posture.
     *
     * Idempotency: the SECOND replay delivers ZERO (delivered events were
     * marked at their sink seq; tail entries below the watermark skip).
     */
    function replay(opts2 = {}) {
        hydrate();
        const report = { subscriber: subscriberName, seen: 0, delivered: 0, skipped: 0, source: 'none' };
        if (typeof _bus.sinkPath !== 'function' || !_bus.sinkPath()) {
            report.source = 'sink-disabled';
            return report;
        }
        const wanted = Object.keys(handlers).filter(ch => (handlers[ch] || []).length > 0);
        if (wanted.length === 0) { report.source = 'no-handlers'; return report; }
        const tail = _bus.sinkTail({ max: MAX_TAIL });
        report.source = 'sink';
        const upcoming = [...(tail.events || [])].reverse();
        // Base watermark: for a fresh subscriber, define the "base" as the
        // OLDEST wanted event in the current tail (from-now-on default), or
        // zero with fromStart. Once seeded, subsequent replays compare
        // against the last DELIVERED seq recorded on the wanted channels.
        const lastDelivered = state.log.filter(l => l.seq).map(l => l.seq);
        const isFresh = state.watermark === 0 && lastDelivered.length === 0;
        const wantedSeqs = upcoming.filter(r => wanted.includes(r.type) && r.seq).map(r => r.seq);
        const base = opts2.fromStart ? (state.watermark || 0)
            : (isFresh ? (Math.max(state.watermark, ...wantedSeqs) - 1) : state.watermark);
        for (const rec of upcoming) {
            const isWanted = wanted.includes(rec.type);
            if (!isWanted) continue;
            report.seen++;
            // Skip anything at or below base (already delivered or pre-attach)
            if (rec.seq !== undefined && rec.seq <= base) {
                report.skipped++;
                continue;
            }
            const arr = handlers[rec.type] || [];
            for (const fn of arr) {
                try { fn(rec.data, { seq: rec.seq, replayed: true }); } catch (e) { /* handler error never stops replay */ }
            }
            if (rec.seq !== undefined) state.watermark = Math.max(state.watermark, rec.seq);
            state.log.push({ seq: rec.seq, type: rec.type, data: rec.data, t: rec.t || Date.now(), replayed: true });
            if (state.log.length > MAX_LOGGED_EVENTS) state.log = state.log.slice(-MAX_LOGGED_EVENTS);
            report.delivered++;
        }
        // (pass 206 fix) Mark the LIVE tail: everything in the current sink
        // tail on wanted channels has by now either been delivered here or
        // skipped as pre-attach - either way, a re-replay must not treat the
        // same tail entries as new. Advancing the watermark to the newest
        // recorded seq on a wanted channel (only when the LIVE attach already
        // saw it in-process) prevents live+durable double delivery.
        if (report.delivered === 0 && report.skipped > 0) {
            const wantedSeqs2 = upcoming.filter(r => wanted.includes(r.type) && r.seq !== undefined).map(r => r.seq);
            if (wantedSeqs2.length) state.watermark = Math.max(state.watermark, ...wantedSeqs2);
        }
        persist();
        return report;
    }

    /** Watermark read (tests + CLI status). */
    function status() {
        hydrate();
        return { subscriber: subscriberName, watermark: state.watermark, logged: state.log.length, handlers: Object.keys(handlers) };
    }

    return { attach, detach, ingest, replay, status };
}

module.exports = { durableSubscriber, MAX_TAIL, MAX_LOGGED_EVENTS };
