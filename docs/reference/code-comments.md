---
version: 0.8.6
permalink: /code-comments
layout: default
title: Code Comments
nav_order: 91
---
# Code Comments

> Vant code comments convention

## Purpose

AI-first code must be self-documenting. Comments help AI agents understand codebase structure, decisions, and gotchas.

## Schema

All comment blocks follow this format:

```javascript
/**
 * Module/Function Name
 * One-line description
 *
 * Extended description if needed.
 *
 * Usage:
 *   const mod = require('./module');
 *   mod.function(args);
 *
 * @param {type} name - Description
 * @returns {type} Description
 *
 * SECURITY:
 * - Security consideration
 * - Another consideration
 *
 * Related: link/to/doc
 */
```

## Required Sections

### 1. Module Header

Every file needs header with:

- **Purpose**: What it does (one line)
- **Usage**: Quick code example
- **Related**: Links to related docs/modules
- **SECURITY**: Security considerations (if any)

### 2. Function Docs

Every exported function needs:

- **@param**: Parameter type, name, description
- **@returns**: Return type and description
- **@throws**: Error conditions (if applicable)

### 3. Inline Comments

Use for:

- **Why this way**: Explain non-obvious choices
- **Gotchas**: Common mistakes to avoid
- **FIXME/TODO**: Known issues

## Style

### Do

- Use short sentences
- Be specific, not abstract
- Use active voice ("Does X" not "X is done")
- Include code examples
- Document the WHY, not just WHAT

### Don't

- Use em dashes (—) - use short dashes (-)
- Use AI clichés (leverage, unlock, empower, seamless)
- Restate obvious code
- Use passive voice
- Leave stale TODO/FIXME

## JSDoc Tags Used

| Tag | Purpose | Example |
|-----|---------|---------|
| @param | Input param | `@param {string} name - User name` |
| @returns | Return value | `@returns {object} User object` |
| @throws | Error conditions | `@throws {Error} If not found` |
| @example | Code example | `@example user.get('name')` |
| @see | Related docs | `@see config.md` |

## File Convention

Each lib/ file should have:

1. File header comment (top)
2. Module-level constants (if any)
3. Exported functions with JSDoc
4. Internal functions (commented)

## Security Comments

Always document:

- Input validation
- Credential handling
- Rate limiting
- Timeout behavior
- Failure modes

## Example

```javascript
/**
 * Get user by name
 * @param {string} name - User name to lookup
 * @returns {object|null} User object or null
 * @throws {Error} If name is invalid
 *
 * SECURITY: Validates name against VAF before lookup
 */
function getUser(name) {
    vaf.check(name, { type: 'string', name: 'user' });
    // ...
}
```

## Quality Checklist

- [ ] Header comment on every file
- [ ] @param on every function
- [ ] @returns on every function  
- [ ] SECURITY section if handling credentials
- [ ] No stale TODO/FIXME
- [ ] No AI clichés
- [ ] Short dashes (- not —)