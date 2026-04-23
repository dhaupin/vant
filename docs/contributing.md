---
permalink: /contributing.html
layout: default
title: Contributing
---

# Contributing to Vant

> Welcome! Here's how to help make Vant better.

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

```
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

Format: `type: description`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code cleanup
- `test`: Adding tests

Examples:
```
feat: Add multi-agent lock timeout
fix: Handle missing brain repo gracefully
docs: Update CLI reference
```

## PR Process

1. **Open early** - Gets feedback quickly
2. **Keep small** - Smaller = faster to review
3. **Respond to feedback** - Iterate until merged

## Recognition

Contributors get added to README.md. Thanks for making Vant better!

---

## Questions?

- Open a [GitHub Discussion](https://github.com/dhaupin/discussions)
- Ask in [Issues](https://github.com/dhaupin/issues)

---

## Related

- [GitHub Repo](https://github.com/dhaupin/vant)
- [Issues](https://github.com/dhaupin/issues)
- [Discussions](https://github.com/dhaupin/discussions)