---
permalink: /guides/troubleshooting.html
layout: default
title: Troubleshooting
---
# Troubleshooting

Common issues and fixes.

## Health Check Failures
This section covers health.

### Config not found
Configuration options.

```
Error: Config file not found
```

**Fix**: Run setup:

```bash
vant setup
```

### GitHub connection failed
This section covers github.

```
Error: Cannot connect to GitHub
```

**Fix**:
1. Check GITHUB_TOKEN in .env
2. Verify repo exists
3. Check network connection

## Sync Issues
This section covers issues.

### Merge conflict
This section covers merge.

```
Error: Merge conflict in brain
```

**Fix**:
1. `vant sync --pull` to see conflicts
2. Resolve manually in brain files
3. `vant sync --push`

### Rate limit exceeded
Check rate limits.

```
Error: GitHub API rate limit exceeded
```

**Fix**:
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
This section covers issues.

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
This section covers advanced.

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
This section covers permission.

```
Error: Permission denied (publickey)
```

**Fix**:
- Use HTTPS with token (recommended)
- Or add SSH key: `git remote set-url origin git@github.com:user/repo.git`

### Token Expired
This section covers token.

```
Error: Token expired
```

**Fix**:
- Generate new token: https://github.com/settings/tokens
- Update .env file

## VAF Blocked Input

VAF (Vant Application Firewall) may block legitimate input:

### Blocked: Newlines
This section covers blocked.

```
Error: Content blocked: /\n/
```

**Fix**:
- Write multi-line content directly to `models/public/filename.md`
- Don't pass newlines via MCP `setMemory`

### Blocked: Path Traversal
This section covers blocked.

```
Error: Path traversal detected: ../etc/passwd
```

**Fix**:
- Use relative paths within project
- Don't use `../` in file parameters

### Blocked: Script/XSS
This section covers blocked.

```
Error: Content blocked: /<script>/
```

**Fix**:
- Don't include `<script>`, `javascript:`, `on*=` in inputs
- For HTML content, write directly to files

### Blocked: Shell Commands
This section covers blocked.

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