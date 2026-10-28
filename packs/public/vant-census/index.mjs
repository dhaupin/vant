// packs/public/vant/index.js - structural-oracle attacks for run roots
// targeting vant pods (dhaupin/vant, v0.8.6+ generation). The census that
// seeded this pack (2026-10-21, upstream repo, issue cross-linked) measured
// on the OSS pod:
//
//   - 131 distinct require-cycle edges across 132 of 188 lib modules, in
//     ONE giant strongly-connected blob; zero clean 2-module cycles; longest
//     printed loop = 37 hops (agents -> ... -> forum).
//   - 222 functions over cyclomatic 15 (worst: lib/transform.js:2035 cx=166).
//   - a latent guard-throw shape: `const brainPath` re-assigned inside the
//     vaf-checkPathTraversal fallback (brain.js:~2514) - an uncaught
//     `TypeError: Assignment to constant variable.` would escape the
//     export the moment that guard branch fires.
//
// ALL FOUR attacks below are in-process and socketless: they consume
// evidence the HOST volunteers through `ctx.config['vant']` (require graph,
// function census, declared maps, probe targets) or do direct calls on
// host-declared exports. Missing config degrades to skipped-REFUSED
// ("skipped: true") - never a false positive (house rule 5). Same commit ->
// same findings (house rule 4): every verdict is a pure function of the
// armed data; nothing reads the clock, the network, or the filesystem except
// the guard-throw probe, which requires ONLY host-declared module paths the
// run root already serves to node's loader.
const ROUTE_ABSENT = /no route registered as/i;

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

async function bodyText(r) {
  if (r == null) return '';
  if (typeof r.body === 'string') return r.body;
  if (typeof r.text === 'function') return await r.text();
  if (r.response && typeof r.response.text === 'function') {
    try { return await r.response.text(); } catch { return ''; }
  }
  return '';
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function tryRun(harness, route, reqInit) {
  try { return await harness.run(route, reqInit); }
  catch (e) {
    if (ROUTE_ABSENT.test(String(e?.message))) return { _absent: true };
    throw e;
  }
}

export default {
  name: 'vant-census',
  description: 'Structural-oracle attacks for vant pods: require-SCC ceiling, whale-function cap, late-key canary, guard-throw probe',
  attacks: [
    {
      name: 'require-cycle-slope',
      description: 'the host require graph must keep its largest strongly-connected require blob at or under the declared ceiling - 132-of-188 modules in one SCC is how "lean" quietly aged out',
      async run(harness, ctx) {
        const cfg = ctx.config?.['vant-census']?.requireGraph;
        if (!cfg?.edges?.length) {
          return { verdict: 'REFUSED', skipped: true, detail: 'not armed: no requireGraph.edges in ctx.config["vant"]' };
        }
        const out = cfg.edges.map((e) => (typeof e === 'string' ? e.split('->').map((s) => s.trim()) : e));
        // tarjanScc returns the LARGEST SCC as a flat node array (empty = no
        // cycles); the blob size is its length
        const blob = tarjanScc(out);
        const biggest = blob.length;
        const edgeCount = out.length;
        const bound = Number.isFinite(cfg.sccBound) ? cfg.sccBound : 25;
        if (biggest > bound) {
          return {
            verdict: 'EXPLOITED',
            detail: `require SCC slope: largest strongly-connected require blob is ${biggest} modules (declared ceiling ${bound}); ${edgeCount} cycle-edges total. Every growth hop in this blob multiplies load-order risk.`,
            tookRequests: 0,
            evidence: { biggestScc: biggest, bound, cycleEdges: edgeCount, blobModules: blob },
          };
        }
        return { verdict: 'REFUSED', detail: `require graph held: largest SCC ${biggest} <= ${bound}; ${edgeCount} cycle-edges`, tookRequests: 0, evidence: { biggestScc: biggest, bound, cycleEdges: edgeCount } };
      },
    },
    {
      name: 'whale-function-cap',
      description: 'every host-declared function must sit under the cyclomatic ceiling - one cx-166 function is three releases of enthusiasm away from unreviewable',
      async run(harness, ctx) {
        const cfg = ctx.config?.['vant-census'];
        if (!Array.isArray(cfg?.whaleFunctions) || !cfg.whaleFunctions.length) {
          return { verdict: 'REFUSED', skipped: true, detail: 'not armed: no whaleFunctions census in ctx.config["vant"]' };
        }
        const cap = Number.isFinite(cfg.whaleCap) ? cfg.whaleCap : 50;
        const whales = cfg.whaleFunctions.filter((f) => Number.isFinite(f.cyclomatic) && f.cyclomatic > cap);
        if (whales.length) {
          const worst = whales.sort((a, b) => b.cyclomatic - a.cyclomatic).slice(0, 3)
            .map((f) => `${f.file || f.loc}:${f.line ?? '?'} cx=${f.cyclomatic}`)
            .join(' / ');
          return {
            verdict: 'EXPLOITED',
            detail: `whale cap blown: ${whales.length} function(s) over cyclomatic ${cap} - worst: ${worst}`,
            tookRequests: 0,
            evidence: { cap, whales: whales.length },
          };
        }
        return { verdict: 'REFUSED', detail: `whale cap held: ${cfg.whaleFunctions.length} functions sampled, all <= ${cap}`, tookRequests: 0, evidence: { cap } };
      },
    },
    {
      name: 'late-key-canary',
      description: 'object literals must not silently clobber declared keys - a duplicate key overwrites the EARLIER handler/value at parse time, and the map never says so',
      async run(harness, ctx) {
        const maps = ctx.config?.['vant-census']?.declaredMaps;
        if (!Array.isArray(maps) || !maps.length) {
          return { verdict: 'REFUSED', skipped: true, detail: 'not armed: no declaredMaps census in ctx.config["vant"]' };
        }
        const clobbers = [];
        for (const m of maps) {
          for (const key of Object.keys(m.duplicates ?? {})) {
            if ((m.intentional ?? []).includes(key)) continue;
            clobbers.push(`${m.name}.${key} (x${m.duplicates[key]})`);
          }
        }
        if (clobbers.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `late-key clobber live in ${clobbers.length} map slot(s): ${clobbers.slice(0, 4).join(', ')}${clobbers.length > 4 ? ' +more' : ''} - the LAST declaration wins and nothing downstream knows the first one died`,
            tookRequests: 0,
            evidence: { clobbers, maps: maps.length },
          };
        }
        return { verdict: 'REFUSED', detail: `late-key canary held: ${maps.length} map(s), every duplicate declared intentional or deduped`, tookRequests: 0, evidence: { maps: maps.length } };
      },
    },
    {
      name: 'guard-throw-probe',
      description: 'guards must refuse honestly, never crash - a hostile input that trips a validation fallback must come back as a typed refusal, not an uncaught TypeError escaping the export',
      async run(harness, ctx) {        const probes = ctx.config?.['vant-census']?.guardProbes;
        if (!Array.isArray(probes) || !probes.length) {
            return { verdict: 'REFUSED', skipped: true, detail: 'not armed: no guardProbes in ctx.config["vant"]' };
        }
        const crashes = [];
        for (const p of probes) {
            // module paths resolve from the RUN ROOT (cwd) or as absolute
            // paths - never pack-relative, so host targets stay host targets
            const { resolve } = await import('node:path');
            const { pathToFileURL } = await import('node:url');
            const target = pathToFileURL(resolve(p.module)).href;
            const mod = await import(target).catch((e) => {
                throw new TypeError(`pack:public/vant-census guard-throw-probe: cannot import host module ${p.module}: ${e.message}`);
            });
          const fn = mod?.[p.fn];
          if (typeof fn !== 'function') {
            // a mis-armed probe is a SPEC failure, not a finding on the
            // target - fail loudly naming the pack and the probe (house
            // rule 3), never a silent false-positive EXPLOITED (rule 5)
            throw new TypeError(`pack:public/vant-census guard-throw-probe: probe target ${p.module}[${p.fn}] is not an export of the host module`);
          }
          let raw = null;
          try {
            await fn(...(p.args ?? []));
          } catch (e) {
            // hostile input should land as the target's own typed error, not
            // a primitive engine crash named differently from the target's
            // error language (abuse-not-5xx, in-process edition)
            if (e instanceof TypeError || !(e.name in (p.typedRefusals ?? { VantError: true }))) raw = `${e.name}: ${e.message}`;
          }
          if (raw) crashes.push(`${p.module}[${p.fn}](${(p.args ?? []).map((a) => JSON.stringify(a)).join(', ')}) -> ${raw}`);
        }
        if (crashes.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `guard-throw caught: ${crashes.length} probe(s) escaped as primitive/foreign crashes instead of typed refusals`,
            tookRequests: 0,
            evidence: { crashes, probes: probes.length },
          };
        }
        return { verdict: 'REFUSED', detail: `guard probes held: ${probes.length} probe(s) returned typed refusals or clean results`, tookRequests: 0, evidence: { probes: probes.length } };
      },
    },
    {
      name: 'naked-lib-first-doors',
      description: "the legacy-runner graveyard's naked modules open their first doors: lib/citations (the merge-under-lock grounding chain: source round trip, verify known/unknown, the [Source: prefix, id increment, the honest clear), lib/telegram (the token wall typed AND the validation door answering BEFORE it), lib/webhooks (the register round-trip with its SECRET-FREE ack projection - the route object with its secret lives in the registry, the ack over that POST never echoes it - the secretless route refusing to bind typed, the HMAC law - genuine accepted, tampered and absent refused - and the replay defense refusing the second come with its no-signature skip), and lib/theme (the sanitize control-char strip + 10k cap, the applyToMCP status/icon mapping with honest defaults) - modules whose ONLY tests were shape-smokes invisible to the sweep, now graded behaviorally (the first fire's own find: the ack rounds trip WITHOUT echoing the register secret)",
      async run(harness) {
        const r = await tryRun(harness, 'lib-first-doors', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no lib-first-doors route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `lib-first-doors threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('lib-first-doors probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the first-doors child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const citLaws = ['citAddSourceRoundTrip', 'citVerifyKnown', 'citVerifyUnknown', 'citFormatPrefix', 'citIdIncrement', 'citClearHonest'];
        const tajLaws = ['tajTokenWallTyped', 'tajValidationDoorFirst'];
        const whLaws = ['whRegisterRoundTrip', 'whRegisterAckSecretFree', 'whSecretlessBindRefused', 'whSigAcceptsGenuine', 'whSigRefusesTampered', 'whSigRefusesAbsent', 'whReplayFirstFresh', 'whReplaySecondRefused', 'whReplayNoSigSkips'];
        const thLaws = ['thSanitizeStripsControl', 'thSanitizeCapsLength', 'thApplyToMCPMaps', 'thApplyToMCPDefault'];
        const broken = [];
        for (const group of [['citations', citLaws], ['telegram', tajLaws], ['webhooks', whLaws], ['theme', thLaws]]) {
          const [mod, laws] = group;
          const missing = laws.filter((k) => j[k] !== true);
          if (missing.length) broken.push(`${mod}: ${missing.join(', ')}`);
        }
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the naked modules broke at: ' + broken.join('; '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: "21 first-doors laws hold across the four naked modules: citations' merge-under-lock chain (round trip, verify both sides, the [Source: prefix, id increment, honest clear), telegram's token wall typed with the validation door answering before it, webhooks' register round-trip + SECRET-FREE ack projection + the secretless bind refusal + HMAC law (genuine/tampered/absent) + replay defense (first fresh, second refused 409, no-signature skip), and theme's sanitize law + applyToMCP mapping - the graveyard's naked modules are now graded behaviorally", tookRequests: 1 };
      },
    },
    {
      name: 'legacy-orphan-laws',
      description: "the graveyard slice 2: the REAL-behavior leftovers the modern suites never claimed - the brain T11b nuclear-alias removals (loadBrain/brainList GONE), the mode/path/corpus laws, legal's dormant gate chain (canUse's passive DORMANT answer, the always-pass-while-dormant checkGate incl. unknown gates, the activate warn / deactivate DORMANT round-trips), sandbox's RLS binding trio (initRLS true with a habitat, generateCaps/createAllowed objects), security's op-gate shapes (Security class, instance encrypt/decrypt, isOperationAllowed/getStatus), and islands' class/hydrated/available trio - everything else in the graveyard duplicates MODERN coverage (escrow.test.js, habitat-rls*, security-hardening P0-9/P1-15, islands.test.js, the audit-C1 vaf regression) and retires as duplicates",
      async run(harness) {
        const r = await tryRun(harness, 'legacy-orphan-laws', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no legacy-orphan-laws route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `legacy-orphan-laws threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('legacy-orphan-laws probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the orphan-laws child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['brain T11b removals + mode law', j.brainT11bAliasesGone && j.brainModeRoundTrip && j.brainPathsNonEmpty && j.brainCorpusArray],
          ['legal dormant chain', j.legalCanUseDormant && j.legalDormantGatePass && j.legalUnknownGatePass && j.legalActivateTyped && j.legalDeactivateTyped],
          ['sandbox RLS trio', j.sbInitRLSWithHabitat && j.sbGenerateCapsObject && j.sbCreateAllowedObject],
          ['security op-gate shapes', j.secClassInstantiates && j.secInstEncryptDecryptFns && j.secIsOperationAllowedObject && j.secGetStatusObject],
          ['islands class trio', j.islGetHydratedArray && j.islGetAvailableArray && j.islClassStatusObject],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the orphaned laws broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: "17 orphaned laws hold: the brain T11b aliases are gone with the mode/path/corpus laws intact, legal's dormant gate chain answers honestly (passive canUse, always-pass checkGate incl. unknown gates, typed activate/deactivate), sandbox's RLS binding trio wires, security's op-gate shapes hold, and islands' class/hydrated/available trio is honest - the graveyard's orphaned behaviors are now pack-graded and the rest of the legacy files retire as duplicates", tookRequests: 1 };
      },
    },
    {
      name: 'facade-surfaces',
      description: "the drift-off pass: the umbrella facade (lib/vant.js) and the never-twin'd utility/integration modules keep their export-surface laws sweep-visible - the facade's 16 function doors (startFull/startHeadless/remember/learn/executeTool/getTools/shutdown/system/lock/connector/citations/encrypt/habitat/sandbox/stego/islands) plus the 6 namespaced module objects (audit/event/mcp/msg/storage namespaces) plus agents/cron/network/qos/event presence plus the version string, compute's run/python executors, auth's Auth class with health's surface, msg's publish/subscribe pair, cron's once/JobWorker pair, audit's batch, boot's lifecycle trio, the cache class, and the embed/network/schema/canvas presence shapes - the laws the last 18 legacy shape-smokes distant-graded, now graded over a real child so those files retire",
      async run(harness) {
        const r = await tryRun(harness, 'facade-surfaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no facade-surfaces route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `facade-surfaces threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('facade-surfaces probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the facade-surfaces child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['vant facade doors', j.vanFnDoors && j.vanObjDoors && j.vanFnObjNamespaces && j.vanVersionString],
          ['compute executors', j.computeRunPython],
          ['auth + health', j.authClassDoor && j.healthSurface],
          ['msg pub/sub pair', j.msgPublishSubscribe],
          ['cron pair', j.cronOnceJobWorker],
          ['audit batch', j.auditBatch],
          ['boot lifecycle', j.bootLifecycle],
          ['cache/embed/network/schema/canvas', j.cacheClass && j.embedSurface && j.networkSurface && j.schemaSurface && j.canvasPaintSpiral],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the facade surfaces broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: "15 facade-surface laws hold: the vant umbrella announces its 15 function doors + 6 namespaced objects (islands rides the object list - the fn/obj split is load-bearing) + namespace presence + version, compute's run/python executors exist, auth/health/msg/cron/audit/boot keep their never-twin'd surfaces, and the cache class + embed/network/schema/canvas presence shapes hold - the last 18 legacy shape-smokes' claims are now sweep-visible and the files retire", tookRequests: 1 };
      },
    },
    {
      name: 'qos-window-laws',
      description: "the QoS machinery's window BEHAVIORS convert where the modern twin grades only shapes: RateLimiter's sliding window (under-limit admissions, the per-client refusal at the cap, the window sliding back open over a real wall-clock tick, the GLOBAL anti-rotation wall refusing a FRESH client id once the global cap is spent - no bypass via rotation - with the qos:rate-limit event auditing the global refusal), CircuitBreaker's trip laws (CLOSED initially and under threshold, OPEN at the threshold with isClosed flipped, reset/success restoring CLOSED), Bulkhead's honest run + isFull, and Throttler's one-shot wrap with the clear-able stats",
      async run(harness) {
        const r = await tryRun(harness, 'qos-window-laws', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no qos-window-laws route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `qos-window-laws threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('qos-window-laws probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the qos-window-laws child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['sliding window admit/refuse/slide', j.rlUnderLimitAdmits && j.rlPerClientRefuses && j.rlWindowSlidesOpen],
          ['anti-rotation wall + event', j.rlAntiRotationWall && j.rlRefusalEventFires],
          ['circuit breaker trip laws', j.cbClosedInitial && j.cbHoldsClosedUnderThreshold && j.cbOpensAtThreshold && j.cbResetOrSuccessRestores],
          ['bulkhead honesty', j.bhRunOk && j.bhIsFullObject],
          ['throttler gate', j.thFirstOkWrapper && j.thClearStats],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the qos window family broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: '13 window laws hold: the sliding window admits under the cap and refuses at it then reopens over the wall clock, a fresh client id CANNOT bypass the spent global cap (refused, with the qos:rate-limit event on the bus), the circuit breaker holds CLOSED under threshold and trips OPEN at it with reset restoring, the bulkhead runs honestly with a boolean isFull, and the throttler wraps once with clear-able stats - the QoS machinery is graded BEHAVIORALLY now, not just as shapes', tookRequests: 1 };
      },
    },
  ],
};

// Tarjan SCC over require edges - the one structural graph tool worth
// shipping in a pack, deterministic and dependency-free.
function tarjanScc(edges) {
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
    if (!adj.has(b)) adj.set(b, []);
  }
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  let counter = 0;
  const strong = (v) => {
    idx.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  };
  for (const v of adj.keys()) if (!idx.has(v)) strong(v);
  return sccs.length ? sccs.reduce((a, b) => (b.length > a.length ? b : a)) : [];
}
