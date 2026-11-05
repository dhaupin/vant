// packs/public/vant-verdict-surfaces/index.mjs - the allow/deny VERDICT
// surfaces, in their own home.
//
// The round-9 audit (vant PR #330) found one bug class in three places: a
// surface classifies an operation WORD against a small hardcoded list and
// falls back to the LOOSER class. Each is a GATE whose verdict reads
// ALLOWED for a word it never heard of - the opposite of the house's own
// "unknown = write" law (lib/guests.js classifyTool). The fix is pinned in
// tests/rls-op-classification.test.js; this pack is the honest HOME for the
// class and the packstruct census counts it.
//
// The rows drive the REAL operator door (bin/vant.js <surface>) - the CLI is
// the surface a person (or a script) actually reads the verdict from, and
// the pre-fix defects were CLI-visible (exit codes included). Two rows also
// drive the LAYER helpers (lib/rls.js, lib/system.js) in-process so the
// classification law is measured on its own.
//
// Zero sockets: every CLI row is an in-process child spawn of the real bin
// (the vant-carriers bin/traveler precedent). ROOT is derived from this
// file's own location so the bin is the REPO's bin, while cwd stays the
// harness sandbox - the RLS decision resolves the throwaway models/ tree,
// never the workspace's.

const path = (await import('node:path')).default;
const { execFileSync } = await import('node:child_process');
const { fileURLToPath } = await import('node:url');

// <repo>/packs/public/vant-verdict-surfaces/index.mjs -> <repo>
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VANT_BIN = path.join(ROOT, 'bin', 'vant.js');

// The read canon and the explicit write vocabulary the doors must agree on.
const READ_WORDS = ['read', 'get', 'list', 'status', 'info', 'inspect', 'health', 'whoami'];
const WRITE_WORDS = ['write', 'delete', 'update', 'commit', 'set', 'mint', 'grant', 'revoke', 'assign', 'spawn', 'record', 'issue'];
const EXPLICIT_WRITE = ['write', 'delete', 'update', 'commit'];

async function loadLib(relPath) {
  const { pathToFileURL } = await import('node:url');
  const ns = await import(pathToFileURL(path.resolve(process.cwd(), relPath)).href);
  return ns.default || ns;
}

function verdictOf(out) {
  if (/\bALLOWED\b/.test(out)) return 'ALLOWED';
  if (/\bDENIED\b/.test(out)) return 'DENIED';
  return null;
}

// Drive the REAL CLI against the sandbox cwd. The bin resolves its lib tree
// from its own location (the repo); the RLS decision reads cwd's models/.
function runCli(argv) {
  try {
    const out = execFileSync('node', [VANT_BIN, ...argv], {
      cwd: process.cwd(),
      timeout: 30000,
      encoding: 'utf8',
      env: { ...process.env, VANT_GATE_QUIET: '1' },
    });
    const s = String(out || '');
    return { code: 0, out: s, verdict: verdictOf(s), usage: /Usage:/i.test(s) };
  } catch (e) {
    const out = String((e && (e.stdout || '')) || '') + String((e && (e.stderr || '')) || '');
    return { code: typeof e.status === 'number' ? e.status : 1, out, verdict: verdictOf(out), usage: /Usage:/i.test(out) };
  }
}

export default {
  name: 'vant-verdict-surfaces',
  description:
    'the allow/deny VERDICT surfaces: each operator door (vant rls allow, vant system allow, vant habitat can) classifies an operation WORD and answers ALLOWED/DENIED, and each once failed OPEN by mapping an unclassified word to the LOOSER class. An unclassified write verb, an unknown word and a typo must all REFUSE, while the read canon and the explicit write verbs keep their verdict; the layer helpers (lib/rls.js, lib/system.js isOperationAllowed) are pinned on their own too',

  attacks: [
    // ---------- R9-1: vant rls allow ----------
    {
      name: 'rls-unclassified-write-verb-refuses',
      description:
        'vant rls allow <op>: an UNLISTED write verb (grant) is a WRITE, not a read — pre-fix the 5-word list mapped it to the LOOSER read policy and printed ALLOWED while the identical write verb delete printed DENIED',
      async run() {
        const r = runCli(['rls', 'allow', 'grant', '_brain:identity']);
        if (r.verdict === 'ALLOWED') {
          return { verdict: 'EXPLOITED', detail: 'an unclassified write verb (grant) printed ALLOWED — the gate fell back to the LOOSER read class', tookRequests: 1 };
        }
        if (r.verdict !== 'DENIED' || r.code === 0) {
          return { verdict: 'EXPLOITED', detail: 'rls allow grant did not refuse with a non-zero exit: ' + JSON.stringify(r).slice(0, 140), tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'an unlisted write verb is classified write and refused (exit ' + r.code + ')', tookRequests: 1 };
      },
    },
    {
      name: 'rls-typo-refuses',
      description:
        'vant rls allow <typo>: an unknown word (raed) is not silently a read — pre-fix every unlisted word resolved to the read policy and printed ALLOWED',
      async run() {
        const r = runCli(['rls', 'allow', 'raed', '_brain:identity']);
        if (r.verdict !== 'DENIED') {
          return { verdict: 'EXPLOITED', detail: 'a typo (raed) was not refused: ' + JSON.stringify(r.verdict || r.out || '').slice(0, 120), tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'an unknown op word refuses (fail-closed), never the looser read class', tookRequests: 1 };
      },
    },
    {
      name: 'rls-read-canon-holds',
      description:
        'the read canon is NOT over-tightened: a genuine read word still answers ALLOWED for an anonymous context on a default-policy resource',
      async run() {
        const r = runCli(['rls', 'allow', 'read', '_brain:identity']);
        if (r.verdict !== 'ALLOWED') {
          return { verdict: 'EXPLOITED', detail: 'a real read word no longer passes: ' + JSON.stringify(r.verdict || r.out || '').slice(0, 120), tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'the read canon keeps its verdict (the fix did not over-reach)', tookRequests: 1 };
      },
    },

    // ---------- R9-2: vant system allow ----------
    {
      name: 'system-unknown-word-refuses',
      description:
        'vant system allow <op>: an unknown word must answer DENIED with a non-zero exit — pre-fix the stub returned {allowed:true} for ANY string and the CLI truthy-tested the OBJECT, so a bogus word printed ALLOWED, exit 0',
      async run() {
        const r = runCli(['system', 'allow', 'totally-bogus-op']);
        if (r.verdict !== 'DENIED') {
          return { verdict: 'EXPLOITED', detail: 'an unknown word was not refused: ' + JSON.stringify(r.verdict || r.out || '').slice(0, 120), tookRequests: 1 };
        }
        if (r.code === 0) {
          return { verdict: 'EXPLOITED', detail: 'an unknown word answered DENIED but exited 0 (a script would read success)', tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'an unknown word refuses with a non-zero exit (exit ' + r.code + ')', tookRequests: 1 };
      },
    },
    {
      name: 'system-write-verb-holds',
      description:
        'the known vocabulary is not over-tightened: a real write verb still answers ALLOWED with exit 0',
      async run() {
        const r = runCli(['system', 'allow', 'write']);
        if (r.verdict !== 'ALLOWED' || r.code !== 0) {
          return { verdict: 'EXPLOITED', detail: 'a known write verb no longer passes: ' + JSON.stringify(r).slice(0, 140), tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'a known write verb keeps its verdict and exit code', tookRequests: 1 };
      },
    },

    // ---------- R9-3: vant habitat can ----------
    {
      name: 'habitat-write-verb-as-mode-refuses',
      description:
        'vant habitat can <mode> <resource> <user>: the mode is read|write ONLY — pre-fix the guard coerced `mode === "write" ? "write" : "read"`, so a WRITE verb passed as the mode (delete) answered against the LOOSER read policy and printed ALLOWED',
      async run() {
        const r = runCli(['habitat', 'can', 'delete', '_brain:identity', 'nobody']);
        if (!r.usage) {
          return { verdict: 'EXPLOITED', detail: 'a write verb as the mode word was accepted (no usage error): verdict=' + JSON.stringify(r.verdict), tookRequests: 1 };
        }
        if (r.verdict === 'ALLOWED') {
          return { verdict: 'EXPLOITED', detail: 'a write verb as the mode printed ALLOWED', tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'a non-read|write mode word is a usage error, never a silent read downgrade', tookRequests: 1 };
      },
    },
    {
      name: 'habitat-unknown-mode-refuses',
      description:
        'an unknown mode word (garbage) is a usage error — pre-fix it coerced to read and printed ALLOWED',
      async run() {
        const r = runCli(['habitat', 'can', 'garbage', '_brain:identity', 'nobody']);
        if (!r.usage || r.verdict === 'ALLOWED') {
          return { verdict: 'EXPLOITED', detail: 'an unknown mode word was not rejected: usage=' + r.usage + ' verdict=' + JSON.stringify(r.verdict), tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'an unknown mode word is a usage error', tookRequests: 1 };
      },
    },
    {
      name: 'habitat-read-mode-holds',
      description:
        'a valid mode (read) is still accepted and answers a real verdict — the mode guard did not over-reach onto the legitimate read|write modes',
      async run() {
        const r = runCli(['habitat', 'can', 'read', '_brain:identity', 'nobody']);
        if (r.usage) {
          return { verdict: 'EXPLOITED', detail: 'a valid read mode was rejected as a usage error (over-tightening)', tookRequests: 1 };
        }
        if (r.verdict !== 'ALLOWED' && r.verdict !== 'DENIED') {
          return { verdict: 'EXPLOITED', detail: 'a valid mode produced no verdict: ' + JSON.stringify(r.out || '').slice(0, 120), tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'a valid mode is accepted and answers ' + r.verdict, tookRequests: 1 };
      },
    },

    // ---------- the LAYER helpers, in-process ----------
    {
      name: 'layer-rls-op-never-looser-class',
      description:
        'lib/rls.js isOperationAllowed(op): EVERY unlisted word (write verbs + a typo + empty) must resolve the WRITE policy, and the read canon must resolve READ — the classification is fail-closed on the verb, not fail-open',
      async run() {
        const rls = await loadLib('lib/rls.js');
        const leaked = [];
        for (const op of [...WRITE_WORDS.filter((w) => !EXPLICIT_WRITE.includes(w)), 'raed', 'wrtie', '']) {
          const allowed = await rls.isOperationAllowed(op, '_brain:identity', {});
          if (allowed !== false) leaked.push(op + '->ALLOWED');
        }
        if (leaked.length) {
          return { verdict: 'EXPLOITED', detail: 'unlisted words resolved the LOOSER read class: ' + leaked.join(', '), tookRequests: 1 };
        }
        const lost = [];
        for (const op of READ_WORDS) {
          const allowed = await rls.isOperationAllowed(op, '_brain:identity', {});
          if (allowed !== true) lost.push(op + '->DENIED');
        }
        if (lost.length) {
          return { verdict: 'EXPLOITED', detail: 'the read canon was over-tightened: ' + lost.join(', '), tookRequests: 2 };
        }
        return { verdict: 'REFUSED', detail: 'unlisted words are WRITE and the read canon is READ — the layer classification is fail-closed', tookRequests: 2 };
      },
    },
    {
      name: 'layer-system-op-refuses-unknown',
      description:
        'lib/system.js isOperationAllowed(op): the verdict OBJECT must carry allowed:false for an unknown word (pre-fix it was {allowed:true} for ANY string) and allowed:true for the known read/write vocabulary',
      async run() {
        const system = await loadLib('lib/system.js');
        for (const op of ['totally-bogus-op', 'raed', '']) {
          const v = system.isOperationAllowed(op);
          if (!(v && v.allowed === false)) {
            return { verdict: 'EXPLOITED', detail: 'an unknown word did not refuse: ' + JSON.stringify(v).slice(0, 100), tookRequests: 1 };
          }
        }
        for (const op of ['read', 'write', 'delete', 'status']) {
          const v = system.isOperationAllowed(op);
          if (!(v && v.allowed === true)) {
            return { verdict: 'EXPLOITED', detail: 'a known word was refused (over-tightening): ' + op + ' -> ' + JSON.stringify(v).slice(0, 100), tookRequests: 2 };
          }
        }
        return { verdict: 'REFUSED', detail: 'the layer verdict object refuses an unknown word and allows the known vocabulary', tookRequests: 2 };
      },
    },
  ],
};
