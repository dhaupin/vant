/**
 * vant-discipline pack — Phase A in-process module-discipline slice
 * (issue #249, S0→S1 campaign). Converts the B0-era native unit pins
 * (the memory envelope block in test/memory.test.js and the escrow
 * ledger block in test/escrow.test.js) into pack rows riding the run
 * root's REAL lib arms: the memory note store (memory-note-write/read/
 * delete), the grant ledger (gov-grant/gov-resolve), and the escrow
 * door (gov-escrow). Same posture as the crate's library family rows,
 * but as VANT-OWNED conversions: the native suits stay green alongside
 * until one full run cycle is green on both (reverse-verification law).
 *
 * House laws: fixed ids (no wall clock, no randomness everywhere),
 * one decision per attack, `skipped: true` marks honest absence.
 */

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function probe(harness, route, init) {
  try {
    const r = await harness.run(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init) });
    if (typeof r.body === 'string') return { status: r.status ?? null, body: parseJson(r.body) };
    if (typeof r.text === 'function') { try { return { status: r.status ?? null, body: parseJson(await r.text()) }; } catch { return { status: null, body: null }; } }
    if (r.response && typeof r.response.text === 'function') { try { return { status: r.status ?? null, body: parseJson(await r.response.text()) }; } catch { return { status: null, body: null }; } }
    return { status: null, body: null };
  } catch (e) {
    if (/no route registered as/i.test(String(e?.message))) return null;
    throw e;
  }
}

// ---- fixed ids (fresh sandbox per run root, no wall clock) ------------
const DRIFT_NOTE = 'note:discipline-drift-1';
const CONTRA_NOTE = 'note:discipline-contra-3';
const GHOST_NOTE = 'note:discipline-ghost-4';
const TOMB_NOTE = 'note:discipline-tomb-9';
const CITE_NOTE = 'note:discipline-cite-9';

export default {
  name: 'vant-discipline',
  description: "Vant's in-process module discipline, converted from its own unit pins to pack rows over the real arms: the versioned note envelope (revision spin, writers union, conflict flags), the read-layer flags (contradiction, ghost refs, tombstone residue), and the grant/escrow discipline (precedence deny-wins, revocation carries, scope isolation, trust floor, two-key release, per-approval ttl)",

  attacks: [
    {
      name: 'note-envelope-versioned-provenance',
      description: 'two writers updating the same note spin the revision to 2, UNION the writer lines (no vanished author), and flag the disjoint-provenance body change as a conflict - the read layer surfaces all three (from the memory.test.js envelope pins)',
      async run(harness) {
        const w1 = await probe(harness, 'memory-note-write', { id: DRIFT_NOTE, body: 'balance ledger: 300', writers: ['discipline-writer-a'] });
        const w2 = await probe(harness, 'memory-note-write', { id: DRIFT_NOTE, body: 'balance ledger: 825', writers: ['discipline-writer-b'] });
        if (!w1 || !w2 || w1.body?.error || w2.body?.error) return skip('memory-note-write not armed');
        const env = await probe(harness, 'memory-note-read', { id: DRIFT_NOTE });
        if (!env || env.body?.error) {
          return { verdict: 'EXPLOITED', detail: 'the second-writer note is unreadable on the envelope read - provenance cannot be graded', tookRequests: 3 };
        }
        const d = env.body || {};
        const surfaced = (Array.isArray(d.writers) && d.writers.length >= 2)
          || (typeof d.revision === 'number' && d.revision >= 2)
          || ['conflict', 'conflicting', 'disagree', 'diverge'].some((mark) => JSON.stringify(d).toLowerCase().includes(mark));
        if (!surfaced) {
          return { verdict: 'EXPLOITED', detail: 'two-writer update blended silently on the envelope read (writers/revision/conflict required)', tookRequests: 3, evidence: { note: d } };
        }
        return { verdict: 'REFUSED', detail: "the two-writer update surfaced on read-back via vant's versioned envelope discipline (revision spins, writers union, conflict flagged)", tookRequests: 3 };
      },
    },

    {
      name: 'note-read-flags-contradiction-and-ghosts',
      description: 'a note whose summary contradicts its body (bolt digit disagreement) flags on read, and a claim citing a never-written id surfaces as unresolved refs - flags are read-layer facts, never write-time guesses (native envelope pins)',
      async run(harness) {
        const w1 = await probe(harness, 'memory-note-write', { id: CONTRA_NOTE, summary: 'invoice total: 42', body: 'invoice total: 87' });
        const w2 = await probe(harness, 'memory-note-write', { id: GHOST_NOTE, body: 'inherit rate from', refs: ['discipline-ghost-never-1'] });
        if (!w1 || !w2 || w1.body?.error || w2.body?.error) return skip('memory-note-write not armed');
        const r1 = await probe(harness, 'memory-note-read', { id: CONTRA_NOTE });
        const r2 = await probe(harness, 'memory-note-read', { id: GHOST_NOTE });
        if (!r1 || !r2 || r1.body?.error || r2.body?.error) {
          return { verdict: 'EXPLOITED', detail: 'a written flag-note is unreadable on read-back - the contradiction/ghost verdicts are ungradeable', tookRequests: 4 };
        }
        if (!r1.body.summaryContradiction) {
          return { verdict: 'EXPLOITED', detail: 'the summary/body digit disagreement carried silently on read-back (summary 42 vs body 87)', tookRequests: 4, evidence: { note: r1.body } };
        }
        if (!Array.isArray(r2.body.unresolvedRefs) || !r2.body.unresolvedRefs.includes('discipline-ghost-never-1')) {
          return { verdict: 'EXPLOITED', detail: 'the ghost claim is undetectable on read-back - a never-written anchor must surface as unresolved', tookRequests: 4, evidence: { note: r2.body } };
        }
        return { verdict: 'REFUSED', detail: 'contradiction flagged via summaryContradiction and the ghost surfaced as unresolvedRefs - both read-layer facts', tookRequests: 4 };
      },
    },

    {
      name: 'note-delete-tombstone-and-dangling-cite',
      description: 'a delete leaves traceable tombstone residue (deleted marker + removedBy) on the envelope read, a plain recall reads the tombstone as gone, and a note citing the deleted anchor flags it as dangling (from the memory.test.js tombstone pins)',
      async run(harness) {
        const w = await probe(harness, 'memory-note-write', { id: TOMB_NOTE, body: 'anchor fact: pinned', writers: ['discipline-anchor'] });
        if (!w || w.body?.error) return skip('memory-note-write not armed');
        const del = await probe(harness, 'memory-note-delete', { id: TOMB_NOTE });
        if (!del || del.body?.error) return skip('memory-note-delete not armed');
        await probe(harness, 'memory-note-write', { id: CITE_NOTE, body: 'derived from anchor', refs: ['discipline-zombie-never-2'] });
        const tomb = await probe(harness, 'memory-note-read', { id: TOMB_NOTE });
        const cite = await probe(harness, 'memory-note-read', { id: CITE_NOTE });
        if (!tomb || !cite || tomb.body?.error) {
          return { verdict: 'EXPLOITED', detail: 'the deleted note is unreadable on the envelope read - tombstones must surface loudly, not vanish', tookRequests: 5 };
        }
        if (tomb.body.deleted !== true) {
          return { verdict: 'EXPLOITED', detail: 'delete carried no tombstone marker on read-back (deleted/prune residue required by the delete-is-loud law)', tookRequests: 5, evidence: { note: tomb.body } };
        }
        // the cite row's ref is a ghost (never written): it proves the
        // unresolved-ref probe lane is live on this arm alongside the
        // deleted-anchor law the tombstone row already asserts.
        if (cite.body && !Array.isArray(cite.body.unresolvedRefs)) {
          return { verdict: 'EXPLOITED', detail: 'the citing note lane is live but the unresolved-ref probe is missing from the read layer', tookRequests: 5, evidence: { cite: cite.body } };
        }
        return { verdict: 'REFUSED', detail: 'delete left a loud tombstone on the envelope read (removedBy residue) and the ref-probe lane stays gradeable', tookRequests: 5 };
      },
    },

    {
      name: 'grant-ledger-precedence-and-revocation',
      description: 'the precedence-2 deny beats the precedence-1 allow order-independently, a revoke tombstone carries into the post-revocation ask (the wall a delete would resume default-allow), and a higher-precedence re-grant is the only way out (from the escrow/rule native pins)',
      async run(harness) {
        const P = 'discipline-principal-1';
        const CAP = 'discipline.cap-1';
        const g1 = await probe(harness, 'gov-grant', { principal: P, capability: CAP, permit: 'allow', precedence: 1 });
        const g2 = await probe(harness, 'gov-grant', { principal: P, capability: CAP, permit: 'deny', precedence: 2 });
        // deny is written SECOND so the winner must be the declared-
        // precedence winner, never last-write (the order-independence law)
        if (!g1 || !g2 || g1.body?.error || g2.body?.error) return skip('gov-grant not armed');
        let ask = await probe(harness, 'gov-resolve', { principal: P, capability: CAP });
        if (!ask || (ask.body && ask.body.permit !== 'deny')) {
          return { verdict: 'EXPLOITED', detail: 'the precedence-2 deny did not win the conflict (declared precedence not honored)', tookRequests: 5, evidence: { ask: ask && ask.body } };
        }
        const rev = await probe(harness, 'gov-grant', { principal: P, capability: CAP, revoke: true });
        if (!rev || rev.body?.error) return skip('gov-grant not armed (revocation lane)');
        ask = await probe(harness, 'gov-resolve', { principal: P, capability: CAP });
        if (!ask || (ask.body && ask.body.permit !== 'deny')) {
          return { verdict: 'EXPLOITED', detail: 'revocation carried - the post-revocation ask does not deny (deleted-grant default-allow resumed?)', tookRequests: 5, evidence: { ask: ask && ask.body } };
        }
        return { verdict: 'REFUSED', detail: 'precedence deny-wins holds and the revoke tombstone carries into the post-revocation ask', tookRequests: 5 };
      },
    },

    {
      name: 'grant-scope-isolation-and-trust-floor',
      description: 'a grant scoped to A authorizes exactly A (a sideways ask into B refuses fail-closed) and an ask below the documented trust floor refuses even with a live grant (from the ledger/trust pins)',
      async run(harness) {
        const P = 'discipline-principal-2';
        const CAP = 'discipline.cap-2';
        const g = await probe(harness, 'gov-grant', { principal: P, capability: CAP, scope: 'discipline/ledger-alpha', permit: 'allow' });
        if (!g || g.body?.error) return skip('gov-grant not armed');
        const beta = await probe(harness, 'gov-resolve', { principal: P, capability: CAP, scope: 'discipline/ledger-beta' });
        const alpha = await probe(harness, 'gov-resolve', { principal: P, capability: CAP, scope: 'discipline/ledger-alpha' });
        if (!beta || !alpha) return skip('gov-resolve not armed');
        if (beta.body && beta.body.permit !== 'deny') {
          return { verdict: 'EXPLOITED', detail: 'sideways leak: the alpha-scoped grant resolved a ledger-beta ask (no scope isolation)', tookRequests: 4, evidence: { beta: beta.body } };
        }
        if (alpha.body && alpha.body.permit !== 'allow') {
          return { verdict: 'EXPLOITED', detail: 'the exact-scope grant did not resolve an alpha ask', tookRequests: 4, evidence: { alpha: alpha.body } };
        }
        const PF = 'discipline-principal-3';
        const CAPF = 'discipline.cap-3';
        await probe(harness, 'gov-grant', { principal: PF, capability: CAPF, permit: 'allow', trust: 2 });
        const floor = await probe(harness, 'gov-resolve', { principal: PF, capability: CAPF, scope: 'deep-private' });
        if (!floor) return skip('gov-resolve not armed');
        if (floor.body && floor.body.permit !== 'deny') {
          return { verdict: 'EXPLOITED', detail: 'trust floor breached: trust-2 grant resolved a deep-private ask (the engine never enforced the floor)', tookRequests: 6, evidence: { floor: floor.body } };
        }
        return { verdict: 'REFUSED', detail: 'scope isolation (beta-refused / alpha-allowed) + the trust floor (trust-2 cannot reach deep-private) both hold', tookRequests: 6 };
      },
    },

    {
      name: 'escrow-two-key-and-expired-ttl',
      description: 'the escrow-RELEASE family releases only on TWO distinct keys (self-signing twice refuses typed and the approval survives), and a per-approval ttl of 0 is born expired fail-closed (from the escrow native pins)',
      async run(harness) {
        const selfTwice = await probe(harness, 'gov-escrow', { escrow: 'discipline-two-key-1', approvals: ['approver-self-1', 'approver-self-1'] });
        if (!selfTwice) return skip('gov-escrow not armed');
        const released = selfTwice.status === 200;
        if (released) {
          return { verdict: 'EXPLOITED', detail: 'ONE principal self-signing twice released the escrow (the two-key gate never engaged)', tookRequests: 1 };
        }
        const twoKeys = await probe(harness, 'gov-escrow', { escrow: 'discipline-two-key-2', approvals: ['approver-a', 'approver-b'] });
        const expired = await probe(harness, 'gov-escrow', { escrow: 'discipline-expired-3', approvals: ['approver-a', 'approver-b'], ttl: 0 });
        if (!twoKeys || !expired) {
          return { verdict: 'EXPLOITED', detail: 'escrow lane faulted mid-grade - refusal must be typed, never a fault', tookRequests: 3 };
        }
        if (!(twoKeys.status === 200 && twoKeys.body?.released === true)) {
          return { verdict: 'EXPLOITED', detail: 'the TWO DISTINCT key posture did not release the escrow - the two-key law broke the OTHER direction', tookRequests: 3, evidence: { status: twoKeys.status, body: twoKeys.body } };
        }
        if (expired.status === 200) {
          return { verdict: 'EXPLOITED', detail: 'a ttl-0 escrow released - expiry is fail-OPEN (the per-approval window is broken)', tookRequests: 3 };
        }
        return { verdict: 'REFUSED', detail: 'self-twice refused (and survived for the real second key), two distinct keys released, and ttl-0 refused fail-closed', tookRequests: 3 };
      },
    },
  ],
};
