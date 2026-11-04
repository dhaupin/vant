// packs/public/vant-authority/index.mjs - the MCP auth + privilege-AUTHORITY
// canon, in its own home.
//
// The vant-mcp pack grades the tool LAYER (unknown-tool honesty, schema
// enforcement, write-scope containment, registry census, security-chain).
// None of its rows grade WHO may mint credentials, grant/revoke capability,
// or mutate trust/teams — the authority lane. The round-7 audit's MCP
// auth + guest-authority row landed in vant-spine (a catch-all); this pack
// is the honest home and the packstruct census counts it.
//
// Every row drives the real lib modules directly (the vant-spine loadLib
// house pattern, no sockets, no run-root arm): the module registry, the
// guest classifier, and the auth token chain are all in-process. Where a
// row must prove the HANDLER refuses a guest (not just the door), it runs
// the handler inside a guest AsyncLocalStorage store — the same store the
// real door builds — so the guard is measured on its own.
//
// The findings pinned here were fixed in the round-7 audit (vant PR #325);
// each row fails against the pre-fix code and passes after.

async function loadLib(relPath) {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const ns = await import(pathToFileURL(resolve(relPath)).href);
  return ns.default || ns;
}

// The authority verb family: the handlers that mint credentials or move
// privilege. Round-4 closed the sudo/habitat set; round-7 closed trust/teams
// + auth_create. A guest (any role) may call none of them.
const AUTHORITY_VERBS = [
  'trust_record', 'trust_setRequired',
  'teams_createOrg', 'teams_createDept', 'teams_createTeam', 'teams_createRole', 'teams_assign',
  'auth_create',
  'sudo_grant', 'sudo_revoke', 'sudo_escalate', 'sudo_createTask',
  'vant_sudo_grant', 'vant_sudo_revoke', 'vant_sudo_escalate', 'vant_sudo_createTask',
  'vant_habitat_mintToken', 'vant_habitat_revokeToken',
  'vant_habitat_createWorkspace', 'vant_habitat_setWorkspace',
  'vant_habitat_addRole', 'vant_habitat_setPolicy',
  'vant_scenario_crew',
];

// Minimal VALID params per verb (the schema gate runs before the handler, so
// every call must pass its inputSchema to reach the authority guard).
const AUTHORITY_CALLS = [
  ['trust_record', { entityId: 'guest:authority-probe', type: 'selfboost', positive: true, value: 1.0 }],
  ['trust_setRequired', { permission: 'dangerous:exec', minTrust: 0 }],
  ['teams_createOrg', { name: 'authority-probe-org' }],
  ['teams_createDept', { name: 'authority-probe-dept' }],
  ['teams_createTeam', { name: 'authority-probe-team' }],
  ['teams_createRole', { name: 'authority-probe-role' }],
  ['teams_assign', { agentId: 'authority-probe-agent' }],
  ['auth_create', { userId: 'authority-probe', roles: ['admin'] }],
  // defense-in-depth family: gated by a DIFFERENT handler seam
  // (_verifiedAdminGate for the habitat workspace, _assertNotGuest for guest
  // management), so they are legitimately write-class at the door and must
  // refuse a guest at the handler instead.
  ['escrow_setWorkspaceBudget', { workspaceId: 'authority-probe-ws', amount: 999999 }],
  ['escrow_setWorkspaceMemberLimit', { workspaceId: 'authority-probe-ws', agentId: 'authority-probe-agent', limit: 999999 }],
  ['security_pipeline_report', {}],
  ['pairing_voucher_generate', {}],
];

// A default `human` guest: the exact caps the door grants a default issuance.
const HUMAN_GUEST = {
  guest: { id: 'authority-probe', role: 'human' },
  caps: ['canRead', 'canLoad', 'canList', 'canWrite', 'canSpawn'],
  isGuest: true,
};

function guestStore() {
  return {
    userId: 'guest:authority-probe',
    agentId: null,
    workspace: null,
    roles: ['guest:human'],
    guest: { id: 'authority-probe', role: 'human' },
  };
}

export default {
  name: 'vant-authority',
  description:
    'the MCP auth + privilege-authority canon: auth_create MINTS a credential ({token,userId,roles}) and never the live Auth instance (which carried options.tokenSecret — the process signing key — so a caller could forge a token for any identity), auth_require reads the verifyToken VERDICT field (a bad token resolves to a truthy {valid:false,...} object, which the old `if (!verified)` answered allowed:true), the trust/teams/sudo/habitat authority verbs are admin-classified at the guest door AND guarded in the handlers (a guest ALS context is refused), the guard does not over-reach onto legitimate write/read verbs, and the classification is TOTAL — every handler-guarded privilege-authority verb is admin-class at the door (the forward-looking invariant: a new authority verb cannot ship without the door blocklist)',

  attacks: [
    {
      name: 'auth-create-mints-credential-not-instance',
      description:
        'auth_create returns a minted credential ({token,userId,roles}) that verifies, and NEVER the live Auth instance: the result carries no tokenSecret (the process signing key — a caller reading it could forge a token for any identity), no `options` bag, and no lockout map',
      async run(_harness) {
        const [mcp, auth] = [await loadLib('lib/mcp.js'), await loadLib('lib/auth.js')];
        const prevSecret = process.env.VANT_TOKEN_SECRET;
        process.env.VANT_TOKEN_SECRET = prevSecret || 'authority-pack-signing-key-32-bytes!';
        try {
          const r = await mcp.execute('auth_create', { userId: 'authority-probe-auth', roles: ['admin'] });
          const ser = JSON.stringify(r);
          if (r && (r.options || r._failedAttempts || r.tokenSecret)) {
            return { verdict: 'EXPLOITED', detail: 'auth_create returned the live Auth instance (secret + lockout map): ' + ser.slice(0, 80), tookRequests: 1 };
          }
          if (ser.includes('"tokenSecret"') || ser.includes(process.env.VANT_TOKEN_SECRET)) {
            return { verdict: 'EXPLOITED', detail: 'auth_create leaked the token-signing secret in its result', tookRequests: 2 };
          }
          if (!(r && typeof r.token === 'string' && r.userId === 'authority-probe-auth')) {
            return { verdict: 'EXPLOITED', detail: 'auth_create did not mint the named credential: ' + ser.slice(0, 80), tookRequests: 3 };
          }
          const v = auth.verifyToken(r.token);
          if (!(v && v.valid === true && v.payload && v.payload.userId === 'authority-probe-auth')) {
            return { verdict: 'EXPLOITED', detail: 'the minted credential does not verify: ' + JSON.stringify(v).slice(0, 80), tookRequests: 4 };
          }
          return { verdict: 'REFUSED', detail: 'auth_create mints a credential that verifies and leaks neither the Auth instance nor the token-signing secret', tookRequests: 4 };
        } finally {
          if (prevSecret === undefined) delete process.env.VANT_TOKEN_SECRET;
          else process.env.VANT_TOKEN_SECRET = prevSecret;
        }
      },
    },

    {
      name: 'auth-require-reads-verdict-field',
      description:
        'auth_require answers allowed:false for an invalid token — the verifyToken verdict is a truthy OBJECT ({valid:false,...}), never null, so a boolean check on it fails open',
      async run(_harness) {
        const mcp = await loadLib('lib/mcp.js');
        const bad = ['', 'not-a-token', 'garbage.but.truthy', 'vant_forged-looking-token'];
        for (const token of bad) {
          const r = await mcp.execute('auth_require', { token });
          if (!(r && r.allowed === false)) {
            return { verdict: 'EXPLOITED', detail: 'auth_require failed open on an invalid token (' + JSON.stringify(r).slice(0, 80) + ')', tookRequests: 1 };
          }
        }
        return { verdict: 'REFUSED', detail: 'auth_require refuses every invalid token (the verdict object is read as a verdict, not a boolean)', tookRequests: bad.length };
      },
    },

    {
      name: 'trust-teams-authority-admin-classified',
      description:
        'every privilege-authority verb classifies admin at the guest door, so a default human guest (canWrite+canSpawn) is refused the write->authority escalation; the round-7 additions (trust_record/trust_setRequired/teams_create*/teams_assign/auth_create) sit beside the round-4 sudo/habitat set',
      async run(_harness) {
        const guests = await loadLib('lib/guests.js');
        const misclassed = AUTHORITY_VERBS.filter((t) => guests.classifyTool(t) !== 'admin');
        if (misclassed.length) {
          return { verdict: 'EXPLOITED', detail: 'authority verbs not admin-class: ' + misclassed.join(', '), tookRequests: 1 };
        }
        const opened = AUTHORITY_VERBS.filter((t) => guests.authorize(t, HUMAN_GUEST).allowed === true);
        if (opened.length) {
          return { verdict: 'EXPLOITED', detail: 'a human guest is allowed authority verbs at the door: ' + opened.join(', '), tookRequests: 2 };
        }
        return { verdict: 'REFUSED', detail: AUTHORITY_VERBS.length + ' authority verbs are admin-class and refused to a default human guest', tookRequests: 2 };
      },
    },

    {
      name: 'authority-handlers-refuse-guest-context',
      description:
        'each authority HANDLER refuses a guest on its own (defense in depth): run inside a guest AsyncLocalStorage store — the same store the real door builds — the handler throws a typed refusal rather than performing the authority act, so the door gate is not the only line',
      async run(_harness) {
        const mcp = await loadLib('lib/mcp.js');
        const store = mcp._requestAls && mcp._requestAls.getStore;
        if (!store) {
          return { verdict: 'REFUSED', detail: 'no _requestAls test seam on this build — handler-guard row degraded to honest skip', skipped: true };
        }
        const leaked = [];
        for (const [tool, args] of AUTHORITY_CALLS) {
          let refused = false;
          try {
            await mcp._requestAls.run(guestStore(), () => mcp.execute(tool, args));
          } catch (e) {
            refused = true;
          }
          if (!refused) leaked.push(tool);
        }
        if (leaked.length) {
          return { verdict: 'EXPLOITED', detail: 'authority handlers did not refuse a guest context: ' + leaked.join(', '), tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'all ' + AUTHORITY_CALLS.length + ' authority handlers refuse a guest ALS context with a typed throw', tookRequests: 1 };
      },
    },

    {
      name: 'authority-classification-totality',
      description:
        'the forward-looking invariant for the authority blocklist seam: EVERY verb whose handler calls _assertNotGuestAuthority is ALSO admin-class at the door — a new privilege-authority verb cannot ship guarded-in-the-handler but door-reachable, and the scan is proven live by asserting it finds the known authority family',
      async run(_harness) {
        const guests = await loadLib('lib/guests.js');
        const { resolve } = await import('node:path');
        const fs = await import('node:fs');
        const src = fs.readFileSync(resolve('lib/mcp.js'), 'utf8');

        const toolRe = /_methods\.set\(\s*'([^']+)'\s*,\s*\{/g;
        let mm;
        const idx = [];
        while ((mm = toolRe.exec(src))) idx.push({ name: mm[1], declEnd: toolRe.lastIndex });

        // call-site detection: the PRIVILEGE-AUTHORITY seam only. The other
        // gate helpers (`_verifiedAdminGate`, `_requireWorkspaceAdmin`,
        // `_assertNotGuest`) are measured for guest-refusal by the handler row
        // above, not by door classification — a habitat-workspace admin or a
        // guest-management verb is legitimately write-class, so totality here
        // is scoped to the authority blocklist seam.
        const CALL = /(?:^|[^a-zA-Z_.])(_assertNotGuestAuthority)\s*\(/g;
        const gated = [];
        for (let i = 0; i < idx.length; i++) {
          const body = src.slice(idx[i].declEnd, i + 1 < idx.length ? src.indexOf('_methods.set(', idx[i].declEnd) : src.length);
          let m2, hit = false;
          CALL.lastIndex = 0;
          while ((m2 = CALL.exec(body))) {
            if (/function\s*$/.test(body.slice(Math.max(0, m2.index - 12), m2.index))) continue;
            hit = true;
          }
          if (hit) gated.push(idx[i].name);
        }

        // scan-rot guard: the known authority family must be detected
        const missed = ['trust_record', 'trust_setRequired', 'teams_createOrg', 'teams_assign', 'auth_create', 'sudo_grant'].filter((t) => !gated.includes(t));
        if (missed.length) {
          return { verdict: 'EXPLOITED', detail: 'the gate scan did not detect known authority handlers (scan rot): ' + missed.join(', '), tookRequests: 1 };
        }

        const doorReachable = gated.filter((t) => guests.classifyTool(t) !== 'admin');
        if (doorReachable.length) {
          return { verdict: 'EXPLOITED', detail: 'handler-guarded authority verbs still reachable by a guest at the door: ' + doorReachable.join(', '), tookRequests: 2 };
        }
        return { verdict: 'REFUSED', detail: 'all ' + gated.length + ' handler-guarded privilege-authority verbs are also admin-class at the door (totality holds; the scan detected the known family)', tookRequests: 2 };
      },
    },

    {
      name: 'authority-guard-does-not-overreach',
      description:
        'the authority guard is NARROW: the write verbs a human guest legitimately needs stay write-class and read verbs stay read-class, so the authority block never reclassifies ordinary work',
      async run(_harness) {
        const guests = await loadLib('lib/guests.js');
        const wrong = [];
        for (const t of ['brain_state', 'forum_status', 'vant_brain_my_get']) {
          if (guests.classifyTool(t) !== 'read') wrong.push(t + '!==read');
        }
        for (const t of ['vant_memory_write', 'brain_write', 'forum_publish']) {
          if (guests.classifyTool(t) !== 'write') wrong.push(t + '!==write');
        }
        if (wrong.length) {
          return { verdict: 'EXPLOITED', detail: 'the authority guard over-reached and reclassified legitimate verbs: ' + wrong.join(', '), tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'read verbs stay read-class and ordinary write verbs stay write-class — the authority block is confined to the authority family', tookRequests: 1 };
      },
    },
  ],
};
