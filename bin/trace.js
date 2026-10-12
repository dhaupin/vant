#!/usr/bin/env node
/**
 * Vant Trace CLI (pass 206, issue #183 Part B)
 *
 * Usage:
 *   vant trace                 Waterfall of persisted spans (this wake + tail)
 *   vant trace --json          Machine-readable spans
 *   vant trace clear           Drop the span ledger (new wake)
 *
 * The trace is a debugging aid: spans ride the era record on close (era
 * execution), persisted between wakes at models/private/<brain>/state/
 * trace-spans.json, bounded at 500 (oldest dropped).
 */
const trace = require('../lib/trace');

const args = process.argv.slice(2);

if (args[0] === '-h' || args[0] === '--help') {
    console.log(`Vant Trace - per-wake execution spans (issue #183)

Usage:
  vant trace              Span waterfall (previous tail + this wake)
  vant trace --json       Spans as JSON
  vant trace clear        Drop the span ledger
`);
    process.exit(0);
}

if (args[0] === 'clear') {
    trace.clear();
    console.log('Span ledger cleared.');
    process.exit(0);
}

if (args.includes('--json')) {
    const tail = trace.tail();
    console.log(JSON.stringify({
        eraId: trace.eraId(),
        count: tail.count,
        failed: tail.failed.map(f => ({ span_id: f.span_id, verb: f.verb, subsystem: f.subsystem, error_code: f.error_code })),
        slowest: tail.slowest ? { span_id: tail.slowest.span_id, verb: tail.slowest.verb, subsystem: tail.slowest.subsystem, duration_ms: tail.slowest.duration_ms } : null,
        spans: tail.spans
    }, null, 2));
    // Exit code: 1 when at least one span FAILED (an operated wake with a
    // recorded failure is non-green - same posture as check runs).
    process.exit(tail.failed.length > 0 ? 1 : 0);
}

console.log('Trace waterfall (era ' + (trace.eraId() || 'none') + ', ' + trace.spans().length + ' span(s), cap ' + trace.SPAN_CAP + '):\n');
console.log(trace.render());
const tail = trace.tail();
if (tail.failed.length) {
    console.log('\n' + tail.failed.length + ' failed span(s): ' +
        tail.failed.slice(0, 5).map(f => f.verb + '(' + (f.error_code || 'E_?') + ')').join(', ')
        + (tail.failed.length > 5 ? ' ...' : ''));
    process.exit(1);
}
process.exit(0);
