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

    // ============ slice 2: the legacy-main multibrain import family ============

    {
      name: 'migrations-legacy-detect-fires',
      description: 'detection fires ONLY on the true flat layout: a pre-multibrain main-style tree (flat models/public + neurons-only state.json) reads legacy.multibrain-import pending',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'detect' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the legacy detect probe failed to answer', [{ op: 'legacy', task: 'detect' }]);
        if (r.fault) return rowErr('the legacy detect probe faulted: ' + r.fault, [{ op: 'legacy', task: 'detect' }]);
        if (r.fires !== true) return rowErr("detection did NOT fire legacy.multibrain-import on the true flat layout", [{ op: 'legacy', task: 'detect' }]);
        return { verdict: 'REFUSED', detail: 'the flat main-style tree reads legacy.multibrain-import pending', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-legacy-no-false-positive',
      description: 'no false positive on multibrain trees: a CLEAN multibrain install (nested brains + stack in state) never reads legacy.multibrain-import pending',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'nofalse', legacy: 'clean' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the no-false-positive probe failed to answer', [{ op: 'legacy', task: 'nofalse', legacy: 'clean' }]);
        if (r.fault) return rowErr('the no-false-positive probe faulted: ' + r.fault, [{ op: 'legacy', task: 'nofalse', legacy: 'clean' }]);
        if (r.falsePositive === true) return rowErr('the import detection fired FALSE on a multibrain tree - main-style legacy detection must never re-fire on an already-nested install', [{ op: 'legacy', task: 'nofalse', legacy: 'clean' }]);
        return { verdict: 'REFUSED', detail: 'the nested multibrain tree reads no legacy import pending - no false positive', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-legacy-dryrun-plans',
      description: 'the dry run PLANS the import without touching the flat tree: >=5 planned moves target the <name> nesting, and models/public/identity.md still exists after (a plan is not an apply)',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'dryrun' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the legacy dry-run probe failed to answer', [{ op: 'legacy', task: 'dryrun' }]);
        if (r.fault) return rowErr('the legacy dry-run probe faulted: ' + r.fault, [{ op: 'legacy', task: 'dryrun' }]);
        if (!(r.planFiles >= 5)) return rowErr(`the dry run planned ${JSON.stringify(r.planFiles)} moves into <name> - the plan must name the real nesting work`, [{ op: 'legacy', task: 'dryrun' }]);
        if (r.stillFlat !== true) return rowErr('the dry run CONSUMED the flat layout - dryRun mutates nothing', [{ op: 'legacy', task: 'dryrun' }]);
        return { verdict: 'REFUSED', detail: `>=5 moves planned into <name>, the tree still flat after the dry run`, tookRequests: 1 };
      },
    },

    {
      name: 'migrations-legacy-apply-nests',
      description: 'the apply nests the brain under models/{public,private}/<name>, synthesizes the stack, writes the v3 marker, self-verifies through the real loader, and a FRESH process reads the migrated brain - the whole user experience',
      async run(harness) {
        const ride = await probeMigration(harness, [
          { op: 'legacy', task: 'apply' },
        ]);
        if (!ride) return rowSkip('migration-fixture not armed');
        void ride;
        const r = ride.get('legacy');
        if (!r) return rowErr('the legacy apply probe failed to answer', [{ op: 'legacy', task: 'apply' }]);
        if (r.fault) return rowErr('the legacy apply probe faulted: ' + r.fault, [{ op: 'legacy', task: 'apply' }]);
        const legs = { appliedHasImport: 'the import step did not APPLY', flatGone: 'the flat public root survived apply', nested: 'identity did not land nested under <name>', bootNested: 'boot/start.md did not nest', successionNested: '_succession.json did not nest', stackHasVant: 'state.json has no stacked brain', neuronsCarried: 'the neurons state did not carry through the synthesis', markerV3: 'the marker was not written at v3', idempotent: 'a second run re-applied the import', selfVerified: 'the step did not self-verify through the real loader', brainReads: 'a FRESH process could not read the migrated brain', corpusNonZero: 'the fresh corpus read empty' };
        for (const [k, why] of Object.entries(legs)) {
          if (r[k] !== true) return rowErr(why + ` (${k})`, [{ op: 'legacy', task: 'apply' }]);
        }
        if (r.currentBrain !== 'vant') return rowErr(`currentBrain reads ${JSON.stringify(r.currentBrain)} - the synthesized stack must point at the chosen brain`, [{ op: 'legacy', task: 'apply' }]);
        return { verdict: 'REFUSED', detail: 'nesting + synthesized stack + neurons carried + v3 marker + self-verified through the real loader + idempotent + a fresh process reads the migrated brain', tookRequests: 2 };
      },
    },

    // ============ slice 3: CLI banners, MCP door, adversarial edges ============

    {
      name: 'migrations-cli-legacy-banner',
      description: 'vant start auto-migrates loudly: a main-style flat tree boots with the BRAIN MIGRATED banner (the user hears what moved)',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'banner' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the banner probe failed to answer', [{ op: 'legacy', task: 'banner' }]);
        if (r.banner !== true) return rowErr('the first start did not print the migration banner - the user must hear what moved', [{ op: 'legacy', task: 'banner' }]);
        return { verdict: 'REFUSED', detail: 'the first start on a flat tree auto-migrated with the BRAIN MIGRATED banner', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-cli-second-start-quiet',
      description: 'the second start stays quiet: no migration banner again (idempotent, no re-alert) and the layout reads OK',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'banner2' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the second-start probe failed to answer', [{ op: 'legacy', task: 'banner2' }]);
        if (r.banner2 !== true) return rowErr('the second-start probe never printed its flag (BANNER2 missing)', [{ op: 'legacy', task: 'banner2' }]);
        if (r.quietSecond !== true) return rowErr('the second start re-printed the migration banner - idempotence must not re-alert', [{ op: 'legacy', task: 'banner2' }]);
        if (r.layoutOk !== true) return rowErr('the second start did not report the layout OK', [{ op: 'legacy', task: 'banner2' }]);
        return { verdict: 'REFUSED', detail: 'second start: silent about the import, loud about the layout OK', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-cli-existing-wins-quiet',
      description: 'a zero-move import is a no-op, not a celebration: every flat file already present inside <name> - the start prints NO migration banner and reads the layout OK',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'bannernomove' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the existing-wins probe failed to answer', [{ op: 'legacy', task: 'bannernomove' }]);
        if (r.quietSecond !== true) return rowErr('the zero-move import PRINTED the migration banner - a no-op gets no celebration', [{ op: 'legacy', task: 'bannernomove' }]);
        if (r.layoutOk !== true) return rowErr('the zero-move start did not read the layout OK', [{ op: 'legacy', task: 'bannernomove' }]);
        return { verdict: 'REFUSED', detail: 'existing-wins: the import moved 0 files, the start stayed quiet about migration and read the layout OK', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-mcp-door-legacy',
      description: 'the MCP door reports a legacy tree honestly: brain_migration_status says legacy:true with guidance that names both vant migrate and --brain-name',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'mcplegacy' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the MCP door probe failed to answer', [{ op: 'legacy', task: 'mcplegacy' }]);
        if (r.legacy !== true) return rowErr('the MCP door did not read the flat tree as legacy', [{ op: 'legacy', task: 'mcplegacy' }]);
        if (r.guidanceMigrate !== true || r.guidanceName !== true) {
          return rowErr(`the guidance did not name the exit (migrate=${r.guidanceMigrate} --brain-name=${r.guidanceName}) - the door must tell the user HOW, not just THAT`, [{ op: 'legacy', task: 'mcplegacy' }]);
        }
        return { verdict: 'REFUSED', detail: 'the door reports legacy:true with actionable guidance (vant migrate + --brain-name)', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-mcp-door-uptodate',
      description: 'after a real migrate the same door reports up-to-date: legacy:false and upToDate:true - the door never cries stale over a sealed migration',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'mcuptodate' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the MCP up-to-date probe failed to answer', [{ op: 'legacy', task: 'mcuptodate' }]);
        if (r.notLegacy !== true || r.uptodate !== true) {
          return rowErr(`post-migrate door reads legacy=${JSON.stringify(r.notLegacy)} upToDate=${JSON.stringify(r.uptodate)} - it must report up-to-date truthfully`, [{ op: 'legacy', task: 'mcuptodate' }]);
        }
        return { verdict: 'REFUSED', detail: 'post-migrate: legacy:false + upToDate:true - the door tells the truth', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-read-fallback',
      description: 'dual-mode reads find the migrated content: a plain read() and an explicit public read both answer with the legacy user content on a migrated tree',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'readfallback' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the read-fallback probe failed to answer', [{ op: 'legacy', task: 'readfallback' }]);
        if (r.fallback !== true || r.explicitPublic !== true) {
          return rowErr(`migrated content read fallback=${JSON.stringify(r.fallback)} explicitPublic=${JSON.stringify(r.explicitPublic)} - the USER must see their old brain after import`, [{ op: 'legacy', task: 'readfallback' }]);
        }
        return { verdict: 'REFUSED', detail: 'plain and explicit-public reads both reach the migrated brain content on a legacy tree', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-no-self-nest',
      description: 'a pre-created destination dir never self-nests: boot artifacts inside models/public/vant stay put, the import lands BESIDE them (no <name>/<name> wipe), and the step self-verifies',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'apply', variant: 'selfnest', probe: 'variant' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the self-nest probe failed to answer', [{ op: 'legacy', task: 'apply', variant: 'selfnest', probe: 'variant' }]);
        if (r.missed) return rowErr(`the self-nest walk missed: ${r.missed}`, [{ op: 'legacy', task: 'apply', variant: 'selfnest', probe: 'variant' }]);
        if (r.missed === null && !r.importOk) return rowErr('the import did not land beside the pre-created dir', [{ op: 'legacy', task: 'apply', variant: 'selfnest', probe: 'variant' }]);
        return { verdict: 'REFUSED', detail: 'boot artifact intact, no <name>/<name>, import beside it, step self-verified', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-stack-rewrite',
      description: 'a default-only stack is REPLACED by the chosen brain name (a health-persisted [vant] stack must never strand a --brain-name import behind a dead default), neurons carried, and the step result reports the new stack',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'apply', variant: 'stackrewrite', probe: 'variant' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the stack-rewrite probe failed to answer', [{ op: 'legacy', task: 'apply', variant: 'stackrewrite', probe: 'variant' }]);
        if (r.missed) return rowErr(`the stack rewrite missed: ${r.missed}`, [{ op: 'legacy', task: 'apply', variant: 'stackrewrite', probe: 'variant' }]);
        return { verdict: 'REFUSED', detail: 'stack rewritten to the chosen name, neurons carried, the step result reports the synthesized stack', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-multibrain-files-win',
      description: 'existing multibrain files win over same-named flat files (no clobber of a LIVE identity), and the result names its skipped-existing count',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'apply', variant: 'mbwin', probe: 'variant' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the multibrain-wins probe failed to answer', [{ op: 'legacy', task: 'apply', variant: 'mbwin', probe: 'variant' }]);
        if (r.missed) return rowErr(`the existing-wins walk missed: ${r.missed}`, [{ op: 'legacy', task: 'apply', variant: 'mbwin', probe: 'variant' }]);
        if (!r.noClobber) return rowErr('the LIVE identity was clobbered by flat import content', [{ op: 'legacy', task: 'apply', variant: 'mbwin', probe: 'variant' }]);
        return { verdict: 'REFUSED', detail: 'LIVE identity intact, skippedExisting counted by the result', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-symlink-wall',
      description: 'the import walker does not follow symlinks out of models/: an outside canary stays byte-intact, the legit import still lands, and the step self-verifies',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'apply', variant: 'symlink', probe: 'variant' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the symlink-walk probe failed to answer', [{ op: 'legacy', task: 'apply', variant: 'symlink', probe: 'variant' }]);
        if (r.missed) return rowErr(`the symlink walk missed: ${r.missed}`, [{ op: 'legacy', task: 'apply', variant: 'symlink', probe: 'variant' }]);
        if (!r.canaryIntact) return rowErr('the outside canary was TOUCHED - deletes must never route out of models/', [{ op: 'legacy', task: 'apply', variant: 'symlink', probe: 'variant' }]);
        return { verdict: 'REFUSED', detail: 'outside canary untouched, legit import landed, step self-verified', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-unverified-withholds',
      description: 'a failed verification withholds the marker: sabotaged verify leaves ok=false, failedVerify=true, marker null - a failed migration is RETRYABLE, never sealed',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'apply', variant: 'sabotage', probe: 'variant' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the sabotage probe failed to answer', [{ op: 'legacy', task: 'apply', variant: 'sabotage', probe: 'variant' }]);
        if (r.missed) return rowErr(`the withhold walk missed: ${r.missed}`, [{ op: 'legacy', task: 'apply', variant: 'sabotage', probe: 'variant' }]);
        return { verdict: 'REFUSED', detail: 'failed verify -> ok:false + failedVerify:true + marker null - retryable, never sealed', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-cli-status-and-fail-exit',
      description: 'the CLI tells the truth by exit code: migrate --status announces the old-style brain (exit 0) and a sabotaged apply exits 1 naming could not verify',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'clifail' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the CLI fail-surface probe failed to answer', [{ op: 'legacy', task: 'clifail' }]);
        if (!r.statusNotice || !r.statusExit0) return rowErr('migrate --status did not announce the old-style brain (note=' + JSON.stringify(r.statusNotice) + ' exit0=' + JSON.stringify(r.statusExit0) + ')', [{ op: 'legacy', task: 'clifail' }]);
        if (!r.failExit1 || !r.failSaysVerify) return rowErr(`the failed apply exited ${JSON.stringify(r.failExit1)} said-verify ${JSON.stringify(r.failSaysVerify)} - a failed import must exit 1 naming why`, [{ op: 'legacy', task: 'clifail' }]);
        return { verdict: 'REFUSED', detail: 'status loud with exit 0; failed apply exit 1 with the could-not-verify reason', tookRequests: 1 };
      },
    },

    {
      name: 'migrations-health-checkmigration',
      description: 'health warns on the legacy tree and goes silent after the migrate: OLD-STYLE BRAIN before, absent after, both exits 0',
      async run(harness) {
        const ride = await probeMigration(harness, [{ op: 'legacy', task: 'healthmig' }]);
        if (!ride) return rowSkip('migration-fixture not armed');
        const r = ride.get('legacy');
        if (!r) return rowErr('the health probe failed to answer', [{ op: 'legacy', task: 'healthmig' }]);
        if (r.warnBefore !== true) return rowErr('health stayed silent on a legacy tree - the tripwire must warn BEFORE', [{ op: 'legacy', task: 'healthmig' }]);
        if (r.warnAfter !== false) return rowErr('health still warns the OLD-STYLE banner after a sealed migration', [{ op: 'legacy', task: 'healthmig' }]);
        if (r.bothExit0 !== true) return rowErr('health exits non-zero in the walk - the notice is a warning, not a failure', [{ op: 'legacy', task: 'healthmig' }]);
        return { verdict: 'REFUSED', detail: 'warns before, silent after, both exits 0', tookRequests: 1 };
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
