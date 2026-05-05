---
version: 0.8.6
permalink: /guides/examples
layout: default
title: Examples
nav_order: 23
---
# Examples

Common workflows.

---

## Wake Up Check

```bash
git branch --show-current
cat models/public/_succession.json
cat models/public/identity.md
cat models/public/goals.md
```

---

## Do Work Save

```bash
nano models/public/lessons.md
git add -A
git commit -m "agent-name: Added lesson"
git push origin agent-name
```

---

## Check Rate Limit

```bash
vant rate
```

---

## Health Check

```bash
vant health
```

---

## Fix Merge Conflict

```bash
git fetch origin
git merge origin/main
# Edit conflicted files
git add -A
git commit -m "Resolved"
git push origin your-branch
```

---

## Errors

| Error
- Fix |
|-------|-----|
| Permission denied
- Check GITHUB_TOKEN |
| Rate limit
- Wait 1 hour |
| Lock held
- Use your branch |

## Related

- [CLI Reference](reference/cli) - All commands
- [Troubleshooting](troubleshooting) - Problem solving
- [GitHub](github) - GitHub integration
