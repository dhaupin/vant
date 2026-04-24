---
permalink: /guides/troubleshooting.html
layout: default
title: Troubleshooting
---
# Troubleshooting

Common issues and fixes.

## Health Check Failures
Diagnose system health issues.

### Config not found
Create config file.

Error:

```
Error: Config file not found
```

Run setup wizard:

```bash
vant setup
```

### GitHub connection failed
Check GitHub credentials.

Error:

```
Error: Cannot connect to GitHub
```

Debug steps:
- Check GITHUB_TOKEN in .env
- Verify repo exists
- Check network connection

## Sync Issues
Debug common issues.

### Merge conflict
Resolve version conflicts.

Error:

```
Error: Merge conflict in brain
```

Resolve:
- `vant sync --pull` to see conflicts
- Resolve manually in brain files
- `vant sync --push`

### Rate limit exceeded
Handle API quota limits.

Error:

```
Error: GitHub API rate limit exceeded
```

Wait:
- Wait for reset (usually 1 hour)
- Reduce sync frequency

## Brain Issues
Brain file structure and management.

### Brain not loading
Test brain loading.

```
Error: Cannot load brain
```

**Fix**:
1. Check models/public/ exists
2. Verify brain files are valid markdown
3. Run `vant health`

### Memory lost

**Fix**:
1. Check GitHub for previous versions
2. `vant sync --pull` to restore

## Node Issues
Debug common issues.

### MCP not responding

**Fix**:
1. Check port isn't in use
2. Restart node: `vant node --mcp`

### Connection refused

**Fix**:
1. Verify node is running
2. Check firewall rules

## Common Commands
Available commands.

```bash
vant health          # Diagnose issues
vant health --quiet # Minimal output
vant rate          # Check rate limit
vant update        # Check for updates
```

## Advanced Issues
Advanced troubleshooting.

### Network Timeouts
Timeout configuration.

```
Error: Request timed out
```

**Fix**:
- Increase POLLING_INTERVAL in config.ini
- Check firewall/network
- Use different network

### Large Brain

**Symptoms**: Slow loads, sync timeouts

**Fix**:
- Split brain into categories
- Use git LFS for large files
- Archive old lessons

### Git Corruption
Handle corrupted brain files.

```
Error: fatal: unsafe repository
```

**Fix**:
```bash
git config --global --add safe.directory /path/to/repo
```

### Permission Denied
Fix permission errors.

```
Error: Permission denied (publickey)
```

**Fix**:
- Use HTTPS with token (recommended)
- Or add SSH key: `git remote set-url origin git@github.com:user/repo.git`

### Token Expired
Fix token errors.

```
Error: Token expired
```

**Fix**:
- Generate new token: https://github.com/settings/tokens
- Update .env file

## VAF Blocked Input

VAF (Vant Application Firewall) may block legitimate input:

### Blocked: Newlines
Handle blocked requests.

```
Error: Content blocked: /\n/
```

**Fix**:
- Write multi-line content directly to `models/public/filename.md`
- Don't pass newlines via MCP `setMemory`

### Blocked: Path Traversal
Handle blocked requests.

```
Error: Path traversal detected: ../etc/passwd
```

**Fix**:
- Use relative paths within project
- Don't use `../` in file parameters

### Blocked: Script/XSS
Handle blocked requests.

```
Error: Content blocked: /<script>/
```

**Fix**:
- Don't include `<script>`, `javascript:`, `on*=` in inputs
- For HTML content, write directly to files

### Blocked: Shell Commands
Handle blocked requests.

```
Error: Content blocked: /; rm -rf/
```

**Fix**:
- Don't include `;`, `|`, `&&`, `$()` in inputs
- These are blocked to prevent injection

## Limitations

| Limitation | Description |
|-----------|-------------|
| GitHub rate limits | 5,000/hour authenticated |
| File size | GitHub max 100MB per file |
| Repo size | Free tier: 1GB max |
| Private repos | Must have GitHub account |

See also: [Configuration](/vant/reference/configuration.html), [Architecture](/vant/guides/architecture.html)