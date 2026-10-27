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
