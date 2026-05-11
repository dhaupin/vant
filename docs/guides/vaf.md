---
version: 0.8.11
permalink: /guides/vaf
layout: default
title: VAF
62
---

# VAF

Vant Application Firewall - input validation.

## What

VAF validates all input:

- Type checking
- Length limits
- Path traversal
- Shell characters
- Word stacking

## Check

Validate input:

```javascript
const vaf = require('./lib/vaf');

vaf.check('input', { type: 'string', maxLength: 500 });
```

### Options

| Option | What |
|--------|------|
| type | string, number, object, array |
| maxLength | Max length |
| pattern | Regex pattern |
| required | Must be present |

## Blocked Patterns

VAF blocks:

| Pattern | Example |
|--------|---------|
| Path traversal | ../etc/passwd |
| Shell chars | ; rm -rf |
| Env vars | $HOME |
| Word stacking | vant vant vant |

## Configuration

```javascript
vaf.configure({
    maxLength: 50000,
    blockPathTraversal: true,
    blockShellChars: true,
    blockEnvVars: true
});
```

---

## Integration

VAF runs on all inputs:

```javascript
// All storage operations go through VAF
brain.write('category', 'file', content);
```

---

## See Also

- [Security](security) - Security overview
- [Sandbox](sandbox) - Execution isolation