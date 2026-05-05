# Contributing to Vant

Thank you for your interest in contributing to Vant!

## Quick Links

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guide](#style-guide)

---

## Code of Conduct

This project follows the Vant Code of Conduct. By participating, you are expected to uphold this code.

**TL;DR:** Be respectful, inclusive, and constructive.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/dhaupin/vant.git
cd vant

# Install dependencies
npm install

# Run tests
npm test
```

### First Contribution?

Issues tagged with `good first issue` are great for beginners:

- [ ] Add documentation
- [ ] Fix typos
- [ ] Add tests

---

## Development Setup

### Local Development

```bash
# Install dependencies
npm install

# Link for local testing
npm link

# Run in development mode
node bin/vant.js start

# Run tests
node bin/build-test.js
```

### Running Tests

```bash
# All tests
node bin/build-test.js

# Health check
node bin/health.js

# Load brain
node bin/load.js v0.8.6
```

---

## Pull Request Process

### Before Submitting

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/your-feature`
3. **Make** your changes
4. **Test** locally: `node bin/build-test.js`
5. **Commit** with clear messages

### PR Checklist

- [ ] Tests pass locally
- [ ] No obvious secrets in code
- [ ] Documentation updated (if needed)
- [ ] Commit messages are clear

### Commit Message Format

```
type(scope): description

- Bullet points for details
- Keep it concise
```

Types: `fix`, `feat`, `docs`, `chore`, `refactor`, `test`

Example:
```
fix(mcp): block path traversal in setMemory

- Add null byte check
- Block absolute paths
- Add VAF validation
```

---

## Style Guide

### JavaScript

- Use `const` over `var`
- Prefer `async/await` over callbacks
- Add JSDoc for public functions

### Naming

- `camelCase` for variables/functions
- `PascalCase` for classes
- `SCREAMING_SNAKE_CASE` for constants

### Code Example

```javascript
/**
 * Load brain files from models/public
 * @param {string} version - Brain version
 * @returns {Object} Brain data
 */
async function load(version) {
  const brain = {};
  // Implementation
  return brain;
}
```

---

## Questions?

- Open an issue for bugs
- Start a discussion for questions
- Check existing issues first

---

## Recognition

Contributors are recognized in:
- CHANGELOG.md
- Release notes
- GitHub contributors page

---

Thank you for contributing to Vant!