# Dead-Export Sweep (P3) — axolotl

Generated 2026-09-20 by an automated cross-reference scan (`lib/*.js` exports vs. all
references in the rest of the repo, JS + docs, excluding `node_modules`).

## Why nothing was deleted in this pass

Two reasons, both lessons from this branch's history:

1. **The corruption incident.** Commit `c7009da` ("Add gather/restore to 12 more
   modules") was an automated bulk edit that pasted stray identifiers into
   `trust.js`, `governance.js`, and `market.js`. Mass-modifying dozens of files in
   one automated sweep is exactly the failure mode that produced it. Removal of
   ~150 exports across ~35 files deserves the same review discipline as any
   breaking API change.

2. **These exports are cheap.** They cost only the bytes in an object literal.
   Deleting them does not shrink the bundle (CommonJS, no bundler) and does not
   reduce attack surface (none of them are security-relevant).

## Method

For each `lib/*.js` file, extract:

- shorthand properties from the `module.exports = { ... }` object
- `exports.NAME = ...` assignments

A symbol is flagged when its bare identifier appears **nowhere** else in the
repository (any `.js` or `.md` file outside `node_modules`/`.git`).

**False positives to expect** when acting on this list:

- test files may reference symbols dynamically (strings, `Object.keys` loops)
- accessors like `getStackTrustLevels` / `getStackCitations` follow a deliberate
  per-stack naming convention; they may be consumed by future stacks by design
- MCP/tool registries sometimes re-export or look up handlers dynamically

## Findings (file → flagged exports)

```
brain.js: applyTransforms, onBootstrap, onFail, preload, _wireBrainToSandbox
canvas.js: unwrap
citations.js: getStackCitations
config.js: setLockOptions
consensus.js: hasVoted, peerVerify, _validate, _checkRate, _grantCapability, _revokeCapability, _signVote, _verifyVote, _hashTally, _encryptBallot, _decryptBallot
context.js: buildStack, buildBrain, getStackInfo, getCacheState, STATIC_FILES, HEARTBEAT_INTERVAL, MAX_CACHE_BREAKPOINTS
cron.js: scheduleCompute, scheduleEmbed
docs.js: listModules, MODULE_DEFS
error.js: configError, githubError, networkError, clearTracking, retryWithBackoff
event.js: defaultPubSub, defaultQueue
format.js: getStackFormats
legal.js: canDistribute, canCommercial, isCompliant, getLegalText, getQuickRef, emergencyScan
lineage.js: traceForWorkspace
lock.js: listBrainLocks, _getToken, _clearToken, getBackoff
market.js: getMarket
metrics.js: timeFn, timeFnAsync
msg.js: defaultMsg
network.js: setOnline, isExpired
pipeline.js: runStack, MODES, getModes
prune.js: pruneAgents, getStackPruneStats, listStackPrunable
qos.js: getMaxInputSize, isCircuitOpen, FAILURE_THRESHOLD, FAILURE_WINDOW_MS, canDeleteIsland, canLoadIsland
realm.js: addIdeaSecured, proposeSecured, setTrustConfig, getTrustWeight, setConfigGates, getConfigGates
recursion.js: checkAsync, guardAsync, getMaxDepth
registry.js: getBrainRegistry, registerBrainAgent, getStackRegistries
resolution.js: logDelta, resolveSecured, deprecateSecured, rejectSecured, getStackResolutionStatus, listStackResolutions
rules.js: RULES_VERSION, getRule, setRule, deleteRule
sandbox.js: getBrainHandler
search.js: getLTC, freshLTC
shell.js: setAllowedCommands, getAllowedCommands, getDefaultCommands
skills.js: getStackSkills
stego.js: getGalleryIndex
stream.js: checkLease
succession.js: getStackTrustLevels, getStackLedgers
sudo.js: isLocked
sync.js: hybrid_savePrivacyConfig, hybrid_getPrivacy
teams.js: updateOrg, deleteOrg, getDept, deleteDept, getTeam, deleteTeam, listRoles, getRole, getRoleChain, unassign, getDelegationPath, getAccountabilityChain, getHierarchy, getTeamMembers, getDeptMembers, getOrgMembers
transform.js: gatherAgents, gatherIslands, gatherRuntime, gatherBoot, gatherConfig, gatherCorpus, gatherNeurons, gatherBrainStorage, gatherPrivateBrains, gatherMetrics, gatherHandlers, gatherConfigStorage, gatherIslandState, gatherMemory, gatherConsensus, gatherEscrow, gatherMsg, gatherRealm, gatherMarket, gatherTeams, gatherTrust, trackDelegation
trust.js: getTrust
vaf.js: checkFileExtension, checkWordStacking, checkWordCommandStacking, checkCommandStacking, checkRateLimit, isBlocked, sanitizeHTML, sanitizeSQL
vibe.js: getStackVibes
watch.js: EntropicRecovery, entropyPool, createSpring, checkSystemHealth
```

## Recommended process for the actual removal

1. Remove exports **one file at a time**, one commit per file, running the full
   suite (`for f in test/*.test.js; do node $f; done`) + `node test/ci.js` after
   each.
2. Start with unambiguous cases: `_`-prefixed internals (`consensus.js`,
   `lock.js`), and duplicated helpers (`metrics.js timeFn/timeFnAsync`).
3. Leave the `getStack*` family for a design decision — they are convention-named
   accessors and may be part of the intended stack API surface.
4. `error.js`'s flagged helpers (`retryWithBackoff`, typed errors) look like
   intended public API — confirm intent before removing.
