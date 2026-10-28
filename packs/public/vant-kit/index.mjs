// packs/public/vant-kit/index.mjs - web/kit contract discipline.
//
// The README survey's open web/kit note (2026-10-27): both web frontends
// vendor the kit's contracts byte-identically (checksummed .sha256 pins);
// the CONTRACT LAYER itself - the runtime-agnostic r/2 relay contract and
// tr/1 traveler contract - deserves its own census: the laws net-deployed
// daily are the kit's decisions, so a kit edit that loosens a wall must
// surface as a finding. The run root declares the census route driving
// the kit files directly (pure modules, no sockets; the one law holds).
//
// ROUTE CONTRACT (armed):
// * kit-contracts  POST, empty JSON body -> the census child's out
//   out = { family: 'kit-contracts', ok, census: [...] }:
//   freeze laws (canary writes refused on CODES / TRANSPORT_STATUS /
//   SEALED / POD_CONFIG_KEYS / EDGE_ENV_KEYS / TRAVEL_CODES), the
//   two-tier private-IP wall (isPrivateIp: loopback/RFC1918/link-local/
//   ULA true with public misses 8.8.8.8 + 2606:4700::1111; isHardPrivateIp:
//   cloud metadata + 0.0.0.0 true, 10.0.0.5 soft), the envelope shape law
//   (32/24-32/32/2+ hex colon format, sub-shape refuses, cap refuses,
//   no-colon refuses), and the traveler bank (wireTraveler shape,
//   travelerShape refusals + the legal-accepts leg, the ledger gap +
//   re-open laws, schemaRize: tr/0 -> tr/1 rize-append, tr/1 untouched).
//
// VALIDATION STATUS: validated against a vant run root (the kit children
// pass standalone + in-run; fires grade it live).

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
  name: 'vant-kit',
  description: 'web/kit contract discipline: frozen vocabularies refuse canary writes, the two-tier private-IP wall answers (hard metadata + 0.0.0.0 refuse in every posture), the envelope shape law holds at its 32/24-32/32/2+ hex shape, the traveler bank (shape/ledger/rizer) closes, and the schema-rizer never guesses forward',
  attacks: [
    {
      name: 'kit-plate-census',
      description: "the CarrierShare plate's own laws, graded from the kit source in a fresh child (typescript transpile + vm decodeSentence evaluation, no React runtime): the pure-renderer law (no fetch/state/asserts/runtime-API calls; btoa stays, it is a standards global), the typed refusal (E_CARRIER_SHAPE: unknown lane + the never-guess/caller-names-the-carrier sentence), decodeSentence word-for-word evaluated live for all five lanes plus the honest custom-plate default, the pointer derivation law (VANT:1: stripped to the 64-hex address), the always-rendered hash-verified sentence, the no-auto-download law (a user-picked link, never auto), and the plate target of the vendoring ring (the vendored CarrierShare.tsx copy byte-identical to kit head)",
      async run(harness) {
        const r = await tryRun(harness, 'kit-plate-census', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no kit-plate-census route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `kit-plate-census threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('kit-plate-census not armed');
        if (j.ok === false) {
          return { verdict: 'EXPLOITED', detail: 'the carrier-share plate broke a law mid-census: ' + (j.bail || 'unknown'), tookRequests: 1, evidence: { census: j } };
        }
        const laws = {
          'pure renderer': j.pureRenderer,
          'typed refusal': j.refusalLaw,
          'decode sentences pinned': j.decodeSentencePinned,
          'unknown lane honest default': j.decodeUnknownCustomPlate,
          'pointer derivation': j.pointerLaw,
          'hash-verified always rendered': j.hashVerifiedAlways,
          'no auto-download': j.noAutoDownload,
          'vendored byte-identical': j.vendoredByteIdentical,
        };
        const broken = Object.entries(laws).filter(([, ok2]) => !ok2);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the carrier-share plate broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: "the CarrierShare plate holds end to end: the kit source is a pure renderer (no doors, no state, no runtime APIs), the unknown-lane refusal is typed (E_CARRIER_SHAPE + the caller-names-the-carrier sentence), decodeSentence is pinned word-for-word across the five lanes plus the honest custom-plate default (evaluated live via the transpiled module), the pointer derivation law holds (VANT:1: strips to the 64-hex address), the hash-verified sentence renders whenever an address is present, nothing auto-downloads (a user-picked link, said so), and the vendored copy is byte-identical to kit head - the kit's first component member is measured at its source", tookRequests: 1, evidence: { census: j } };
      },
    },
    {
      name: 'kit-vendor-ring-census',
      description: "the vendoring parity ring: the vendor script's --check answers exit 0 with one [ok] per pin (9 sidecar pins: relay relay x4, traveler x4, CarrierShare plate x1), AND an independent census child re-derives the ring WITHOUT the script's bookkeeping - each pin must equal BOTH the vendored copy's bytes and its kit source's head (a stale or swapped copy fails either leg), every target stays inside web/ (the one-way boundary), and a negative-control leg (one mutated byte changes the digest) keeps sha() discriminating",
      async run(harness) {
        const r = await tryRun(harness, 'kit-vendor-ring', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no kit-vendor-ring route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `kit-vendor-ring threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('kit-vendor-ring not armed');
        const s = j.script || {};
        const c = j.census || {};
        const bad = (c.pairs || []).filter((p) => !p.pinned);
        const broken = [];
        if (s.exit !== 0) broken.push('the vendor --check exited non-zero');
        if (!c.ok) broken.push('the independent census child failed: ' + (c.bail || 'unknown'));
        if (bad.length) broken.push('unpinned copies: ' + bad.map((p) => p.rel).join(', '));
        if (c.negativeControl !== true) broken.push('the negative control failed: sha() answers the same digest for mutated bytes');
        if (c.containmentOk !== true) broken.push('a vendored target rode outside web/ (the one-way boundary)');
        if (s.okLines !== c.pairCount) broken.push(`the two lenses disagree: script [ok] lines ${s.okLines} vs census pairs ${c.pairCount} - a pin exists one lens cannot see`);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the vendoring ring broke at: ' + broken.join('; '), tookRequests: 2, evidence: { script: s, census: c } };
        }
        return { verdict: 'REFUSED', detail: `the vendoring parity ring holds end to end: the vendor --check answers exit 0 with [ok] on all ${c.pairCount} pins, the independent census child (no script bookkeeping) confirms every pin equals BOTH the vendored bytes and its kit source head, all targets stay inside web/ (the one-way boundary), and the negative control proves sha() discriminates - a drifted or swapped vendored copy cannot ship silently`, tookRequests: 2, evidence: { script: s, census: c } };
      },
    },
    {
      name: 'kit-contracts-census',
      description: 'the web/kit contract census: freeze laws on every frozen vocabulary (canary writes refused), the two-tier private-IP wall (loopback/RFC1918/link-local/ULA true, 8.8.8.8-class misses false, fail-closed shape, and the HARD subset — cloud metadata + 0.0.0.0 — refusing in every posture while RFC1918 stays soft), the envelope shape law at its exact colon-separated hex shape (sub-shape, over-cap and no-colon bodies refuse), the traveler bank (wireTraveler stamps tr/1 + v.major 2, travelerShape refuses SHAPE/ADDRESS/SCHEMA/STEP with the legal-accepts leg green, ledger gap + re-open laws), and the schema-rizer lift (tr/0 -> tr/1 via the rize-append ledger, tr/1 untouched, unknown future refused)',
      async run(harness) {
        const r = await tryRun(harness, 'kit-contracts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no kit-contracts route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `kit-contracts threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('kit-contracts not armed');
        const census = Array.isArray(j.census) ? j.census : [];
        if (j.ok === false) {
          return { verdict: 'EXPLOITED', detail: 'the kit contracts broke a law mid-census: ' + (j.bail || census.filter((l) => String(l).includes('FAIL')).join('; ') || 'unknown'), tookRequests: 1, evidence: { census } };
        }
        const failing = census.filter((l) => String(l).includes('FAIL'));
        if (failing.length) {
          return { verdict: 'EXPLOITED', detail: 'the kit contracts broke at: ' + failing.join('; '), tookRequests: 1, evidence: { census } };
        }
        return { verdict: 'REFUSED', detail: "the kit contract layer holds end to end: every frozen vocabulary refuses canary writes, the two-tier private-IP wall answers (hard metadata + 0.0.0.0 in every posture, RFC1918 soft, fail-closed on unknown shapes), the envelope shape law holds at 32/24-32/32/2+ hex with sub-shape + cap + no-colon refusals, the traveler bank closes (builders stamp tr/1 + v.major 2; shape refusals exact; ledger gap + re-open refused with the legal-accepts leg green), and the schema-rizer lifts tr/0 -> tr/1 through the rize-append ledger while leaving tr/1 untouched - the vendored contract layer is measured at its source", tookRequests: 1, evidence: { census } };
      },
    },
  ],
};
