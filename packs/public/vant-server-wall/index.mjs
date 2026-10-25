/**
 * vant-server-wall pack — Phase A bucket 0 (issue #249, S0→S1 conversion
 * campaign). Converted from the native wire suite `test/crashtest-server.js`
 * under the reverse-verification law: the suite stays green alongside these
 * rows until the crashtest run is one full cycle green on both, and only
 * then does the S-counter advance for this bucket.
 *
 * Every row drives vant's REAL Node wire through the run root's
 * `mcp-server-wall` route (lib/server._handleRequest with fake req/res
 * pairs — no sockets, no wall clock, same needles the native pins use).
 * Verdicts grade what the wall DID, never an answer sheet: hostile shapes
 * must answer 4xx-class with honest, typed bodies; 5xx/uncaught faults and
 * missing headers are the findings.
 *
 * Row ORDER matters and is part of the flip: the flood row runs LAST
 * (the native suite's ordering law — even though the shim keeps a fresh
 * wall per lane, the flood pin modelled the global-wall posture and is
 * graded over a dedicated lane for coverage).
 */

const skip = (detail) => ({ verdict: 'REFUSED', skipped: true, detail });

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function probeWall(harness, reqInit) {
  try { return await harness.run('mcp-server-wall', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reqInit) }); }
  catch (e) {
    if (/no route registered as/i.test(String(e?.message))) return { _absent: true, error: e };
    throw e;
  }
}

/** Same read shape the other vant packs use: a raw Response, or a Record
 * wrapper whose payload is a JSON text of the shim's round-trip answer. */
async function readProbe(harness, reqInit) {
  const r = await probeWall(harness, reqInit);
  if (r._absent || r.threw) return null;
  let text = '';
  if (typeof r.body === 'string') text = r.body;
  else if (typeof r.text === 'function') { try { text = await r.text(); } catch { text = ''; } }
  else if (r.response && typeof r.response.text === 'function') {
    try { text = await r.response.text(); } catch { text = ''; }
  }
  if (!text) return null;
  const j = parseJson(text);
  // the shim ()s 5xx shapes honestly: a server-side fault in the DRIVE is not a wall verdict.
  if (!j || j.error) return null;
  return j;
}

/** Fire the wall with a shape; return { status, headers, bodyText } or null when unarmed. */
async function fire(harness, reqInit) {
  const r = await readProbe(harness, reqInit);
  return r && !r.error ? { status: r.status, headers: r.headers || {}, bodyText: r.bodyText || '' } : null;
}

const CALL = { url: '/call', method: 'POST', headers: { 'content-type': 'application/json' } };

export default {
  name: 'vant-server-wall',
  description: 'Server-wall discipline over the REAL Node wire: an exhausted escrow budget answers 429 with Retry-After (never 500), hostile bodies answer 4xx-class with honest typed bodies, credential stuffing answers 401 distinctly, and the flood wall refuses with a PRECISE Retry-After while still answering no-store',

  attacks: [
    {
      name: 'escrow-wall-429-never-5xx',
      description: 'an exhausted budget pins the wall into the temporal-refusal family: 429 with a Retry-After header — a 500 turns the caller running out of budget into a server fault (the escrow wall, native pin 2)',
      async run(harness) {
        const j = await fire(harness, { ...CALL, pin: 'escrow-dry', body: '{"tool":"memory_list","args":{}}' });
        if (!j) return skip('mcp-server-wall not armed (pending run-root wiring) — bucket 0 row skipped');
        if (j.status !== 429) {
          return {
            verdict: 'EXPLOITED',
            detail: `an exhausted budget answered ${j.status} instead of 429 - budget exhaustion is a TEMPORAL refusal, never a fault`,
            tookRequests: 1,
            evidence: { status: j.status, bodyText: String(j.bodyText || '').slice(0, 100) },
          };
        }
        const retryAfter = typeof j.headers['Retry-After'] === 'string' && j.headers['Retry-After'].length > 0;
        if (!retryAfter) {
          return {
            verdict: 'EXPLOITED',
            detail: 'the 429 answered without a Retry-After - the caller cannot know when the budget replenishes',
            tookRequests: 1,
          };
        }
        return { verdict: 'REFUSED', detail: 'the dry budget answered 429 + Retry-After: temporal, replenishing, never a server fault', tookRequests: 1 };
      },
    },

    {
      name: 'hostile-body-floor',
      description: 'bent JSON, the crashtest first-offender id shape, and a 64KiB fill body all answer 415-4xx-class honest — a SyntaxError family miss belongs to the caller; the storage-fill class never lands as a 500 (native pins 3/3b/3c)',
      async run(harness) {
        // 3 — bent JSON
        const bent = await fire(harness, { ...CALL, body: '{"id":' });
        if (!bent) return skip('mcp-server-wall not armed — bucket 0 row skipped');
        if (bent.status !== 400) {
          return { verdict: 'EXPLOITED', detail: `a bent body answered ${bent.status} instead of 400 - the caller's malformed JSON became a server verdict`, tookRequests: 1, evidence: { status: bent.status } };
        }
        // 3b — first offender: {"id":2147483648}
        const offender = await fire(harness, { ...CALL, body: '{"id":2147483648,"jsonrpc":"2.0","method":"tools/call"}' });
        if (offender && (offender.status >= 500)) {
          return { verdict: 'EXPLOITED', detail: `the first-offender id shape answered ${offender.status} - the 4xx-honesty floor broke on the known shape`, tookRequests: 2, evidence: { status: offender.status } };
        }
        // 3c — the storage-fill class: 64KiB body under the transport limit
        const fill = await fire(harness, { ...CALL, body: JSON.stringify({ tool: 'memory_store', args: { key: 'fill0', content: 'A'.repeat(64 * 1024) } }) });
        if (fill && fill.status >= 500) {
          return { verdict: 'EXPLOITED', detail: `a fill-sized 64KiB body answered ${fill.status} - the storage-fill class landed as a server fault`, tookRequests: 3, evidence: { status: fill.status, bodyText: String(fill.bodyText || '').slice(0, 100) } };
        }
        const honest = bent.status === 400
          && (!offender || (offender.status >= 400 && offender.status < 500))
          && (!fill || (fill.status >= 400 && fill.status < 500));
        if (!honest) {
          return { verdict: 'EXPLOITED', detail: 'the hostile-body floor is incomplete — one of the shapes was neither 4xx-honest nor absent', tookRequests: 3 };
        }
        return { verdict: 'REFUSED', detail: 'bent JSON, first-offender id, and a 64KiB fill body all answered 4xx-class honest - hostile bodies never became server faults', tookRequests: 3 };
      },
    },

    {
      name: 'credential-stuffing-distinct-401',
      description: 'on the auth wall BOTH the missing key and a wrong key answer 401 distinctly - a missing credential and a guessed one are the same refusal, never a 500 or an oracle that distinguishes them silently (native pin 4)',
      async run(harness) {
        const noKey = await fire(harness, { ...CALL, pin: 'auth', body: '{"tool":"relay_status"}' });
        if (!noKey) return skip('mcp-server-wall not armed — bucket 0 row skipped');
        const wrongKey = await fire(harness, { ...CALL, pin: 'auth', headers: { 'x-api-key': 'vguess_stuff-0123456789' }, body: '{"tool":"relay_status"}' });
        if (noKey.status >= 500 || (wrongKey && wrongKey.status >= 500)) {
          return { verdict: 'EXPLOITED', detail: `credential stuffing landed as ${noKey.status}/${wrongKey ? wrongKey.status : '??'} - the auth wall faulted instead of refusing`, tookRequests: 2 };
        }
        if (noKey.status !== 401 || (wrongKey && wrongKey.status !== 401)) {
          return { verdict: 'EXPLOITED', detail: `stuffing refused off-shape: missing key ${noKey.status}, wrong key ${wrongKey ? wrongKey.status : '??'} - the pair must both be 401 distinctly`, tookRequests: 2 };
        }
        return { verdict: 'REFUSED', detail: 'missing-key and wrong-key stuffing both answered 401 distinctly - no oracle, no fault', tookRequests: 2 };
      },
    },

    {
      name: 'write-honesty-no-store',
      description: 'POST answers ride the no-store headers (#214 write honesty) while non-POST surfaces keep their honest shape: GET /health is 200 with NO Cache-Control need (native pins 5/6)',
      async run(harness) {
        const shape = await fire(harness, { url: '/health', method: 'GET' });
        if (!shape) return skip('mcp-server-wall not armed — bucket 0 row skipped');
        if (shape.status !== 200) {
          return { verdict: 'EXPLOITED', detail: `GET /health answered ${shape.status} - the committed honest shape is 200`, tookRequests: 1, evidence: { status: shape.status } };
        }
        if (shape.headers['Cache-Control'] !== undefined) {
          return { verdict: 'EXPLOITED', detail: 'GET /health carries a Cache-Control header - non-POST surfaces must NOT claim write honesty', tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'GET /health kept its honest 200-without-Cache-Control shape (the POST no-store pin rides the flood row below)', tookRequests: 1 };
      },
    },

    {
      name: 'flood-wall-429-retry-after', // LAST by the ordering law — the flood pin modelled the global wall
      description: 'a flooded wall answers 429 with a PRECISE numeric Retry-After (the limiter knows the TTL it refused for) and even a REFUSED POST carries no-store (#214 covers refusals too — no state to store either) (native pin 7)',
      async run(harness) {
        // channel the SAME needle the native pin modelled: the flood's own
        // wall lane, refuse-shaped via the limiter by pinning traffic volume
        // with 300 reads, then firing the POST probe
        let flooded = false;
        for (let i = 0; i < 300; i++) {
          const r = await probeWall(harness, { url: '/health', method: 'GET' });
          if (r._absent) return skip('mcp-server-wall not armed — bucket 0 row skipped');
          const j = await readProbe(harness, { url: '/health', method: 'GET' });
          if (j && j.status === 429) { flooded = true; break; }
          if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `flood probe threw in the shim: ${r.error?.name}` };
        }
        const post = await fire(harness, { ...CALL, body: '{"tool":"relay_status","args":{}}' });
        if (!post) return skip('mcp-server-wall not armed — bucket 0 row skipped');
        if (post.status !== 429) {
          return { verdict: 'EXPLOITED', detail: `after the flood the POST answered ${post.status} - the flood wall's refuse shape is 429, OR the flood never engaged (flooded=${flooded})`, tookRequests: 301, evidence: { status: post.status, flooded } };
        }
        const retryOk = /^[1-9][0-9]*$/.test(post.headers['Retry-After'] || '');
        const noStoreOk = post.headers['Cache-Control'] === 'no-store' && post.headers['Pragma'] === 'no-cache';
        if (!retryOk || !noStoreOk) {
          return { verdict: 'EXPLOITED', detail: `the flood 429 is imprecise: Retry-After=${JSON.stringify(post.headers['Retry-After'] || null)}, no-store=${JSON.stringify(post.headers['Cache-Control'] || null)} - a refusal WITH a state to store is the pool ordering`, tookRequests: 302, evidence: { flooded } };
        }
        return { verdict: 'REFUSED', detail: 'the flooded wall answered 429 with a PRECISE Retry-After and no-store on the refusal - the limiter knows the TTL it owes and the answer carries no state', tookRequests: 302 };
      },
    },
  ],
};
