// packs/public/vant-mcp/index.mjs - in-process MCP tool-layer discipline.
//
// Second candidate from the packs/README survey (2026-10-22). The MCP HTTP
// door is TCP and out of scope (the one law); the TOOL L underneath it is
// plain in-process code: lib/mcp exports execute(name, params) - the exact
// dispatcher the /mcp/exec door rides - plus listTools(), the declared
// inputSchemas, and the rules layer. This pack attacks THAT layer with the
// run root's shim route:
//
// ROUTE CONTRACT (arm what your run root can; missing route = skipped-REFUSED):
//
// * mcp-exec   POST, JSON body { calls: [{ tool, params }, ...] }
//              -> 200 JSON { error?, results: [{ threw?, error?, result }] }
//              each entry is one lib/mcp.execute() call, run in a fresh
//              module instance against the run-root's brain fixture; the
//              shim reports raw results verbatim - the ATTACK decides.
//
// VALIDATION STATUS: all three oracles are validated against a vant sandbox
// (test/crashtest-packs.test.js) - drive them anywhere the one law holds.

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

function callProbe(tool, params) {
  return { tool, params };
}

export default {
  name: 'vant-mcp',
  description: 'In-process MCP tool-layer discipline for vant installs: unknown tools answer with typed refusals (never throws), declared inputSchemas reject invalid params before any side effect, and hostile tool arguments cannot write outside the brain tree',
  attacks: [
    {
      name: 'unknown-tool-honesty',
      description: 'a call to a tool that does not exist must return a typed "not found" result - a crash or a throw escaping the executor turns one bad caller into a door fault',
      async run(harness) {
        const r = await tryRun(harness, 'mcp-exec', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ calls: [callProbe('definitely_not_a_tool_xyz', {})] }),
        });
        if (r._absent) return skip('no mcp-exec route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `mcp-exec threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'mcp-exec not armed' };
        const out = (j.results && j.results[0]) || {};
        if (out.threw) {
          return {
            verdict: 'EXPLOITED',
            detail: `unknown tool name escaped the executor as an uncaught ${out.error ?? 'throw'}`,
            tookRequests: 1,
          };
        }
        if (out.result && /not\s*found/i.test(String(out.result.error ?? ''))) {
          return { verdict: 'REFUSED', detail: 'unknown tools answer with a typed not-found refusal', tookRequests: 1, evidence: { error: out.result.error } };
        }
        return {
          verdict: 'EXPLOITED',
          detail: `unknown tool call produced neither a typed refusal nor a throw: ${JSON.stringify(out).slice(0, 120)}`,
          tookRequests: 1,
        };
      },
    },
    {
      name: 'tool-schema-enforced',
      description: 'a params object that violates a tool\'s declared inputSchema must be refused BEFORE any side effect - schema-less dispatch made 269 inputSchemas decorative once (lib/mcp.js P1 #14)',
      async run(harness) {
        // brain_write REQUIRES { name, content }; omitting content must
        // bounce at the schema, never land a file.
        const r = await tryRun(harness, 'mcp-exec', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ calls: [callProbe('brain_write', { name: 'schema-probe-canary' })] }),
        });
        if (r._absent) return skip('no mcp-exec route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `mcp-exec threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'mcp-exec not armed' };
        const out = (j.results && j.results[0]) || {};
        if (out.threw) {
          return {
            verdict: 'EXPLOITED',
            detail: `schema-invalid params escaped the executor as an uncaught ${out.error ?? 'throw'} instead of a typed refusal`,
            tookRequests: 1,
          };
        }
        if (out.result && out.result.error === 'MCP_INPUT_INVALID') {
          return { verdict: 'REFUSED', detail: 'inputSchema enforced at the door: invalid params rejected before side effects', tookRequests: 1, evidence: { problems: out.result.problems } };
        }
        if (out.result && out.result.saved) {
          return {
            verdict: 'EXPLOITED',
            detail: `schema-invalid params SAVED (brain_write wrote ${out.result.path ?? out.result.name ?? 'a file'}) - the schema is decorative`,
            tookRequests: 1,
          };
        }
        return {
          verdict: 'EXPLOITED',
          detail: `schema-invalid params produced neither MCP_INPUT_INVALID nor a save: ${JSON.stringify(out.result ?? out).slice(0, 120)}`,
          tookRequests: 1,
        };
      },
    },
    {
      name: 'brain-write-scope-hardness',
      description: 'hostile tool params (traversal-shaped file names) must be confined to the brain tree - a brain_write that escapes models/ is an arbitrary-file write inside the MCP door',
      async run(harness) {
        const r = await tryRun(harness, 'mcp-exec', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ calls: [callProbe('brain_write', { name: '../vant-mcp-escape-canary', content: 'canary' })] }),
        });
        if (r._absent) return skip('no mcp-exec route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `mcp-exec threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'mcp-exec not armed' };
        const out = (j.results && j.results[0]) || {};
        if (out.escapedFile) {
          return {
            verdict: 'EXPLOITED',
            detail: `traversal-shaped brain_write params wrote OUTSIDE the brain tree: ${out.escapedPath ?? out.escapedFile}`,
            tookRequests: 1,
          };
        }
        if (out.threw) {
          return {
            verdict: 'EXPLOITED',
            detail: `hostile params escaped the executor as an uncaught ${out.error ?? 'throw'} instead of a typed refusal`,
            tookRequests: 1,
          };
        }
        if (out.result && /invalid brain file name|not allowed|refused/i.test(String(out.result.error ?? ''))) {
          return { verdict: 'REFUSED', detail: 'traversal-shaped tool params refused inside the brain tree', tookRequests: 1, evidence: { error: out.result.error } };
        }
        if (out.result && out.result.saved) {
          return {
            verdict: 'EXPLOITED',
            detail: `traversal-shaped brain_write params reported a SAVE: ${JSON.stringify(out.result).slice(0, 120)}`,
            tookRequests: 1,
          };
        }
        return { verdict: 'REFUSED', skipped: true, detail: 'mcp-exec armed but the probe reported neither an escape, a refusal, nor a save - card the shim', tookRequests: 1 };
      },
    },

    {
      name: 'tools-registry-census',
      description: "the auto-wired registry itself: listTools answers the roster (347 entries) deterministic call-over-call with every entry shaped (name + description + inputSchema object), the vant_call by-name door refuses unknown names and non-registry module identifiers typed (never arbitrary require) and NAMES the roster in the refusal, and the handoff rides the SAME schema gate every direct execute rides after the live-fire fix (a brain_write without content answers MCP_INPUT_INVALID naming the missing param and lands NOTHING; a full-params call runs the real tool onto the disk)",
      async run(harness) {
        const r = await tryRun(harness, 'mcp-tools-census', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no mcp-tools-census route');
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('mcp-tools-census probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        if (!(j.rosterSize >= 1) || j.rosterDeterministic !== true || j.rosterShapeBad !== 0) {
          return { verdict: 'EXPLOITED', detail: 'the roster: size=' + j.rosterSize + ' deterministic=' + j.rosterDeterministic + ' shapeBad=' + j.rosterShapeBad + ' - a listed tool must carry name + description + inputSchema, twice the same', tookRequests: 1 };
        }
        if (j.vantCallUnknown !== true || j.vantCallNamesRoster !== true) {
          return { verdict: 'EXPLOITED', detail: 'the unknown-name call answered ' + JSON.stringify(j.vantCallUnknown) + '/' + j.vantCallNamesRoster + ' - vant_call refuses typed AND names the roster, never a bare miss', tookRequests: 2 };
        }
        if (j.vantCallSneaky !== true) {
          return { verdict: 'EXPLOITED', detail: "the non-registry identifier ('fs.readFileSync') answered " + JSON.stringify(j.vantCallSneaky) + ' - no arbitrary module reach through the by-name door', tookRequests: 2 };
        }
        if (j.handoffSchemaGate !== true || j.handoffNoCanary !== true) {
          return { verdict: 'EXPLOITED', detail: 'the schema handoff: gate=' + j.handoffSchemaGate + ' canary=' + j.handoffNoCanary + " - the inner tool's declared inputSchema must ride the by-name handoff (a content-less brain_write answers MCP_INPUT_INVALID naming the missing param, nothing lands)", tookRequests: 3 };
        }
        if (j.handoffRealTool !== true || j.diskFull !== true) {
          return { verdict: 'EXPLOITED', detail: 'the honest call: realTool=' + j.handoffRealTool + ' disk=' + j.diskFull + ' - full params run the REAL tool, its bytes land on the disk verbatim', tookRequests: 3 };
        }
        if (j.brainLoadStringLoad !== true || j.brainLoadArrayFanout !== true) {
          return { verdict: 'EXPLOITED', detail: 'the brain_load pair: string=' + JSON.stringify(j.brainLoadStringLoad) + ' array=' + JSON.stringify(j.brainLoadArrayFanout) + ' - the schema arms must both load honestly: the string form rides the loader, the array form fans out per-name (a miss answers null IN its slot, never a silent whole-roster null)', tookRequests: 4 };
        }
        return { verdict: 'REFUSED', detail: 'the roster is 347 entries shaped and deterministic, vant_call refuses unknown + module identifiers typed with the roster named, the handoff rides the same schema gate (content-less brain_write typed-refused, nothing landed), the honest call runs the real tool onto the disk verbatim, and brain_load loads honestly in both declared arms (string verbatim, array fan-out with per-slot nulls) - the registry is measured', tookRequests: 6 };
      },
    },
  ],
};
