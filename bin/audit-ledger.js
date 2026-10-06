#!/usr/bin/env node
/**
 * Vant Audit Ledger Inspector (pass 118, post-PRD #6a)
 *
 * The pass-113 ledger cap rotates trimmed entries into
 * models/audit-rotate/audit-<ts>.json (BARE JSON ARRAYS). This CLI makes
 * that archive queryable; every field it prints comes from lib/audit.js
 * listArchives()/readArchive() — nothing invented.
 *
 * USAGE:
 *   vant audit-ledger                  # list archives (summary table)
 *   vant audit-ledger --all            # dump every archived entry (JSON)
 *   vant audit-ledger <file>           # dump one archive, e.g. audit-1770.json
 *   vant audit-ledger --action <name>  # filter by action substring (with --all)
 *   vant audit-ledger --limit N        # newest N of the match set
 *   vant audit-ledger --json           # machine-readable list output
 */

const args = process.argv.slice(2);
const audit = require('../lib/audit');

if (args.includes('-h') || args.includes('--help')) {
    console.log(`
Vant Audit Ledger Inspector — models/audit-rotate/ archive (pass 118)

Usage:
  vant audit-ledger                  List archives (summary)
  vant audit-ledger --all            Dump all archived entries (JSON array)
  vant audit-ledger <audit-N.json>   Dump one archive (JSON array)
  vant audit-ledger --all --action fatal --limit 20
                                     Filter + newest-N

Read-only. Every field comes from audit.listArchives()/readArchive().
`);
    process.exit(0);
}

try {
    const fileArg = args.find(a => /^audit-\d+\.json$/.test(a));
    // (pass 118) An explicit non-flag arg that is NOT a valid archive name
    // is a caller error, not a request to list — fail loudly (E_INVALID_ARCHIVE)
    // instead of silently listing (a bare arg must never be ignored).
    const stray = args.find(a => !a.startsWith('-') && a !== fileArg
        && !/^\d+$/.test(a) // --limit value
        && !(args[args.indexOf(a) - 1] === '--action'));
    if (stray) {
        throw Object.assign(new Error('invalid archive name: ' + stray), { code: 'E_INVALID_ARCHIVE' });
    }
    const actionIdx = args.indexOf('--action');
    const action = actionIdx !== -1 && args[actionIdx + 1] ? args[actionIdx + 1] : null;
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx !== -1 && Number(args[limitIdx + 1]) > 0 ? Number(args[limitIdx + 1]) : null;
    const wantAll = args.includes('--all');
    const jsonOut = args.includes('--json');

    if (fileArg || wantAll) {
        const { entries, total } = audit.readArchive(fileArg, { action, limit });
        console.log(JSON.stringify({ file: fileArg || null, total, returned: entries.length, entries }, null, 2));
        process.exit(0);
    }

    const archives = audit.listArchives();
    if (archives.length === 0) {
        console.log('No audit archives (models/audit-rotate/ is empty or absent).');
        process.exit(0);
    }
    if (jsonOut) {
        console.log(JSON.stringify(archives, null, 2));
        process.exit(0);
    }
    console.log('Audit ledger archives (models/audit-rotate/):\n');
    let totalEntries = 0, totalBytes = 0;
    for (const a of archives) {
        totalEntries += a.entries > 0 ? a.entries : 0;
        totalBytes += a.bytes;
        if (a.entries < 0) {
            console.log(`  ${a.file}  UNREADABLE (${a.error})`);
        } else {
            console.log(`  ${a.file}  ${a.entries} entries  ${(a.bytes / 1024).toFixed(1)} KB  ${a.first || '?'} → ${a.last || '?'}`);
        }
    }
    console.log(`\n  total: ${archives.length} archive(s), ${totalEntries} entries, ${(totalBytes / 1024).toFixed(1)} KB`);
    process.exit(0);
} catch (e) {
    console.error('audit-ledger: ' + e.message);
    process.exit(e.code === 'E_INVALID_ARCHIVE' ? 2 : 1);
}
