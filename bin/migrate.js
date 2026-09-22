#!/usr/bin/env node
/**
 * Vant Migrate CLI — brain layout versioning (prd-storage.md migration tool)
 *
 * Usage:
 *   vant migrate --status     Show layout version + pending migrations
 *   vant migrate --dry-run    Preview what would move (no changes)
 *   vant migrate              Apply pending migrations in order
 *
 * The layout version records WHERE brain data lives (multibrain dirs,
 * brain-scoped orgchart stores, tmp-space anchoring) — distinct from the
 * package version. Every step is idempotent; detection is content-based
 * so the marker alone is never trusted.
 */

const args = process.argv.slice(2);

const migrations = require('../lib/migrations');

async function main() {
    // No args = RUN migrations (the common path — and what `vant start`
    // invokes). Help only on explicit -h/--help; a bare `vant migrate`
    // printing usage instead of migrating was an auto-run trap: start's
    // invocation silently did nothing while exiting 0.
    if (args.includes('-h') || args.includes('--help')) {
        console.log(`
Vant Migrate — brain layout versioning

Usage:
  vant migrate --status             Show layout version + pending migrations
  vant migrate --dry-run            Preview what would move (no changes)
  vant migrate                      Apply pending migrations in order
  vant migrate --brain-name <name>  Name the imported brain (legacy import; default: vant)

Layout target: v${migrations.LAYOUT_VERSION}
`);
        process.exit(0);
    }

    const status = migrations.status();
    if (args.includes('--status')) {
        console.log('Brain layout status:');
        console.log('  marker version:', status.markerVersion === null ? '(none)' : 'v' + status.markerVersion);
        console.log('  target version: v' + status.targetVersion);
        if (status.upToDate) {
            console.log('  ✓ up to date');
        } else {
            console.log('  pending:');
            for (const p of status.pending) {
                console.log(`    - ${p.id}: ${p.description}`);
                for (const e of p.evidence) console.log(`        evidence: ${e}`);
            }
            // Loud legacy notice: --status is the user-facing diagnostic and
            // should TELL them what to do, not just list a step id.
            const legacy = status.pending.find(p => p.id === 'legacy.multibrain-import');
            if (legacy) {
                console.log('');
                console.log('  ⚠  OLD-STYLE BRAIN DETECTED (pre-multi-brain layout).');
                console.log('     Run `vant migrate` to import it — your brain is not');
                console.log('     visible to the current loader until migrated.');
                console.log('     Name it: `vant migrate --brain-name <name>` (default: vant).');
            }
        }
        process.exit(0);
    }

    const dryRun = args.includes('--dry-run') || args.includes('-d');

    // --brain-name <name>: names the brain for the legacy.multibrain-import
    // step (pre-multibrain single-public-brain layouts). Validated downstream
    // by migrations._validBrainName; invalid names fall back to 'vant'.
    const nameIdx = args.indexOf('--brain-name');
    const brainName = nameIdx !== -1 && args[nameIdx + 1] ? args[nameIdx + 1] : undefined;
    const result = await migrations.migrate({ dryRun, brainName });

    if (result.applied.length === 0) {
        console.log('✓ Nothing to migrate — layout is up to date.');
        process.exit(0);
    }

    if (dryRun) {
        console.log('[DRY-RUN] Would apply:\n');
        for (const a of result.applied) {
            console.log(`  ${a.id}`);
            for (const mv of (a.plan || [])) {
                console.log(`    ${mv.from || '(new)'} → ${mv.to}`);
            }
        }
        console.log('\nNo changes made. Run `vant migrate` to apply.');
        process.exit(0);
    }

    console.log('Applying migrations:\n');
    for (const a of result.applied) {
        console.log(`  ✓ ${a.id} ${JSON.stringify(a.result || {})}`);
    }
    if (result.failedVerify) {
        // Migration RAN but could not verify the brain is readable — treat
        // as failure so users (and start's banner logic) don't celebrate a
        // broken import. Marker was withheld; next run retries.
        console.log('\n❌ Migration ran but could not verify the imported brain is readable.');
        console.log('   Your brain content was moved; the layout was NOT marked migrated.');
        console.log('   Inspect models/{public,private}/<name>/ and re-run `vant migrate`.');
        if (process.env.DEBUG) console.error(JSON.stringify(result, null, 2));
        process.exit(1);
    }
    console.log(`\n✓ Layout at v${migrations.LAYOUT_VERSION}. Run \`vant migrate --status\` to verify.`);
    process.exit(0);
}

main().catch(e => {
    console.error('❌ Migrate failed:', e.message);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
});
