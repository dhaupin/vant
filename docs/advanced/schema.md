---
version: 0.8.6
permalink: /schema.md/schema
layout: default
title: Schema Validation
nav_order: 69
---

# Vant Schema Guide

> JSON Schema validation for brain integrity

## What Is Schema?

Validates brain.json and _core.json (LTC) against strict schemas.
Prevents corrupted/malformed states from hydrating.

## Usage

```javascript
const schema = require('./lib/schema');

// Validate all
const result = schema.isValid();
// { valid: true |
- results: [] |
- summary: { checked: 2 |
- passed: 2 |
- failed: 0 } }

// Validate specific file
const brainResult = schema.validateFile('brain.json');
// { valid: true |
- errors: [] |
- file: 'brain.json' }

// Get schema
const brainSchema = schema.getSchema('brain');
```

## CLI

```bash
vant validate --check    # Full validation (schema + audit + circuits)
vant validate --schema  # Schema only
```

## Schemas

### brain.json
```json
{
    "version": "string",
    "identity": "object",
    "learnings": "array",
    "decisions": "array",
    "preferences": "object",
    "updated": "string"
}
```

### _core.json (LTC)
```json
{
    "version": "string",
    "updated": "string",
    "core": "object",
    "stats": "object"
}
```

## Integration

Used in boot process:

```javascript
const schema = require('./lib/schema');

const result = schema.isValid();
if (!result.valid) {
    console.error('Brain corrupted!');
    console.error(result.results);
    process.exit(1);
}
```

## Related

- [Configuration](reference/configuration) - Config validation
- [Vibe Controls](advanced/vibe) - Dynamic settings