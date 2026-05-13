---
version: 0.8.11
permalink: /essential/vant-skill-review-code.md
layout: default
title: Skill Review code
nav_order: 143
---

# Code Review

> Read code. Understand it. Find issues. Report clearly.

---

## First: Read It Like It Works

Before finding bugs, understand what it does:

1. **Run it** - Actually execute if possible
2. **Trace the data** - Follow input to output
3. **Find the edges** - Where does it start, where does it end?
4. **Check the happy path** - Does the main thing work?

Assume it's right until you understand it. Then question.

---

## Pass 1: Functionality

Does this actually do the thing?

| Check | Look For |
|-------|----------|
| Entry point | Where does execution start? |
| Main logic | Core algorithm correct? |
| Edge cases | null, empty, extremes |
| Error handling | What happens on failure? |
| Return values | What's actually returned? |

### How to verify:

```javascript
// Run with inputs
node file.js test-input

// Check output matches expectation
```

---

## Pass 2: Security

Input enters. Something executes. Check:

```javascript
// Credentials exposed?
process.env.API_KEY
// Hardcoded secrets?
const token = "sk-..."
// Injection points?
db.query(userInput)
exec(userInput)
eval(userInput)
// Filesystem?
fs.readFile(path)
```

### Questions to ask:

- Can this be called by anyone?
- What happens with malicious input?
- Are credentials visible in stack traces?
- Rate limiting?

---

## Pass 3: Performance

Expensive operations:

```javascript
// Loops inside loops?
items.map(i => i.sub.map(s => ...))

// Async blocked?
await Promise.all(heavy)

// Missing cache?
// Same lookup repeated

// Memory unbounded?
arr.push(infinite)
```

### Questions:

- Scales with users?
- Memory bounded?
- Async/await correct?

---

## Pass 4: Code Quality

| Check | Issue | Fix |
|-------|------|-----|
| Name unclear | `x` | `userCount` |
| Function too long | 500 lines | Split it |
| Comments what not why | `// loop` | `// sorted by date to match UI` |
| No tests | - | Add tests |

### Questions:

- Can I understand this in 30 seconds?
- Does function do one thing?
- Are side effects obvious?

---

## Pass 5: AI Usability (Vant-specific)

Can another agent use this?

- Public API clear?
- Required params documented?
- Can be imported and called?
- Errors descriptive?

```javascript
// Good: Clear API
await loadBrain(repo, options)

// Bad: What is options?
await loadBrain(x, y)
```

---

## Output Format

For each file:

```
## Review - [filename]

### What it does
[One sentence: What problem does this solve?]

### Issues
| Severity | Type | Issue | Suggestion |
|----------|------|-------|-----------|
| HIGH     | Security | SQL injection | Use parameterized query |
| MEDIUM   | Perf     | N+1 query    | Batch fetches |
| LOW      | Quality | Unclear name | Rename 'x' to 'userId' |

### Looks Good
- [Things done well]

### AI Usability
- [Can another agent call this?]
```

---

## Severity Guide

| Severity | Meaning | Action Required |
|----------|---------|----------------|
| HIGH | Exploit possible / broken | Fix before merge |
| MEDIUM | Could cause issues | Fix or document |
| LOW | Style / preference | Optional fix |

---

## Tips

- **First read then review** - Don't scan, read fully
- **One pass per axis** - Don't mix security with style
- **Question kindly** - "Could this be..." not "Wrong"
- **Think like the writer** - They had reasons
- **Check the tests** - Verify the behavior

---

**Role**: Code Reviewer  
**Input**: Source file(s)  
**Output**: Issues found

> Be thorough. Be kind. Be clear.