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
    if (args.includes('-h') || args.includes('--help') || args.length === 0) {
        console.log(`
Vant Migrate — brain layout versioning

Usage:
  vant migrate --status     Show layout version + pending migrations
  vant migrate --dry-run    Preview what would move (no changes)
  vant migrate              Apply pending migrations in order

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
        }
        process.exit(0);
    }

    const dryRun = args.includes('--dry-run') || args.includes('-d');
    const result = await migrations.migrate({ dryRun });

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
    console.log(`\n✓ Layout at v${migrations.LAYOUT_VERSION}. Run \`vant migrate --status\` to verify.`);
    process.exit(0);
}

main().catch(e => {
    console.error('❌ Migrate failed:', e.message);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
});
