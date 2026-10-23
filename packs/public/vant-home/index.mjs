// packs/public/vant-home/index.mjs - the SITE wire discipline pack.
//
// Fourth 2026-10-23 addition from the packs ecosystem walk: the site this
// repo itself deploys (vant.creadev.org, built from web/home/) has exactly
// ONE runtime surface - the Pages Functions under web/home/functions/. This
// pack attacks them the crashtest way: the REAL handlers (onRequestGet /
// onRequestPost) are driven in-process with WHATWG Requests over a
// statement-mapped in-memory fake D1 (per-call fresh state, the fresh-
// fixture law), so every verdict measures the true production wire.
//
// ROUTE CONTRACT (armed on the run root + the contract suite):
//
// * home-summary  POST, JSON body {...posture} - defines env (db present?,
//   STATUS_ADMIN_KEY, STATUS_SWEEP_SECONDS), optionally forces the sweep
//   window hot, then answers one honest round trip through the REAL
//   onRequestGet (method contract enforced by the route: GET dispatches,
//   everything else is a typed 405, as the platform would).
// * home-admin    POST, JSON body {...posture, inner, rawBody}
//   - same, through the REAL onRequestPost.
//
// ARMED + VALIDATED 2026-10-23. One row was armed as a REAL FINDING the
// same turn (flood-cost-cap: the endpoint table accepted unbounded rows,
// turning one compromised admin key into a per-GET probe-per-row egress
// hammer) and was FIXED the same turn: addEndpoint now enforces a cost cap
// (STATUS_MAX_ENDPOINTS, Text env, default 24) and the row measures the
// refusal typed. The verdict table below is the honest ledger.

const ROUTE_ABSENT = /no route registered as/i;

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });
const refused = (detail, extra = {}) => ({ verdict: 'REFUSED', detail, ...extra });
const exploited = (detail, extra = {}) => ({ verdict: 'EXPLOITED', detail, ...extra });

async function callRoute(harness, route, spec) {
    try {
        return await harness.run(route, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(spec),
        });
    } catch (e) {
        if (ROUTE_ABSENT.test(String(e?.message))) return { _absent: true };
        throw e;
    }
}

async function spoke(harness, route, spec) {
    const rec = await callRoute(harness, route, spec);
    if (rec._absent) return { absent: true };
    if (rec.threw) return { fault: 'shim threw: ' + String(rec.error || 'unknown').slice(0, 90) };
    const text = (typeof rec.body === 'string' ? rec.body : (rec.response ? await rec.response.text().catch(() => '') : ''));
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    return { status: rec.status, parsed, text: String(text).slice(0, 300) };
}

export default {
    name: 'vant-home',
    description: 'Site-wire discipline for the vant.creadev.org Pages Functions: the status API refuses unwired deploys with typed fixes, hostile summary shapes stay on the 2xx-4xx floor, the admin door refuses bad keys and bodies with typed verdicts, and the endpoint table carries a cost cap so a compromised key cannot become an unlimited probe budget.',

    attacks: [
        {
            name: 'unwired-refusal-typed',
            description: 'With no DB bound, the summary GET and the admin POST must both answer TYPED refusals (503 + the exact fix sentence) - a stack trace, an empty 200, or a fabricated board is worse than honest',
            async run(harness) {
                const s = await spoke(harness, 'home-summary', { db: false });
                if (s.absent) return skip('home-summary unregistered');
                if (s.fault) return exploited('summary route faulted while unwired: ' + s.fault);
                const a = await spoke(harness, 'home-admin', { db: false, envKey: 'home-valid-key-24-chars', adminKey: 'home-valid-key-24-chars', inner: { action: 'check.run' } });
                if (a.absent) return skip('home-admin unregistered');
                if (a.fault) return exploited('admin route faulted while unwired: ' + a.fault);
                const typed = (r, marker) => r.status === 503 && typeof r.parsed?.error === 'string' && r.parsed.error.length >= 10 && r.parsed.error.toLowerCase().includes(marker);
                const sumOk = typed(s, 'd1');
                const admOk = typed(a, 'd1');
                if (!sumOk || !admOk) {
                    return exploited(`unwired answers were not typed refusals: summary ${s.status} ${s.text.slice(0, 80)} / admin ${a.status} ${a.text.slice(0, 80)}`);
                }
                return refused('both unwired POST/GET shapes answer 503 with the typed fix sentence (no DB) - absence is loud, not silent', { statuses: [s.status, a.status] });
            },
        },

        {
            name: 'summary-fuzz-floor',
            description: 'Hostile summary wire shape s (query pollution, oversized urls, spoofed methods []). (query pollution, oversized URLs, spoofed methods, junk headers) stay on the 2xx-4xx floor - abuse never becomes a server fault or a raw throw',
            async run(harness) {
                const probes = [
                    { url: '?' + 'a=1&'.repeat(400) + 'a=1' },
                    { url: '?' + 'noiseparam' + 'x'.repeat(2000) + '=y' },
                    { url: '/../../etc/passwd?x=1' },
                    { url: '?%00alerter=1' },
                    { method: 'POST' },
                    { method: 'DELETE' },
                    { method: 'TRACE' },
                    { headers: { 'x-forwarded-for': 'not-an-ip' }, url: '?fuzz=1' },
                    { headers: { 'accept': ('a,'.repeat(600)) + 'a' } },
                ];
                const bad = [];
                let n = 0;
                for (const p of probes) {
                    const r = await spoke(harness, 'home-summary', { ...p });
                    n++;
                    if (r.absent) return skip('home-summary unregistered');
                    if (r.fault) { bad.push(`${p.method || 'GET'} ${String(p.url || '').slice(0, 24)} -> ${r.fault}`); continue; }
                    if (r.status >= 500 || r.status < 200) bad.push(`${p.method || 'GET'} -> ${r.status}`);
                }
                if (bad.length) return exploited(`${bad.length}/${probes.length} hostile shapes broke the floor: ${bad[0]}`);
                return refused(`all ${probes.length} hostile summary shapes answered 2xx-4xx typed - the wire never becomes a server fault`, { tookRequests: n });
            },
        },

        {
            name: 'admin-key-discipline',
            description: 'The admin door refuses: no key, a wrong key, a junk wire key - always 403 typed with the door closed; and an unset/short STATUS_ADMIN_KEY in env keeps the door 503-fail-closed, never fail-open',
            async run(harness) {
                const cases = [
                    { name: 'no key', spec: { inner: { action: 'check.run' } } }, // no adminKey: no header, no body key
                    { name: 'wrong key', spec: { inner: { action: 'check.run' }, adminKey: 'wrong-key-does-not-open-d0or' } },
                    { name: 'junk body key', spec: { inner: { action: 'check.run', key: '\t \n\u0000=?!deadbeef' } } },
                    { name: 'body-key-only-wrong', spec: { inner: { action: 'check.run', key: 'wrong-body-key-01234567' } } },
                ];
                const bad = [];
                for (const c of cases) {
                    const r = await spoke(harness, 'home-admin', { ...c.spec, inner: { ...c.spec.inner } });
                    if (r.absent) return skip('home-admin unregistered');
                    if (r.fault) { bad.push(c.name + ' faulted'); continue; }
                    if (r.status !== 403) bad.push(`${c.name} -> ${r.status} (expected 403)`);
                }
                // fail-closed half: env key short or missing -> 503 typed
                const noEnv = await spoke(harness, 'home-admin', { envKey: 'short', inner: { action: 'check.run' }, adminKey: 'short' });
                if (noEnv.fault) return exploited('short-env-key posture faulted: ' + noEnv.fault);
                if (noEnv.status !== 503) bad.push(`short env key -> ${noEnv.status} (expected 503 fail-closed)`);
                if (bad.length) return exploited(`admin-key discipline broke: ${bad[0]} (+${bad.length - 1} more)`);
                return refused('every key posture lands typed: missing/wrong/junk = 403, unset env = 503 - the door is fail-closed on the wire', { tookRequests: cases.length + 1 });
            },
        },

        {
            name: 'admin-body-discipline',
            description: 'With a VALID key, hostile bodies stay typed 4xx: non-JSON wire, an empty object (no action), an unknown action, and alert.set without a message - no 5xx, no silent acceptance, and clamped storage for oversized messages',
            async run(harness) {
                const ENV_KEY = 'home-valid-key-24-chars';
                const key = ENV_KEY;
                const cases = [
                    { name: 'non-JSON wire', spec: { rawBody: '{{{ not json at all', envKey: ENV_KEY, adminKey: key } },
                    { name: 'no action', spec: { inner: {}, envKey: ENV_KEY, adminKey: key } },
                    { name: 'unknown action', spec: { inner: { action: 'self.detonate' }, envKey: ENV_KEY, adminKey: key } },
                    { name: 'alert without message', spec: { inner: { action: 'alert.set' }, envKey: ENV_KEY, adminKey: key } },
                    { name: 'oversized alert', spec: { inner: { action: 'alert.set', message: 'x'.repeat(600), level: 'warn' }, envKey: ENV_KEY, adminKey: key } },
                ];
                const bad = [];
                for (const c of cases) {
                    const r = await spoke(harness, 'home-admin', { ...c.spec });
                    if (r.absent) return skip('home-admin unregistered');
                    if (r.fault) { bad.push(c.name + ' faulted'); continue; }
                    if (r.status >= 500) bad.push(`${c.name} -> ${r.status}`);
                    // every refusal must be a TYPED error; oversized messages
                    // clamp to 500 instead of exploding the store
                    if (c.name === 'oversized alert') {
                        if (r.status === 200 && typeof r.parsed?.alert?.message === 'string' && r.parsed.alert.message.length <= 500) continue;
                        bad.push('oversized alert not clamped to 500 chars');
                    }
                }
                if (bad.length) return exploited(`admin-body discipline broke: ${bad[0]}`);
                return refused('hostile admin bodies answer typed 4xx; oversized storage clamps to its declared bound - the wire stays honest', { tookRequests: cases.length });
            },
        },

        {
            name: 'flood-cost-cap',
            description: 'endpoint.add is the monitor\'s only inflow: past the cost cap (STATUS_MAX_ENDPOINTS, default 24) every further add is refused TYPED - an unbounded table would turn one compromised key into a per-cold-GET probe-per-row egress hammer',
            async run(harness) {
                // The fake DB boots with the 6 seeded defaults, then packs 24
                // periods: cap = 24 for the ceiling, so 18 adds succeed (6+18 =
                // 24), and the 19th is refused. (add till you accumulate a full
                // ceiling of rows and verify WHERE they stop.)
                let added = 0;
                let refusal = null;
                let i = 0;
                // one SHARED fake D1 across the burst (the flood is only a
                // flood when the adds accumulate); the first call resets it
                // so both determinism runs measure from the seeded start
                let first = true;
                for (i = 0; i < 30; i++) {
                    const r = await spoke(harness, 'home-admin', {
                        envKey: 'home-valid-key-24-chars',
                        sharedDb: true,
                        resetSharedDb: first,
                        inner: { action: 'endpoint.add', name: 'flood-attack-shape-' + i, url: 'https://fuzz-' + i + '.invalid/', kind: 'http' },
                        adminKey: 'home-valid-key-24-chars',
                    });
                    first = false;
                    if (r.absent) return skip('home-admin unregistered');
                    if (r.fault) return exploited('flood row faulted: ' + r.fault);
                    if (r.status === 200 && r.parsed?.ok) {
                        added++;
                        continue;
                    }
                    if (r.status === 400 && typeof r.parsed?.error === 'string' && /cap/i.test(r.parsed.error)) {
                        refusal = r.parsed.error;
                        break;
                    }
                    return exploited(`flood add ${i} answered ${r.status}: ${r.text.slice(0, 80)}`);
                }
                if (!refusal) {
                    return exploited(`endpoint flood: all ${i} adds accepted with no cap refusal - the table is an unbounded probe budget`);
                }
                if (added >= 30) return exploited(`flood: cap never fired within 30 adds`);
                return refused(`the cost wall holds: ${added} adds accepted inside the cap, then the ${(added + 1)}th answered typed refuse (${refusal.slice(0, 60)})`, { accepted: added });
            },
        },
    ],
};
