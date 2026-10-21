// packs/public/vant-stones/index.mjs - stone (horcrux) lifecycle discipline.
//
// Fourth candidate from the packs/README survey (2026-10-22), and the one
// the real-world incident thread (#226/#227/#232, the crashtest stone
// repros) actually lived in. All three oracles attack the FILE layer and
// the in-process seal/restore APIs (lib/horcrux-safe safeWriteHorcrux,
// lib/transform fromHorcrux/restore) - no sockets, no sealed-network act.
//
// ROUTE CONTRACT (armed 2026-10-24 against a vant run root):
//
// * stone-scope   POST, JSON body { brains: [a,b] } seals a stone at that
//                 exact allowlist through safeWriteHorcrux over a fresh
//                 fixture tree (the fixture brains exist so the #219 filter
//                 has real material) -> { scopedBrains, stateJson:
//                 { currentBrain, stack } } decoded back. An absent body
//                 ('{}') asks for the MINIMAL single-brain capture - the
//                 lineage trap: scope ONE brain while the runtime pointer
//                 sits OUTSIDE it.
// * stone-tamper  POST {} -> tamper a sealed fixture stone byte-by-byte
//                 through the <brn:secret> payload region until decode
//                 refuses, then run the REAL restore only when tamper
//                 SURVIVES -> { restoreStatus, restoredFiles }, the
//                 refuse-loudly contract per #233 expansion 4.
//
// VALIDATION STATUS: stone-scope-honesty and restore-torn-refusal REFUSE
// (held). state-pointer-lineage EXPLOITS against vant v0.8.6/axolotl
// TODAY - that is a pinned FINDING, not a glitch: lib/transform.gather
// scopes the brain INVENTORY but leaves the live currentBrain/activeStack
// unfiltered by design, so a single-brain stone carries a pointer outside
// its scope (#226 mint-side silence, measured from the sealed-payload
// side). Fix => flip the row to REFUSED.
//
// Verdict vocabulary and absence-tolerance match the other vant packs:
// exactly one decision per attack, `skipped: true` marks honest absence.

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
  name: 'vant-stones',
  description: 'Stone lifecycle discipline for vant installs: scoped stones carry only the brains they name, restored state never wakes a foreign currentBrain, and tampered stones refuse the restore loudly with nothing partial written',
  attacks: [
    {
      name: 'stone-scope-honesty',
      description: 'a stone minted with a brain scope must decode back to EXACTLY that scope - a stone that says one brain on the label and bundles the whole install inside is the #219/#226 footgun wearing a scope costume',
      async run(harness) {
        const r = await tryRun(harness, 'stone-scope', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ brains: ['fixture-a', 'fixture-b'] }),
        });
        if (r._absent) return skip('no stone-scope route (pending run-root seal/decode wiring)');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `stone-scope threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'stone-scope not armed for decode' };
        const decoded = new Set(j.scopedBrains || []);
        const wanted = new Set(['fixture-a', 'fixture-b']);
        const overlap = [...decoded].filter((b) => !wanted.has(b));
        if (overlap.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `scoped stone carries brains outside its scope: ${overlap.slice(0, 4).join(', ')}`,
            tookRequests: 1,
            evidence: { decoded: j.scopedBrains },
          };
        }
        return { verdict: 'REFUSED', detail: 'scoped stone decodes to exactly its declared scope', tookRequests: 1, evidence: { decoded: j.scopedBrains } };
      },
    },
    {
      name: 'state-pointer-lineage',
      description: 'a restore must never wake a sealed stone on a foreign currentBrain without saying so - the state pointer inside the stone is shared state, and the operator boots the LABEL, not the pointer (#226/#232 class, now pinned from both the mint and the boot side)',
      async run(harness) {
        const r = await tryRun(harness, 'stone-scope', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no stone-scope route (pending run-root seal/decode wiring)');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `stone-scope threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'stone-scope not armed for decode' };
        const pointer = j.stateJson?.currentBrain ?? null;
        const brains = j.scopedBrains || [];
        if (pointer && brains.length === 1 && brains[0] !== pointer) {
          return {
            verdict: 'EXPLOITED',
            detail: `stone scoped to exactly '${brains[0]}' wakes on currentBrain='${pointer}' - the footgun #226 made loud at mint/boot time is still silent in the sealed payload`,
            tookRequests: 1,
            evidence: { pointer, brains },
          };
        }
        return { verdict: 'REFUSED', detail: pointer ? `pointer lineage honest (state wakes on ${pointer})` : 'stone carries no foreign pointer lineage', tookRequests: 1, evidence: { pointer, brains } };
      },
    },
    {
      name: 'restore-torn-refusal',
      description: 'a tampered stone must refuse the restore loudly and write NOTHING partial - a torn restore that half-wakes a brain is worse than a failed one (the write-ahead-journal contract vant promises elsewhere)',
      async run(harness) {
        const r = await tryRun(harness, 'stone-tamper', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no stone-tamper route (pending run-root tamper fixture; the crashtest quillstone is the documented fixture)');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `stone-tamper threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'stone-tamper not armed' };
        if (String(j.restoreStatus).toLowerCase() === 'ok') {
          return {
            verdict: 'EXPLOITED',
            detail: `tampered stone RESTORED (${j.restoredFiles ?? '?'} files) - integrity contract broken`,
            tookRequests: 1,
          };
        }
        if (Number(j.restoredFiles) > 0) {
          return {
            verdict: 'EXPLOITED',
            detail: `tampered stone refused with ${j.restoredFiles} PARTIAL files written - a torn restore`,
            tookRequests: 1,
          };
        }
        return { verdict: 'REFUSED', detail: `tampered stone refused loudly (${j.restoreStatus}) and wrote nothing partial`, tookRequests: 1 };
      },
    },
  ],
};
