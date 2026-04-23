---
permalink: /legal/environment.html
layout: default
title: Environment & Limits
---

# Environment & Limits

> GitHub API usage, rate limits, environmental considerations. Updated: April 2025.

---

## GITHUB API USAGE

### What Vant Uses

When configured with GitHub sync, Vant interacts with:

| API | Purpose | Method |
|-----|---------|--------|
| Repositories | Brain storage | GET, POST, PUT |
| Contents | File read/write | GET, PUT |
| Commits | Version history | GET, POST |
| Branches | Isolation | GET, POST |
| Git Data | Sync operations | GET, POST |

### Not Used

Vant does NOT use:
- Issues (for storage)
- Pull requests (as data)
- Wiki (as storage)
- Releases (for storage)
- Projects (as database)

### Rate Limits

**GitHub API has rate limits:**

| Plan | Requests/Hour | Burst |
|------|--------------|-------|
| Unauthenticated | 60 | 60 |
| Authenticated | 5,000 | 5,000 |
| GitHub Actions | 1,000 | 1,000 |

**Source:** [GitHub Rate Limits](https://docs.github.com/en/rest/about-rest-api/rate-limits-and-concurrency)

### Token Scopes

**Recommended minimal scopes:**

```
repo
  - repo:status    (check)
  - repo_deployment (read)
```

**Avoid:**
- `admin:org`
- `delete_repo`
- `write:discussion`

---

## POLLING CONSIDERATIONS

### GitHub ToS Prohibition

**Automated polling is prohibited.**

> "Using GitHub as a database or for purposes unrelated to source code management."
> — [GitHub Acceptable Use Policies](https://docs.github.com/en/github/site-policy/github-acceptable-use-policies)

### What This Means

| Allowed | Not Allowed |
|---------|------------|
| Manual sync (`vant sync`) | Polling every N seconds |
| `git clone/fetch` | Checking every minute |
| On-demand sync | Scheduled background sync |
| User-initiated | Automated by default |

### Vant's Approach

Vant defaults to:
- **Manual sync** — Run `vant sync` when you want
- **No polling** — Must explicitly opt-in
- **Opt-in warnings** — Clear GitHub ToS warnings
- **Two confirmations** — Env var OR stdin

---

## DATA CONSIDERATIONS

### What Gets Synced

**Your brain files:**
- Memory files (`models/public/*.md`)
- Configuration (non-secret)
- Settings

**NOT synced:**
- `.env` files (gitignored)
- Tokens
- Local state
- Cache files

### Repository Size

**GitHub soft limit:** 1GB per repo
**GitHub hard limit:** 2GB per repo

**Best practices:**
- Keep brain files concise
- Don't commit binaries
- Use `.gitignore`

See: [GitHub Large Files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)

### Privacy

Your brain is:
- Stored on YOUR GitHub account
- Visible to who you share with
- Public or private - YOUR choice

---

## TOKEN SECURITY

### Best Practices

1. **Use Fine-Grained Tokens**
   - Created October 2022+
   - Minimum permissions
   - Expiration dates

2. **Rotate Regularly**
   - Every 90 days
   - After suspicious activity
   - When leaving organization

3. **Never Commit**
   - Add `.env` to `.gitignore`
   - Don't paste in issues
   - Don't share in chat

4. **Use .env Files**
   ```bash
   # .env (gitignored)
   VANT_GITHUB_TOKEN=ghp_xxxx
   ```

### Token Exposure

**If exposed:**

1. **Immediate**: Revoke token
   - GitHub → Settings → Developer → Tokens
   - Or: Settings → Tokens (classic)

2. **Check Audit Log**
   - GitHub → Settings → Audit log
   - Look for suspicious activity

3. **Generate New**
   - Minimal scopes only
   - Set expiration

4. **Update Vant**
   - Update `.env`
   - Restart node

---

## SYSTEM REQUIREMENTS

### Minimum

| Resource | Requirement |
|----------|-------------|
| Node.js | 18+ |
| RAM | 512MB |
| Disk | 100MB |
| Git | 2.x |

### Recommended

| Resource | Requirement |
|----------|-------------|
| Node.js | 20+ |
| RAM | 1GB |
| Disk | 500MB |
| Git | 2.x |

### Dependencies

Vant uses:
- `express` - HTTP server
- `chalk` - Terminal colors
- `cli-progress` - Progress bars
- `inquirer` - Interactive prompts
- `yaml` - YAML parsing
- And ~30 other packages

---

## NETWORK CONSIDERATIONS

### Ports Used

| Port | Service |
|------|---------|
| 3456 | MCP server (default) |
| 3457 | MCP alt port |
| 443 | HTTPS (GitHub) |

### Firewall Rules

**For MCP server:**
```bash
# Allow local only
ufw allow from 127.0.0.1 port 3456

# Or specific IPs
ufw allow from 192.168.1.0/24 port 3456
```

### Proxy Support

Set HTTP proxy:
```bash
export HTTP_PROXY=http://proxy:8080
export HTTPS_PROXY=http://proxy:8080
```

---

## ENVIRONMENT VARIABLES

### Required

| Variable | Purpose |
|----------|---------|
| None | Works standalone |

### Optional

| Variable | Purpose |
|----------|---------|
| `VANT_GITHUB_TOKEN` | GitHub sync |
| `VANT_GITHUB_REPO` | Repository |
| `VANT_MCP_PORT` | MCP port |
| `VANT_AGREE_AUTO_SYNC` | Opt-in polling |

### Security

- Store in `.env` (gitignored)
- Never in code
- Never in logs

---

## ERROR HANDLING

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401` | Bad token | Regenerate token |
| `403` | No permission | Check scopes |
| `404` | No repo | Create or check |
| `429` | Rate limit | Wait, reduce sync |
| `500` | GitHub | Check status |

### Recovery

1. **Token issues**: Regenerate, update `.env`
2. **Rate limit**: Wait 1 hour, use manual sync
3. **GitHub down**: Use offline, wait
4. **Conflict**: Pull rebase or merge manually

---

## LIMITATIONS

### Vant Limitations

- Single brain per instance
- No built-in encryption
- Git-based sync only
- No multi-user auth

### GitHub Limitations

- Not a database
- Not for real-time apps
- Rate limited
- Can revoke access

### Alternative Backends

Future support (not implemented):
- GitLab
- Gitea
- Self-hosted Git
- File system only

---

## MONITORING

### Local Monitoring

```bash
# Check resource usage
top
htop

# Check Node processes
ps aux | grep node

# Check disk usage
du -sh models/public/
```

### GitHub Monitoring

- **Tokens**: Settings → Developer → Tokens
- **Audit Log**: Settings → Audit log
- **Usage**: Settings → Repositories

---

## COMPLIANCE CHECKLIST

Before using Vant with GitHub:

- [ ] Read GitHub Terms
- [ ] Understood API rate limits
- [ ] Token created with minimal scopes
- [ ] Token has expiration
- [ ] `.env` in `.gitignore`
- [ ] Backup plan in place
- [ ] Understand manual sync
- [ ] No automated polling
- [ ] Privacy implications understood

---

## SEE ALSO

- [Terms](./index.html) - Legal disclaimer
- [Privacy](./privacy.html) - Privacy policy
- [GitHub API Docs](https://docs.github.com/en/rest) - Full API reference
- [GitHub ToS](https://docs.github.com/en/github/site-policy) - All policies