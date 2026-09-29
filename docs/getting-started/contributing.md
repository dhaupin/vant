---
version: 0.8.6
permalink: /getting-started/contributing
layout: default
title: Contributing
nav_order: 19
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

### Good First Issues

Issues labeled `good first issue` (the repo's real label, with spaces)
carry a contract: a reproduction and an acceptance test sit in the
issue body, so you verify your fix the same way the project does. It is
the same contract every vant fix follows - the fix ships with the test
that proves it. Browse the current set on the [issues
page](https://github.com/dhaupin/vant/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

### Triage Doors

Every kind of input has a real door, and the doors are checked against
reality:

| Input | Door | What to include |
|-------|------|-----------------|
| Question or idea | [Discussions](https://github.com/dhaupin/vant/discussions) | What you tried, what you expected |
| Bug | [Issues](https://github.com/dhaupin/vant/issues) with the bug template | Expected, actual, reproduction, environment |
| Feature request | [Discussions](https://github.com/dhaupin/vant/discussions) first | The problem and proposed shape; becomes an issue once concrete |
| Security vulnerability | [Private advisory](https://github.com/dhaupin/vant/security/advisories/new) - never a public issue | Impact, reproduction, which surface |
| Documentation gap | [Issues](https://github.com/dhaupin/vant/issues) with the `documentation` label | The page, the claim, what reality says |

Labels that exist on the tracker: `bug`, `documentation`, `enhancement`,
`good first issue`, `help wanted`, `question`, plus project tags
(`announcement`, `exploration`, `roadmap`, `testing`, `api`,
`encryption`, `recursion`, `nova`). If a guide mentions a label that
does not exist, that is a bug: the doors are part of the surface.

Security handling is credited and private per the project's
[security policy](https://github.com/dhaupin/vant/blob/axolotl/.github/SECURITY.md);
support routing lives in
[SUPPORT.md](https://github.com/dhaupin/vant/blob/axolotl/.github/SUPPORT.md).

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