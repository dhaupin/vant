# Development Patterns

> Standard module patterns for robust codebases.

## DETECTION PATTERN

Detect input format before parsing:

```javascript
// DON'T assume:
const data = JSON.parse(content);

// DO detect first:
const format = detectExtension(content, path);
// Then parse appropriately
```

This makes code format-agnostic.

---

## LAZY LOADING

Defer heavy requires:

```javascript
// Top-level blocks boot
const heavy = require('./heavy');

// Lazy loads when needed
let _heavy;
function getHeavy() {
    if (!_heavy) _heavy = require('./heavy');
    return _heavy;
}
```

---

## GATE INTERFACE

Standard security layer interface:

```javascript
can(operation)      // boolean check
beforeExecute(ctx)  // hook before run
afterExecute(ctx)   // hook after run
getStatus()        // { enabled, ... }
```

---

## ERROR RETURNS

Return objects, don't throw:

```javascript
// Not: throw new Error('bad')
// But: return { error: 'human', details: {...} }
```

---

## TEST BEFORE COMMIT

Verify changes locally before pushing:

```bash
npm test   # or yarn test, etc.
```

This prevents breaking builds.