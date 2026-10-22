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
