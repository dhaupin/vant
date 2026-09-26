---
version: 0.8.6
permalink: /security/vaf
layout: default
title: VAF
nav_order: 68
description: VAF, the Vant Application Firewall - input validation for every write path.
---

# VAF

VAF, the Vant Application Firewall, validates all input before it reaches
storage, the runtime, or the MCP surface.

## What it checks

- Type and shape validation
- Length limits
- Path traversal
- Word and command stacking
- Content filtering (script injection, control characters)
- File extension allowlists

## Check

Validate input:

```javascript
const vaf = require('./lib/vaf');

vaf.check('input', { name: 'input', type: 'string', maxLength: 500 });
```

### Options

| Option | What |
|--------|------|
| `type` | Expected input type |
| `name` | Field name for error messages |
| `required` | Must be present |
| `maxLength` | Max string length |
| `allowContent` | Skip content filtering (for arbitrary text like commit messages) |
| `category` | Validation category |

## Blocked patterns

| Pattern | Example |
|---------|---------|
| Path traversal | `../etc/passwd` |
| Word stacking | `vant vant vant` |
| Command stacking | chained shell metacharacters |
| Script injection | `<script>` tags |
| Unsafe extensions | outside the allowlist |

## Configuration

Tuning happens through the `CONFIG` surface and config keys, not a
runtime setter:

```javascript
const vaf = require('./lib/vaf');

vaf.CONFIG.MAX_STRING_LENGTH;      // default 100000
vaf.CONFIG.BLOCK_PATH_TRAVERSAL;   // default true
```

`MAX_STRING_LENGTH` and `BLOCK_PATH_TRAVERSAL` can be set in config
(`vant config set`) and are read at load time. Other exposed validators:
`validateString`, `validateObject`, `validateSafePath`, `checkContent`,
`sanitizeContent`, `checkFileExtension`, `checkWordStacking`,
`checkCommandStacking`, `sanitize`, `middleware`, `getStatus`.

## Integration

VAF runs on all storage writes:

```javascript
// All storage operations go through VAF
brain.write('category', 'file', content);
```

The same chain guards MCP tool arguments and headless server inputs.

## Related

- [Security](/vant/security/) - Security overview
- [Sandbox](/vant/security/sandbox) - Execution isolation
- [Encryption](/vant/security/encryption) - Crypto primitives
