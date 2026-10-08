#!/usr/bin/env node
/**
 * Fiction-signature gate (pass 153).
 *
 * The wrong-claims that this project has actually caught in docs, help
 * text, and the lander — repeatedly — are now gates, not memories:
 *
 *   1. `npm install -g vant`   — the vant npm package is an unrelated
 *                                 Vue UI library (caught 4x: docs x9,
 *                                 README, lander x2, and origin PRD)
 *   2. "max 4 agents"          — folklore with no enforcing code; the
 *                                 real quota is dynamic (_getMaxAgents,
 *                                 agents.maxAgents default 10)
 *   3. lib/framework.js        — deleted module still described as live
 *   4. lib/notifications.js    — never existed; phantom module
 *   5. VantRetryableError      — phantom error class (retryable is an
 *                                 option on VantError)
 *   6. vant.loadBrain(         — removed 0.8.6 alias for read()/loadCorpus()
 *   7. vant.use(               — phantom plugin loader (real surface: islands)
 *   8. 0.8.7                   — no such release exists (current: 0.8.6);
 *                                 caught twice — forward-dated feature
 *                                 claims and a CHANGELOG section with a
 *                                 "max 4" row hiding inside it
 *   9. (v0.9.0…) headers       — owner call (pass 155): EVERYTHING ships
 *                                 as 0.8.6; axolotl work lands early but
 *                                 is never branded 0.9.0. 84+ refs were
 *                                 converted; this guards the pattern.
 *
 * SCOPE: every tracked text file EXCEPT the allow-list below. Allowed:
 *   - scripts/check-fiction-signatures.js (this file: the signatures)
 *   - labs/archives/**                    (point-in-time records by design)
 *   - labs/TASKS.md, labs/MEM.md          (the crew ledger QUOTES fiction
 *                                          when it fixes it — quotes are
 *                                          the job, not a regression)
 *   - CHANGELOG.md                        (historical release records)
 *   - package-lock.json / node_modules / .git (not prose)
 *
 * Add a signature here the moment a fiction is caught twice. Exit 1 on
 * any hit outside the allow-list.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// signature: [regex, human explanation]
const SIGNATURES = [
    [/npm\s+install\s+(-g|--global)\s+vant/i,
     'the vant npm package is an unrelated Vue UI library (install = clone + npm ci)'],
    [/max\s+4\s+agents|up\s+to\s+4\s+(concurrent\s+)?agents|4\s+agents\s+max|\(you\s+\+\s+3\s+coworkers\)|you\s+\+\s+3\s+workers/i,
     'the "max 4 agents" folklore — real quota is dynamic: agents.maxAgents, default 10 (lib/agents/core.js _getMaxAgents)'],
    [/lib\/framework\.js/i,
     'lib/framework.js was deleted — do not describe it as a live module'],
    [/lib\/notifications\.js|require\(['"]\.\/lib\/notifications/i,
     'lib/notifications.js never existed — real surfaces: Telegram bot, events, webhooks'],
    [/VantRetryableError/,
     'no VantRetryableError class — retryability is the retryable option on VantError'],
    [/vant\.loadBrain\s*\(|brain\.loadBrain\s*\(/,
     'brain.loadBrain() was removed in 0.8.6 — use brain.read() / brain.loadCorpus()'],
    [/vant\.use\s*\(|require\(['"]vant\/plugins/i,
     'no plugin loader — the extensibility surface is islands (docs/essential/islands)'],
    [/\b0\.8\.7\b/,
     'no 0.8.7 release exists — current is 0.8.6; never date features to 0.8.7'],
    [/\(v0\.9\.0(-axolotl|-exp)?\)|^version:\s*['"]?v?0\.9\.0(-axolotl)?/m,
     'nothing is 0.9.0 — owner call: everything ships as 0.8.6 (axolotl work included); use 0.8.6 in headers and frontmatter'],
];

// path is relative to ROOT; return true to skip the file
function allowListed(rel) {
    if (rel === 'scripts/check-fiction-signatures.js') return true;
    if (/^scripts\/check-.*\.js$/.test(rel)) return true; // gates may quote signatures in their own checks/messages
    if (rel.startsWith('labs/archives/')) return true;
    if (rel === 'labs/TASKS.md' || rel === 'labs/MEM.md') return true;
    if (rel.startsWith('models/private/')) return true; // private brain learnings QUOTE fiction to debunk it
    if (rel.startsWith('.migration-fixture/')) return true; // gitignored pre-multi-brain test fixture, point-in-time by design
    if (rel === 'CHANGELOG.md') return true;
    if (rel === 'package-lock.json') return true;
    if (rel.startsWith('node_modules/') || rel.startsWith('.git/')) return true;
    return false;
}

// A line that DEBUNKS a signature ("There is no VantRetryableError",
// "lib/notifications.js does not exist", an Errata block) is doing the
// gate's job in prose - not a regression. Skip those lines.
const NEGATION = /there is no\b|does not exist|never existed|no built-in|removed in 0\.8\.6|was deleted|originally said|errata|folklore|no enforcing code|never fires/i;

// text extensions worth scanning; anything else is binary/not prose
const TEXT_EXT = new Set(['.md', '.js', '.mjs', '.cjs', '.ts', '.html', '.json',
    '.yml', '.yaml', '.txt', '.ini', '.sh', '.css', '.rb']);

const hits = [];
let scanned = 0;
(function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = dir + '/' + f.name;
        const rel = path.relative(ROOT, p);
        if (f.isDirectory()) { walk(p); continue; }
        if (allowListed(rel)) continue;
        if (!TEXT_EXT.has(path.extname(f.name))) continue;
        let text;
        try { text = fs.readFileSync(p, 'utf8'); } catch (e) { continue; }
        scanned++;
        const lines = text.split('\n');
        for (const [re, why] of SIGNATURES) {
            let hitLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (re.test(lines[i])) { hitLine = i; break; }
            }
            if (hitLine === -1) continue;
            const line = lines[hitLine];
            // debunk check spans the hit line AND the one before it -
            // negations often wrap ("there is no X ... separate class")
            const context = (lines[hitLine - 1] || '') + '\n' + line;
            if (NEGATION.test(context)) continue; // debunk line, not a regression
            hits.push(`${rel}:${hitLine + 1}: "${line.trim().slice(0, 120)}" — ${why}`);
        }
    }
})(ROOT);

if (hits.length) {
    console.error(`FICTION SIGNATURES: FAIL (${hits.length} hit${hits.length === 1 ? '' : 's'} in ${scanned} files)`);
    for (const h of hits) console.error('  ' + h);
    console.error('  (fix the text, or if the signature is stale, update the signature here AND the ledger)');
    process.exit(1);
}
console.log(`FICTION SIGNATURES: PASS (${scanned} files scanned, ${SIGNATURES.length} signatures)`);
