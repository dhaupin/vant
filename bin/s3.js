#!/usr/bin/env node
/**
 * Vant S3 CLI — remote storage connectors (prd-storage)
 *
 * Usage:
 *   vant s3 --status                       Show config summary (no secrets)
 *   vant s3 --test                         Connectivity probe (put/get/delete round-trip)
 *   vant s3 --ls [prefix]                  List remote keys (recursive)
 *   vant s3 --push [--dry-run]             Push local models tree → remote
 *   vant s3 --pull [--dry-run]             Pull remote keys → local models tree
 *
 * Config: VANT_REMOTE_PROVIDER (s3|r2|minio|b2), VANT_REMOTE_BUCKET,
 * VANT_REMOTE_REGION, VANT_REMOTE_KEY, VANT_REMOTE_SECRET,
 * VANT_REMOTE_PREFIX, VANT_REMOTE_ENDPOINT — or pass options to
 * getStorage('remote', {...}) programmatically.
 *
 * SAFE BY DEFAULT: --push/--pull refuse to run without the models write
 * gate (push also writes remote; pull overwrites local files). --ls and
 * --status are read-only; --test writes/deletes only its own probe key.
 */

const path = require('path');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argAfter = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

if (has('-h') || has('--help') || args.length === 0) {
    console.log(`Vant Remote — S3-compatible storage connectors (S3 / R2 / MinIO / B2)

Usage:
  vant s3 --status               Config summary (no secrets printed)
  vant s3 --test                 Connectivity probe (round-trip on a probe key)
  vant s3 --ls [prefix]          List remote keys (recursive)
  vant s3 --push [--dry-run]     Push local models tree → remote
  vant s3 --pull [--dry-run]     Pull remote keys → local models tree

Config (env or constructor options):
  VANT_REMOTE_PROVIDER   s3 | r2 | minio | b2        (default s3)
  VANT_REMOTE_BUCKET     bucket name                 (required)
  VANT_REMOTE_REGION     region / account / endpoint id (required for b2/r2)
  VANT_REMOTE_KEY        access key id               (required)
  VANT_REMOTE_SECRET     secret access key           (required)
  VANT_REMOTE_PREFIX     key prefix for every op     (optional)
  VANT_REMOTE_ENDPOINT   full URL override (self-hosted S3 API) (optional)`);
    process.exit(0);
}

const mod = require('../lib/storage');

function getStore() {
    const store = mod.get('remote', {});
    if (!store.remoteStatus().configured) {
        console.error('❌ remote storage not configured — set VANT_REMOTE_BUCKET, VANT_REMOTE_KEY, VANT_REMOTE_SECRET (and provider/region as needed).');
        process.exit(1);
    }
    return store;
}

async function main() {
    if (has('--status')) {
        const st = getStore().remoteStatus();
        console.log('Remote storage: ' + st.basePath);
        console.log('  provider: ' + st.provider + (st.endpoint ? ' (endpoint override)' : ''));
        console.log('  bucket:   ' + st.bucket);
        if (st.region) console.log('  region:   ' + st.region);
        if (st.prefix) console.log('  prefix:   ' + st.prefix);
        console.log('  configured: yes');
        process.exit(0);
    }

    if (has('--test')) {
        const store = getStore();
        console.log('Probing ' + store.basePath + ' ...');
        const r = await store._getClient().test();
        if (r.ok) {
            console.log('  ✓ connectivity OK (put/get/delete round-trip)');
            process.exit(0);
        }
        console.error('  ✗ probe failed: ' + r.error);
        process.exit(1);
    }

    if (has('--ls')) {
        const store = getStore();
        const prefix = argAfter('--ls') || '';
        const keys = await store.list(prefix);
        if (!keys.length) {
            console.log('No keys under "' + (prefix || store.basePath) + '"');
            process.exit(0);
        }
        for (const k of keys) console.log(k);
        console.log('(' + keys.length + ' keys)');
        process.exit(0);
    }

    if (has('--push') || has('--pull')) {
        const store = getStore();
        const local = mod.get('file', { basePath: path.resolve(__dirname, '..', 'models') });
        const dir = has('--push') ? 'push' : 'pull';

        // Write gate: push writes remote via store.write (gate inside), pull
        // writes local files through FileStorage.write (gate inside). Both
        // fail loudly when the sandbox denies canWrite — checked up front so
        // the refusal happens before any transfer starts.
        try {
            await local.write('.remote-cli-gate-probe', 'gate');
            local.delete('.remote-cli-gate-probe');
        } catch (e) {
            console.error('❌ write gate refused (' + dir + '): ' + e.message);
            process.exit(1);
        }

        const dry = has('--dry-run');
        if (dry) console.log('DRY RUN — no data will be transferred');
        const r = dir === 'push'
            ? await store.pushFrom(local, { dryRun: dry })
            : await store.pullTo(local, { dryRun: dry });
        const verb = dir === 'push' ? 'pushed' : 'pulled';
        console.log(dir + ' complete: ' + r[verb] + ' ' + verb +
            ', ' + r.skipped + ' skipped, ' + r.errors + ' errors' +
            (dry ? ' (dry run)' : ''));
        process.exit(r.errors > 0 ? 1 : 0);
    }

    console.error('Unknown option — try vant s3 --help');
    process.exit(1);
}

main().catch(e => {
    console.error('❌ ' + e.message);
    process.exit(1);
});
