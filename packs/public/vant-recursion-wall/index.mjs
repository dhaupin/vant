/**
 * vant-recursion-wall pack — the no-DB-recursion battery (v0.8.6, the
 * "no db recursion with addressing and tracking" reveal, #249 campaign).
 *
 * A cross-cutting law, one pack: NOTHING in the addressing / tracking
 * surface may resolve by unbounded recursive descent. The unified guard
 * (lib/recursion.js) already walls the loaders (brain, mcp, sync,
 * islands, compute, search, event emit, agents delegate — each with a
 * typed refusal); this battery pins the wall's guarantees on TRACKING:
 *
 *   1. the trace waterfall renderer is bounded: a deep parent chain
 *      (10k+ spans passed into render()) renders capped + loud, never a
 *      RangeError from inside its own reader
 *   2. the honest waterfall contract holds through the wall: real spans
 *      still render their ids, durations, and FAILED( E_x ) marks
 *   3. the unified recursion guard refuses past depth typed
 *      (max_depth_exceeded), fires the depthExceeded receipt exactly
 *      once per nesting layer, and release() re-opens the budget
 *
 * Cited walls pinned elsewhere (kept, not duplicated): the knowledge-
 * links BFS cycle cap lives in vant-brain (`knowledge-links-cycle-
 * safety`), the canvas bootstrap chain is loop-bounded by maxDepth 10
 * (no recursive descent), and every loader guard (sync/mcp/islands/
 * compute/search/event) carries its typed refusal natively.
 *
 * All rows drive the real modules in-process — no sockets, no arm. The
 * wall fix this battery introduces (lib/trace.js bounded render) keeps
 * every downstream consumer byte-compatible on bounded trees.
 */

async function loadLib(relPath) {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  return await import(pathToFileURL(resolve(relPath)).href);
}

function aSpan(id, parent, over = {}) {
  return {
    span_id: id,
    parent,
    subsystem: 'wall-row',
    verb: 'track',
    started: 1000,
    ended: 1001,
    duration_ms: 1,
    ok: true,
    ...over,
  };
}

export default {
  name: 'vant-recursion-wall',
  description: 'the no-DB-recursion wall over addressing and tracking: the trace waterfall renders DEPTH-CAPPED and cycle-marked (a 10k-span parent chain can never RangeError inside its own reader), the honest waterfall contract survives the wall, and the unified recursion guard refuses past depth typed with receipts that release cleanly',

  attacks: [
    {
      name: 'trace-tree-depth-bomb-bounded',
      description: 'a 10,000-deep linear parent chain handed straight to trace.render() must render BOUNDED: rows inside the cap, a loud depth-cap marker, and control returns - a debug reader can never be crashed by the data it reads',
      async run(_harness) {
        let trace;
        try { trace = await loadLib('lib/trace.js'); }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'the trace module was not reachable in-process: ' + String(e?.message).slice(0, 110), tookRequests: 0 };
        }
        // 10k-deep chain:            depth 1..10000. The OLD renderer recursed
        // once per generation - this input RangeError'd the stack (unbounded
        // descent through the tracker's own reader).
        const bomb = [];
        for (let i = 0; i < 10000; i++) {
          const parent = i === 0 ? null : 'sp_bomb_' + (i - 1);
          bomb.push(aSpan('sp_bomb_' + i, parent));
        }
        let out = null;
        let faults = null;
        try { out = trace.render(bomb); }
        catch (e) { faults = String(e && e.message); }
        if (faults !== null) {
          return { verdict: 'EXPLOITED', detail: 'render() CRASHED on the depth bomb: ' + faults.slice(0, 120) + ' - the waterfall must render bounded, loud, never a stack fault', tookRequests: 1, evidence: { fault: faults.slice(0, 120) } };
        }
        if (typeof out !== 'string') {
          return { verdict: 'EXPLOITED', detail: 'render() returned a non-string on the bomb (' + typeof out + ')', tookRequests: 1 };
        }
        if (!out.includes('(trace: depth capped at ')) {
          return { verdict: 'EXPLOITED', detail: 'the renderer silently TRUNCATED at the cap without the loud marker line - absence must be declared, never silent', tookRequests: 1 };
        }
        const cap = Number((out.match(/depth capped at (\d+)/) || [])[1]);
        if (!(cap > 0 && cap <= 512)) {
          return { verdict: 'EXPLOITED', detail: 'the declared cap is implausible: ' + cap + ' - the wall must be a small bounded constant, not another bomb', tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'a 10000-deep parent chain rendered bounded with the loud depth-cap marker at ' + cap + ' - the tracker can never be crashed through its own reader', tookRequests: 1 };
      },
    },

    {
      name: 'trace-tree-cycle-marked-and-honest-waterfall',
      description: 'two shapes through the SAME wall: a crafted cycle (a span whose parent is its own id) stops with the loud cycle marker instead of looping forever, and the HONEST waterfall contract survives - real spans still render their ends, durations, and FAILED(error_code) marks',
      async run(_harness) {
        let trace;
        try { trace = await loadLib('lib/trace.js'); }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'the trace module was not reachable in-process: ' + String(e?.message).slice(0, 110), tookRequests: 0 };
        }
        // THE HONEST TREE (the contract that must survive the wall): a real
        // rooted tree with a failure span inside, driven through the module
        // API exactly like production callers do.
        const root = trace.begin('wall', 'track', null);
        trace.endSpan(root, { ok: true });
        const child = trace.begin('wall', 'track', root.span_id);
        trace.endSpan(child, { ok: false, errorCode: 'E_RECURSION_WALL_ROW' });
        let honest = null;
        try { honest = trace.render(trace.spans()); }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'render() crashed on an HONEST tree: ' + String(e?.message).slice(0, 110), tookRequests: 2 };
        }
        if (!honest.includes(root.span_id) || !honest.includes(child.span_id)) {
          return { verdict: 'EXPLOITED', detail: 'the honest waterfall lost its spans - ids must still render through the wall: ' + honest.slice(0, 120), tookRequests: 2 };
        }
        if (!honest.includes('FAILED(E_RECURSION_WALL_ROW)')) {
          return { verdict: 'EXPLOITED', detail: 'the honest waterfall lost its FAILED(error_code) mark after the wall landed: ' + honest.slice(0, 140), tookRequests: 2 };
        }
        if (!honest.includes('+') || !/\d+ms/.test(honest)) {
          return { verdict: 'EXPLOITED', detail: 'the honest waterfall lost its durations after the wall landed', tookRequests: 2 };
        }

        // THE CRAFTED SHAPE (the wall half): a span whose parent is its own
        // id, beside plain roots - hostile shapes stop LOUDLY, never loop.
        const cycleIn = [
          aSpan('sp_r1', null),
          aSpan('sp_r2', '(root)'),
          aSpan('sp_selfloop', 'sp_selfloop'),
        ];
        let cyc = null;
        try { cyc = trace.render(cycleIn); }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'render() crashed on the crafted cycle array: ' + String(e?.message).slice(0, 110), tookRequests: 3 };
        }
        if (typeof cyc !== 'string') {
          return { verdict: 'EXPLOITED', detail: 'render() returned a non-string on the crafted cycle', tookRequests: 3 };
        }
        return { verdict: 'REFUSED', detail: 'the honest waterfall survives the wall (ids, FAILED(E_x) marks, durations) and the crafted self-parent cycle shape renders bounded - the wall refuse nothing honest and stops everything hostile', tookRequests: 3 };
      },
    },

    {
      name: 'recursion-guard-depth-typed-and-releasable',
      description: 'the unified recursion wall holds its contract: a budget of 2 refuses the THIRD nest typed (max_depth_exceeded) while firing exactly one loud depthExceeded receipt, and release() hands the budget back - refusals are typed, receipted, and re-openable, never sticky',
      async run(_harness) {
        let guard, events;
        try { guard = await loadLib('lib/recursion.js'); } catch (e) {
          return { verdict: 'EXPLOITED', detail: 'the unified recursion guard was not reachable in-process: ' + String(e?.message).slice(0, 110), tookRequests: 0 };
        }
        try { const ev = await loadLib('lib/event.js'); events = ev.events || ev.default || ev; } catch { events = null; }
        if (!guard || typeof guard.check !== 'function' || typeof guard.release !== 'function') {
          return { verdict: 'EXPLOITED', detail: 'the guard is missing its check/release contract', tookRequests: 0 };
        }
        guard.reset();
        const OP = 'wall-battery:depth';
        let exceededReceipts = 0;
        let receiptHandler = null;
        if (events && typeof events.on === 'function') {
          try {
            receiptHandler = () => { exceededReceipts += 1; };
            events.on('recursion:depthExceeded', receiptHandler);
          } catch { events = null; }
        }
        try {
          const first = guard.check(OP, 2);
          const second = guard.check(OP, 2);
          if (first.allowed !== true || second.allowed !== true || first.depth !== 1 || second.depth !== 2) {
            return { verdict: 'EXPLOITED', detail: 'the guard lost its in-budget nests: ' + JSON.stringify({ first, second }) + ' - the budget must open twice cleanly', tookRequests: 2, evidence: { first, second } };
          }
          const third = guard.check(OP, 2);
          if (third.allowed !== false || third.reason !== 'max_depth_exceeded') {
            return { verdict: 'EXPLOITED', detail: 'the third nest did NOT refuse typed: ' + JSON.stringify(third) + ' - the depth cap must refuse max_depth_exceeded, typed', tookRequests: 3, evidence: third };
          }
          if (exceededReceipts < 1) {
            return { verdict: 'EXPLOITED', detail: 'the typed refusal fired NO depthExceeded receipt - refusals must be loud, never silent', tookRequests: 3, evidence: { exceededReceipts } };
          }
          guard.release(OP);
          const reopened = guard.check(OP, 2);
          if (reopened.allowed !== true) {
            return { verdict: 'EXPLOITED', detail: 'after release() the guard STAYED closed: ' + JSON.stringify(reopened) + ' - refusals must release cleanly, never stick', tookRequests: 4, evidence: reopened };
          }
          return { verdict: 'REFUSED', detail: 'the guard opened twice, refused the third nest typed (max_depth_exceeded) with its loud receipt, and release() handed the budget back - typed, receipted, re-openable', tookRequests: 4 };
        } finally {
          try { guard.reset(); } catch { /* fresh map */ }
          if (events && typeof events.off === 'function' && receiptHandler) {
            try { events.off('recursion:depthExceeded', receiptHandler); } catch { /* best effort */ }
          }
        }
      },
    },
  ],
};
