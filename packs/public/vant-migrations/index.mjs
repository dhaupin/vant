/**
 * vant-migrations pack — battery slice 1 (per-bucket conversion).
 * Converts the MIGRATIONS battery's fixture family onto the run root's
 * `migration-fixture` arm: the REAL migrations lib + bin/migrate.js seam
 * driven the way the native suite drives it — a throwaway fixture install
 * (lib copy + package.json + the axolotl-era legacy artifacts in
 * .agent_tmp/, storage/myStuff/ and models/private/<brain>/state/) probed
 * by subprocess (spawnSync node -e, 30s bound), the fixture living and
 * dying inside one ride. The wire carries the probe flags as neutral
 * booleans; the seed layout is deterministic.
 *
 * House laws: one decision per attack, `skipped: true` marks honest
 * absence; the native suite (test/migrations.test.js) stays green
 * alongside under the reverse-verification law.
 */

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

async function probeMigration(harness, ops) {
  let raw;
  try {
    const r = await harness.run('migration-fixture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    if (typeof r.body === 'string') raw = r.body;
    else if (typeof r.text === 'function') { try { raw = await r.text(); } catch { raw = ''; } }
    else if (r.response && typeof r.response.text === 'function') {
      try { raw = await r.response.text(); } catch { raw = ''; } }
    else raw = '';
  } catch (e) {
    if (/no route registered as/i.test(String(e && e.message))) return null;
    throw e;
  }
  if (!raw) return null;
  let j = null;
  try { j = JSON.parse(raw); } catch { j = null; }
  if (!j || j.error) return null;
  const arr = Array.isArray(j.results) ? j.results : [];
  return { rows: arr, get: (n) => arr.filter((x) => x && x.op === n).pop() };
}

function rowErr(detail, ops, evidence) {
  return { verdict: 'EXPLOITED', detail, tookRequests: ops.length, evidence };
}
const rowSkip = skip;

export default {
  name: 'vant-migrations',
  description: 'brain-layout migration discipline over the REAL fixture install: the registry exposes ordered steps and reports target/up-to-date honestly, detection finds every legacy artifact and a dry run mutates nothing, the apply moves escrow/dropfiles/user storage through the security chain with the marker down and full idempotence, and a live dropfile wins over legacy content without ever being clobbered',

  attacks: [
    {
      name: 'migrations-registry-shape',
      description: 'the registry exposes ordered steps (id + detect + apply present on >=3 steps), status() reports the LAYOUT_VERSION target with an honest upToDate boolean, and on a clean install the second migrate() applies nothing while skipping exactly every registered step',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'registry' }]);
        if (!ride) return rowSkip('migration-fixture not armed (battery slice 1 arm pending)');
        const r = ride.get('registry');
        if (!r) return rowErr('the registry probe failed to answer', [{ op: 'registry' }]);
        if (r.fault) return rowErr('the registry probe faulted: ' + r.fault, [{ op: 'registry' }]);
        if (r.stepsOk !== true) return rowErr('the step registry is not in shape (>=3 steps with id + detect + apply)', [{ op: 'registry' }]);
        if (r.statusOk !== true) return rowErr('status() did not report the LAYOUT_VERSION target with an honest boolean upToDate', [{ op: 'registry' }]);
        if (r.idempotent !== true) return rowErr('the second migrate() was NOT idempotent on a clean install (apply again, or skipped != STEPS count)', [{ op: 'registry' }]);
        return { verdict: 'REFUSED', detail: 'ordered steps, honest status, and idempotence (second run applies zero, skips every step)', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-detect-dryrun-no-mutation',
      description: 'on the axolotl-era legacy layout detection finds ALL the legacy artifacts pending (orgchart.brain-scope, tmpspace.models-anchor, dropfiles.tmp-space), a dry run PLANS the moves without applying one, the artifacts stay intact after it, and the layout still reads pending',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'detect' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('detect');
        if (!r) return rowErr('the detect probe failed to answer', [{ op: 'detect' }]);
        if (r.fault) return rowErr('the detect probe faulted: ' + r.fault, [{ op: 'detect' }]);
        for (const [k, want] of Object.entries({ pendingOrgchart: 'orgchart.brain-scope', pendingTmpspace: 'tmpspace.models-anchor', pendingDropfiles: 'dropfiles.tmp-space' })) {
          if (r[k] !== true) return rowErr(`detection did NOT fire on ${want}`, [{ op: 'detect' }]);
        }
        if (r.dryPlanned !== true) return rowErr('the dry run did not PLAN the powered moves (dryRun mutates only its plan)', [{ op: 'detect' }]);
        if (r.stillPending !== true) return rowErr('the dry run CONSUMED the pending state - a plan is not an apply', [{ op: 'detect' }]);
        if (r.artifactsIntact !== true) return rowErr('the dry run MOVED the legacy artifacts - dryRun must not mutate the tree', [{ op: 'detect' }]);
        return { verdict: 'REFUSED', detail: 'all three legacy artifacts detected, the plan named, the tree byte-intact, and the layout still pending after the dry run', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-apply-security-chain',
      description: `the apply moves the seed fixture content through the security chain: escrow lands in models/private/<brain>/orgchart/escrow.json, the legacy state/ dir drains without empties, .agent_tmp escrow is GONE, storage/myStuff's dropfile content lands in models/tmp-space/myStuff byte-for-byte, the migration marker is written (>=2), and the second run applies nothing (idempotent)`,
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'apply' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('apply');
        if (!r) return rowErr('the apply probe failed to answer', [{ op: 'apply' }]);
        if (r.fault) return rowErr('the apply probe faulted: ' + r.fault, [{ op: 'apply' }]);
        if (r.appliedOrgchart !== true) return rowErr('orgchart.brain-scope did not APPLY', [{ op: 'apply' }]);
        if (r.oldGone !== true) return rowErr('the legacy artifact survived apply - the source is drained, never left standing (guards against re-import)', [{ op: 'apply' }]);
        if (r.escrowMoved !== true) return rowErr('escrow did not land in the brain tree after apply', [{ op: 'apply' }]);
        if (r.dropMoved !== true) return rowErr('the legacy dropfile dir did not drain after apply', [{ op: 'apply' }]);
        if (r.myStuffMoved !== true) return rowErr('storage/myStuff did not land byte-for-byte in tmp-space', [{ op: 'apply' }]);
        if (r.marker !== true) return rowErr('the migration marker was not written (a sealed migration leaves its receipt)', [{ op: 'apply' }]);
        if (r.idempotent !== true) return rowErr('the second apply was NOT idempotent - a repeat run must apply nothing', [{ op: 'apply' }]);
        return { verdict: 'REFUSED', detail: 'apply moves escrow + drops + user storage through the security chain byte-for-byte, writes the marker, and the second run applies nothing', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-dropfile-no-clobber',
      description: 'a CURRENT dropfile wins over legacy state/ content: after a full migrate() the live model tmp-space/read still says exactly CURRENT WINS - the migration NEVER clobbers fresh content with history',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'noClobber' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('noClobber');
        if (!r) return rowErr('the no-clobber probe failed to answer', [{ op: 'noClobber' }]);
        if (r.fault) return rowErr('the no-clobber probe faulted: ' + r.fault, [{ op: 'noClobber' }]);
        if (r.noClobber !== true) return rowErr('the CURRENT dropfile was CLOBBERED by legacy content - a migration may import around the present, never overwrite it', [{ op: 'noClobber' }]);
        return { verdict: 'REFUSED', detail: 'the live dropfile content read unchanged after the full apply - the present wins over history', tookRequests: 1 };
      },
    },
  ],
};
