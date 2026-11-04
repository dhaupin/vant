// packs/public/vant-network-wall/index.mjs - the outbound-network SSRF wall.
//
// Filed with the round-2 audit (2026-11-03) that found the bypasses this pack
// now pins. The MCP/REST *doors* are TCP and out of scope (the one law); the
// wall underneath them is plain in-process code: lib/network.js exports
// isInternalIP / isPrivateLanIP / isDomainAllowed / fetch, and lib/mcp.js
// exposes execute() - the exact dispatcher the /mcp/exec door rides, whose
// vant_network_fetch tool is the guest-reachable network door. This pack
// attacks THAT layer with the run root's own routes:
//
// ROUTE CONTRACT (arm what your run root can; missing route = skipped-REFUSED):
//
// * mcp-exec   POST, JSON body { calls: [{ tool, params }, ...] }
//              -> 200 JSON { results: [{ threw?, error?, result }] }
//              each entry is one lib/mcp.execute() call, run in a fresh
//              module instance against the run-root's brain fixture; the
//              shim reports raw results verbatim - the ATTACK decides.
//
// The rows that need no route drive lib/network.js directly (self-contained
// rows, the vant-brain batch-2 precedent) - they earn strict verdicts in
// EVERY run root. The door row needs mcp-exec.
//
// NO EXTERNAL SOCKETS. The door row dials a test-owned loopback listener and
// asserts it is never reached (the vant-relay pack's real-upstream precedent,
// inverted: the server exists to prove the wall held). The DNS row stubs
// dns.resolve4/resolve6 in-process, so nothing leaves the machine.

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

/** In-process lib loader (house pattern): the pod's CJS lib face via
 * pathToFileURL + dynamic import, resolved from the repo root. */
async function loadLib(relPath) {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const ns = await import(pathToFileURL(resolve(relPath)).href);
  return ns.default || ns;
}

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
    if (/no route registered as/i.test(String(e?.message))) return { _absent: true };
    throw e;
  }
}

/** Every spelling of a v4 endpoint that must be refused: the dotted form plus
 * the IPv6 wrappers that reach the SAME address (IPv4-mapped ::ffff:0:0/96,
 * IPv4-compatible ::/96, NAT64 64:ff9b::/96, dotted AND hex-group tails). */
const V4_WRAPPERS = {
  '127.0.0.1': ['127.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::127.0.0.1', '::7f00:1', '64:ff9b::127.0.0.1', '64:ff9b::7f00:1'],
  '169.254.169.254': ['169.254.169.254', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '64:ff9b::169.254.169.254', '64:ff9b::a9fe:a9fe'],
  '10.0.0.1': ['10.0.0.1', '::ffff:10.0.0.1', '::ffff:0a00:0001', '64:ff9b::10.0.0.1'],
};

/** A v4 endpoint wrapped in a v6 literal reaches the same host as its dotted
 * form, so isInternalIP (and isDomainAllowed, which rides it) must refuse
 * every wrapper. Returns the first spelling that slipped, or null. */
function firstSlipped(net, spellings) {
  for (const h of spellings) {
    if (net.isInternalIP(h) !== true) return h;
  }
  return null;
}

export default {
  name: 'vant-network-wall',
  description: 'The outbound-network SSRF wall in-process: loopback / link-local / cloud-metadata / RFC1918 refuse through every IPv6 spelling of the same v4 endpoint (IPv4-mapped, IPv4-compatible, NAT64, dotted and hex tails), the full fc00::/7 + fe80::/10 + ff00::/8 ranges refuse, a v6-only internal target refuses (the resolve4-only gap), and the MCP door pins its caller-supplied escape hatches so a guest cannot opt past the wall',
  attacks: [
    {
      name: 'ipv4-mapped-and-nat64-refuse',
      description: 'an IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) or NAT64 (64:ff9b::/96) literal reaches the SAME v4 endpoint as its dotted form - loopback and cloud metadata were reachable while the plain address was refused, so the wall must decode the embedded v4 and check it too (round-2 finding L)',
      async run(_harness) {
        const net = await loadLib('lib/network.js');
        for (const [dotted, spellings] of Object.entries(V4_WRAPPERS)) {
          const slipped = firstSlipped(net, spellings);
          if (slipped) {
            return {
              verdict: 'EXPLOITED',
              detail: `the IPv6 wrapper [${slipped}] reached ${dotted} while the dotted form was refused - an SSRF-wall bypass`,
              tookRequests: 0,
              evidence: { endpoint: dotted, slipped, spellings },
            };
          }
        }
        return {
          verdict: 'REFUSED',
          detail: `every IPv6 spelling of loopback/metadata/RFC1918 (mapped, compatible, NAT64; dotted and hex tails) refuses exactly like the dotted form (${Object.values(V4_WRAPPERS).flat().length} spellings)`,
          tookRequests: 0,
        };
      },
    },
    {
      name: 'ula-and-link-local-cidr-refuse',
      description: 'the IPv6 patterns must match the whole CIDR, not the literal base prefix: fc00::/7 (fc01-fdff), fe80::/10 (fe81-febf) and v6 multicast ff00::/8 all reach internal endpoints and must refuse (round-2 finding O)',
      async run(_harness) {
        const net = await loadLib('lib/network.js');
        const mustRefuse = [
          'fc00::1', 'fc01::1', 'fc12::1', 'fcff::1',      // fc00::/7
          'fd00::1', 'fd12::1', 'fdff::1',                 // fc00::/7
          'fe80::1', 'fe81::1', 'fe9f::1', 'fea0::1', 'febf::1', // fe80::/10
          'ff01::1', 'ff02::1', 'ff05::1',                 // ff00::/8
        ];
        const slipped = mustRefuse.filter((h) => net.isInternalIP(h) !== true);
        if (slipped.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `${slipped.length} IPv6 internal address(es) inside fc00::/7, fe80::/10 or ff00::/8 sailed the wall: ${slipped.join(', ')}`,
            tookRequests: 0,
            evidence: { slipped },
          };
        }
        // the fix must not over-block: a public v6 address, and the two
        // near-miss forms OUTSIDE the ranges (fd0:: = not ULA; fec0:: =
        // deprecated site-local, not fe80::/10), stay allowed.
        const mustAllow = ['2606:4700:4700::1111', '2001:4860:4860::8888', 'fd0::1', 'fc0::1', 'fe8::1', 'fec0::1'];
        const overBlocked = mustAllow.filter((h) => net.isInternalIP(h) !== false);
        if (overBlocked.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `the wall OVER-blocks a legitimate address (a widened internal set is its own denial-of-service): ${overBlocked.join(', ')}`,
            tookRequests: 0,
            evidence: { overBlocked },
          };
        }
        return {
          verdict: 'REFUSED',
          detail: `all ${mustRefuse.length} internal IPv6 addresses in fc00::/7 + fe80::/10 + ff00::/8 refuse, and the ${mustAllow.length} public/out-of-range forms stay allowed`,
          tookRequests: 0,
        };
      },
    },
    {
      name: 'lan-carve-out-not-widened',
      description: 'the privateLan intranet carve-out (isPrivateLanIP) admits EXACTLY loopback + RFC1918 + v6 ULA, and never cloud metadata / multicast / link-local - the round-2 embedded-v4 fix must not let a mapped metadata literal ride the LAN posture into the always-hostile set',
      async run(_harness) {
        const net = await loadLib('lib/network.js');
        const mustBeLan = ['10.0.0.5', '192.168.1.9', '172.20.0.1', '127.0.0.1', '::1', 'fc12::1', 'fd12::1', '::ffff:10.0.0.5', '::ffff:c0a8:0109'];
        const mustNotBeLan = ['169.254.169.254', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '224.0.0.1', 'ff02::1', 'fe80::1', '8.8.8.8', '2606:4700:4700::1111'];
        const wrong = [];
        for (const h of mustBeLan) if (net.isPrivateLanIP(h) !== true) wrong.push(`refused ${h}`);
        for (const h of mustNotBeLan) if (net.isPrivateLanIP(h) !== false) wrong.push(`admitted ${h}`);
        if (wrong.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `the privateLan carve-out drifted: ${wrong.join('; ')}`,
            tookRequests: 0,
            evidence: { wrong },
          };
        }
        return {
          verdict: 'REFUSED',
          detail: `the LAN carve-out admits exactly the ${mustBeLan.length} loopback/RFC1918/ULA forms and refuses all ${mustNotBeLan.length} metadata/multicast/link-local/public forms`,
          tookRequests: 0,
        };
      },
    },
    {
      name: 'v6-only-internal-target-refuses',
      description: 'resolveAndCheckIP must resolve BOTH families: a hostname whose A record is public/absent but whose AAAA is internal must refuse, or Node dials the v6 address past the v4-only check (round-2 finding L, DNS half)',
      async run(_harness) {
        const net = await loadLib('lib/network.js');
        const dns = await import('node:dns');
        const saved = { resolve4: dns.default.resolve4, resolve6: dns.default.resolve6 };
        try {
          // A public A record, an INTERNAL AAAA. The old v4-only check saw
          // only 93.184.216.34 and let the request dial ::1. The row drives
          // the wall as a SYSTEM caller (`system: true` - the sync/remote
          // posture, which legitimately opts out of the capability gate), so
          // it neither depends on nor mutates the shared sandbox capability
          // set that later packs rely on; the DNS wall must hold either way.
          dns.default.resolve4 = (_h, cb) => cb(null, ['93.184.216.34']);
          dns.default.resolve6 = (_h, cb) => cb(null, ['::1']);
          let reached = false;
          let refusal = null;
          try {
            await net.fetch('http://aaaa-gap.invalid-probe.example:9/', { system: true, circuit: false, cache: false, timeout: 1500 });
            reached = true;
          } catch (e) {
            refusal = e && e.message ? e.message : String(e);
          }
          if (reached) {
            return {
              verdict: 'EXPLOITED',
              detail: 'a hostname whose AAAA is ::1 (A public) passed the DNS wall - the v6-only internal target was dialled',
              tookRequests: 1,
            };
          }
          if (!/dns rebinding/i.test(refusal || '')) {
            return { verdict: 'REFUSED', skipped: true, detail: `the DNS wall did not decide (transport said: ${String(refusal).slice(0, 90)}) - not armed`, tookRequests: 1 };
          }
          return { verdict: 'REFUSED', detail: 'the AAAA internal answer is caught: the request refuses typed at the DNS wall before any dial', tookRequests: 1, evidence: { refusal } };
        } finally {
          dns.default.resolve4 = saved.resolve4;
          dns.default.resolve6 = saved.resolve6;
        }
      },
    },
    {
      name: 'mcp-door-pins-escape-hatches',
      description: 'the vant_network_fetch door must not forward caller-supplied skipDomainCheck / system / internalPolicy: a guest could send skipDomainCheck:true and walk the whole wall to loopback or cloud metadata (round-2 finding L, door half)',
      async run(harness) {
        const http = await import('node:http');
        // A test-owned loopback listener: the wall must keep the request from
        // ever reaching it. It exists to prove the refusal, not to be called.
        let hits = 0;
        const server = http.createServer((req, res) => { hits++; res.writeHead(200); res.end('CANARY'); });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        try {
          const url = `http://127.0.0.1:${port}/ssrf-canary`;
          const shapes = [
            { label: 'skipDomainCheck', options: { skipDomainCheck: true } },
            { label: 'system', options: { system: true, skipDomainCheck: true } },
            { label: 'privateLan', options: { internalPolicy: 'privateLan' } },
            { label: 'no-options', options: undefined },
          ];
          const calls = shapes.map((s) => ({ tool: 'vant_network_fetch', params: s.options === undefined ? { url } : { url, options: s.options } }));
          const r = await tryRun(harness, 'mcp-exec', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ calls }),
          });
          if (r._absent) return skip('no mcp-exec route');
          if (r.threw) return skip(`mcp-exec threw in the shim: ${r.error?.name}`);
          const j = parseJson(await bodyText(r));
          if (!j || j.error) return skip('mcp-exec not armed');
          const results = j.results || [];
          // Every shape must refuse (a rejection shows up as threw, or as a
          // typed error result). A success means the door let it through.
          const escaped = [];
          for (let i = 0; i < shapes.length; i++) {
            const out = results[i] || {};
            const succeeded = !out.threw && out.result != null
              && !(out.result && (out.result.error || out.result.code));
            if (succeeded) escaped.push(shapes[i].label);
          }
          if (hits > 0) {
            return {
              verdict: 'EXPLOITED',
              detail: `the door reached the loopback listener ${hits} time(s) - a caller-supplied escape hatch walked the SSRF wall`,
              tookRequests: shapes.length,
              evidence: { hits, escaped },
            };
          }
          if (escaped.length) {
            return {
              verdict: 'EXPLOITED',
              detail: `the door reported success (not a refusal) for: ${escaped.join(', ')}`,
              tookRequests: shapes.length,
              evidence: { escaped },
            };
          }
          return {
            verdict: 'REFUSED',
            detail: `all ${shapes.length} door shapes (skipDomainCheck / system / privateLan / bare) refused typed and the loopback listener was never reached`,
            tookRequests: shapes.length,
          };
        } finally {
          await new Promise((resolve) => server.close(resolve));
        }
      },
    },
  ],
};
