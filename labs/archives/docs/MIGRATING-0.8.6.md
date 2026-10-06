# Migrating to 0.8.6 (Axolotl Branch)

> **TL;DR**: The axolotl refactor removed 30+ dead-code aliases,
> singletons, and legacy exports. There are no backward-compat
> shims. Every removal is a hard break. This guide shows you
> exactly what to change.

## Who needs to migrate?

Anyone who:

- Uses `lib/cache` directly (T13b removed the singleton)
- Uses the `brain.loadBrain` / `brain.brainList` helpers (T11b)
- Uses `storage.exists` (T10b)
- Uses `compute.eval` (T15d)
- Uses the legacy `EventBus` / `SimpleEventEmitter` aliases (T14b-r1)
- Uses `config.setFlag` (T14b-r1)
- Reads `vant.Runtime` (T14b-r1)
- Reads `vant.api.mode` via a getter (T14b-r1)

If none of the above apply, you don't need to change anything.

---

## 1. Cache singleton → `new Cache()` (T13b)

**Before** (v0.8.5 and earlier):

```js
const cache = require('vant/lib/cache');
await cache.set('key', 'value');
const v = await cache.get('key');
```

**After** (0.8.6 axolotl):

```js
const { Cache } = require('vant/lib/cache');
const cache = new Cache();
await cache.set('key', 'value');
const v = await cache.get('key');
```

The singleton is gone. Every consumer now owns its `Cache` instance.
This makes multi-tenant use cases sane (each tenant can have its own
cache without sharing state).

**Why it changed**: the singleton leaked state between tests and
between consumers. It also made the dependency graph invisible —
you couldn't tell from the API surface which code owned a given
cache entry.

---

## 2. `brain.loadBrain` / `brain.brainList` (T11b)

**Before**:

```js
const brain = require('vant/lib/brain');
const item = await brain.loadBrain('identity');
const list = await brain.brainList();
```

**After**:

```js
const brain = require('vant/lib/brain');
const item = await brain.read('identity');          // unified read
const corpus = brain.loadCorpus();                  // sync, all brains
```

`brain.read(name)` is the new unified reader — it returns
`{ format, source, content, data }` regardless of file extension
(.md, .json, .yaml, .yml, .txt, .ini).

**Why it changed**: `loadBrain` and `brainList` were two different
APIs for related operations. `read()` + `loadCorpus()` are one
mental model.

---

## 3. `storage.exists` → `storage.has` (T10b)

**Before**:

```js
const storage = require('vant/lib/storage');
if (await storage.exists('foo.md')) { ... }
```

**After**:

```js
const storage = require('vant/lib/storage');
if (await storage.has('foo.md')) { ... }
```

`exists` was an alias. `has` is the canonical name (matches
`Map.prototype.has`).

---

## 4. `compute.eval` → `compute.evaluate` (T15d)

**Before**:

```js
const compute = require('vant/lib/compute');
const r = await compute.eval(code, { lang: 'python' });
```

**After**:

```js
const compute = require('vant/lib/compute');
const r = await compute.evaluate(code, { lang: 'python' });
```

`eval` is a reserved-ish word in some contexts. `evaluate` is the
canonical name. The 4 internal callsites in `lib/framework.js`,
`lib/mcp.js`, and `lib/geometry/engine.js` have all been migrated.

---

## 5. `EventBus` / `SimpleEventEmitter` → `EventEmitter` (T14b-r1)

**Before**:

```js
const { EventBus, SimpleEventEmitter } = require('vant/lib/event');
const bus = new EventBus();
```

**After**:

```js
const { EventEmitter } = require('vant/lib/event');
const bus = new EventEmitter();
```

`EventBus` and `SimpleEventEmitter` were aliases. The canonical
export is `EventEmitter`.

---

## 6. `config.setFlag` → `config.set` (T14b-r1)

**Before**:

```js
const { setFlag } = require('vant/lib/config');
setFlag('foo', true);
```

**After**:

```js
const { set } = require('vant/lib/config');
set('foo', true);
```

`setFlag` was a noun-phrase alias for `set`. The canonical name
matches `Map.set` semantics.

---

## 7. `vant.Runtime` → top-level lazy getters (T14b-r1)

**Before**:

```js
const vant = require('vant');
const r = new vant.Runtime();
r.something();
```

**After**:

```js
const vant = require('vant');
// vant has top-level lazy getters for every subsystem:
// vant.brain, vant.cache, vant.config, vant.storage, vant.compute,
// vant.sandbox, vant.event, vant.msg, vant.agents, ...
vant.brain.read('identity');
```

`vant.Runtime` was a legacy class that wrapped top-level accessors.
The top-level lazy getters (which `vant.Runtime` was just a thin
wrapper around) are the canonical way to access subsystems.

---

## 8. `vant.api.mode` getter (T14b-r1)

**Before**:

```js
const vant = require('vant');
console.log(vant.api.mode);   // used the getter
```

**After**:

```js
const vant = require('vant');
console.log(vant.api.mode);   // read-only property, same syntax
```

The syntax is the same. The implementation changed (no getter, just
a property), so if you used `Object.getOwnPropertyDescriptor` or
re-defined `mode` on the object, that no longer works.

---

## What was NOT changed

- The `Cache` class API itself (all 25 methods: configure, set, get,
  remove, clear, has, size, compress, decompress, createPool, etc.)
- Brain file format / schema
- Storage backend connectors
- MCP tool names and signatures
- CLI commands and flags
- Config keys

## T17 additions (also nuclear breaking)

### 9. `Encrypt.encode()` / `Encrypt.decode()` → `Encrypt.encrypt()` / `Encrypt.decrypt()`

**Before**:

```js
const { Encrypt } = require('vant');
const enc = Encrypt.encode(message, password);
const dec = Encrypt.decode(enc, password);
```

**After**:

```js
const { Encrypt } = require('vant');
const enc = Encrypt.encrypt(message, password, { algorithm: 'aes-256-gcm' });
const dec = Encrypt.decrypt(enc, password, { algorithm: 'aes-256-gcm' });
```

The deprecated `encode`/`decode` aliases for `encrypt`/`decrypt`
with ALGORITHM='aes-256-gcm' are gone.

### 10. `Encrypt.pbkdf2Sync()` → `crypto.pbkdf2Sync()` (Node built-in)

**Before**:

```js
const { Encrypt } = require('vant');
const key = Encrypt.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
```

**After**:

```js
const crypto = require('crypto');
const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
```

`Encrypt.pbkdf2Sync` was a 1-line passthrough to `crypto.pbkdf2Sync`
with zero callers. Use the Node built-in directly.

### 11. `secret.getPassword()` / `hasPassword()` / `clearPassword()` → `get` / `has` / `clear` with `'brain'` type

**Before**:

```js
const secret = require('vant').secret;
const pwd = await secret.getPassword();
const exists = await secret.hasPassword();
await secret.clearPassword();
```

**After**:

```js
const secret = require('vant').secret;
const pwd = await secret.get('brain');
const exists = await secret.has('brain');
await secret.clear('brain');
```

The legacy "password" aliases were hardcoded to the `'brain'`
secret type. Use the generic `get(type, options)` API with
the explicit type.

## What if I'm stuck?

Run the test suite — the failures are informative. The branch is
**100% green** as of T16: 1489/1489 passing, 0 failures.

If a removal broke your code and you need help migrating, the
diff is in commits `4ae316b` → `3df35d4` on the `axolotl` branch.
