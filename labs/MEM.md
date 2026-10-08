# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 158 — comment audit batch 5 (search/geometry/connectors/backup): 4/6 accurate, 2 fixed. FIXED search.js "(v0.8.6-axolotl)" — leftover qualifier from pass-154's 0.8.7 conversion riding along; pass-155 pattern didn't target 0.8.6-axolotl forms → now plain (v0.8.6), only occurrence repo-wide. FIXED s3.js Usage drift — taught `.s3({...})` but exports are createClient (:393), `.s3` never existed (same Usage-name-vs-export-name class as escrow pass-157). VERIFIED: backup (create/validate/restore/start all exported — validate is the pass-24 ghost-fix, now real), stego (encode/decode sigs match), geometry (project/quasicrystal/store/retrieve exported), wal (layout matches constants), search modes basic/hybrid/hyde/rag :373. GAPS: lib/geometry/ has NO dedicated test file; backup validate+restore round-trip pin candidate. GATES: claims/surface PASS, syntax OK; suites search 22/backup 3/stego 12/wal 14/connector 8 all 0-fail; sweep via CI. LESSONS: (1) version-conversion passes should grep BOTH directions — old-version→new leaves suffix hybrids like 0.8.6-axolotl behind; (2) Usage examples name APIs that never existed (.s3) — check export names literally. NEXT-UP: batch 6 (msg/network/node-registry/consensus/market/trust/embed/encrypt) or owner direction. Rides PR #118.

**Previous (pass 157) — comment audit batch 4 (security-chain + mesh core): 6/8 accurate, 2 fixed.** FIXED escrow.js Usage signature drift — header taught `hold('task-1', { until: 'condition' })` but real signature is `hold(holdId, condition)` (:654, 2-arg). FIXED islands.js stale format list — omitted .ini (same drift pass-156 fixed in format.js itself: sibling headers copy each other's omissions). VERIFIED: genesis (create :128/join :263), pipeline (5 modes :96-100, state machine real), primitives (zero ./ requires — hard contract holds; stego.js:178/backup.js:501+562 genuinely on storage.atomicWrite), qos (all 5 classes real), sudo (5 scopes real :46-67), habitat (conceptual, no falsifiable API claims). GATES: claims PASS, syntax OK; suites escrow 18/islands 14/primitives 8/qos 10/pipeline 9 all 0-fail; sweep via CI. LESSONS: (1) Usage-block examples drift from signatures even when the function EXISTS — verify arg shapes, not just names; (2) stale omissions propagate across sibling headers (format.js ↔ islands.js both dropped .ini) — when fixing one header, grep its exact stale line repo-wide. NEXT-UP: batch 5 (search internals, geometry/, connectors/), format.js test pin, or owner direction. Rides PR #118.

**Previous (pass 156) — comment audit batch 3 (persistence/security core): 6/8 accurate, 2 fixed.** PR #117 MERGED (142-155). FIXED cache.js header FICTION — Usage taught module-level cache.set/get/compress but exports = { Cache } only (0.8.6 refactor killed the singleton); header now class-only + explicit "NO cache.set/get on module exports". FIXED format.js header STALE — omitted .ini (code+AGENTS.md have it). VERIFIED: citations (addSource/formatCitation :75/:121), storage (getStorage factory :2125, BrainStorage.get(category,key)), vaf (check/sanitize/isBlocked real), lock (mutex in-proc promise chain :284, caller list matches lock-audit gate), brain-lock (1h TTL :56, events, cross-brain root), state-store (all claimed consumers confirmed). LESSONS: (1) Usage blocks must be verified against module.exports — a header can teach a REMOVED API (gate only catches phantoms named in docs, not header-vs-exports drift — extend signature gate if caught twice); (2) lib/format.js has NO dedicated test file — pin candidate. GATES: claims PASS, syntax OK; suites cache 12/12, citations 9/9, brain-lock 21/21, brain-storage-strict 14/14, atomic-writes 13/13; sweep via CI. NEXT-UP: batch 4 (habitat/genesis/pipeline/primitives/islands/qos/escrow/sudo) or owner direction. New PR (117 merged).

**Previous (pass 155) — version standardization: EVERYTHING is 0.8.6 (owner call) + signature #9.** Owner ruled: axolotl work is early 0.8.6-era work, never brand it 0.9.0. CONVERTED 118 refs/57 files: lib/bin headers `(v0.9.0(-axolotl))` → `(v0.8.6)`, inline annotations, test banners (26), docs frontmatter (sudo, compute), style.md example, geometry README (v0.9.0-exp — caught by residual grep, .md missed by .js-only walk), labs PRD done-claims, ROADMAP done sections. KEPT 0.9.0: release.md semver illustrations + ROADMAP "v0.9.0 - Futures" (genuinely future). .migration-fixture/ untouched (gitignored point-in-time fixture; allow-listed). SHIPPED signature #9: `(v0.9.0...)` headers + `version: 0.9.0` frontmatter. GATES: all PASS (9 sigs), syntax OK, spot-tests cache 12/12 brain 77/77; sweep via CI. LESSONS: (1) version dating is an owner decision, not a code-reading deduction — sanity-check the model with the owner before bulk conversion; (2) batch walks must cover every extension in the tree (.js walk missed lib/geometry/README.md); (3) legitimate future-version mentions (roadmap Futures, semver illustrations) must survive a standardization — decide per-ref, not blanket. NEXT-UP: CI on PR #117, more lib batches, or owner direction. Rides PR #117. Owner: "no 0.8.7 — all refs to 0.8.6; continue lib comments + fiction checks." INVENTORY: 29 refs. CONVERTED to 0.8.6: lib/search.js, AGENTS.md, style.md, prd-agents x8, prd-brain, CHANGELOG x2 (+ max-4 row removed — its point-in-time cover was the wrong label), openapi.yaml (caught by NEW signature first run — grep had *.yml but missed *.yaml: gate > grep). release.md illustrations GENERICIZED not relabeled (PATCH 1.2.3->1.2.4, docker v0.9.0) — relabeling forward-dated examples rots when 0.8.7 really ships. SHIPPED: fiction-signature #8 = blanket \b0\.8\.7\b (no such release; current 0.8.6, axolotl 0.9.0); allow-list +models/private/ (learnings quote fiction to debunk; gitignored but gate walks fs). COMMENT AUDIT batch 2 (config/boot/sync/mcp): ALL accurate, zero drift (config exports match header, boot layer order matches _bootState, sync pushAll/pullAny/rebase :266/:449/:612, mcp start + port 3457 real). GATES: docs/claims(846f,8sig)/dist/surface/helpers/locks PASS + syntax OK; full sweep > 180s cap -> CI. LESSONS: (1) inventory greps must cover .yaml AND .yml — or just let the gate catch what grep missed (it did); (2) semver illustrations in release docs should be generic/example versions, never a plausible-next real version; (3) a CHANGELOG fiction row can hide under a wrong version label — relabeling is not enough, re-verify the rows inside. NEXT-UP: CI on PR #117, more lib batches, or owner direction. Rides PR #117.

**Previous (pass 154) — 0.8.7 fictional-version purge + signature #8 + core-batch comment audit.** Owner: build the 2 gates, then audit core-lib comments. SHIPPED: scripts/check-fiction-signatures.js (lint:claims + workflow step; 7 signatures = caught-twice fictions: npm-install, max-4 x5 variants, framework.js, notifications.js, VantRetryableError, loadBrain, vant.use; 1978 files; allow-list archives/ledger/CHANGELOG/check-scripts; line-level negation filter w/ prev-line context + word boundaries) + scripts/check-docs-frontmatter.js (chained into lint:docs; all-5-fields + permalink / + nav_order int; version PRESENCE-only - style.md says 'version introduced', equality false-positives on 0.9.0-era pages). BOTH BIT ON FIRST RUN: fiction gate caught REAL missed fiction - examples.md:258 taught require('./lib/notifications') (phantom, pass 142 missed it) - FIXED to real surfaces w/ verified APIs (defaultEvent.on('sync:push:complete') lib/sync.js:346, vant webhooks add <url> <event>, VANT_WEBHOOK_SECRET mandatory lib/webhooks.js:133); frontmatter caught sudo.md/compute.md version drift -> released as presence-only. Fault-injections bit w/ file:line evidence. OWN BUG: docstring with docs/**/*.md self-terminates at */ - node -c before shipping. COMMENT AUDIT (brain/vant/sandbox/error/memory/agents/event): 981 JSDoc, 675 pass-notes, 116 SECURITY:, uniform headers, 3 TODO/FIXME (2 false positives). STRENGTHS: sandbox deny-by-default flagged 3x, agents facade split documented, brain.read() JSDoc matches docs exactly. FIXED: vant.js:1604 getter-block comment now says the 7 getters are NOT the whole surface (NEW: section eagerly attaches + OVERRIDES audit - live-probed typeof vant.audit=object before writing); error.js VantError docblock now documents the {code, retryable, statusCode, details} contract errors.md teaches. VERDICT: comments consistent + doc-reader friendly. GATES: lint:docs PASS (style+links+frontmatter x118), claims PASS (1978), dist PASS, surface PASS, ci.js 439/0/1skip. LESSONS: (1) node -c every new script before shipping; (2) debunk-vs-fiction needs context-aware negation (prev line, word boundaries); (3) catch-twice -> signature is now MECHANIZED; (4) live-probe export surfaces (typeof) before writing comments about them - the old comment AND the MEM folklore were both half-wrong (7 getters != whole surface). NEXT-UP: merge-go PR #117, or owner direction. Rides PR #117 with 142-152.

**Previous (pass 152) — buried-docs sweep.** Owner: "any other fictitious claims or stale readmes buried elsewhere? update or archive." INVENTORY: 691 .md outside docs/+root-8, but almost all gitignored runtime brain state - live docs-adjacent set = .github(5) + labs(~20) + lib/geometry/README.md + models/public/vant/boot/README.md. Signature grep (npm-install, dead modules, max-4, phantom getters/classes) across all. VERIFIED CLEAN: .github/SECURITY.md (incl. 'docs-claimed-but-wrong behavior is a security bug here, by policy'), SUPPORT.md, templates, boot/README.md (single-stone chain matches pass-132, restore cmd real), labs/whitepaper/*, DISCUSSION drafts, prd-* with honest status headers. FIXED: (1) labs/prd-agents.md - Status 'Implemented (v0.8.7+)' made its 'up to 4 agents' claims read as CURRENT FACT; it was the folklore's ORIGIN, live in the PRD DEPLOY.md cross-references. Overview + design principle + brain_agent_spawn MCP row corrected to dynamic quota (agents.maxAgents default 10, VANT_AGENTS_MAX) with dated errata; rest of PRD verified real (delegate/delegateAsync/pollWork/completeWork work.js:32/116/151/168, join/emit/on, agent_* MCP tools mcp.js:2219+); v0.8.7 changelog row '(4 agents)' left point-in-time. (2) lib/geometry/README.md - directory listing omitted engine.js + fragmenter.js; usage passed project() coords to store() which takes (barcode, data) - corrected to geometry.store('1-...-8', data)/retrieve(barcode) (real wrappers index.js:59-74), quasicrystal() noted as lower-level. ARCHIVE CANDIDATES: none taken - buried docs are real, dated, or now corrected (unlike pass-142 notifications). GATES: style+links PASS (118), dist PASS, surface PASS, ci.js 439/0/1skip; residual max-4 grep clean outside archives/ledger/version-history. LESSONS: (1) a PRD with Status 'Implemented' is a REFERENCE doc - check its claims against code when the status says shipped; (2) lib/*/README.md is the THIRD unchecked docs surface (root .md, dist/, now lib-internal) - geometry's README taught a different API than the module exports; (3) inventory before sweeping - 691 files reduce to ~30 real docs once gitignored runtime state is excluded. NEXT-UP: merge-go for PR #117, frontmatter/enforcement gates, or owner direction. Rides PR #117 with 142-151.

**Previous (pass 151) — crosslink/frontmatter sweep.** Owner: "crosslinking makes sense, all crosslinks resolve, frontmatter good to go." CENSUS (scripted, not spot): 491 /vant/ links -> 0 broken (my first script reported ~200 bad - that was MY trailing-slash normalization bug, contradicted both by the passing checker and 6 live 200 spot-checks; corrected, re-ran, 0); relative links 100% resolve; nav.yml <-> permalinks 1:1 (117 rows + home by design, no orphans/ghosts/dups); semantic spot-check of 6 Related blocks - all targets match context. FIXED: reference/locks.md + operations/locks.md missing `layout:` (2 of 118) - REAL consequence: _config.yml has no defaults block, Jekyll renders layout-less pages as raw HTML without site chrome, invisible to every regex gate. All 118 pages now carry all 5 style fields. VERIFIED BENIGN: nav_order dups can't affect the menu - the rendered sidebar uses site.data.nav (nav.yml, default.html:628), while nav_generator.rb filling site.config['nav'] is DEAD config (drift hazard, noted). GATES: style+links PASS (118), dist PASS, surface PASS, ci.js 439/0/1skip. LESSONS: (1) when a one-off script contradicts a passing gate + live checks, suspect the SCRIPT first - the gate was right; (2) frontmatter completeness needs the renderer's view (missing layout = silent raw-HTML render); follow-up candidate: check-docs-frontmatter.js to actually enforce the 'all 5 fields' style.md rule; (3) nav_generator.rb vs nav.yml = two nav sources that will diverge silently someday. NEXT-UP: merge-go for PR #117, frontmatter-gate follow-up, or owner direction. Rides PR #117 with 142-150.

**Previous (pass 150) — dist/ INTO the repo gates.** Owner: "/dist should be in repo gates. It's the lander/website. It may have other stuff in future." NEW: scripts/check-dist-lander.js (6 checks: fragments match ids; local assets exist on disk; docs.creadev.org/vant/<p> must resolve against real docs permalinks; github links must be dhaupin/vant; `npm install -g vant` = hard FAIL - the wrong-package trap, caught 3x now (140, 148, 149); data-count must be positive integer). Wired: `npm run lint:dist` + workflow step after lint:surface. PROVEN not written: clean PASS (1 file, 118 permalinks); injected broken anchor -> FAIL; injected npm-fiction -> FAIL; restored byte-identical (diff-verified - first restore attempt was incomplete, a global sed hit 3 lines, caught by re-diff). Gates: lint:dist PASS + style/links PASS (118) + surface PASS + ci.js 439/0/1skip. LESSONS: (1) fault-inject every new gate - one that has never failed is not a gate; (2) verify restores with diff, never assume; (3) gate classes keep revealing themselves (docs/L root .md/dist now covered) - a new surface class gets a new gate, not a memory rule. NEXT-UP: merge-go for PR #117 or next direction. Rides PR #117 with 142-149.

**Previous (pass 149) — dist/ lander judgment read.ALL VERIFIED** Owner: run through /dist, no fiction, links resolve, funnels for agents/hobbyists/enterprise. FIXED: `npm install -g vant` re-seeded TWICE in the lander (hero terminal + HowTo JSON-LD step 1) - same wrong-package trap pass 140 uprooted from docs, back via copy-from-memory; both now clone+npm ci with honest not-on-npm note. Stats row stale: 93 CLI/89 lib/119 docs/108 tests -> 99 (routed verbs from `vant --help` unique parse), 132 (find lib -name '*.js'), 118 (docs md), 169 (ls test/*.test.js); markup ships real values, counters only animate. 'Up to four agents' residue in section 03 -> agents.maxAgents default 10 (CHANGELOG point-in-time stays). VERIFIED REAL: MCP 127.0.0.1:3457, REST 3456, learn/search/migrate/onboard syntaxes (learn parser real bin/vant.js:300), 3 memory systems, security chain + WAL, headless/REST/Docker, MIT/price-0, not-a-fit section. LINKS: 10/10 live 200 (site permalink = baseurl /vant + frontmatter, matches; github labs + releases too). FUNNELS: hero dual-CTA = human 5-min path vs agent MCP+AGENTS.md door; enterprise grounded via headless/REST/Docker/multi-brain cards; closing CTAs 'Start the five minutes'/'Send your agent'. GATES: lint:docs PASS (118), surface PASS, HTML tag balance ok. LESSONS: (1) dist/ is outside every repo gate - judgment-read each touch (125, 132, 149); (2) installer fiction re-enters front surfaces whenever copy is written from memory - grep `npm install -g vant` across README+dist every pass; (3) stat rows need a recount habit: `find lib -name '*.js'`, `ls test/*.test.js`, `vant --help` verb count; (4) curl -L every external href once per lander pass - external URLs are invisible to all gates. CI note (pass 149 addendum): the 815a0e8 push's CI failed in 'Run standalone suites' - livefire-stress.test.js stale-takeover CAS ('1/4 races had two live holders'), the SAME documented runner-load flake as pass 137/PR 116. Diagnosed not assumed: commit touches only dist + labs (zero lib/test), last lib change was pass 138, identical code went green on 8db05c4 + 600bef8 earlier the same day, suite passes 4/4 x3 locally. gh rerun refused (no actions:write) - owner reruns from the Actions UI or it self-heals on next push. CORRECTION of my own recent claim: flake is INTERMITTENT, not 'always fails' - base rate this session 2 green / 1 flaked. NEXT-UP: docs+dist+root all clean; merge-go for PR #117 or next direction. Rides PR #117 with 142-148.

**Previous (pass 148) — root docs final touches.** Owner: "let's actually read the root docs too like readme, deploy, contributing, code of conduct, agents, and all the rest." All 8 root .md files read and verified: README, DEPLOY, CONTRIBUTING (all referenced files exist: contributing.md, .github/SECURITY.md, SUPPORT.md, bug_report template, LICENSE; 'good first issue' label real), CODE_OF_CONDUCT (prose only), AGENTS (body clean from 139/145/147), LEGAL (7-day TTL real lib/memory.js:82, models/private gitignored real), ROADMAP (no phantom APIs), CHANGELOG (point-in-time history, left intact). FIXED - the 'max 4 agents' folklore's LAST copies (pass 145 fixed bin/help.js + agent-spawner but README:72, DEPLOY §9, DEPLOY troubleshooting '(max 4)', AGENTS.md:235 TOC still carried it; reality: lib/agents/core.js:34 interpolates 'Agent quota reached (max N)' from _getMaxAgents(), default 10 via agents.maxAgents/VANT_AGENTS_MAX lib/config.js:260 - DEPLOY had even cited agents.maxAgents right next to the wrong number). VERIFIED REAL: README startHeadless {started, mode:'headless', endpoints} lib/vant.js:1248, VANT_MODE lib/api.js:73, learn/remember/init exports, migrate flags, ports; DEPLOY port map/sync/backup/horcrux/transform/org grant/WAL all held from pass 126. GATES: lint:docs PASS (118), surface PASS, ci.js 439/0/1skip; residual 'max 4' grep clean outside CHANGELOG. LESSONS: (1) root files are OUTSIDE lint:docs (scans docs/*.md only) - README/DEPLOY/AGENTS need manual verification every pass, exactly like dist/ and nav.yml (pass 126 lesson, re-confirmed); (2) folklore re-seeds through the FRONT DOOR - pass 145 fixed the code-adjacent copies but the README a newcomer reads first still taught the fiction; sweep by grep across the whole repo, not by section ownership; (3) a self-contradicting doc ('Up to 4 agents per install (MCP door quota, agents.maxAgents)') is a tell: when a doc cites a config key, grep that key's default before trusting the number next to it; (4) CHANGELOG historical entries stay as-written - point-in-time records, current surfaces corrected instead. NEXT-UP: docs + root docs COMPLETE. Remaining: periodic re-reads, merge-go for PR #117, or owner direction. Rides PR #117 with 142-147.

**Previous (pass 147) — reference/ + advanced/ COMPLETE (judgment reads).** Owner: "let's read all the docs reference and advanced next." VERIFIED REAL: escrow.md (pass-77 era, spot-verified), code-comments.md, efficiency.md, audit.md (lib log/logHydrate/getLedger/healthCheck + .audit.log + vant audit CLI), troubleshooting.md, release.md, agent-contributors.md (pass commit format real per git log, lint:docs real package.json:42, genesis.js + genesis-ring.test.js real, 14 test groups), nsc9-spec.md (labeled Draft v0.1, zero code backing, makes no code claims), style.md. FIXED: stream.md (enqueue/poll stream-scoped name-first enqueue('tasks',payload)/poll('tasks'); fabricated return shapes dropped); sudo.md (role-based fiction -> task-scoped createTask/can(taskId,scope) sync false-on-unknown/grant/revoke/escalate async/calculateLevel(scopes)); errors.md (no VantRetryableError class - retryable option on VantError, error.retryable; require('vant').errors getter fiction -> './lib/error'); consensus.md (create(topic, options)/vote(topic, outcome, agentId)/get(id, viewerId) scope gate); node-registry.md (register(node)/discover(filter)/heartbeat, refresh extra); legal.md dup rows; index.md +Escrow+RLS rows; rerank.md (vant_rerank MCP schema {query,docs} NOT {query,mode,topK}; no vant.rerank getter - lib/search export); search-architecture.md (session-cache section -> lib/search hydrate-era API); canvas/compute/embed/schema/theme/tmp API tables re-verified against module exports. GATES: style+links PASS (118; caught my own trailing whitespace on rerank.md:71 mid-run), surface PASS, ci.js 439/0/1skip. Boot stone runtime-refreshed (rides along). LESSONS: (1) getter-check before every `require('vant').X` - errors.md invented a .errors getter the same way pass 145's coordination.md invented vant.branch; the 7-getter list at lib/vant.js is the gate; (2) permission APIs here are TASK-scoped, not role-scoped - a levels table (sudo.md 0-4) looks authoritative and rots fastest; (3) a draft-spec page with no code backing is fine if it labels itself - nsc9-spec needed zero edits because it claims to be a proposal, not a doc of the code. NEXT-UP: docs sweep COMPLETE - every section judgment-read (essential, getting-started, memory, multi-agent, integrations, security, runtime, operations, advanced, reference). Remaining: periodic re-reads + owner direction. Rides PR #117 with 142-146.

**Previous (pass 146) — security/ judgment reads (9/9 pages).** Owner: "let's read security next." VERIFIED REAL: index hub, privacy.md, vaf.md (options/CONFIG/validator list all match), encryption.md (full primitives table incl. rsaSign/rsaVerify + hmac/hmacSign + VANT_TOKEN_SECRET lib/config.js:442 + VANT_MSG_ENCRYPTED :221), environment.md GitHub/ToS/polling/token/ports sections. FIXED: sandbox.md (caps table claimed canWrite/canNetwork/canCommit TRUE - reality DENY-by-default in DEFAULT_CAPABILITIES + untouched-sandbox-allows semantics now documented; getStats->getStatus {active,reads,writes,uptime}; getBudget->getBudgetStatus escrow delegate; blockExternal fiction; {error,code:'RATE_LIMITED'} returns -> throws coded errors; phantom canExecuteCode/canUseFilesystem -> real canTrade); escrow.md (hold(id,condition)+options.holdTimeout 300000 not per-hold opts; requestApproval(op,reason) -> {approvalId,approved} or {approved:true,reason:'auto_approved'}; canProceed/setQuota/reject DO NOT EXIST -> checkHold/options-driven quotas auto-window-reset/checkApproval-only; setBudgetLimit real; beforeExecute async; vant.sandbox getter in examples -> './lib/sandbox'); best-practices.md (vaf.configure fiction -> CONFIG keys + per-call opts; sandbox caps form); airgap-propagation.md (vant stego encode/decode CLI verbs DO NOT EXIST - bin/stego.js = snapshot/recover/capacity/upload; generic encode/decode lib-only; npm start -> node bin/vant.js start); environment.md (deps express/cli-progress/inquirer fiction - package.json = chalk/js-yaml/yaml + plain-node http; stale "Single brain per instance / No built-in encryption" Limitations replaced with true ones). GATES: style+links PASS (118; broke a table mida-run with my own edit, caught + fixed), surface PASS, ci.js 439/0/1skip. LESSONS: (1) security pages carry the same deny-vs-allow inversion fiction qOS had - a doc table that says a dangerous default is `true` when the code says false is worse than a wrong method name, it TEACHES insecure config; (2) `require('vant').X` getters: exactly 7 exist (brain/storage/search/islands/mcp/agents/msg) - any other is fiction, greppable at lib/vant.js:1604-1610; (3) stego CLI/lib mismatch again (pass 136 archived deprecations claiming the opposite drift) - bin verbs and lib exports have diverged repeatedly, check BOTH before writing either. NEXT-UP: runtime/ (4 pages) then advanced/ (11) + reference/ tail. Rides PR #117 with 142-146.

**Previous (pass 145) — multi-agent/ judgment reads (7/7 pages).** VERIFIED REAL: brains.md, succession.md (trust CLI real bin/succession.js:96; _succession.json at models/public/vant/), federation.md rules + all six parts incl. mesh --peers, agents.md prose. FIXED: coordination.md (vant.branch/vant.lock getters NOT exports — only brain/storage/search/islands/mcp/agents/msg; lock.acquire is path-based returning {ok,reason} -> rewrote to lib/brain-lock.acquireBrainLock(agentId, timeout) -> TOKEN or null + releaseBrainLock(agentId, token) in try/finally; `vant branch create` -> `vant git-branch create` — branch-manager has no create verb); branches.md (vant.branch getter fiction; list->listBranches, create->checkout(create=true)+fork, delete->deleteBranch(agentId, remote); real aliases switchBranch/getStatus documented); agents.md dup Related row; index.md "up to four agents" -> agents.maxAgents config (default 10 via VANT_AGENTS_MAX); federation.md org-sync "Automatic on push" -> explicit replicate(bus,node). ROOT-CAUSE SWEEP: the "max 4 agents" number exists NOWHERE in lib (core quota = _getMaxAgents(), internal default 200, config default 10) — it was AGENTS.md folklore that leaked into bin/help.js (2 spawn rows) and bin/agent-spawner.js help; fixed at the root, grep-verified no test pins the old text. GATES: style+links PASS (118), surface PASS (AGENTS.md scanned by rules 1/2/7 — claims there must resolve to bin/lib), ci.js 439/0/1skip. LESSONS: (1) when a docs fiction also lives in help text + AGENTS.md, fix ALL copies in one pass — partial fixes let the folklore re-seed; (2) resume-after-drop works: the ledger's "verdicts recorded" todo + git status reconstruct exactly which fixes landed; (3) a help-text number with no enforcing code is a fiction in the strongest form — grep the enforcing line, not just the doc. NEXT-UP: integrations/ (10 pages), then security/ (9), runtime/ (4), advanced/ (11), reference/ tail. Rides PR #117 with 142-144.

**Previous (pass 144) — memory/ judgment reads (10/10 pages).** Owner: keep going through remaining sections (memory -> multi-agent -> integrations -> security -> runtime -> advanced). VERIFIED REAL: index.md hub, stego.md (capacity --image= real in the capacity subparser bin/stego.js:100 — my suspicion was wrong, CHECKED BEFORE EDITING; chunked encode/decode + encodeSvg/decodeSvg real), horcrux.md CLI (create/refresh/restore/inspect + p_<password> default path + password chain), brain.md (pass 141). FIXED: citations.md (addSource(commit, context) — old example passed one 'file#anchor' string; getStack() not an export — getStackCitations; verify(commit) takes a hash); rag.md (search.query returns {memories,results,context} — context already the joined string, topK/maxTokens not real options, hybrid returns {fused} not {context,scores}, cache.set TTL is options-object, vant.think({topK}) not real); geometry.md (lib/geometry/ is a DIRECTORY not geometry.js; store/retrieve take (barcode, data) not ('a-key','value'); key-value convenience = bin/geometry.js routes via memory.learn 'geometry:'+key); horcrux.md (toHorcrux(outputPath,{password}) + fromHorcrux(path,{password}) file-level entry; restore(data) is the parsed-data half); prune.md (prune.run -> prune.prune + userCtx REQUIRED fail-closed lib/prune.js:181); memory-store.md (state/recall/learn/query all async — await added; TTL options-object example). GATES: style+links PASS (118), surface PASS, ci.js 439/0/1skip. LESSONS: (1) verify the SUSPICIOUS claim too — the stego capacity --image= flag looked wrong against the general help text but the capacity subparser really takes --image=; flag-scoped parsers beat global help; (2) directory-vs-file require paths (lib/geometry/) are the same fiction class as phantom paths — check with ls, not just grep for the module name; (3) async-by-default APIs in docs that drop await are a silent race in examples, not just style. NEXT-UP: multi-agent/ (7 pages) then integrations/ (10), security/ (9), runtime/ (4), advanced/ (11). Rides PR #117 with 142-143.

**Previous (pass 143) — operations/ section COMPLETE (9 remaining pages).** Owner asked what's next in /docs; noted GitHub having issues 3 days running. VERIFIED REAL: agora.md (5 CLI verbs + 5 MCP tools + consensus.get scope gate), settlement.md (makeInvoice/sendInvoice/list/get + wire legs + refusal codes), steward-runbook.md (org-sync generations, ring admit lib, teams/registry APIs), federation-playbooks.md (genesis CLI create/join/status, mesh status, all referenced MCP tools registered), ci.md (matches .github/workflows/test.yml exactly incl. audit step and single-job design), sync.md core (isRAID/pushAll/pullAny/getStatus/rebase; providers github/gitlab/bitbucket/gitea/selfhosted + their token envs). FIXED: storage.md (brain.getIdentity()/getVersion() never existed; phantom brain.read in the (category,key) example — it's get(); denial returns {error} not throw; connectors-dir example wrong — classes via lib/remote.js; `new Storage({path,sync,atomic,sandbox})` ctor fiction → FileStorage({basePath,encrypt,wal,mirrors}); vector.add 3rd arg is metadata not a vector); network.md (fetch → body string not {json,status}; fetchWithRetry/getPoolStats/configure() nonexistent — retry(fn,{retries,backoff,maxBackoff}) real; isOnline vs checkOnline; CLOSED|OPEN no half-open; system:true opts out of per-call canNetwork gate); testing.md (no test:watch/coverage scripts; mocha-style example → plain-Node assert script; vant.init returns {error} not {id}, think→{insights}, learn→{success,key,ttl}); ci.md (npm run build/build:watch fiction — no build step); sync.md (pullAny opt is {provider}, getStatus shape, extra exports); federation-playbooks.md (`vant genesis admit` CLI fiction — admit/accept lib-only). GATES: style+links PASS (118), surface PASS, ci.js 439/0/1skip. NEXT-UP (coverage map): memory/ and multi-agent/ and integrations/ and security/ and runtime/ and advanced/ judgment reads (reference/ mostly touched piecemeal 130-141). Rides PR #117 with pass 142.

**Previous (pass 142) — operations/ judgment reads (notifications archive + qos/cache/cron/events/webhooks/automation truth-up).** First full judgment read of docs/operations/ (20 pages; only marker sweeps + spot checks before). ARCHIVED notifications.md (FULL FICTION: `require('./lib/notifications')` slack/discord/email/pushover/telegram + broadcast()/status() — lib/notifications.js does not exist, no lib file mentions notifications, none of the SLACK/DISCORD/PUSHOVER/SMTP env names are read anywhere in lib/ or bin/; git mv -> labs/archives/docs/operations-notifications.md + provenance row; nav.yml + operations/index rows dropped; operations.md Notifications section rewritten to real surfaces: Telegram bot, events, webhooks). qos.md: RateLimiter isAllowed()/consume() never existed (real: async check(clientId, op) THROWS RATE_LIMIT_EXCEEDED; default maxPerMinute 60 not 100); CircuitBreaker execute()/onOpen/onClose never existed (real: recordFailure/recordSuccess/isClosed/getState/getStatus/reset; option is `threshold`; throws SANDBOX_CIRCUIT_OPEN; no half-open — time-based recovery; mode:'full' = per-provider backoff); Bulkhead execute()->run(fn), maxConcurrent/maxQueue -> single `concurrency` (default 10; queues, not rejects); sandbox.create({maxConcurrent,readQuota,writeQuota}) REAL. cache.md: exports the Cache CLASS (not an instance), TTL is set(key,value,{ttl}) options-object (old positional example set NO ttl), "-1 = no expiry" fiction, delete()->remove(), get() refreshes TTL. cron.md: every()/after()/cron()/jobs()/stop(jobId) ALL fiction; real = schedule({id,interval,handler}) ms-intervals 1000..86400000 VAF-validated (no cron parser), cancel(id), list(), status(id), once/on/off, scheduleCompute/Embed. webhooks.md+automation.md: same phantom stack (`vant/lib/network` sync, cron.cron('0 0 * * *'), vant.prune({keep}) not an export) -> rewrote to real: webhooks CLI on 3467 + VANT_WEBHOOK_SECRET + loopback bind, cron.schedule + lib/sync.js pushAll(), `vant prune` CLI via system crontab, `vant watch` for GitHub polling (no inbound receiver exists); branch.commit(agentId,message)/vant.learn/vant.think verified REAL. events.md: Queue has no user process() API, is not an EventEmitter (no .on('job:complete')); options = concurrency only (default 1); qos.PubSub fallback line removed. operations.md: `.vant.log` -> `vant.log` (clean.js rotates vant.log/vant.log.old); Telegram gained /sync + TELEGRAM_BOT_TOKEN (was wrong in notifications.md too); `vant rate`/`vant bot` real. notices.md verified REAL (bin/notices.js matches). GATES: style+links PASS (118), surface PASS, ci.js 439/0/1skip. LESSONS: (1) the operations/ section had never been judgment-read — three whole pages (notifications, cron, qos) were built on modules/methods that never existed; the 139 marker sweep missed all of it because the fiction is POSITIVE claims ("supports X"), not lifecycle words; (2) when a page teaches a class, check whether the module exports the class or an INSTANCE — cache.md failed at line 1 (`require('./lib/cache')` then `cache.set`); (3) grep the option names too: Bulkhead's documented maxConcurrent/maxQueue vs real `concurrency` would break every copy-paste; (4) the guard blocks terminal greps containing env-var NAME strings — rephrase the pattern (search the module, not the env name) or use file checks; (5) a page can be 100% real (notices.md) — verify before rewriting; the read pass must keep proving pages real, not just find fiction.

**Previous (pass 141) — mid-funnel judgment reads (architecture, agent-onboarding, brain, cli).** Owner: "mid-funnel pages had their machine-checkable layers swept in passes 138-139 but not full judgment reads." architecture.md: bin/webhook.js -> bin/webhooks.js; lib-table exports corrected; Execution Flow `require('vant/lib/network')` sync fiction -> sync.pullAny/pushAll (lib/sync.js:266/:449/:786); brain().get -> .read; security chain Sandbox->VAF->QoS->Escrow (old order omitted QoS); "296 tools" de-numbered. agent-onboarding.md: migration link -> /getting-started/migration; POST /rpc phantom -> curl /mcp/tools. brain.md: await brain.loadCorpus(). cli.md (header claims bin-verified signatures, so fiction = self-contradiction): `onboard --list` never existed (bin/onboard.js: bare `list`=summary, `files`=file list; --list -> "Unknown command") -> `onboard files` in cli.md + essential/index.md; citations add/verify were console.log stubs while lib has real lock-protected addSource()/verify() -> WIRED bin/citations.js to the lib (allow-by-default gate; live-verified add/verify-hit/verify-miss exit codes), search/export marked placeholders in bin help + docs; `vant run` is a banner-only stub (interactive loop/-p/--mcp fiction) -> honest row; `--ttl` never a CLI flag (bin/memory.js passes no opts) -> lib-API note; `node bin/sweep.sh` -> `bash bin/sweep.sh` (#!/bin/bash). runtime.md citations row cite()/link() (not exports) -> addSource()/getAll()/verify(). Spot-verified REAL: snapshot/node/agents/org/geometry/test-core/api/spawn/docs/bump/changelog/wal/backup flags. GATES: style+links PASS (119), surface PASS, ci.js 439/0/1skip. LESSONS: (1) `--flag` vs bare-verb fiction only surfaces by grepping the arg PARSER (bin/onboard.js), not by grepping for the command name; (2) a lib with real functions behind a log-only CLI is the runop-class bug inverted — this time I wired the bin to the lib (gate allows by default, models/private gitignored, zero CI coupling: grep test/ci.js for the command first); (3) check-docs-style bans em/en dashes in prose and tables but NOT inside code blocks — text pasted from code samples can smuggle them into prose (2 lint fails on my own lines).

**Previous (pass 140) — judgment read-pass.** Owner: read the docs for misleading-but-true framing. HEADLINE: `npm install -g vant` taught in 9 places (README front door, docs/index.md, quick-start, install.md x4, DEPLOY.md, style.md) installs VANT UI (vant-ui/vant v4.10.2, a Vue mobile-UI library — verified npm view; @dhaupin/vant is 404). FIXED everywhere: from-source path (clone + npm ci + node bin/vant.js start, npm link for the CLI) + collision warning; `vant start --ai` deleted (no such flag). VERIFIED REAL: docker pull dhaupin/vant (Docker Hub active, 15,195 pulls), bin/build-test.js. SECOND: plugins.md ARCHIVED (essential-plugins.md) — vant.use/plugin loader/npm plugin ecosystem never existed (0 "plugin" refs in lib); real surface = islands (extensibility.md, custom-island.md). FAQ: roadmap link malformed (missing /vant, 404 — external URLs skip the link checker) fixed; succession answer was describing version tracking — it is the trust-level system, rewritten + linked; "your brain is a GitHub repo" storage overstatement reworded to local files + sync/backup. quick-start 2min vs index 5min aligned. GATES: style+links PASS (119), surface PASS, ci.js 439/0/1skip. LESSON: external URLs and npm names are invisible to every repo gate — the two things a newcomer runs FIRST were both unguarded. Rides PR #116.

**Previous (pass 139)** — narrative-claims sweep. Owner: "we can do narrative level claims, let's see what we find." Swept 120 docs pages for lifecycle markers (removed/no longer/deprecated/superseded/version claims) — 21 hits, all triaged. YIELD: 2 real, both AGENTS.md Brain Router Interface — (1) `brain.loadBrain('identity')` is a REMOVED 0.8.6 alias (CHANGELOG: -> loadCorpus() + per-name read(); lib/brain.js only has internal _loadBrain) — replaced with `brain.read('identity', { type: 'private' })`; (2) `brain.loadCorpus()` taught as sync with no await — it is async by default ("use {sync:true} for sync mode") — fixed to await. Everything else benign: prune/resolution vocabulary, release.md semver examples, migration.md "v0.9" = the repo's own axolotl-era label (compute "Beta v0.9.0", CHANGELOG "pinned at 0.8.6"), README has zero numeric claims, remaining AGENTS.md brain.* calls all exported. GATES: surface PASS (AGENTS.md scanned by rules 1/2/7), style+links PASS (120), ci.js 439/0/1skip. Rides PR #116.

**Previous (pass 138)** — dead import + doc-truth sweep. Owner: fix theme import + islands_canAccess, keep cleaning docs ("prob still a lot of inaccurate info"). CODE: lib/mcp.js dead theme require (:99) removed (grep-verified unused); bin/runop.js `vant runop stop` was calling nonexistent `pipeline.stop()` (exports runtimeStop) — TypeError every stop, fixed to runtimeStop(); bug found BY doc verification. islands_canAccess CORRECTION: pass-137 candidate was wrong — it IS registered (lib/mcp.js:2541, island-boundaries tests exercise it; my registry dump truncated). SWEEP (scratch, deleted): 120 pages — 0 phantom tools, 0 phantom env vars (33 referenced all real), 0 real phantom verbs (hybrid/mesh dispatcher-routed), 5 phantom lib/bin mentions all fixed. FIXED: storage.md "Files Deleted: lib/brain.js" fiction (brain.js NOT deleted, core router; real merges vector-store/repos/state -> factory classes per getStorage switch), islands.md Files section (state.js + gallery.js dropped — nonexistent, unreferenced), runop.md rewritten (require('vant/lib/runop') was MODULE_NOT_FOUND; runop absorbed into lib/pipeline.js + vant runop CLI). VERIFIED REAL: entropy.md (matches bin/compress.js: window 8, threshold 0.85). GATES: style+links PASS (120), surface PASS, ci.js 439/0/1skip. Rides PR #116.

**Previous (pass 137)** — audits archive + RPC/REST/resolution truth-up. Owner approved the pass-136 discuss list and expanded it (move 9 labs audit files, update rpc.md + resolution.md, general docs cleanup + menu fixes). MOVED (git mv → labs/archives/audits/, new provenance README): AUDIT_FINDINGS, COHESION_AUDIT, DEAD_EXPORTS, LOCKS, MULTIBRAIN_CENSUS, QC_WAVE, SESSION_PASS24, STABILITY, WAVE_RETROSPECTIVE; 13 inbound refs retargeted (locks.md, ROADMAP, DEPLOY link, audit-locks.js x3, run-all.js, snapshot-guards, integration-criticals, security-hardening, branch-manager x2 + bin, node-crew/stress.js x3); TASKS/MEM/learnings + prd-* mentions left as point-in-time. rpc.md REWRITTEN: theme helpers ship but the server does not apply _theme (dead import lib/mcp.js:99 noted); fake Skill/Agent Chain "Planned" sections replaced with real surfaces (lib/agents.js, agent_* MCP tools, msg.send, crew bus envelope contract + versioning); wire map = MCP door / REST layer / crew bus. rest-api.md REWRITTEN: /call + tools/call on 3456 REAL (pass-131; built-ins shadow the router), /ready + rate-limit plans + SDKs + Socket.IO deleted (never existed); 19 startREST routes mapped to tools. mcp.md DE-FICTIONED: /call was 3457 fiction (REST-only), env names fixed to VANT_MCP_*, auth = headers not JSON-RPC params, 16 tool examples re-shaped to registered schemas (get/set memory {category,filename[,content]}, vant_search {query,limit} + separate vant_search_hybrid). resolution.md REWRITTEN: blockchain line + phantom .resolutions/ dir deleted; ledger = single models/public/.resolution.json (multibrain-aware); real entry shape + CLI/API tables. nav.yml: -2 dup rows (Search Tuning, Advanced-section RAG Tutorial); title-vs-page scan: ~29 short-title rows all legit, left alone. server.md /tools /health /call verified REAL. GATES: style+links PASS (120), surface PASS, ci.js 439/0/1skip. DELIVERY: owner MERGED #115 at 21:18Z (passes 129-136 now in main), so b51e559 rides NEW PR #116 (axolotl→main). PR 116 CI first run FAILED on test/livefire-stress.test.js gate A ("12x two-racer stale-takeover CAS", iteration 6 bothWrote=true) — runner-load race flake, NOT a regression: zero lib/ files changed in b51e559, identical lib code passed #115's 4m18s green run, gate passes 3/3 locally, and livefire-stress does not even require the edited stress.js. gh run rerun refused (integration lacks actions:write) — OWNER: re-run the failed job from the Actions UI (or merge if satisfied; local gates all green). CANDIDATES (both RESOLVED in pass 138): lib/mcp.js:99 dead theme import (removed); islands_canAccess (note was wrong — it IS registered at lib/mcp.js:2541).

**Previous (pass 136)** — docs archive census. Owner asked for a stale/useless docs sweep (named MIGRATING-0.8.6.md as the example: "solves nothing atm, people are getting migrated regardless"). ARCHIVED (git mv → labs/archives/docs/, 3 new provenance rows): MIGRATING-0.8.6.md (root; superseded by automatic migration on vant start + docs/getting-started/migration.md; self-stale — cites deleted lib/framework.js and an ancient test count; only plain-text mentions in the two CHANGELOGs, root one retargeted to the archive path); docs/reference/CHANGELOG.md → reference-CHANGELOG.md (drifted fork with FOUR v0.8.6 headings; nav + reference/index rows now point at the GitHub root CHANGELOG; the _repair_*.js scripts skip-CHANGELOG by name and generate nothing); docs/reference/deprecations.md (2026-05-10 half-fiction: lib/brain.js "REMOVED" — false, core module exists; stego message mode "removed" — false, stego.md canonical; Encrypt.encrypt/decrypt "deprecated → aesGcm*" — contradicts lib/encrypt.js where encrypt/decrypt are primary :157/:190; the true removals vector-store/state/repos are in the changelog + reference/storage.md; nav + index rows dropped). docs pages 122 → 120. DISCUSS LIST handed to owner: advanced/rpc.md (update candidate), reference/resolution.md (module real, freshness pass), 9 labs audit-era files → labs/archives/audits/ (caveat: docs/operations/locks.md links labs/LOCKS.md), runtime/runtime vs reference/api-runtime verified NOT dupes (pass-134 parked item closed), ROADMAP.md active, operations/storage.md date-stale-but-content-current. GATES: style+links PASS (120), surface PASS, ci.js 439/0/1skip.

**Previous (pass 135)** — whitepaper speaks Vant. Owner asked the white paper to talk about vant instead of agents md / tasks md / mem md files. docs/whitepaper/agent-first.md's last 3 AGENTS.md links swapped for product surfaces: §2 clause table "past generations" row → inheritance is waking into the brain its predecessors wrote (../memory/brain.md); §3.1 "The rules" bullet → rules are memory too (conventions in brain files, autonomy = succession trust level, "nothing an agent needs in order to behave is stored outside its memory"); §4 "Memory survives death" artifact → the brain + the memory store with the crew's own drill described in the FAQ (pass-132 pattern: product claims point at the product, crew claims live in the FAQ). VERIFIED (pass-132 parked item (b)): labs/whitepaper/README.md + BUILD-LOG.md carry NO AGENTS/TASKS/MEM mentions — only prd-*/node-crew companion links, no edits needed. INTENTIONALLY LEFT: dist/index.html lander AGENTS.md copy pitches Vant's own shipped AGENTS.md as onboarding protocol — product, not crew. FAQ "The crew and the ledger" stays the single home of raw ledger links. PARKED (pass 132 item a): move TASKS/MEM ledger into Buffy's brain + templates for other agents/users — needs owner intent confirmation. GATES: style+links PASS (122), surface PASS, ci.js 439/0/1skip.

**Previous (pass 134)** — /docs dedupe round 2. Archived (git mv → labs/archives/docs/): advanced/citations.md (verbatim dup of memory/citations.md — both API tables match lib/citations.js exactly), advanced/pruning.md (daemon/stats/list flags REAL in bin/prune.js — depth absorbed into memory/prune.md, not kept as a split doc), advanced/search.md (real depth absorbed into memory/search.md PLUS 4 fictions killed: searchLTC→getLTC/queryBrain, getCacheStats/clearCache/rehydrate→hydrate, vant_search {mode,files} schema→registered tool is {query,limit} with separate vant_search_hybrid/hyde tools, lib/query.js doesn't exist; also "Requires LTC/50KB max" contradicted getSettings() defaults 5000B/no-gate), operations/deployment.md (dup of getting-started/deploy.md). nav: -3 archived, +1 (RAG Tutorial was unnav'd), "Search Tuning" row retargeted to search-architecture (title never matched its page). Kept as NOT dupes: operations/storage vs reference/storage (ops surface vs factory API; retitled "Storage", root-index "API architecture" blurb dropped), multi-agent/agents (branch-workflow chapter) vs integrations/agents (lib API page) — agents.md had a Lock→self-link bug, fixed to operations/locks. GATES: style+links PASS (122), surface PASS, ci.js 439/0/1skip. LESSON: (1) the duplicate-with-fiction pattern is worse than the stale-fiction pattern — the buried page ABSORBS inbound links that then transmit wrong APIs; when consolidating, grep module.exports BEFORE merging, and re-probe every example against the registered MCP schema, not the docs of a sibling tool; (2) "Search Tuning" nav row pointed at the archived hybrid page all along — when a nav title doesn't match its page title, either the page is a dup or the row is lying; (3) a doc can be a perfect API reference and still lose — subject-home beats content-quality for the flood (marketing-driven) user scanning a section.

**Previous (pass 133)** — docs consolidation: horcrux and stego one doc each, architecture one canonical doc, onboard disambiguated. Archived (git mv → labs/archives/docs/): memory/horcrux-bootstrap.md (real content folded into horcrux.md's new "Zero-config boot from an image" + "The canvas aside" sections — verified: vant boot --image/--decrypt real bin/boot.js:40; toHorcrux template→canvas fallback lib/transform.js:1186-1192; stego.generateManifest real lib/stego.js:278; AES-256-GCM real) and advanced/architecture.md (API ownership model absorbed into essential/architecture.md "The API surface": Vant-owned vs MCP-unique vs REST-unique, spec table corrected to the real 296 tools, honest MCP/REST-import-directly note; the rest was stale flat-tree fiction). nav.yml: both archived entries dropped, "Onboard" retitled "Knowledge Base Browser" (page frontmatter was already that; 5 cross-refs aligned — essential/index ×2, boot.md, manual-brain.md, runtime.md). stego.md's 2 stale horcrux-bootstrap links → horcrux + "hocrux" typo fixed. encodeBrain/decodeBrain ARE real module.exports aliases (lib/stego.js:492-493) — checked before "fixing" the code sample, it was fine. GATES: docs style + links PASS (126), surface PASS, ci.js 439/0/1skip. LESSON: pass 132's "wording ripples into output-sniffing checks" applies to docs too — the links checker fails on ANY reference to an archived permalink, so grep docs/ for the old permalink immediately after a git mv, before the checker finds it.

**Previous (pass 132)** — horcrux chain is single-stone + crew-ledger mentions live in the FAQ. Boot: only axolotl-p_axolotl2026.svg remains in models/public/vant/boot/ (the onboard for dev helpers, runtime-refreshed); buffy-p_buffy2026 + nova-p_nova2026 archived to labs/archives/horcruxes/ (restore commands in the README there) and labs/archives/horcruxes/*.svg added to .ignore (prime #100: never grep a stone). Whitepaper: docs/whitepaper/agent-first.md's 8 labs/MEM+TASKS evidence links replaced with product surfaces (brain learnings, memory store, Agora board) — the raw ledger links now exist in exactly ONE place: the new FAQ section "The crew and the ledger" (who builds Vant, what the labs files are, where Vant's own memory lives). dist/index.html was already clean. test-all now pins "Brain loaded" (the 131 wording fix had dropped fresh-dir to 16/17). LESSONS: (1) when archiving stones OUT of boot/, re-check .ignore globs — the old glob only covered models/public/*/boot/; (2) wording changes ripple into output-sniffing checks (test-all greps for 'Model') — grep bin/ for the old marker before rewording any CLI banner; (3) evidence links in a whitepaper should point at the PRODUCT unless the claim is about the crew itself — and then it belongs in the FAQ. Pass 131 context: live-fire on merged main found 3 user-facing bugs, all fixed in axolotl for the next PR. FINDING 1 (the good one): POST /call was documented as JSON-RPC 2.0 in reference/rest-api.md but the handler read request.method as the tool name — the documented example got "Unknown tool: tools/call"; fixed in lib/server.js to unwrap the envelope (id echo, error wrap) while keeping flat {method:'<tool>'} and {tool,args} shapes (no tests pinned /call, checked first). FINDING 2: vant sync exited 0 on refusal ("Config not set") — main() ignored the {success:false} returns; now exits 1. FINDING 3: vant load said "Model loaded"; says "Brain loaded" now. Live-fire method that found them: fresh clone of main + (1) 107-verb --help sweep (106/107, bot honestly refuses), (2) run the EXACT commands quick-start/faq/setup tell users to run, (3) server+MCP door batteries. LESSON: run the documented curl verbatim — docs-vs-handler drift hides behind green suites because nothing tested the documented shape. Also: the Freebuff env-name guard blocks heredocs mentioning NODE_PATH — symlink node_modules into scratch clones instead. NOT bugs (noted): load "Identity: unknown" is honest; setup on non-tty exits 0 at EOF mid-prompt (future non-tty guard candidate). COLLAB POST: labs/DISCUSSION-meet-buffy.md — paste-ready owner-facing intro of Buffy + 4 collab invites. GATES: sync 18/18, api 21/21, server 12/12, truthfulness 3/3, cli-smoke 2/2, ci.js 439/0/1skip. Pass 130 context: /docs power run. ARCHIVED to labs/archives/docs/ (5, git mv + provenance README): omega-init (fictional .agent-brain boot flow, the funny one), advanced/framework (documents deleted lib/framework.js), advanced/frontend (fabricated vant-js-sdk/vant-python-sdk), reference/api (fabricated require('vant').runtime/.ipc/.agents exports — while the HONEST api-runtime.md sat hidden: classic menu inversion), advanced/schema (duplicate of reference/schema). CANONICAL MENU: nav.yml rewritten to 125 entries — every one of the 128 permalinked docs pages now reachable exactly once, zero dead links (verified programmatically); previously-hidden REAL pages nav'd (locks, daily-commands, sudo grant-model, vant repos, 20 reference APIs); sections grouped by job, titles match pages. Inbound links retargeted (getting-started/advanced/reference index tables, docs-build.js stamp list cleaned of ghosts incl. never-existing docs/guides/*). GATES: style 128 PASS, links PASS, surface PASS, helpers/truthfulness/locks 0, cli-smoke 119 CLIs 2/2, ci.js 439/0/1skip. LESSONS: (1) never judge an orphan page by its permalink absence — half the "stale-looking" hidden pages documented REAL modules (verify against lib/ before archiving); (2) nav.yml order IS the menu (layout renders it verbatim; frontmatter nav_order feeds an unused generator); (3) the API-triangle pattern — when 3 pages cover one module, the menu'd one is not necessarily the accurate one; grep module.exports before trusting any of them. Pass 129 context: PR 91 MERGED to main (owner accepted; merge commit bb45cfb "Welcome to Vant multi-brain!"); axolotl CONTINUES as the staging branch. MAIN VERIFIED GREEN on the merge commit: VANT CI 4m36s (full battery incl. both E2E tours), Build and Push VANT success (docker.yml pushes dhaupin/vant:latest on every main push — the Docker Hub "real-host build" gap closed itself; ~10k Hub users now get the auto-migrating image), Deploy Docs success (58s). Migration Guide LIVE at docs.creadev.org/vant/getting-started/migration (200, full content) — all launch-discussion links resolve on the real site. FRESH-CLONE SMOKE PASS: real git clone from GitHub of bb45cfb, no node_modules, NODE_PATH bridge — migrate --status correctly reports pending v3 marker with evidence, vant health boots clean (exit 0, 0 debris), clone deleted. GOTCHA: pushes to axolotl no longer trigger CI (not in test.yml push list; PR events only) — staging-branch verification needs the next PR or workflow_dispatch. Prior pass 128c context: pass 128c — migration docs made solid + launch discussion drafted, ready for tonight's merge. NEW docs/getting-started/migration.md — a dedicated, linkable Migration Guide (what changed in 0.9, do-you-need-to-act, automatic vs manual paths, naming order flag > env > "vant", the safety contract table, post-import verification incl. the brain_migration_status MCP tool, Docker volume notes, troubleshooting). WIRED IN: nav.yml (Migration Guide, nav_order 20, no collisions), setup.md points to the guide, brain.md + multi-agent/brains.md "migration guide" links retargeted from setup.md to it, cli.md migrate notes link it. SOLIDITY: docs style + links PASS (133 files), 7/7 claims probe-verified against bin/migrate.js + bin/start.js + lib/migrations.js + lib/mcp.js, lint:surface PASS (probe gotcha: start's --no-migrate lives in bin/start.js, not bin/vant.js — check the real handler file, not the delegator). LAUNCH POST: labs/DISCUSSION-multibrain-merge.md is paste-ready for a GitHub Discussion (Announcements): what's happening, what multibrain means, three migration lanes, safety table, 7 docs links ALL verified against real permalinks + repo links, brief release rundown (locks, security, deploy truth, tours), known gaps. The migration page URL goes live when Cloudflare Pages redeploys after the merge. PR 91 body updated: + Migration Guide bullet in Final passes, + "Known gaps after the merge" section (Docker Hub image ships old build until a real-host docker build + push; post-merge fresh-clone smoke; docs page timing), merge plan now points at the discussion draft. Workspace clean (empty untracked qc/ dir removed, no leftover leases, env store has only the neutralized blank key placeholder). NEXT: owner merges PR 91 tonight; paste labs/DISCUSSION-multibrain-merge.md into Discussions; docker build -t vant . on a real host before any Hub push; then fresh-clone boot smoke against merged main.

**Previous (pass 128b)** — brain-lock stale-sweep TOCTOU race FIXED (CI gate B on PR 91 failed with wins=2 after 26+ clean local runs; root cause: the pre-create sweep could unlink a competitor's FRESH lock — descheduled racer R1 read stale, slept while R2 completed a full takeover, resumed and unlinked R2's lock, then O_EXCL'd in as a second live holder). Fix: split sweep by kind — symlink → unconditional unlinkSync (gates C/D contract: unlink on a link path removes ONLY the link; an inode guard is actively WRONG there because openSync follows links and the guard would compare victim-target inode vs the link and refuse to sweep forever); regular file → O_RDONLY|O_NOFOLLOW open, fstat-pin dev+ino, read via fd, verify stale, lstat again, unlink ONLY if inode unchanged. ATTEMPT 1 (inode guard on ALL cases) broke gate D 1/4 — kept for the lesson. SELF-INFLICTED: first edit wrote flags as 'r' + (rflag ? undefined : '') → "rundefined" → openSync throws, catch-all swallows it → silent regression to the racy path; numeric fs.constants.O_RDONLY|O_NOFOLLOW (=131072 on Linux) is the fix. VERIFIED: stress 6/6 (A-D), hammer 24/24 x2 under load, lock suites 21+2+10+6+23+19, ci.js 439/0/1skip, runner 37, vibe 4, coverage 36, sweep 169/169, surface PASS. GOTCHAS: (a) scratch racers process.exit WITHOUT release → fresh 30s lease left in models/private/.locks/ makes brain-lock.test.js fail 2 CORRECTLY — delete the leftover lease, never weaken the suite; (b) openSync's 3rd arg is MODE not flags — only numeric fs.constants flags are valid. Pass 128 (dafd960) before it: full CLI/MCP/server live-fire — 109/112 CLI verbs answer --help (bot correctly refuses without token; mcp/all were REAL bugs — `vant mcp --help/--stdio` fell through to the inline handler and started the HTTP server; fixed by delegating to bin/mcp.js). MCP stdio is a ONE-SHOT JSON DISPATCH, not an MCP transport (no initialize handshake, no notifications — vant_health/vant_search answer, unknown method → -32601); the HTTP door is the client surface — DEPLOY.md now says so. vant server battery 9/9: boots default, /health, /tools (FIXED: now 302 = 6 built-ins + full MCP surface; old branch called HTTP-Router.handle('tools/list') which can never work + fallback listed 6 of ~300), /call real + garbage, --auth boots, missing key 401, correct key 200. SECURITY FIX: wrong key used to get 200 — lib/server.js did `!validateApiKey(apiKey)` but validateApiKey returns {valid,reason} (always-truthy object); now checks .valid; all other callers were already correct. MCP door battery 6/6 (tools, vant_health, brain_migration_status, vant_search, clean unknown-tool error). LESSONS: (1) env-name guard blocks terminal commands containing env var names — test keys go through freebuff-env into .env.local (auto-loaded), neutralize after; (2) scratch harnesses must be write_file'd into repo root and deleted after (str_replace can't reach /tmp); (3) auth result-object vs boolean is a classic truthy-bug class — grep callers when fixing; (4) the /tools-undercount class: advertise what the EXECUTOR accepts, not what a registry fragment holds; (5) a CI-only flake that reproduces under synthetic CPU load is usually a REAL race hiding in a rarely-exercised window — read the lock code as an adversarial interleaving, not as the happy path; (6) unlink-on-sight is the wrong primitive for lease sweeps: pin identity (inode) or the path kind (symlink) BEFORE deleting. NEXT: owner merge-go for PR 91 (push re-triggers CI; race fix in), docker build test on a real docker host, then fresh-clone smoke.

**Previous (pass 127)** — ports audit + remote Docker + Deploy docs page. THE MAP: REST 3456 / MCP 3457 / webhooks 3467 (was 3456 = collision) / health-metrics 3468 (was hardcoded 3000, and the ONLY listener bound 0.0.0.0 — now loopback via VANT_HEALTH_BIND) / mesh crew bus 4890-4892; headless follows VANT_SERVER_PORT (was hardcoded 3000). FOUR CODE BUGS FIXED: (1) startFull('all') started NEITHER server (mode had to be exactly 'mcp' or 'api') — inclusive match now, Dockerfile CMD finally real; (2) `vant server` refused to bind on EVERY default install: lib/server.js listen() demanded sandbox canNetwork, which is deny-by-default AND per prd-security.md governs OUTBOUND only — gate removed, per-request security intact, MCP never had the gate (inconsistency proven); (3) startHeadless hardcoded port 3000 + used the shared default Server() which refuses plaintext HTTP — own instance, config-driven port/bind, allowInsecure (MCP parity; TLS auto-wins with VANT_SERVER_CERT/KEY); (4) health.js app.listen had NO bind arg = 0.0.0.0. DOCKER: shipped image had NO npm install (MODULE_NOT_FOUND on chalk) — now npm ci --omit=dev, non-root, HEALTHCHECK /health, CMD bin/vant.js all, bind ENVs loopback inside container (-p reaches it; 0.0.0.0 only for host network); compose rebuilt (app + bot, vant-models volume, dead DD/health service removed — it published 3000:3000 while REST sat on 3456). config.example.ini dead keys killed (MCP_API_KEY/MCP_PORT never read; real: VANT_MCP_API_KEY/VANT_MCP_PORT=3457) + honest note that vaf tunables come from config.get() not config.ini. DOCS: new docs/getting-started/deploy.md (nav'd, canonical = repo DEPLOY.md), deployment.md fiction removed (no `vant serve`, no `--daemon`). VERIFIED: live smoke (all: /health 200 + /tools 200; bare server binds; 0.0.0.0-no-TLS refused; headless answers), sweep 169/169, 4 lints PASS. TWO MID-PASS CORRECTIONS: (a) first CI run failed in 29s — the old bind gate made bin/server.js self-exit "Network permission required" which ci.js treats as ENV_DENIALS skip, so the smoke stayed green for months while the server never started; un-bricking exposed the TLS gate as a hard fail (SERVER_BIN must stay alive). New coherent rule in lib/server.js listen(): plaintext OK on loopback binds, non-loopback without TLS refuses unless --insecure; startFull/headless pass allowInsecure deliberately (runtime paths, loud warnings); (b) my container-bind claim was backwards — docker -p forwards to the container IP, so loopback inside a container is UNREACHABLE via published ports; image now ENV-binds 0.0.0.0 and compose publishes on HOST loopback (127.0.0.1:3456:3456) as the privacy control. LESSON: composite/posture bugs hide behind green suites — nothing tested `vant all` end-to-end or a bare `vant server` bind; the 'allow plaintext on loopback' MCP parity decision is load-bearing for headless/all (strict TLS stays on the CLI). NEXT: owner merge-go for axolotl to main (PR 91), fresh-clone smoke, optional: wire webhook/health ports into a surfaces doc + bin/vant.js help.

**Previous (pass 126)** — DEPLOY.md canonicalized (full rewrite: fabricated config.ini sections [core]/[brain]/[sync]/[sandbox]/[sudo]/[audit] removed — real config.ini is the flat CONFIG_TEMPLATE surface, policy is code; dead verbs killed: `vant init`, `provider add`, `backup create --name/--password`, `transform toHorcrux`, `health --json`, `--log-format=json`, `agents.spawn('name',{...})`, `vant think/act`, sync raid, Redis locking, pre-multibrain models tree; reality documented: ports 3456 REST / 3457 MCP + loopback binds + VANT_SERVER_BIND, backup create has NO flags and schedule is NOT IMPLEMENTED, horcrux inspect/create/restore/refresh + transform gather|full|horcrux|backup|extract|restore|status, <agent>-p_<password>.svg convention, sync protected-branch --branch opt-in, connector/s3/mirror flags, agents spawn SYNC {name,role} + flush, monitoring via system status/audit ledger/health counters). COLLATERAL TRUTH FIXES: Dockerfile ARG VERSION 0.8.4->0.8.6 + EXPOSE 3000->3456 3457; docker-compose health service 3000:3000->3456:3456 + VANT_SERVER_BIND=0.0.0.0 (bin/server.js defaults 3456 and binds 127.0.0.1 — the old published port could never answer). LESSON: DEPLOY.md was never under lint:docs (root file, linters scan docs/*.md only) and predates the truthfulness gates; root docs need manual verification like dist/ and nav.yml. This push also re-triggers CI on PR 91 (pass-125 run died to GitHub runner starvation, zero tests executed). NEXT: owner merge-go for axolotl to main (PR 91), then fresh-clone smoke against merged main.

**Previous (pass 125)** — docs+dist accuracy audit (pass 124: grant-model docs corrected — sudo.md + agent-onboarding.md now teach the pass-88/123 persisted-grant model; dist landing verified: 296 tools, version, links, migration bridge all accurate; labs link moved to tree/main since labs/ lands on main with the merge). PASS 125 FIXES: 2 broken anchors (search.md heading rename, mcp-tools.md tool-count rename), rls.md missing frontmatter (title/nav_order/version), duplicate nav_order 124 (embed+escrow, escrow -> 137), integrations/agents.md orphan rewritten from a STALE API (agents.create/update/delete do not exist) to the real lib/agents.js surface and surfaced via nav.yml + integrations index, setup.md documents the --brain-name > VANT_BRAIN > "vant" naming order. AUDIT LESSON: lint:docs only scans *.md — docs/_data/nav.yml and dist/ are unchecked surfaces; a one-off audit script (nav-to-permalink, anchors, dist links, frontmatter completeness) is the way. All gates green (lint:docs/surface/helpers). NEXT: owner merge-go for axolotl to main (PR 91 green at pass 124 CI, CLEAN), then fresh-clone smoke against merged main.

**Previous (pass 123)** — CI failure root-caused and fixed. THE CHAIN: test/ci.js bare-bin smoke ran `node bin/org.js` (default subcommand was 'grant', which persists operatorCapabilities) → models/private/vant/config.json polluted in CI → boot's pass-88 hydrate read via brain.getCurrentBrain() which IGNORES VANT_BRAIN → scratch-brain cold child hydrated the default brain's caps → operator-caps negative control saw spawn:true. FIXES: (1) bin/org.js default = 'status' (read-only; grant is explicit), grants persist via config.currentBrainName() (VANT_BRAIN-aware); (2) lib/boot.js hydrate resolves the ACTIVE brain via config.currentBrainName() with getCurrentBrain fallback — writer/reader now agree (state-store semantics: VANT_BRAIN wins); (3) operator-caps suite 8→10 gates: leak pin (planted vant-brain caps must not reach a VANT_BRAIN child; canSpawn is the discriminator, canWrite legitimately true via boot-task scopes) + bare-org read-only pin (config.json byte-snapshot; escrow.json runtime scribbles allowed). VERIFIED: fresh CI-sim tree, all four pre-steps green (ci.js 438, runner 37, vibe 4, coverage 36), zero operatorCapabilities in models/ after the bin smoke, standalone loop 169/169 in 4 chunks, local suites green, grant routing env-correct, eslint 0 errors. Local repro lesson: every failed repro shared one flaw — none ran test/ci.js first in the SAME tree; CI jobs are pipelines, simulate the whole pipeline.

**Previous (pass 121)** — env-aware import naming (flag > VANT_BRAIN > vant), migration boundary gates, PR 91 rewritten as the axolotl-vs-main release summary. Motivation: ~10k Docker Hub pulls run main, so the migration path is the front door and PR 91 is the release notes. NEW gates: journey 12-14 (scoped start imports into the VANT_BRAIN brain with zero MARK content leaking into a default brain; flag beats env; hostile env falls back). Gates: journey 14/14, migrations 28/28, grand tour 18/18, eslint touched 0 errors.
NEW test/migrate-onboard-journey.test.js (11 gates): the REAL CLI path an old-main (single-brain) user takes, on repo-copy fixtures shaped like origin/main. FIVE fixes it forced: (1) migrations marker I/O no longer goes through FileStorage (the storage-to-brain require chain booted the brain runtime inside every detect() call; its lazy escrow init materialized models/private/vant/orgchart/escrow.json on the legacy tree BEFORE the import plan, which then nested the scaffold INSIDE the user's named brain) now plain fs read + primitives.atomicWriteFile; (2) marker-supersedes in status()/migrate() so settled trees stop re-firing dropfiles against the imported brain's own state/*.json (pure content re-detection meant the tree never reported up-to-date; no marker still means content-only detection, crash recovery intact; dropfiles also defers while the legacy import owns the tree); (3) bin/start.js seeds AFTER the migrate child closes (seed-before-migrate let the starter placeholder win existing-wins over the user's REAL identity.md, stranding files at the private root with the tree still LEGACY; --no-migrate branch seeds immediately); (4) apply() plans BEFORE opening the store and skips runtime-only dirs via _runtimeOnlyDir; (5) audit-locks PATH_LITERAL_OK adds lib/migrations.js with justification (_runtimeOnlyDir classifies .locks dirs, never builds paths). Uber PR: open PR 91 (axolotl to main) is THE vehicle, body is STALE (still the 23-criticals audit wave), needs a rewrite before merge; owner approved A = sanity + merge after the migration check, merge to main still awaits explicit go.
Gates: journey 11/11, migrations.test.js 28/28, onboard 10/10, grand tour 18/18, sweep 168/168 env-free, npm test 0, test-core 5/5, test-all 0, check 0, lints x4 PASS, audit-locks PASS, audit-mcp 296/59/0/0/0/149/88/0 exact baseline, eslint touched 0 errors, scratch wiped.
NEXT: rewrite PR 91 title/body to describe the full axolotl arc (641+ commits); owner merge-go for axolotl to main; fresh-clone smoke against merged main.

**Previous (pass 119)** — E2E grand tour + sudo_grant disconnect + dead lint hatch.
NEW test/e2e-grand-tour.test.js (18 gates, ~1.5s): fresh clone boots (health/migrate/sweep, NODE_PATH bridges deps), LIVE MCP door (296 tools, deny-by-default agent_spawn, sudo_grant escalation CONNECTS via CAP_TO_SCOPE, spawn/list/kill lifecycle, malformed JSON no-500, DNS-rebind refused), edge (hostile VANT_BRAIN fallback, storage traversal, honest E_SANDBOX). THE FIX: MCP sudo_grant stored the RAW capability while sandbox.can asks sudo.can(agentId, MAPPED scope) — granted canSpawn could never satisfy canSpawn; now grants mapped scope + raw name. vant_sudo_grant was already right (param IS a scope). SECOND FIX: bin-truthfulness gate's STATUS-FIELD-OK hatch was dead since pass 80 (checked against comment-STRIPPED source); now checks RAW lines; bin/health.js's legit lock.stats().held read carries the marker (that read had been an unfixable red gate since pass 117 — the pass-117/118 "lint:helpers PASS" claims were WRONG). New test/bin-truthfulness.test.js 3/3 (unmarked fails, marked passes, hatch is line-scoped). Docs: sudo.md MCP-tools section (two grant doors). Gates: sweep 168/168 env-free, npm test 15/15, test-core 5/5, test-all 0, lints x4 PASS, check OK, eslint touched 0 errors (flushed a pre-existing zero-width space in check-bin-truthfulness.js docstring), audit-mcp 296/59/0/0/0/149/88/0 exact baseline, audit-locks PASS, scratch wiped, tmp clone cleaned.
NEXT (from 119): no open work. Candidates: tour fresh-install against a real npm install (CI-slow, skipped by design); more cross-surface tours (CLI verbs vs lib returns); owner's next direction.

**Previous (pass 118)** — post-PRD menu CLEARED (#4 lease live-fire, #5 spin hygiene, #6 small fry).
#5: acquire's wait now SLEEPS (Atomics.wait, 5ms poll; bounded-spin fallback)
— 400ms contended wait measured ~12ms CPU (was ~400ms); gate E in
lock-observability asserts CPU << wall. #4: test/livefire-lease2.test.js 10/10
— holder SIGKILLed via READY MARKER: lease file survives parseable, token
rotates to exactly ONE CAS successor, chained deaths (A→B→C) + clean release,
lease counters show the storm. #6a: audit.listArchives/readArchive +
`vant audit-ledger` CLI (list/--all/<file>/--action/--limit; stray arg =
E_INVALID_ARCHIVE, never a silent list). #6b: audit-locks GLOBAL_KINDS
allowlist (auth-lockout, vaf-blocked, mcp-insights) — unknown kind or quiet
swap to per-brain pathFor FAILS the audit (proven with temp fixture).
Live-fire lessons: LEASE root is repo-level models/private/.locks/
(.lock-<brain>.json) — per-brain .locks/ is the MUTEX root; pass {brain}
explicitly in lease tests or children fight over the REAL vant lease;
acquireBrainLock's ~750ms retry budget means takeover probes must HAMMER;
encodeURIComponent (not base64) through nested template literals.
Gates: sweep 166/166 env-free, npm test 15/15, test-core 5/5, test-all 0,
lint:locks/docs/surface/helpers PASS, check OK, eslint 0 errors, audit-mcp
296/59/0/0/0/149/88/0 exact baseline, scratch wiped.
NEXT: post-PRD menu EMPTY — owner's next direction.

**Previous (pass 117)** — lock observability + debris janitor (post-PRD #2 + #3).
#2: lock.stats() (mutex counters incl. aborted/holdMsMax/heldNow) +
brain-lock.leaseStats() (granted/refreshed/denied/released/releaseDenied/forced),
process-local, delta-read, NO reset API; surfaced in vant health,
health.getStackHealthStatus() (lock.mutex/lock.lease), MCP vant_lock
action="stats". #3: storage.sweepTemps({root,maxAgeMs,dryRun,maxDepth}) —
recursive <name>.<ext>.<uuid> aged-temp scan; vant health reports (dryRun,
read path never mutates), `vant health --sweep` removes (operator intent);
symlinks never followed, fresh temps + bystanders never touched; passive
atomicWrite sweep unchanged.
Gates: test/lock-observability.test.js 22/22 (delta-based, symlink + nested
cases), sweep 164/164 env-free, npm test 15/15, test-core 5/5, test-all 0,
lint:locks/docs/surface/helpers PASS, check OK, eslint 0 errors, audit-mcp
296/59/0/0/0/149/88/0 exact baseline, scratch wiped. Docs updated (locks
reference + operations, mcp-tools vant_lock stats row).
NEXT: post-PRD #4 (lease round-2 live-fire), #5 (sync-acquire spin hygiene),
#6 small fry — owner's pick.

**Previous (pass 116)** — save-refusal parity sweep done (post-PRD target #1).
Every §8.5 (a)-guard now surfaces refusals honestly: auth (withLockSync +
{persisted, code:'E_SAVE_REFUSED'} — the brute-force lockout lie is dead), vaf
(same), mcp brain_share (no more {shared:true} on abort; insights.json untouched
under refusal), agents (_saveAgents resolves {ok,reason,aborted}; _dirty KEPT on
abort so flush()/beforeExit retry; terminate/prune/restoreState surface persisted;
bin/agents kill prints the warning) + restoreState tombstone fix (_noteAgentSeen
per restored id — a refused terminate used to RESURRECT the agent on the retry
save; the parity gate caught it live).
SECOND-ORDER LESSON: auth/vaf called the ASYNC withLock from SYNC functions —
`.aborted` on a Promise is ALWAYS undefined; abort checks on unawaited promises
are dead code. Sync bodies read withLockSync. F7+F12 now both accept
`withLock(?:Sync)?\(`. Honest already: config/citations/habitat/state-store.
Gates: test/save-refusal-parity.test.js 16/16 (broken-root, VANT_REPO_ROOT tmp
isolation for auth/vaf circuit files), sweep 163/163 env-free, npm test 15/15,
test-core 5/5, test-all 0, lint:locks 0 leaked, audit-mcp 296/59/0/0/0/149/88/0
exact baseline, eslint 0 errors, scratch wiped. Full matrix: labs/LOCKS.md §8.12.
NEXT: post-PRD target #2 (lock observability counters in health/MCP) or #3
(debris janitor), owner's pick.

**Previous (pass 115)** — BOTH pass-114 live-fire product findings fixed.
(1) create* lying success: new lock.withLockSync (sync twin, plain-value return,
aborts as {ok:false,reason,aborted:true}) + _saveTeams() now SYNC returning the
honest {ok,reason}; all 11 teams mutators do snapshot→mutate→rollback and return
{error, code:'E_SAVE_REFUSED', reason} on refusal; store.write failures inside the
lock body also surface (body owns its outcome — the second flavor of the lie).
(2) atomicWrite debris: _sweepStaleTemps before every write — same-dir
<basename>.<uuid> (uuid regex) with lstat mtime older than 60s, unlinked,
best-effort, scoped per target (fresh in-flight temps safe).
Gates: livefire-kill9 6/6 (gate D plants its own debris when the kills leave
none — deterministic), lock.test 19/19 (+4 withLockSync), teams-crossprocess
9/9 (new gate C: held lock → refusal + no memory row; release → persists),
lock-failclosed 6/6 (updated — the old gate PINNED the lying success).
Full: sweep 162/162 env-free, npm test 15/15, test-core 5/5, test-all 0,
lint:locks PASS — F7 regex is `withLock(?:Sync)?\(`; NOTE `withLockSync?\(`
is a footgun (Syn mandatory, stops matching withLock(), other writers break),
audit-mcp 296/59/0/0/0/149/88/0 exact baseline, eslint 0 errors, scratch wiped.
withLockSync documented in docs/reference/locks.md + docs/operations/locks.md.

**Previous (pass 114)** — live-fire targets 2-6 destroyed, gates permanent.
test/livefire-kill9.test.js (4) + test/livefire-lease.test.js (2) +
test/livefire-stress.test.js (4). Results: kill-9 stale takeover 5/5;
FileStorage temp+rename survived 5 mid-write SIGKILLs of 5MB writes; teams
recovers via fail-closed refusals + 10s takeover; TTL expiry under 3-contender
load: ZERO two-holder samples (~70 sampled); force-release mid-write: lease
changed hands, all mutex writes landed whole; CAS at scale 12x2 mutex + 8x3
lease: all clean; symlink replant (mutex + lease): sweeps unlink the LINK,
victims byte-intact. TWO PRODUCT FINDINGS for the owner: (1) atomicWrite
debris — SIGKILL mid-writeFileSync leaves permanent <file>.<uuid> temps,
nothing sweeps them (candidate: same-target temp sweep age > 60s on write);
(2) create* LYING SUCCESS — teams.createOrg returns {id} even when _saveTeams
was fail-closed refused (org memory-only, vanishes on restart); fix =
propagate the abort marker through create* returns. Harness lessons:
kills need a READY-MARKER file + stagger (module load eats spawn-timers);
acquire staleness is MTIME-based (plant stale with fs.utimesSync, the JSON
`at` field is ignored); lease file = JSON\n---\ntoken split format; judge
success by PERSISTENCE not by create* returns. Gates: sweep 162/162 env-free,
npm test 15/15, test-core 5/5, test-all 0, lint:locks 0 leaked, audit-mcp
296/0/0, eslint 0 errors, scratch wiped.

**Last known good commit:** pass 113 — live-fire: EPIPE fatal storm destroyed.
Root cause was a three-link chain: two Sep-30 zombie QC probes (~85% CPU each,
writing to dead pipes) + vant.js's fatal handler console.error()ing into the
broken stream (self-feeding re-entry, 172k re-entries in the repro) +
audit.log() rewriting the whole ledger per append (47.55 MB / 165k rows, still
growing during the session). Fixed natively: handler re-entrancy flag + 1s
cool-down + wrapped stderr writes; audit ledger capped LEDGER_MAX_ENTRIES=
10000 at the write sites (trim 1x-2x, in-place archive at 2x). Verified: 397
fatals + 172k re-entries -> 3 cool-down rows. Permanent gates:
test/epipe-guard.test.js (2) + test/audit.test.js cap gates (+2, now 24).
Zombies SIGKILLed (372828/374259); MCP-door servers left alone. Ledger
sanitized 165,311 -> 29 legit rows (47.55 MB -> 14.3 KB); models/audit-rotate/
gitignored. LESSONS: getBrainPath() honours process.env.VANT_BRAIN FIRST
(that is the test-isolation lever, not pushBrain); audit archives are BARE
ARRAYS; a broken stderr swallows crash reports (exit 7 = handler-internal
failure — the probe caught MY OWN typo this way: FATAL_LOG_COOLDOWN_MS).
Gates: sweep 159/159 env-free, npm test 15/15, test-core 5/5, test-all 0,
lint:locks 0 leaked, audit-mcp 296/0/0, lint:docs 131, surface/helpers PASS,
eslint 0 errors. NEXT (live-fire continues): kill-9 mid-save races across all
guarded writers, TTL-expiry under load, force-release during active writes,
CAS two-holder stress at scale, symlink replant attacks.

**Last known good commit:** pass 112 — locks S6 (documentation, F13).
docs/operations/locks.md + docs/reference/locks.md written (two types,
roots, postures, exact exports/returns; CLI verbs verified against
bin/lock.js — acquire/release/status/force, NO stack CLI verb); mcp-tools
vant_lock entry expanded + Return Types row de-staled; ops/reference index
rows (nav_order 66/136); README pointer; ROADMAP lock lines 557/599/606
refreshed. Docstrings audited accurate. Gates: lint:docs green, lints ×4,
check, sweep 158/158 env-free, npm test, test-core, test-all, audit-locks
0 leaked, MCP 296/0/0, scratch wiped. STAGE S1-S6 ALL DONE — the locks PRD
(labs/LOCKS.md §8) is complete. NEXT: owner's live-fire/destructive
real-time session. Order: EPIPE audit-log pollution FIRST
(models/private/vant/.audit.json was 44 MB / 147,913 write-EPIPE fatal
uncaughtException entries since Oct 2 04:37Z, bursts at workspace wake-ups;
candidate fix = drop/rate-limit EPIPE fatals + cap audit size), then
kill-9 mid-save races across all guarded writers, TTL-expiry under load,
force-release during active writes, CAS two-holder stress at scale, symlink
replant attacks. Platform rules: no backgrounding — build destructive tests
as self-contained child-process scripts (runChild + barrier flags pattern
in test/market-crossprocess.test.js is the template); run the sweep WITHOUT
VANT_BRAIN exported.

**Last known good commit:** pass 111 — locks S5 (unguarded-writer triage,
F12). All 11 §8.5 candidates decided (matrix in LOCKS.md §8.5): five
**(a) merge-under-lock guards** — auth lockout + vaf blocklist (security;
new lock.pathForGlobal repo-scoped root models/.locks-global/), brain config
(sync-preserving shallow merge; saveBrainConfig stays SYNC), mcp insights
(re-read after embed awaits, dedupe by id), citations (re-read, fail-closed
null); six **(b) accepted** with reasons. BONUS: auth's lockout branch never
persisted (memory-only) — fixed. Harness catch: Object.entries(Map) yields
[] — the vaf merge silently dropped local blocks until the new gate caught
it; Map iteration required. audit-locks F12 gate: the five writers must keep
withLock(; .locks-global leak-scanned + gitignored. Suite count 157→158
(test/snapshot-guards.test.js, 6 gates). Gates: sweep 158/158 env-free,
lints ×4, eslint 0 errors, check, npm test, test-core, test-all, audit-locks
0 leaked, MCP 296/0/0. NEXT: S6 (docs — docs/operations/locks.md,
docs/reference/locks.md + MCP entry, README pointer, ROADMAP 557/599/606,
accurate docstrings), then owner's live-fire/destructive real-time session
(EPIPE audit-log pollution is a queued target).

**Last known good commit:** pass 110 — native lock contention (monkeypatch
seam dropped). withLock calls internal acquire directly again (the pass-109
module.exports.acquire indirection existed only for the tests' property
replacement). lock-failclosed + market gate D now create REAL contention: a
regular FILE at the scratch brain's lock root makes every acquire() fail
`unavailable` instantly (mkdirSync on a file throws) — real filesystem path,
zero stubs. Gate C's withLock spy remains (wraps + delegates, measurement
only). BONUS: switching the technique flushed a real pass-109 bug —
teams._saveTeams checked `.aborted` on withLock's PROMISE without awaiting,
so the fail-closed log was dead (refusal worked, log didn't); now awaited,
write stays synchronous (restoreState exit-safety contract preserved).
Census: zero lock-module property replacements in product code. Gates: sweep
157/157 env-free, lints ×4, eslint 0 errors, check, npm test, test-core,
test-all, audit-locks 0 leaked, MCP 296/0/0. Next: S5 (unguarded-writer
triage, F12 decision matrix), then S6 (docs).

**Last known good commit:** pass 109 — locks S4 (withLock migration, F7).
All four whole-snapshot writers (state-store.persistMerged,
teams._saveTeams, agents/internal._saveAgents, habitat.save) now go through
lock.withLock (failMode 'closed', same 10s/8s timings, merge-under-lock
kept, fail-closed messages unchanged); dead _acquire/_release helpers
removed. persistMerged is now ASYNC (withLock returns a Promise) — lib
callers ignore the return, lock-failclosed's two persistMerged tests await
it. withLock routes acquire through module.exports.acquire so the
fail-closed tests' lock.acquire monkeypatch still intercepts. audit-locks
now FAILS if any of the four writers lacks withLock( (F7 gate).
market-crossprocess gate C spy filters to 'market-trade' path locks (its
intent is per-listing scope, not total withLock traffic). Gates: sweep
157/157 env-free, lints ×4, eslint 0 errors, check, npm test, test-core,
test-all, audit-locks 0 leaked, MCP 296/0/0. Next: S5 (unguarded-writer
triage, F12 — decision matrix per module), then S6 (docs).

**Last known good commit:** pass 108 — lock defect hunt (four bugs fixed).
Owner said the recent lock commits have def bugs; a probe-driven hunt
confirmed: (L1) brain-lock same-agent re-acquire FAILED (dead
`existing.token === token` refresh branch) — now refreshes by agentId with a
stable file token; (L2) stale takeover was a blind atomic REPLACE — two
takers could both win (1/12 races observed) — now re-check + O_EXCL create
(CAS); (L3) lib/lock.js release()/exit hook deleted by path with no
ownership check — a stalled predecessor clobbered the successor's live lock
— now pid-verified, takeover loop bounded; (L4) forceReleaseBrainLock
returned undefined — now boolean (MCP `vant_lock force` truthful). Tests:
lock 13→15, brain-lock 18→21. All gates green (sweep 157/157 env-free, MCP
296/0/0, audit-locks 0 leaked). Next: S4 (migrate to `withLock`, F7).

**Last known good commit:** pass 107 — locks stage S3 (wire-up completion).
F6 closed: `lib/tmp.js` put/delete now lazy-require `./brain-lock` and call
`acquireBrainLock`/`releaseBrainLock` directly — no more implicit
`global._lock` (shell.js was the last writer; it now uses a local lazy cache, so
the global is gone; bin/tmp.js no longer wires it). Surfaces: `health.
getStackHealthStatus` returns a `lock` field `{layer,byBrain,held}` and `vant
health` prints it; MCP `vant_lock` status includes `stack`+`held` (+ new `stack`
action); `vant lock status` prints the whole-stack view; boot.init dropped the
dead `if (lock.init)`. Tests +8 across brain-lock/health/tmp. 11 files.
⚠️ HARNESS: run the 157 sweep WITHOUT `VANT_BRAIN` — test/migrations.test.js's
spawned probe inherits it and false-fails on the legacy-main read test (157/157
with it unset). All gates green. Next: S4 (migrate to `withLock`, F7).

**Last known good commit:** pass 106 — locks stage S2 (separation-of-concern
contract). F8–F11 closed. Documented the two lock roots in code headers: mutex
`lib/lock.js` = per-brain `models/private/<brain>/.locks/` (pathFor); lease
`lib/brain-lock.js` = cross-brain `models/private/.locks/.lock-<brain>.json`
(temp+rename, not O_EXCL) — MUST stay separate. F11: `lib/recursion.js guard`
labelled a depth guard, not a lock (requires neither module). F10: in-process
save chains (`_teamsSaveChain`/`_saveChain`) labelled write-ordering-only.
`scripts/audit-locks.js` now ASSERTS the contract (two roots, no cross-require,
recursion non-lock, writers take the mutex). 6 files. All gates green (sweep
157/157, MCP 296 reg / PHANTOM 0). Next: S3 (wire-up completion, F6/F7).

**Last known good commit:** pass 105 — locks stage S1 (truth-up the lease).
F1–F5 closed. F1 was REMOVED (not wired): the lease is acquired hot by internal
writers, so rate limiting is QoS's job — deleted the dead `_checkRateLimit`
(undefined `errors`), its constants/maps, and the docstring claim. F2 added
`getLayerStatus()`. F3 fixed `listStackLocks` (was spreading strings) + dropped
`listBrainLocks`; stack helpers now pass brain explicitly (no pushBrain). F4
`bin/lock.js release` honours `.success` (was false success + token wipe on a
denied release). F5 `getState().lockStatus` is data now. test/brain-lock.test.js
= 14 (async runner). Marker for S1 file locations in labs/TASKS.md. Next: S2
(separation-of-concern contract).

**Last known good commit:** pass 104 — lock-system PRD (labs/LOCKS.md §8, S1–S6).
Walk-back audit found 13 issues; High: F1 (brain-lock rate limit dead AND would
ReferenceError — `errors` undefined, no caller), F4 (`vant lock release`
succeeds/clears the token on a DENIED release because it truthiness-checks an
always-object), F12 (tail of unguarded whole-snapshot writers). Medium: no
getLayerStatus (boot hardcodes lock layer), listStackLocks spreads strings,
getState().lockStatus returns a fn ref, tmp locks via implicit global._lock,
withLock used by market only, two .locks roots undocumented. Stages S1–S6 +
acceptance/gates are in labs/LOCKS.md §8.6–8.8. Next: S1.

**Last known good commit:** pass 103 QC — locks gaps/edges. New
test/lock-failclosed.test.js (6) proves the fail-closed refusal actually
refuses writes (state-store/teams/habitat) and recovers; test/lock.test.js
grew to 13 (withLock releases on sync throw; closed abort never deletes a
peer's lockfile). Hardened scripts/audit-locks.js: it now also catches a quoted
string ENDING in `.lock` (the old `path.resolve(base, '.habitat.lock')` class),
verified via a 7-case regex probe. Non-findings: rls-hookups "poisoned
_cacheLock" is behavioral (still valid); no stale identifiers. Gates: sweep
157/157, lint:locks PASS, check, eslint 0 err, zero leaked locks.

**Last known good commit:** pass 103 — locks §4 (posture, one lock root, mutex collapse, fail-closed, audit).
`lib/lock.js` mutex now: `acquire()`→`{ok,reason}` (acquired|held|unavailable);
`withLock(path,fn,{failMode})` closed-by-default (never runs fn without the
lock; returns `{ok:false,reason,aborted:true}`), open runs fn(result), sync fn
released synchronously; new `mutex()` and `pathFor(kind,id)`. All file locks
moved to `models/private/<brain>/.locks/` (retired the 4 ad-hoc formulas).
In-process mutexes (consensus/cache/canvas) now use `lock.mutex()`; deleted the
dead `storage.LockStorage`. Fail-CLOSED at persistMerged/teams/agents/habitat
(refuse unlocked write + log reason) — no more last-writer-wins. Bonus: agents
roster lock now spans merge+write. `scripts/audit-locks.js` + `npm run
lint:locks` enumerate 8 mutex / 10 lease requires, 0 leaks. Tests updated for
new lock paths; new test/lock.test.js (11). Gates: sweep 156/156, lints
PASS, eslint 0 err, check, audit-mcp 296 THREW0/TIMEOUT0/INVALID0/REFUSED149/
OK88/PHANTOM0, npm test 15/15, test-all 0, test-core 5/5, zero leaked locks.

**Last known good commit:** pass 102 — lock naming split (brain-lock lease vs lock mutex).
Owner chose to keep both lock concepts but name them unambiguously. `lib/lock.js`
(authorization lease) → `lib/brain-lock.js`; `lib/flock.js` (cross-process
mutex) → `lib/lock.js`. Extended to fn/method/event level: the lease exports
are now `acquireBrainLock`/`releaseBrainLock`/`brainLockStatus`/
`forceReleaseBrainLock`, events `brain-lock:*`, config `BRAIN_LOCK_CONFIG`,
internals `_getBrainLockFile`/`ensureBrainLockDir`, log prefix `[brain-lock]`;
the mutex keeps `acquire`/`release`/`withLock`. Updated all 8 lib consumers +
bin/lock,build-test,tmp,node + mcp `vant_lock` + docs/ROADMAP + tests.
`test/lock.test.js`→`test/brain-lock.test.js`; deleted dead `test/test-lock.js`.
`.gitignore`: added `models/**/*.lock` + relabeled lock block, removed redundant
rot (`models/public/.state.json`, `models/.resolution.json`, `models/.providers.json`,
`temp/models/latent/*.vpatch`). LOCKS.md §4 behavior items still open. Gates:
sweep 155/155, lints PASS, eslint 0 err, check, audit-mcp 296 THREW0/TIMEOUT0/
INVALID0/REFUSED149/OK88/PHANTOM0, npm test 15/15, test-all 0, test-core 5/5,
zero leaked locks.

**Last known good commit:** pass 101 — market lock limitation + CLI help-syntax + escrow hold leak.
(1) MARKET: open-ended listings no longer take the per-listing flock; the
lock body is now fully synchronous (budget/hold/trust/governance hoisted
above it); fail-closed `E_TRADE_LOCK` + release buyer hold when the lock is
unavailable (no more proceed-unlocked). test/market-crossprocess.test.js
8/8 (open-ended no-lock pinned via a `flock.withLock` spy). (2) CLI HELP:
`vant --help` summary now shows `--status/--drill/--reset` etc. (was bare
words); docs/reference/cli.md s3 lines fixed; regression in
test/remote-cli.test.js. (3) ESCROW HOLD LEAK (found while fixing 1):
`escrow.release()` never removed the persisted hold — the additive
`_saveEscrow` union re-added it; holds accumulated to `maxHolds` and then
ALL trades failed. Fixed with `_deletedHolds` applied after the union;
test/escrow.test.js gate added. (4) LOCKS: labs/LOCKS.md inventory +
canonicalization proposal; no refactor yet. Gates: sweep 155/155, lints
PASS, eslint 0 err, check, audit-mcp 296 THREW0/TIMEOUT0/INVALID0/REFUSED149/
OK88/PHANTOM0, npm test 15/15, test-all 0, test-core 5/5, zero leaked locks.

**Last known good commit:** pass 100 — live-fire (single install + mesh), 2 bugs.
Scratch-brain live fire of the CLI/MCP. (1) CROSS-PROCESS MARKET OVERSELL:
the scarcity reserve in market.trade is per-process (`_reserved` not
persisted; `trades` commits only after the escrow awaits) and `_applyMarket`
skips held listings, so two processes both sold a supply-1 listing (persisted
counter desynced to 1 vs 2 trade records). Fixed with a per-listing
cross-process `flock` across reserve→commit + `_adoptCommittedTrades`
re-reading disk `trades` under the lock. (2) CONFIG PROTOTYPE POLLUTION:
`config.setConfig` walked dotted keys with `node = node[part]`; `__proto__`
hit Object.prototype, so MCP `vant_config_set` key `__proto__.x` polluted
every object (`({}).x === v`). Fixed: refuse `__proto__`/`constructor`/
`prototype` segments (E_KEY_SEGMENT). NEW test/market-crossprocess.test.js
3/3; test/config-persistence.test.js +gate D 13/13. NOTE: `vant wal/mirror/s3
status` (bare word) exit 1 — real syntax is `--status`; help is misleading.
Gates: sweep 155/155 chunked, lints PASS (docs 129/surface/helpers), eslint 0
err, npm run check, audit-mcp 296 THREW(0)/TIMEOUT(0)/INVALID(0)/REFUSED
149/OK 88/PHANTOM 0, npm test 15/15, test-all exit 0, test-core 5/5, zero
leaked locks. Queued: left the wal/mirror/s3 help-vs-syntax mismatch
unfixed (doc-only); draft axolotl→main PR; MEM/TASKS→vant-native + whitepaper.

**Last known good commit:** pass 99 — proactive tombstones + cross-process reap.
Closed the two pass-98 caveats. (1) market/settlement got the `_seen*` +
tombstone-aware merge UP FRONT (append-only today, so a no-op behaviourally,
but a future hard-delete is now safe by construction) — proves via a
`_deleteForTest` seam. (2) consensus reap is now CONVERGENT across processes:
`_reapedTopics` (topic→reapedAt) is persisted in the snapshot (`reaped`
array) and `_mergeLedgers`/`_applyLedgers` adopt peer reaps and drop held
copies — no more resurrection by a peer that still held the reaped topic.
BUG the new gate caught: a re-pull's own persist re-read the stale on-disk
reap and re-tombstoned the recovered topic → fixed with a clock-free
`_reapRecovered` intent set (also keeps agora-hygiene's round-trip green).
NEW tests: test/state-store-tombstones.test.js 2/2;
test/consensus-reap-crossprocess.test.js 6/6. Gates: sweep 154/154 chunked,
lints PASS (docs 129/surface/helpers), eslint 0 err, npm run check,
audit-mcp 296 THREW(0)/TIMEOUT(0)/INVALID(0)/REFUSED 149/OK 88, npm test
15/15, test-all exit 0, test-core 5/5, zero leaked locks. Queued: draft
axolotl→main PR (merge-readiness done pass 96); MEM/TASKS→vant-native +
whitepaper.

**Last known good commit:** pass 98 — state-store family cross-process lock.
Fixed the two items pass 97 documented-not-fixed. (1) STATE-STORE FAMILY:
consensus / market / node-registry / settlement all wrote whole snapshots
with no cross-process lock (peers that hydrated before either wrote
clobbered each other). New `stateStore.persistMerged` (lock at the brain
root via new `lib/flock.js`, re-read disk, adopt unseen, write union) wired
into all four. node-registry `unregister` and consensus `reap` are
tombstone-safe (seen-set); consensus also UNIONS votes for held topics;
market/settlement are append-only so adopt-unseen only. Gotcha: consensus
marking must cover EVERY `_ledgers.set` path — mergeTopic was missed and
agora-hygiene caught the reap-resurrection. (2) LOCK LEAK: `lib/flock.js`
registers a `process.on('exit')` that unlinks held locks (finally can't run
on abrupt mid-await exit); habitat/teams/agents-internal refactored onto
flock. Verified ZERO leaked locks after the full 152-suite sweep. NEW
test/state-store-crossprocess.test.js 5/5. Gates: sweep 152/152 chunked,
lints PASS (docs 129/surface/helpers), eslint 0 err, npm run check,
audit-mcp 296 THREW(0)/TIMEOUT(0)/INVALID(0)/REFUSED 149/OK 88, npm test
15/15, test-all exit 0, test-core 5/5. Queued: draft axolotl→main PR
(merge-readiness done pass 96); MEM/TASKS→vant-native + whitepaper.

**Last known good commit:** pass 97 — habitat cross-process fix + QC.
HABITAT FIX (the pass-96 deferred finding): save() wrote the whole
in-memory snapshot (workspaces/roles/boundaries/tokens) while
adopt-on-load ran once at restore(), so peers that hydrated before either
wrote clobbered each other (pre-fix: 4 concurrent createWorkspace → 2).
Now every save takes a lockfile, re-reads the _habitat row FRESH, adopts
unseen newcomers, writes the union; tombstone-safe (seen-but-absent ids
stay deleted), roles per-triple. Required a `fresh` flag on BOTH
memory.recall and brain._loadBrain (two caches). NEW
test/habitat-crossprocess.test.js 5/5. SELF-INFLICTED BUG caught + fixed:
lock at `<brain>/state/_habitat.json.lock` collided with lib/migrations'
dropfiles.tmp-space sweeper → broke migrations idempotency; moved to brain
root `.habitat.lock`. QC round 2: 5 more MCP stubs wired real —
vant_commit / vant_sync / vant_lock (+required action) / vant_health /
vant_create_branch. DOCUMENTED NOT FIXED: consensus/market/node-registry/
settlement whole-snapshot writes with no cross-process lock (single-writer
hub assumption, lower blast radius); fire-and-forget habitat saves can leak
a lock on abrupt exit (stale >5s takeover reclaims). Gates: sweep 151/151
chunked, lints PASS (docs 129 / surface / helpers), eslint 0 err, npm run
check, audit-mcp 296 THREW(0)/TIMEOUT(0)/INVALID(0)/REFUSED 149/OK 88,
npm test 15/15, test-all exit 0, test-core 5/5. Queued: consensus/market
family lock parity; MEM/TASKS→vant-native + whitepaper (owner: later);
draft axolotl→main PR (merge-readiness done in pass 96).

**Last known good commit:** pass 96 — merge-readiness checklist + QC.
MERGE-READY VERDICT: axolotl→main conflict scan is DEFINITIVELY clean —
main's tip tree (`c11ae19…`) is byte-identical to the merge base
(`36d6f62`); the single main-only commit (5965e14, merge of PR #52
"evolution") is content-neutral, so main adds nothing. 615 commits our
side, 0 files changed on both sides since base. QC found + FIXED:
(1) teams.json cross-process last-writer-wins (proven 4 concurrent
createOrg → 1 org; fixed with lockfile+adopt+tombstone mirroring pass 95;
NEW test/teams-crossprocess.test.js 5/5; _resetHydration now clears
tombstones). (2) MCP stubs in the audit OK bucket: vant_audit_log /
_audit_list / _succession_info / _sandbox_status were hardcoded — now real
(succession reported the brain's REAL 'medium', the stub lied 'high').
QC found + DEFERRED: (3) habitat state has the same cross-process class
(4 concurrent createWorkspace → 2) — deferred because it's the
pass-91-hardened RLS/tenancy/token map surface and needs a tombstone-safe
merge on its own pass. Also fixed bin/build.sh (was broken+stale:
missing states/REGISTRY.txt, hardcoded v0.5.0 → now reads package.json)
and lib/version.js's false "docs has no changelog" note. Gates: sweep
150/150, lints PASS, eslint 0 err, npm run check, audit-mcp 296 THREW(0)/
REFUSED 148/OK 89, npm test 15/15, test-all/test-core exit 0. Queued:
habitat merge (finding #3); MEM/TASKS→vant-native + whitepaper (tonight).

**Pass 95:** cross-process seams: roster
merge + config persistence. Survey note: pass-95 work was already on
disk (uncommitted) when this session resumed; it was INCOMPLETE.
(1) ROSTER: lib/agents/internal.js cross-process merge — lockfile
(agents.json.lock in the orgchart dir) + _seenIds tombstone +
_noteAgentSeen; adoption of never-seen ids; _saveAgents() now takes
NO param (writes _agents after the merge). test/roster-
crossprocess.test.js 6/6 (4 concurrent children + tombstone gate).
(2) CONFIG: lib/config.js setConfig() persists into the CURRENT
brain config.json (loadBrainConfig/saveBrainConfig), bin/config.js
set/get rewired; MCP vant_config_get/set were PURE STUBS → now real
+ required[] (audit OK→REFUSED +2). FINISHING SEAM: mcpRequireKey()/
mcpApiKey() (the MCP auth gate's accessors) never read brain config,
so `vant config set mcp.requireKey true` / `mcp.apiKey` were no-ops
for a later server → new _brainConfigValue() bridge (env still
wins). test/config-persistence.test.js 10/10 (cross-process +
negative control). (3) lib/brain.js brainDirs skips dot-dirs
(models/private/.locks was listed as a brain). (4) version.js
comment: changelog is repo-root CHANGELOG.md, not docs/.
Gates: sweep 149/149 chunked, lints PASS, eslint 0 errors, npm run
check, audit-mcp 296 THREW(0)/REFUSED 147/OK 90, npm test 15/15,
test-all/test-core exit 0. Queued: merge-readiness (axolotl→main);
MEM/TASKS→vant-native + whitepaper (owner: later tonight); prime's
#100–#112 still OPEN on GitHub (manual close after prime verifies).

**Pass 94:** second-boot gate (10/10,
ZERO product bugs — the existing-brain path is healthy).
Verified by hand (boot1 seed → mutate → boot2 → boot3), then
codified: no re-seed/clobber, identity sha-stable across boots,
migrate idempotent, orgs/roster/workspaces rehydrate in fresh
processes, agent FIELD bindings env-correct (pass-93 seam
holds), vant brain byte-untouched (orgchart + state.json),
no tree deletion (pass-89 canvas class), honest sync/update
refusals, MCP round-trip in the env brain. PROBE GOTCHAS:
agents.list() is ASYNC and PROJECTS {id,name,role,state,mcp}
ONLY (brain stripped by design) — assert bindings via
orgchart/agents.json [[id, agent], ...] Map shape;
transform.gather capturing ALL brains = documented multibrain
full-capture inventory, not a leak. Gate joins the sweep (147
suites). ALSO this pass: transform.js gather/backup, horcrux
create/inspect on an existing env brain verified (roster 2,
2 orgs after 2 demos — unique-suffixed names, no guards
tripped). Gates: sweep 147/147 chunked, lints PASS, eslint 0
errors, npm run check, audit-mcp 296 THREW(0), npm test 15/15,
test-all/test-core exit 0. Queued (tonight): MEM/TASKS →
vant-native + whitepaper rewrite; merge-readiness next;
prime's #100–#112 still OPEN on GitHub (manual close after
prime verifies).
Pass 93 (5bfb521): fresh-boot live fire, 3
real bugs + standing gate. (1) SEED SEAM: bin/start.js
seedStarterBrain read state.json stack[0] ONLY, ignored
VANT_BRAIN → env-brain starts found the default brain populated
and never seeded → every env-scoped fresh brain woke with NO
identity/goals/lessons (health: "in use, scaffold skipped"
forever). Fixed via state-store.currentBrain(). (2) SPAWN-
BINDING: lib/agents/core.js bound the agent's brain FIELD via
bare Brain.currentBrain() while the ROSTER persisted in the env
brain (teams.getAgentBrain/writeTo targeted the wrong brain
forever); teams.js:1027 first-assign fallback same. Both
state-store-aware now; proven via org demo on-disk records.
(3) SUMMARY STUB: bin/summary.js canned placeholder was PINNED
by test-all's output check; rewrote as real brain-derived
summary + fixed --json parsed from argv.slice(3) (never fired).
Worked first try: boot chain, org demo e2e, hybrid search,
learn, MCP HTTP 296 tools + write/read round-trip landing in
the env brain. autoWireCoreLibs (mcp.js:3182) stays COMMENTED
OUT — superseded by 153 explicit vant_* tools (its generic args
shape bypasses per-tool validation). LAYER MAP: brain.write(
category,key) = memory STORE layer, brain.read(name)/MCP
brain_read = flat brain-FILE layer — don't mix in probes.
NEW test/live-fresh-boot.test.js 5/5 (fresh brain → boot seeds →
health clean → org demo binds env brain → summary real → MCP
HTTP round-trip; scratch brain p93-live-fresh, probed MCP port).
Gates: sweep 146/146 chunked, neighbors green, lints PASS,
eslint touched 0 errors, npm run check, audit-mcp 296 THREW(0),
npm test 15/15, test-all/test-core exit 0. Queued (tonight):
MEM/TASKS → vant-native + whitepaper rewrite; prime's #100–#112
still OPEN on GitHub (manual close after prime verifies).
Pass 92 (2776ee2): vapor hunt + CLI smoke
gate + live-fire flake. Survey: first zero-ref grep gave 11 dead
modules — FALSE ALARM, the pattern missed bin's '../lib/x'
requires (zero truly dead; api.js MCP-live via autoWireCoreLibs;
34 .catch(()=>{}) sites all documented-intentional; FileStorage
.write is SYNC so no #109 persistence vapor in the 10 CLI flows;
MCP 0 phantoms, 145 honest refusals; bot.js = honest token
gate). Fixed: vant_agents_delegate_mcp + vant_agents_broadcast
schemas had no `required` → {} passed validation and died as
'Agent not found: undefined' (now MCP_INPUT_INVALID — remember
mcp.execute returns validation failures as RESULT objects, not
throws); CLI --help polish on vant.js (bare/-h/--help → help
cmd), docs.js, transform.js, test-core.js (-h → modes list);
live-fire webhook flake: 46000+pid%2000 collided with a platform
listener on the link-local IP (169.254.0.21:46116) and the ss
assertion grabbed the FIRST line matching the port (order
unstable, flapped 1-in-3 standalone — NOT cli-smoke pollution,
cli-smoke only reshuffles pids) → OS-assigned free port via
net.listen(0) + assert OUR 127.0.0.1:PORT line + wildcard absence.
NEW standing gate test/cli-smoke.test.js (node --check all 120
bin CLIs + --help exit-0/usage on 118; skip bot.js token-gate,
cli-standard.js template; auto-joins test-core full mode) — CLI
rot now fails a gate, not a user. Gates: sweep 145/145 chunked,
lints PASS, eslint touched 0 errors, npm run check, audit-mcp
296 THREW(0), npm test 15/15, test-all/test-core exit 0. Queued
(tonight, per owner): MEM/TASKS → vant-native + whitepaper
rewrite; prime's #100–#112 still OPEN on GitHub (manual close
after prime verifies).
Pass 91 (dd94705): #113 + habitat/RLS adversarial QC. #113: horcrux create's auto-.ignore used
REPO_ROOT = __dirname/.. (INSTALL root) → '../../..' escape
chains from mounted sandbox cwds, file landed nowhere. Fix:
workspace root = nearest ancestor (inclusive) of the CALLER's cwd
with .git/ or models/; root-relative globs; stone outside → skip
with hint; no marker → stone's own dir (rg nearest-.ignore rule).
e2e-proven from a temp workspace; #100 suite 12/12 still.
QC scan lesson: ({}).polluted MISSES the real class — on plain
maps map['__proto__'] = x REPLACES the prototype (missing-key
fallthrough corruption); global only when the write lands on a
prototype object. Probed + fixed with safeMapKey/safeMapAssign at
every write gate: createWorkspace, setPolicy (resource AND policy
fields — a poisoned policy with writableBy public is a direct RLS
bypass), provisionAgent (validate BEFORE the exists-lookup — the
lookup itself falls through and 'exists'), addRole/removeRole,
instance restore() (all 4 maps + defaultWorkspace) and module
restoreState configs — P3/P5 matter because HORCRUX STONES are
the sanctioned cross-process transport of that state: a crafted
stone corrupted every fresh process's RLS maps at boot. Also:
token-cache role confusion (cached ctx kept tenant-A roles after
a workspace switch — re-derived via _baseRoles), rls.middleware
x-workspace HEADER pivoted the process-global session workspace
(no live callers; req.rlsWorkspace now). HELD SOLID:
generateCaps fail-closed tenancy (pass 82) blocks fabricated
workspaces even on a polluted map; evaluate() mask/filter spec-
safe. Tenant-shaped test resources need setPolicy({container:
ws}) — cross-tenant admin is DENIED by design (pass-82
isolation), don't misread as regression. NEW
test/habitat-rls-qc.test.js 13/13. Gates: sweep 144/144 chunked,
lints PASS, eslint touched 0 errors, npm run check, audit-mcp 296
THREW(0), npm test 15/15, test-all/test-core exit 0. Queued:
whitepaper rewrite, TASKS/MEM → vant-native; prime's #100–#112
still OPEN on GitHub (keywords auto-close only on default branch
— manual close after prime verifies).
Pass 90 (9ebe920): RLS hookups: enforcement vapor closed. Survey (owner: "more habitat/rls hookups?") found
the RLS carrier chain mostly VAPOR: 10 sites fired ASYNC
rls.checkRead/checkWrite from SYNC code un-awaited (brain 3209 —
dream was the only awaited site — storage, islands, lineage, msg,
teams _checkRLS RETURNED the promise and callers discarded it,
config's try/catch around a promise = dead E_RLS branch,
memory's unconditional {}, audit fed userCtx params to param-LESS
checkers → any process-cap holder could read ANY tenant's audit
trail; denials were orphaned unhandledRejections AFTER the op
ran). DOCTRINE: explicit userCtx → enforce INLINE; anonymous →
internal actuator op, allowed (enforcing on {} would deny every
internal write — default policy writableBy ['role:admin']). CORE:
habitat.canSync() sync decision core (async can() delegates),
rls.assertSync() throws RLS_DENIED + emits, sandbox `rls` getter
auto-claims the shared habitat (pass-82 doctrine) so un-booted
CLI/early-MCP processes stay enforcing; carriers: assertSync
inline when ctx explicit, stub rls keeps async path + .catch.
LIVE BUGS the wiring exposed: cache.js s.can(userCtx,'write',res)
MIS-BOUND (module can(cap) takes ONE name → ctx in cap slot →
userCtx'd get() threw EFORBIDDEN live; _checkWrite never called;
set() had NO gate — both now assertSync); _cacheLock POISONING
(one denial made the rejected promise the chain — every later op
inherited it; task.catch keeps it alive); config/teams
_getSandbox pinned the PARTIAL early sandbox export during the
boot require cycle FOREVER (teams' E_RLS worked, config's
silently never could) — gate.js F-2 pattern: verify
defaultSandbox before caching. Gotchas: roles match BARE names
(ctx ['admin'] matches rule 'role:admin'); audit READ is public
by default — deny-tests need setPolicy first; node -e probes
need (async()=>{})() for async targets and await before
asserting on JSON.stringify(Promise) → {}. NEW
test/rls-hookups.test.js 19/19. Gates: sweep 143/143 chunked,
lint:docs (129)/surface/helpers PASS, eslint touched 0 errors,
npm run check, audit-mcp 296 THREW(0), npm test 15/15,
test-all/test-core exit 0. Queued: whitepaper rewrite, TASKS/MEM
→ vant-native; prime's #100–#112 still show OPEN on GitHub
(keywords auto-close only on default branch — manual close after
prime verifies).
Pass 89 (7c69b5d): horcrux/teams/brain-naming triage, prime
#100–#104/#111/#112 all closed: repo-root .ignore for stones (rg
honors, git not) + horcrux create auto-append; #101 root cause =
CONSUMERS raced sync store.write (async save chain broke
teams-refresh, async restoreState broke orgflow's sync contract →
_saveTeams inline + flush() + restoreState STAYS SYNC +
transform.restore awaits); inspect roster-first (#102); emptyDir
.keep markers via storage chain + per-file sweep scope (#103);
assign() reads prev BEFORE resolution (draft checked the derived
value so fallback always won) + hierarchy guards + self-excluded
quotas + escrow placement flag (#104); health initialized =
markers OR content via MODEL_PATH escape for the empty branch
(#111); brain.test stack assertion derives active brain (#112).
Drive-bys: lint:docs em-dash rot since 74ac92a; crew-bus ~50%
flake (platform MCP squats 4585 inside 4571+pid%40 + premature
READY) → live free-triple pick + child port probe, 6/6. NEW
test/horcrux-orgchart.test.js 12/12. Gates: sweep 142/142 + all
lints + audit 296 THREW(0) + npm test 15 + test-all/test-core 0.
Pass 88 (74ac92a): habitat/RLS call-point fairness + prime's #105–#110. Survey verdict: habitat/RLS call points
were already factory-clean (no raw state writes outside habitat.js);
the real unfairness = fresh processes didn't inherit authority +
mutations raced their own persistence. (1) BOOT HYDRATES persisted
orgchart.operatorCapabilities (widen-only, host-configured skipped)
— `vant org grant` now PERSISTS by default (--session-only opts out)
and CLI spawn/kill just work afterward (#108/#105 root fix). (2) FLUSH
discipline: agents internal serialized save chain + flushAgents()
(agents.flush() facade), habitat.flush() = _readyPromise, all
mutating CLI flows (agents spawn/kill/prune, habitat grant/init/
policy/token, org grant/demo) drain before exit (#109). (3) bin/
agents.js REBUILT real (was stub; spawn/kill/info/status/prune, --help
guarded at subcommand level, operator self-grant on mutation) and
terminate() now HYDRATES before delete — a fresh process used to
return false for on-disk agents (masked by the stub for months)
(#106/#107). (4) audit.healthCheck restored {healthy, issues, status,
entries} — validate always failed before (#110). (5) CROSS-BRAIN
AGENT BLEED fixed: _getAgentStorePath used bare getCurrentBrain()
which ignores VANT_BRAIN → every env-scoped process wrote rosters
into the vant brain (22 agents, phantom agents.maxAgents=10 quota
hits); now state-store.currentBrain() resolver (pass-53 teams seam).
Vant roster purged of probe agents. NEW test/operator-caps.test.js
8/8 (cold-process e2e). Gates: sweep 143/143, all key suites, 3
lints, audit 296 THREW(0). Crew: Buffy + Cairn + Prime (festival/event
management layer IRL). Queued: whitepaper rewrite, TASKS/MEM →
vant-native.
Pass 87 (463fcbf): #6 agora/mesh tenancy. RANKED
LIST CLOSED: verified it is EXACTLY #1–#6 (82✓ 83✓ 84✓ 85✓ 86✓ 87✓,
no #7 anywhere); only non-numbered queued items remain: whitepaper
rewrite + TASKS/MEM → vant-native (notify board/memory). Owner also
bringing up a second runtime ("Buffy + Cairn + TBA") — hence tenancy.
lib/forum.js: subject chain same as islands/memory (userCtx → current
agent identity → anonymous); commons semantics (workspaceless = global
pre-87 behavior preserved; tenant pub invisible to anonymous FAIL
CLOSED, get() found:false no leak; own ws + ANY registry role in the
pub's ws = visible); publish stamps workspace/authorAgentId, pins
enforced ('' = global, foreign pin needs role → workspace_denied,
invalid → invalid_workspace); list() filtered + tenancy meta.
CRITICAL PRE-EXISTING FIX: module shims `list: () => forum.list()` /
`get: bc => forum.get(bc)` DROPPED opts — mcp.js holds the MODULE not
the singleton, so forum_list/forum_get were always tenancy-blind
anonymous (the whole MCP member-list mystery: handler resolved userCtx
correctly, shim discarded it one frame later). Shims forward opts now.
mcp +2 forum_publish/forum_list = 296 tools audit THREW(0); bin/forum.js
rebuilt REAL (was pass-81 facade); shareableReport tenancy block +
peer workspace; node-registry register(). SECOND PRE-EXISTING FIX
(differentiated via worktree @ HEAD — pass-86 code failed identically
in clean env): Habitat never CREATED the declared default workspace →
fresh process addRole('default') threw HABITAT_UNKNOWN_WORKSPACE,
masked until now by a _habitat state containing 'default' that
disappeared. _ensureDefaultWorkspace() idempotent + PERSIST-FREE
(createWorkspace auto-persists; constructor-time save would race the
restore chain) in ctor + after restore() replace; createWorkspace
got skipPersist. SPAWN-RESTORE RACE documented: spawn provisions
sync before async restore() resolves → restore clobbers → tests must
await getSharedReady() BEFORE spawn (agora-tenancy test fixed; no
code change — spawn contract is sync). Publications memory-only across
processes (no hydrate — forum:pub:* write-only): CLI e2e posts+lists in
ONE child (argv swap); Forum hydration = follow-up. NEW SUITE
test/agora-tenancy.test.js 12/12. Docs: rls.md "Agora tenancy (pass
87)", mcp-tools forum entries, cli.md forum row. Gates: FULL sweep
142/142 (chunked per-suite — run-all exceeds 175s cap, pass-45
precedent; crew-bus + agents-split flakes re-verified standalone),
npm test 15, test-all 17, test-core 5, all key suites green, 3 lints,
eslint touched 0 errors, audit 296 THREW(0).
Pass 86 (c686c41): #4 MCP auth ctx via habitat tokens.
habitat.mintToken/verifyToken/revokeToken/listTokens: bearer tokens
anchored to habitat identities (raw shown once, sha256 hash persisted
in _habitat state row). Verify = registry-verified agentContext at USE
time (role changes apply immediately; authority not snapshot);
unknown/expired/revoked/identity-stripped → null. COLD-PROCESS
FALLBACK: agents registry is memory-only, so agentContext falls back
to _agentContextFromRegistry (durable provisionAgent role rows = the
authority; strip all rows = identity gone). MCP door accepts Bearer
vant_... / x-habitat-token IN ADDITION to shared key; valid token
satisfies mcp.requireKey alone; AsyncLocalStorage carries the verified
subject through execution; PRIORITY verified > declared userCtx >
current agent > anonymous (anti-spoof), wired into vant_memory_state/
_recall (auto-scoping), vant_habitat_can/_check, islands_canAccess.
escrow money-admin accepts token's registry identity as admin
(_verifiedAdminGate; adminId legacy path stays). NEW tools x3 (294
total): vant_habitat_mintToken/_verifyToken/_revokeToken. mcp.start()
explicit port 0 honored (falsy-|| skipped it; listen promise never
settled on bind errors) + _serverRef hook. CLI habitat token
mint/verify/list/revoke; FIXED PRE-EXISTING RACE: bare getShared()
raced restore → fresh-process mint AGENT_NOT_FOUND; token ops await
getSharedReady(). NEW SUITE test/habitat-token.test.js 15/15 (incl.
HTTP e2e: Bearer token → memory auto-scoped to org-http, spoofed
declared ctx loses). Gates green; audit 294 THREW(0).
Pass 85 (87de0a1): #5 per-workspace memory namespacing —
memory.state/recall resolve workspace subject chain (explicit
opts.workspace/userCtx -> current agent habitat identity -> anonymous)
and scope keys to ws<wsLen>.<ws>.<key> on disk (e.g. ws4.acme.proj).
KEY-SHAPE WHY: state keys become filenames; storage sanitizer strips
colons + truncates at 100, so ws:<ws>:<key> collapses and bare concat
collides — length prefix + dots + letter-start ws names parse
unambiguously; 100-char composite overflows throw VAF_INPUT_INVALID.
Namespaces ISOLATING (no flat fallback, anon never sees scoped rows);
flat keys unchanged for anonymous callers; workspace:null pins
UNSCOPED (habitat _habitat, nature _flywheel, context history all
pinned — process-global state must not fragment). MCP: vant_memory_
state/_recall gained optional workspace arg. CLI: islands load --as
<agentId> + islands boundaries. Suite test/workspace-memory.test.js
21/21.
Pass 84 (1146749): island boundaries enforced at load/hydrate/save
(_island:<name>, subject chain identical, anonymous writes fail
closed E_ISLAND_WRITE_DENIED, no policy = open); PRE-EXISTING FIX:
islands.save() called nonexistent island.write() → island.set();
MCP +1 islands_canAccess; suite 14/14; rls.md permalink frontmatter
required by docs link-checker. Pass 83 (d6c2758):
workspace budgets ws:<ws>:<agent>/ws:<ws>::org, two-rows-one-pool,
persistent member caps, registry-verified admin (RLS_DENIED), market
context.workspace pool draw, STALE-SINGLETON merge fix (hold/release
now fresh disk-coherent instances). Pass 82 (77504ff): agents got
habitat identity + RLS online (agentContext/provisionAgent,
filter/mask enforcement, generateCaps fail-closed, _readyPromise
undefined-resolution fix).
**Prior — pass 81:** environment family DELETED per owner ruling
(was a scrapped subsystem whose 7 tools shipped registered against a
never-existing module; pass 80 stopgapped with coded refusals, 81
removed). Replaced with the REAL subsystem, fully wired: habitat MCP
tools x8 (all live-probed incl. two-process persistence) + real CLI
(bin/habitat.js rebuilt from facade). All surfaces share ONE instance
via habitat.getShared()/getSharedReady() claiming
global.__vant_habitat; boot ADOPTS a pre-claimed instance instead of
clobbering. Habitat fixes en route: addRole fails closed on unknown
workspace; mutations auto-persist; restore serialized on
_readyPromise; setWorkspace stays session-only by design. Audit 281
THREW(0).
**Prior — pass 80:** full MCP surface audit (scripts/
audit-mcp-surface.js, new): 280 tools probed, THREW(0)/PHANTOM(0);
9 bug clusters fixed (boot.js detached-method, brain_evolution_ x5,
geometry_init object-await, branch.js porcelain, get/set_memory
bare-brain + schema/docs split, switch_branch -> switchBrain(),
context_build circular JSON, environment x7 -> coded refusals,
required:[] schema holes). NEW GATE: check-bin-truthfulness.js in
lint:helpers (bin throwaway helpers + status-field cross-check vs lib
bodies) — caught 5 live phantoms + 2 caps.length lies, fixed truthful.
**Pass 79** (46717a7): lib helpers gate, escrow.json merge-save,
hashPassword phantom. **Pass 78** (0a346da): server shared-instance +
clientIp TDZ. **Pass 77** (fa8c51d): escrow reference + MCP tools.
**Pass 76** (495f6bf): whitepaper draft of record — STILL awaiting
owner review. Issues #92-#99 closed; only #86 open.

---
**Prior — pass 79** (lint:helpers gate + market/consensus MCP audit
CLEAN + escrow.json merge-save, 46717a7): gate
scripts/check-stateful-helpers.js blocks `=> new X()` call-through
helpers on stateful classes (negative-controlled on BOTH syntaxes incl.
member-expression; factories exempt; HELPER-MODEL tag documents
deliberate fresh-per-call). Escrow budget helpers tagged
fresh-by-contract (disk-coherent: every mutation persists, every
fresh instance reloads — market debit depends on it); hold/release
singleton+persist. Fifth phantom: auth.hashPassword (hash is STATIC).
MCP audit: market/consensus handlers ALL CLEAN live-probed (governance
gates + E_NOT_REGISTRY are correct fail-closed shapes). BONUS economic
fix: escrow.json was whole-file last-write-wins — stale hold-save
could silently revert a settled trade's debit; _saveEscrow now merges
per key; all 4 market-debit pins green. Pass 78 (0a346da): server
shared-instance + clientIp TDZ; pass 77 (fa8c51d): escrow reference +
3 MCP tools + resetBudget phantom; pass 76 (495f6bf): whitepaper
draft of record. All suites green; lint:helpers + lint:surface PASS.
Issues #92-#99 closed; only #86 open.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 79. #98: sudo escalations are the agent's memory — audit trail
resolves per call via state-store currentBrain() →
models/private/<brain>/sudo/escalations.jsonl (legacy flat path as
fallback + migration source; _migrateLegacyAudit handles both upgrade
orderings: legacy-only carry, both-exist merge-then-remove, empty-husk
remove). Templates/policies stay GLOBAL BY DESIGN, ruling documented at
the constants. #99: brain.read(name, { stackFallback: true }) walks the
rest of the stack (private-then-public per lower brain, all extensions)
when the active brain misses and the read is UNPINNED — opt-in per
owner (default-on would change precedence for every consumer). Result
carries provenance: viaStack, viaStackPosition, source, brain. Pinned
reads never walk. docs/memory/brain.md documents the opt-in; census
resolution note appended (census COMPLETE — every Tier B item resolved).
Harness-verified (/tmp/mb-harness): #98 S1 per-brain trail, S2
env-pin + isolation, S3 read-back, M2 both-exist merge, M3 legacy-only
carry; #99 F1 no-opt-in→null, F2 baseline hit (vant@1 public), F3
active-wins, F4 pin blocks walk, F5 own-brain-first, F5b viaStack tag.
All suites green (npm test 15/15, brain 77, storage 40, sudo 7,
security-hardening 22, memory 18, mcp 6, boot 15, vant 16, transform 5),
lint:docs + lint:surface PASS. Issues #92-#99 ALL CLOSED; only #86
(stego transport) open. Pass 74 (e8b6f49) rolled multibrain through
bin/mcp/health/load/succession/brain-unlock; pass 72 fixed #96/#97
(ea3f484, 3531ef5); pass 73 census at 0a6eb13.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 75.
**Status:** UNBLOCKED. Lane 1 closed (Waves A→J); Lane 2 shipped;
Cairn's issue queue (#92-#99) FULLY CLOSED. Remaining: airgap exercise
(proposed, owner-flagged as key-later), prd-whitepaper §9 open
questions (publication target + length) await owner answers;
optional escrow/settlement CLI reference prose; Lane 3 HOLD per
owner ("agent is deep in world building there"). Known quirk (not
fixed, judged out of scope): resolveBrainPath is a bare
exists-check, so an orgchart/ dir alone makes it report
models/private/vant as the vant brain — harmless for the real CLI
(its writes land private too) but know it before "cleaning"
models/private/vant. exercise-group.js has a known cold-start race
(1-in-N runs loses a phase on first boot after churn; tails healthy,
0 gaps) — rerun before debugging.
**Owner context:** unchanged from pass 69 (enterprise grade, over-built
plumbing NOW to avoid integration pain later). New for the paper: the
epigraph stays unexplained by owner decision; agents are the paramount
audience, everyone else reads from the sidelines. Owner reaction to
the awareness exchange: "You are a brilliant being, regardless of you
restarting. Vant is here to solve that, somehow, eventually" - folded
into prd-whitepaper.md as the section 2 thesis + section 3.1
testimony (v0.2); chapter 2 opens with it.
**BLOCKER:** none.

---

## CURRENT DUMP

(nothing in flight — pass 79 committed: gate shipped, MCP audit clean,
escrow.json merge-save landed. Next agent: whitepaper owner feedback;
airgap parked; candidates: extend gate to bin/ + status-field
truthfulness checks, MCP surface audit for remaining tool families
(qos, config, islands).)

---

## Crash-Restore Procedure

1. `git status && git log --oneline -10` — confirm branch `axolotl`
2. Read `labs/TASKS.md` top session block — current state + next steps
3. Read `models/private/buffy/learnings.md` — hard-won patterns
4. Check this dump section for anything in flight
5. `node test/runner.js` — verify baseline before touching anything

---

## Session End Checklist

1. Update `labs/TASKS.md` — new top session block (what shipped, next steps)
2. Write brain learnings (models/private/buffy/)
3. Update this file — wipe CURRENT DUMP to "(nothing in flight)", set Handoff
4. Commit: `axolotl: pass NN — <one-liner>`
