
# Architecture Audit: Habitat, RLS, Nature

*Date: 2026-07-05*

## Findings: Overlaps & Collisions

### 1. AUTH vs HABITAT

| auth.js | habitat.js | Overlap? |
|---------|-----------|----------|
| verifyToken() | context() | YES |

**Current:**
- auth.verifyToken() → returns { userId, role }
- habitat.context() → returns { userId, roles, scopes, workspace }

**Problem:** Dual user context. Which is source of truth?

**Solution:** Habitat should wrap auth, not duplicate.

```javascript
// habitat.context() should use auth internally
async context(token) {
  const payload = await auth.verifyToken(token);
  // ... add workspace, roles from habitat
}
```

---

### 2. BRAIN vs HABITAT

| brain.js | habitat.js | Overlap? |
|----------|------------|----------|
| learn/remember | save/restore | YES |

**Current:**
- brain.learn('_habitat', state) → general brain storage
- habitat.save() → stores to brain

**Problem:** Habitat knows about brain internals.

**Solution:** Habitat should use a generic persistence interface, not brain-specific methods.

```javascript
// Better: abstraction layer
habitat.save({ write: (key, data) => brain.learn(key, data) });
```

---

### 3. SANDBOX vs RLS

| sandbox.js | rls.js | Overlap? |
|------------|--------|----------|
| canRead() | checkRead() | YES |
| canWrite() | checkWrite() | YES |
| capabilities | createSandboxCaps() | YES |

**Current:**
- sandbox.create() → takes { canRead, canWrite } functions
- rls.createSandboxCaps() → returns { canRead, canWrite } from roles

**Problem:** Two different capability systems.

**Solution:** RLS should be the SOURCE of sandbox capabilities.

```javascript
// sandbox should ask rls
const caps = rls.createSandboxCaps(userCtx);
const sandbox = Sandbox.create(caps);
```

---

### 4. ESCROW vs RLS vs LEGAL

| escrow.js | rls.js | legal.js |
|-----------|--------|-----------|
| beforeExecute() | checkWrite() | checkGate() |

**Current:**
- escrow.beforeExecute() checks: budget, quota, circuit, legal, rls
- rls.checkWrite() → throws on denial
- legal.checkGate() → returns allowed boolean

**Problem:** Three security layers doing similar things.

**Solution:** Consolidate into one security pipeline.

```
request → RLS (workspace/role) → LEGAL (compliance) → ESCROW (budget/quota)
```

---

### 5. NATURE vs CRON

| nature.js | cron.js |
|-----------|---------|
| tick() | setInterval() |

**Current:**
- nature.tick() → decay flywheel, check spark
- cron uses setInterval for scheduled tasks

**Problem:** Both are "timers" but different purposes.

**Solution:** Nature is NOT cron. It's event-driven. Keep separate.

---

### 6. ISLANDS vs HABITAT

| islands.js | habitat.js |
|------------|------------|
| type: static/lazy | container isolation |
| source: corpus/storage | workspaces |

**Current:** No integration.

**Future:** Islands should be workspace-scoped.

```javascript
// habitat should filter islands by workspace
islands.load('my-island', { workspace: 'team-alpha' });
```

---

## Summary: What to Fix

| Priority | Issue | Fix |
|----------|-------|-----|
| HIGH | auth/habitat context duplication | Habitat wraps auth |
| HIGH | sandbox/rls capability duplication | RLS is source of truth |
| MEDIUM | brain/habitat persistence coupling | Abstract persistence |
| MEDIUM | escrow/rls/legal triple security | Consolidate pipeline |
| LOW | islands/workspace isolation | Future feature |

---

## Better Architecture

```
                    ┌─────────────┐
                    │   REQUEST   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    RLS      │  ← Workspace/Role context
                    │ context()   │    from auth token
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌─────▼────┐      ┌─────▼────┐
    │ CANVAS  │      │  ISLAND  │      │  STORAGE │
    │ check() │      │ check()  │      │  check() │
    └────┬────┘      └─────┬────┘      └─────┬────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │   ESCROW    │  ← Budget/Quota/Circuit
                    │beforeExec() │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   EXECUTE   │
                    └─────────────┘

NATURE (separate, event-driven):
  - habitat.feed() → chaos events
  - nature.accumulate() → spin flywheel
  - nature.tick() → decay → potential spark
  - NOT part of request pipeline
```

---

## Action Items

- [ ] Refactor habitat.context() to use auth internally
- [ ] Make sandbox use rls.createSandboxCaps() as source of truth
- [ ] Abstract persistence in habitat (don't couple to brain)
- [ ] Document the security pipeline (RLS → LEGAL → ESCROW)
- [ ] Keep nature separate - it's not request-related

---

*This is a living document. Update as architecture evolves.*
