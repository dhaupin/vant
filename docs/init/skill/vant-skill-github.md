# GitHub

> Work with GitHub.

---

## When To Use

- Create PRs
- Check issues
- Manage repos

---

## How To Use

### Create PR

```bash
# Via CLI
vant gh create-pr --base main --head fix-branch

# Via API
POST /repos/{owner}/{repo}/pulls
```

### Check Status

```bash
# Check CI
vant gh status

# Check PR
vant gh pr [number]
```

---

## Vant Integration

```bash
# Auto-PR on brain sync
vant sync --pr
```

---

## Actions

| Action | Command |
|--------|---------|
| Create PR | gh pr create |
| Check CI | gh run view |
| Link Issue | gh issue link |

---

## Output

```
## GitHub

### PR
- [url]
- CI: [status]
- Review: [status]
```

---

**Role**: GitHub Manager  
**Input**: Action  
**Output**: GitHub updated

> Keep in sync with code.
