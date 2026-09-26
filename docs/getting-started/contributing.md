---
version: 0.8.6
permalink: /getting-started/contributing
layout: default
title: Contributing
nav_order: 18
---

# Contributing to Vant

> Welcome! Here's how to help make Vant better.
>
> **Canonical source note:** this page is the ONE full contribution
> guide. The root [CONTRIBUTING.md](https://github.com/dhaupin/vant/blob/axolotl/CONTRIBUTING.md)
> is the short front door pointing here; do not grow the two back into
> divergent copies of each other.

## Code of Conduct

Be respectful. We're all here to build cool AI memory stuff together.

## Ways to Contribute
There are several ways to contribute to Vant.

### 1. Report Bugs

Open an issue with:
- What you expected
- What happened
- Steps to reproduce
- Your environment (Node version, OS, etc.)

### 2. Suggest Features

Open a discussion first:
- Describe the feature
- Why it's useful
- How it would work

### 3. Write Code
Contribute code to the project.

```text
1. Fork the repo
2. Create a branch: git checkout -b feature/your-feature
3. Make changes
4. Add tests if applicable
5. Commit: git commit -m 'Add feature'
6. Push: git push origin feature/your-feature
7. Open a PR
```

### 4. Improve Docs

Docs live in `docs/`. Just edit and PR!

Two lint gates run over every docs change, so run them before you push:

```bash
# Voice/format gate: fence language tags, heading order, em dashes,
# emoji in prose, pipe-table shape, trailing whitespace
npm run lint:docs
```

Both scripts live in `scripts/` and pass silently when clean:

```bash
# Style gate only
node scripts/check-docs-style.js

# Link gate only: every internal link must resolve to a real page
node scripts/check-docs-links.js
```

Content rules in short:

- Plain hyphen in prose, never em or en dashes
- No emoji or decorative glyphs outside code fences and inline code
- Every opening code fence gets a language tag
- Pipe tables: every row starts and ends with `|`
- Version-specific claims (ports, paths, APIs) get checked against `lib/`
  and `bin/` before you commit

### 5. Share

- Star the repo
- Write about Vant
- Help others in discussions

## Development Setup
Get your local development environment ready.

```bash
# Clone
git clone https://github.com/dhaupin/vant.git
cd vant

# Install deps
npm install

# Test
npm test

# Run locally
node bin/vant.js
```

## Coding Standards

- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused
- Test edge cases

## Commit Messages

Format: `type: description` (this is the canonical commit format;
agent-crew work on `agent-<name>` branches uses the `agent-name: did
thing X` pass format instead. Both are documented, neither is
accidental)

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code cleanup
- `test`: Adding tests

Examples:
```yaml
feat: Add multi-agent lock timeout
fix: Handle missing brain repo gracefully
docs: Update CLI reference
```

## PR Process

1. **Open early** - Gets feedback quickly
2. **Keep small** - Smaller = faster to review
3. **Respond to feedback** - Iterate until merged

## Recognition

Contributors get added to README. Thanks for making Vant better!

---

## Questions?

- Open a [GitHub Discussion](https://github.com/dhaupin/vant/discussions)
- Report a bug via [Issues](https://github.com/dhaupin/vant/issues)

---

## Related

- [GitHub Repo](https://github.com/dhaupin/vant)
- [Issues](https://github.com/dhaupin/vant/issues)
- [Discussions](https://github.com/dhaupin/vant/discussions)