// packs/public/vant-teams/index.mjs - orgchart depth discipline for vant.
//
// Fifth candidate family (2026-10-27): lib/teams is the largest unmeasured
// lib facet by raw size. Driven by the same contract as vant-crew: the RUN
// ROOT declares the census route against lib/teams in-process (no sockets;
// the one law holds), returns neutral facts, and the attack decides.
//
// ROUTE CONTRACT (armed):
//
// * teams-orgchart POST, empty JSON body -> the census child's out
//   (family 'teams-orgchart'): the org depth (create/dup/bad-name/ghost
//   updates), the parent-first convention binding every link, the role
//   arm over the DOCUMENTED name-first options shape, the role-scoped
//   hasPermission law, the agent-side can() law (direct / chain-walk /
//   the CRITICAL-permission trust floor), the assignment round trip
//   (verbatim + brain mapping + unassign drop), the listTeams shapes,
//   and the ghost-ref vocabulary (documented exact-hit-only reorder +
//   the explicit-form typed refusals).
//
// VALIDATION STATUS: validated against a vant run root (the census child
// smoke-ed green standalone; fires grade it live).

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
  name: 'vant-teams',
  description: 'Orgchart depth discipline for vant installs: the teams chain binds every link, the permission laws close exactly (role-scoped + agent-side direct/chain/trust-floor), and every ghost ref answers its own honest shape',
  attacks: [
    {
      name: 'teams-orgchart-census',
      description: "the orgchart depth: org create/dup/bad-name/ghost-update laws, the parent-first convention binding dept->org and team->dept, the role arm storing its documented options (permissions + chain), role-scoped hasPermission exact, the agent-side can() law (direct grant, chain walk, ghost agents false), the CRITICAL-permission trust floor withholding canDeploy at the fixture's neutral trust, the assignment round trip (verbatim record, brain mapping, unassign dropping the permission), the listTeams dept-ref shapes, and the ghost-ref vocabulary (the documented exact-hit-only reorder reinterpreting a ghost parent-first ref, the explicit ghost-org form refusing typed)",
      async run(harness) {
        const r = await tryRun(harness, 'teams-orgchart', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no teams-orgchart route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `teams-orgchart threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('teams-orgchart not armed');
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = {
          'org depth': j.orgCreated && j.dupOrgTyped && j.badNameTyped && j.getOrgGhostUndefined && j.updateOrgGhostTyped,
          'chain binds': j.deptBindsOrg && j.teamBindsDept && j.roleBindings && j.roleChainStored,
          'role-scoped permission': j.hasPermissionGranted && j.hasPermissionMissing && j.hasPermissionGhost && j.roleChainListed,
          'agent-side can()': j.canDirect && j.canChainWalk && j.canMissingFalse && j.canUnknownAgentFalse,
          'trust floor': j.trustFloorHolds,
          'assignment round trip': j.assignmentVerbatim && j.agentBrainRoundTrip && j.unassignThenDrop,
          'list Teams shapes': j.listTeamsDeptRef && j.listTeamsAll && j.listTeamsGhostEmpty,
          'ghost vocabulary': j.deleteDeptGhostTyped && j.ghostParentReinterpreted && j.explicitGhostOrgTyped,
        };
        const broken = Object.entries(laws).filter(([, ok2]) => !ok2);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the orgchart broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: "the full orgchart chain closes over the documented shapes: org depth laws typed, every link bound (dept->org, team->dept, role->team), permissions and chain stored verbatim, role-scoped hasPermission exact, can() direct AND chain-walk true with ghosts false, the CRITICAL-permission trust floor withholding canDeploy at neutral trust, the assignment round trip verbatim with the brain mapping and the unassign drop, the listTeams dept-ref shapes, and the ghost vocabulary held (documented parent-first reorder + explicit-form typed refusals) - the largest unmeasured facet is measured", tookRequests: 1 };
      },
    },
  ],
};
