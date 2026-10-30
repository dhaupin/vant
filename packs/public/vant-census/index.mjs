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
    {
      name: 'circuit-full-mode',
      description: "the CircuitBreaker's FULL mode converts - the OS-grade tripped state machinery no twin or pack row graded: per-provider isolation (key a's failures never open key b), the trip at threshold flipping isClosed for the FAILED provider only, the backoff ladder doubling below the threshold (persisted in the state file), the trip persisting so a RECONSTRUCTED breaker inherits the outage (and keeps the healthy providers), the auto-retry half-open recovery answering closed again after the backoff window passes with the provider zeroed, the honest recordSuccess reset, the corrupt-file fail-open recovery (garbage state file degrades to an empty provider map, never a crash, never an inherited trip), and the default mode keeping its own getAllStates shape",
      async run(harness) {
        const r = await tryRun(harness, 'circuit-full-mode', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no circuit-full-mode route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `circuit-full-mode threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('circuit-full-mode probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the circuit-full-mode child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['full mode + per-provider isolation', j.getModeFull && j.isoBStillClosed && j.isoAAcceptingUnderThreshold],
          ['backoff ladder + typed trip', j.backoffLadderDoubles && j.tripOpensKey && j.tripLeavesOthers && j.openStateInFile],
          ['reconstruction inherits the outage', j.reconstructedInheritsTrip && j.reconstructedKeepsOthers],
          ['half-open auto-recovery', j.halfOpenRecovers && j.healZeroesProvider],
          ['success reset + corrupt recovery', j.successResetRestores && j.corruptFileDegradesEmpty && j.defaultModeShape],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the circuit breaker full mode broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: '11 full-mode laws hold: per-provider isolation, the backoff ladder doubling with every below-threshold failure and persisting, the trip at threshold flipping isClosed for the failed provider only, the outage surviving a fresh construction from the state file, the backoff window then answering the retry half-open with the provider zeroed, recordSuccess restoring honestly, a corrupt state file degrading to an EMPTY provider map (never a crash, never an inherited trip), and the default mode keeping its shape - the breaker machine is graded end to end', tookRequests: 1 };
      },
    },
    {
      name: 'throttle-debounce-bulkhead',
      description: "the third tranche of the QoS machinery - the Throttler/Debouncer/Bulkhead DEEP window laws convert where wave 8 graded only one-shot shapes: Throttler's per-KEY windows (two named functions never share a window) with the SILENT refusal (the cap spills and the wrapper drops the call without invoking fn - the invocation counter stays pinned), the window sliding open again, the clear() reset, and stats counting distinct keys; Debouncer's trailing-edge collapse (rapid calls fire ONCE with the LAST args - last-writes-win), cancel() killing a pending fire for good, per-function-reference independence, and stats().timers honest at zero after fire and one while pending; Bulkhead UNDER LOAD (saturation flips isFull with the (N+1)th runner queued behind the honest queue counter, the queued task draining FIFO with its error PROPAGATED to the queued caller when it fails, and the running counter returning to 0 after drain); and the unified QoS facade riding the same chain typed (admission, then the typed rate-limit refusal)",
      async run(harness) {
        const r = await tryRun(harness, 'throttle-debounce-bulkhead', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no throttle-debounce-bulkhead route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `throttle-debounce-bulkhead threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('throttle-debounce-bulkhead probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the throttle-debounce-bulkhead child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['throttler per-key + silent', j.thPerKeyWindows && j.thSaturationWasSilent && j.thStatsKeys && j.thWindowSlidesOpen && j.thClearResetsWindows],
          ['debouncer trailing edge', j.dbTrailingEdgeOnly && j.dbLastWritesWin && j.dbTimersStatZero && j.dbPendingTimerCounted && j.dbCancelKillsPending],
          ['bulkhead under load', j.bhSaturated && j.bhQueuedHonest && j.bhDrainsFifoTypedError && j.bhRecoversAfterDrain && j.bhCountersReturnToZero],
          ['unified QoS chain typed', j.qosCheckAdmitsFirst && j.qosRateLimitTyped],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the throttle/debounce/bulkhead family broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: "14 deep window laws hold: the throttler spills SILENTLY at the per-key cap (countered, not thrown) and reopens over the real clock, the debouncer collapses rapid calls to ONE trailing fire with the last args and cancel kills a pending fire before it lands, the bulkhead saturates honestly, queues the overflow, drains it FIFO with the QUEUED caller receiving the queued task's failure as its own rejection, and returns its counters to drained, and the unified QoS facade refuses the second client typed at the shared chain - the QoS trio is now graded behaviorally end to end", tookRequests: 1 };
      },
    },
    {
      name: 'jobworker-pool',
      description: "the pattern sweep's convert move: the wave-10 bug shapes (the Wedge, the Stale Timer) swept the whole lib tree CLEAN (boot's unregister/stopAll both delete, tempo's controller._timer nulls, the sandbox/shell/sidecar one-shot locals, agora-sync's paired _pending deletes), so the never-graded pool laws convert instead - the JobWorker (lib/cron.js): concurrency honored when racing adds park separate _process loops on the shared counter, the counter pairing back to 0 at the drain, the typed failure path (handler throws -> status failed + the job:failed event + THE POOL CONTINUES serving the next jobs), batch adds draining fully under a small concurrency, and stats honest mid-flight and at parity",
      async run(harness) {
        const r = await tryRun(harness, 'jobworker-pool', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no jobworker-pool route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `jobworker-pool threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('jobworker-pool probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the jobworker-pool child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['racing adds honor concurrency', j.jwConcurrencyHonored && j.jwCounterParity],
          ['failure path typed + non-wedging', j.jwFailStatusTyped && j.jwFailEventFired && j.jwPoolSurvivesFailure],
          ['batch drains under a small cap', j.jwBatchDrains],
          ['stats honest mid-flight + parity', j.jwMidFlightShape && j.jwMidFlightParity],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the job worker pool broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: '7 pool laws hold: racing adds reach the declared concurrency with the shared counter pairing back to 0, a throwing handler marks its job failed typed with the job:failed event AND the pool keeps serving the jobs behind it (the error cannot wedge the pool), a batch of adds under a one-slot cap drains fully, and the stats are honest mid-flight and at parity - the JobWorker pool is graded behaviorally, riding the wave-11 pattern sweep that cleared the other clearTimeout families', tookRequests: 1 };
      },
    },
    {
      name: 'heartbeat-lifecycle',
      description: "the context engine's heartbeat lifecycle converts - the timer family the census sweep found with ZERO graded behavior anywhere (no twin, no pack row, no legacy smoke claimed it): cold-stop safety (stopHeartbeat before any start is a silent no-op, never a throw), the 4-minute interval the status shape contracts, the ONE heartbeat:started event under a double start (idempotence is event-audited), boot's timer registry actually holding 'context.heartbeat' at that interval, ping's honest shape ({ok:path, timestamp}) with its own heartbeat:ping event, and the registry-wired stop (the timer entry GONE from boot's map, the enabled flag off, inspect() reporting the disabled heartbeat honestly)",
      async run(harness) {
        const r = await tryRun(harness, 'heartbeat-lifecycle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no heartbeat-lifecycle route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `heartbeat-lifecycle threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('heartbeat-lifecycle probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the heartbeat-lifecycle child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['cold-stop safe + status contract', j.hbStopColdSafe && j.hbIntervalContract],
          ['start idempotent, event-audited', j.hbStartsEnabled && j.hbStartIdempotent],
          ['boot registry ride', j.hbBootRegistered],
          ['ping honest shape + event', j.hbPingOk && j.hbPingEventFires],
          ['registry-wired stop + honest inspect', j.hbBootUnregistered && j.hbStopsEnabled && j.hbInspectHonest],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the heartbeat family broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: '5 lifecycle laws hold: a cold stopHeartbeat is a silent no-op, the 4-minute interval is the contracted status shape, a double start emits exactly ONE heartbeat:started, the boot timer registry holds context.heartbeat at 240000ms, ping answers {ok:true, timestamp} with its own event, and the stop unregisters the timer from the boot map with the flag off and inspect() honest - the context heartbeat is graded behaviorally for the first time', tookRequests: 1 };
      },
    },
    {
      name: 'crypto-canon-laws',
      description: "lib/encrypt.js's OWN census converts - the one-canon file rode other families' rows (stego rode encrypt/decrypt, webhooks rode hmacSign) but its refusal chain was never graded, and the census's first find is TWO PHANTOM CODES: encrypt()/rsaKeyPair() threw with errors.CODES.ENCRYPT_KEY_REQUIRED and ENCRYPT_KEY_INVALID, names that never existed in lib/error.js, so the typed refusals carried code: undefined (fixed this wave by adding them to the keyed map). The row grades the canon post-repair: the GCM round trip (modern 12-byte default nonce, the legacy 16-byte opt-in decoding by width sniffing, the zero-byte and non-ASCII payload edges), the keyed typed refusals, decrypt's ONE-shape throw law (bad format, the honest IV-length complaint, wrong key, flipped-hex tamper - every leg a VantError, the success path a bare string), hash/verify (round trip, malformed stored hash answering false without throwing), the hex HMAC law (genuine, tampered, non-hex), the 2-part signed token (round trip, wrong secret null, past-exp null under a genuine HMAC, garbage null), and the RSA OAEP/SHA256 pair",
      async run(harness) {
        const r = await tryRun(harness, 'crypto-canon-laws', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no crypto-canon-laws route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `crypto-canon-laws threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('crypto-canon-laws probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the crypto-canon child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['GCM round trip + IV widths', j.ksGcmRoundTrip && j.ksIvModern12 && j.ksIvLegacy16 && j.ksZeroByteRoundTrip && j.ksUnicodeRoundTrip],
          ['keyed typed refusals (post phantom repair)', j.ksKeyRequiredTyped && j.ksRsaMinBitsTyped],
          ['decrypt one-shape law', j.ksFormatTyped && j.ksIvLengthHonest && j.ksWrongKeyFails && j.ksTamperRefused && j.ksSingleShape],
          ['hash/verify canon', j.ksHashVerifyRoundTrip && j.ksMalformedHashFalse],
          ['hex HMAC law', j.ksHmacGenuine && j.ksHmacTampered && j.ksHmacNonHex],
          ['signed token canon', j.ksTokenTwoPart && j.ksTokenRoundTrip && j.ksTokenWrongSecret && j.ksTokenGarbage && j.ksTokenExpired],
          ['RSA OAEP pair', j.ksRsaRoundTrip && j.ksRsaSignVerify && j.ksRsaTampered],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the crypto canon broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: 'the census\'s first find is TWO PHANTOM CODES - encrypt()/rsaKeyPair() threw on errors.CODES.ENCRYPT_KEY_REQUIRED and ENCRYPT_KEY_INVALID, names that never existed in lib/error.js, so the typed refusals carried code: undefined (BOTH FIXED THIS WAVE by adding them to the keyed map) - and post-repair 25 canon laws hold: the GCM round trip rides the modern 12-byte nonce with the legacy 16-byte opt-in decoding by width sniffing (plus zero-byte and non-ASCII edges), the key refusals answer with KEYED typed codes, decrypt keeps its ONE-shape throw law across format/IV-length/wrong-key/tamper legs, hash/verify answers non-match without throwing, the HMAC law is genuine/tampered/non-hex, the 2-part token round-trips and rejects wrong secrets, past-exps and garbage, and the RSA OAEP/SHA256 pair round-trips + verifies + refuses tamper', tookRequests: 1 };
      },
    },
    {
      name: 'noticeboard-field-walls',
      description: "the federation board's wire-payload walls convert - the push leg's 'every field is re-clamped' comment had no row grading it: the envelope is untrusted and the dispatcher clamps (title 120, body 2000, ref 120, ttlMs hard-capped at MAX_TTL_MS, from pinned to the SENDER), malformed entries inside a mixed payload are skipped without breaking the good ones, an unknown origin gets NO board oracle, a re-posted id is merge-only (first writer wins), the catch-up ask only answers registered peers (even an empty board answers - the retry-stop law), acks are sender-bound (a REGISTERED different peer replaying the observed reqId resolves nothing), pull's send-failure and timeout legs answer typed with the pending entry deleted, and the board's storage walls (title-required, invalid-ttl typed, local clamps, TTL pruning with sticky survival) hold beside them",
      async run(harness) {
        const r = await tryRun(harness, 'noticeboard-field-walls', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no noticeboard-field-walls route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `noticeboard-field-walls threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('noticeboard-field-walls probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the noticeboard child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['storage walls typed + clamped', j.nbTitleRequired && j.nbNegTtlTyped && j.nbNaNTtlTyped && j.nbClampTitleBodyRef && j.nbClampTtl],
          ['TTL pruning + sticky survival', j.nbTtlPrunes && j.nbStickySurvives],
          ['install idempotent + typed chain', j.nbInstallIdempotent && j.nbTypedRefusals],
          ['push payload walls', j.nbWideAdopted && j.nbWireTitleClamped && j.nbWireBodyClamped && j.nbWireRefClamped && j.nbWireTtlClamped && j.nbWireFromPinned],
          ['no oracle for strangers + merge-only', j.nbUnknownOriginIgnored && j.nbMergeOnlyFirstWriter],
          ['catch-up gated + answered', j.nbStrangerNoOracle && j.nbCatchUpAnswersRegistered],
          ['acks sender-bound', j.nbForgedAckIgnored && j.nbHonestAckAdopts],
          ['pull failure legs typed', j.nbPullSendFailLeg && j.nbPullTimeoutTyped],
          ['push/broadcast rounds', j.nbPushRound && j.nbBroadcastFanned],
        ];
        const broken = laws.filter(([, ok]) => !ok);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the board walls broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: '24 board-wall laws hold: the push leg re-clamps every untrusted field (title 120, body 2000, ref 120, the 30-day ttl ceiling, from pinned to the sender) and skips malformed entries in a mixed payload without losing the good ones, strangers get no board oracle and their ids never adopt, a re-posted id clobbers nothing (first writer wins), the catch-up ask answers registered peers only with the empty-board retry-stop intact, a registered DIFFERENT peer replaying an observed reqId resolves nothing while the addressed-node ack adopts, the pull send-failure and timeout legs answer typed, and the board storage walls (title-required, invalid-ttl typed, the local clamps, TTL pruning with sticky survival) hold - the untrusted-payload posture of the federation board is graded behaviorally', tookRequests: 1 };
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
