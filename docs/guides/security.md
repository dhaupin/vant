---
permalink: /guides/security.html
layout: default
title: Security
---

# Security

Security guide for Vant - protecting your brain, tokens, and secrets.

## VAF (Vant Application Firewall)

VAF is Vant's input validation and filtering system. It protects against:
- Injection attacks (command, path, script)
- DoS attacks (rate limits, input size bombs)
- Malicious content (malware patterns, exploits)
- Word stacking attacks (troll/flood attacks)

### Quick Start

```javascript
const vaf = require('./lib/vaf');

// Validate any input
vaf.check(userInput, { type: 'string', maxLength: 50000 });

// Check path for traversal
vaf.checkPathTraversal(userPath);

// Check content for dangerous patterns
vaf.checkContent(content);
```

---

## VAF Rules (Complete List)

VAF blocks the following patterns (all configurable via config.ini):

### 1. Word Stacking / Flood Attacks

| Pattern | Description | Example |
|---------|-------------|---------|
| Massive repetition | 10+ repeats of same word | `vant vant vant vant vant vant vant vant vant vant` |
| Command stacking | 2+ repeats of commands | `vant vant`, `node node`, `docker docker` |

**Note:** Blocks ONLY command/program words (vant, node, docker, npm, git, etc.), NOT normal words (bye, go, ok, hi, etc. pass through).

### 2. Command Injection

| Pattern | Blocked Examples |
|---------|----------------|
| Command substitution | `$(whoami)`, `${whoami}`, `` `whoami` `` |
| Pipe to shell | `| bash`, `| sh` |
| Sequential | `; rm -rf /`, `:;rm` |
| Background | `& rm -rf &` |
| Chain operators | `&& whoami`, `|| whoami` |

### 3. Shell Metacharacters

| Character | Purpose | Blocked |
|-----------|---------|---------|
| `&&` | AND chain | Yes |
| `||` | OR chain | Yes |
| `;` | Sequence | Yes |
| `&` | Background | Yes |
| `|` | Pipe | Yes |
| `>` | Redirect out | Yes |
| `<` | Redirect in | Yes |
| `>>` | Append redirect | Yes |

### 4. Environment Variables

| Pattern | Blocked |
|---------|---------|
| `$VAR` | `$HOME`, `$PATH`, `$USER`, `$AWS_KEY` |
| `${VAR}` | `${SECRET}`, `${AWS_ACCESS_KEY}` |

### 5. Script Injection

| Pattern | Description |
|---------|-------------|
| `<script>` | Script tags |
| `javascript:` | JS protocol |
| `onclick=` | Event handlers |
| `<iframe>` | Frame injection |
| `eval()` | Code eval |
| `exec()` | Command exec |
| `system()` | PHP system |

### 6. Path Traversal

| Pattern | Blocked |
|---------|---------|
| `../` | Parent traversal |
| `..%2F` | URL encoded |
| `%2E%2E%2F` | Double encoded |
| `....//` | Bypass attempt |

### 7. Sensitive System Paths

All of these are blocked in paths:

```
/etc/   /usr/   /bin/   /sbin/  /var/   /root/
/home/  /tmp/   /opt/   /boot/  /dev/   /sys/
/proc/  /lib/   /snap/
```

Windows paths: `C:\`, `D:\`, `\\UNC\path`

Home expansion: `~`, `$HOME`, `$USER`, `~/.ssh/`

### 8. File Attack Extensions

| Blocked | Reason |
|---------|--------|
| `.exe`, `.bat`, `.cmd` | Executables |
| `.sh`, `.bash` | Shell scripts |
| `.ps1` | PowerShell |
| `.scr`, `.vbs` | Scripts |
| `.dll`, `.so` | Libraries |

### 9. PHP Code

| Pattern | Description |
|---------|-------------|
| `<?php` | PHP open tag |
| `<?=` | PHP short echo |
| `system()` | Execute command |
| `shell_exec()` | Shell execute |
| `passthru()` | Execute passthru |
| `proc_open()` | Process open |

### 10. Dangerous Commands

```javascript
/\brm\s+-rf\b/      // rm -rf
/\bdd\s+if\b.*\bof\b/  // dd if
/chmod\s+777/      // chmod 777
/chown\s+/          // chown
```

### 11. Log Injection

Newlines in logs can inject fake entries or corrupt audit trails:

| Pattern | Description | Risk |
|---------|-------------|------|
| `\n` | Newline | Fake log entries |
| `\r` | Carriage return | Log corruption |

### 12. CRLF Injection

CRLF sequences can inject HTTP headers:

| Pattern | Description | Risk |
|---------|-------------|------|
| `\r\n` | CRLF sequence | HTTP header injection |
| `Set-Cookie:` | Cookie injection | Session hijacking |

### 13. XXE (XML External Entity)

XML parsing vulnerabilities:

| Pattern | Description |
|---------|-------------|
| `<!ENTITY` | XML entity definition |
| `<!ELEMENT` | XML element definition |

### 14. Null Byte Injection

```
file.txt\x00.exe  -> Blocked
test.php\x00      -> Blocked
```

---

## Configuration

All VAF settings are configurable via `config.ini`:

```ini
# VAF Configuration (config.ini)
MAX_STRING_LENGTH=100000
MAX_DEPTH=5
MAX_ARRAY_LENGTH=1000
MAX_REQUESTS_PER_MINUTE=60
MAX_REQUESTS_PER_HOUR=1000
MAX_BURST=10
MAX_PATH_LENGTH=4096
BLOCK_PATH_TRAVERSAL=true
```

## MCP Server

MCP endpoints use VAF for all input validation. Important:

- **File parameters** use `type: 'path'` to block path traversal
- **String parameters** block newlines (`\n`), CRLF (`\r\n`), XSS
- **Memory content** should be written directly to `models/public/` not via MCP

```javascript
// MCP - blocks newlines in content (secure)
await setMemory('lessons', '# Lesson\n\n- Note here')

// Direct file write - allows newlines (user intent)
fs.writeFileSync('models/public/lessons.md', '# Lesson\n\n- Note here')
```

### Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| MAX_STRING_LENGTH | 100000 | Max input string length |
| MAX_DEPTH | 5 | Max nested object depth |
| MAX_ARRAY_LENGTH | 1000 | Max array items |
| MAX_REQUESTS_PER_MINUTE | 60 | Rate limit/min |
| MAX_REQUESTS_PER_HOUR | 1000 | Rate limit/hour |
| MAX_BURST | 10 | Burst requests |
| MAX_PATH_LENGTH | 4096 | Max path length |
| BLOCK_PATH_TRAVERSAL | true | Block .. in paths |
| AUDIT_LOG | true | Enable audit logging |
| AUDIT_FILE | .audit.log | Log file path |

---

## MCP Protection

The MCP server has additional protection layers (lib/protection.js):

### Settings (config.ini)

```ini
MCP_SERVER=true
MCP_PORT=3456
MCP_API_KEY=your-secret-key
MCP_REQUIRE_API_KEY=false
MCP_TIMEOUT=30000
MCP_MAX_INPUT_SIZE=1048576
MCP_MAX_CONCURRENT=3
MCP_CIRCUIT_BREAK_THRESHOLD=5
MCP_CIRCUIT_BREAK_WINDOW=60000
```

### MCP Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| MCP_PORT | 3456 | Server port |
| MCP_API_KEY | - | API key for auth |
| MCP_REQUIRE_API_KEY | false | Force auth required |
| MCP_TIMEOUT | 30000 | Request timeout (ms) |
| MCP_MAX_INPUT_SIZE | 1048576 | Max input (1MB) |
| MCP_MAX_CONCURRENT | 3 | Concurrent requests |
| MCP_CIRCUIT_BREAK_THRESHOLD | 5 | Failures before block |
| MCP_CIRCUIT_BREAK_WINDOW | 60000 | Failure window (ms) |

### Circuit Breaker

The circuit breaker prevents cascade failures:

1. 5 failures in 1 minute -> circuit opens
2. All requests rejected until window clears
3. Auto-recovery after window passes

---

## Rate Limiting

| Limit | Default | Description |
|-------|---------|-------------|
| Per minute | 60 | Standard rate |
| Per hour | 1000 | Hourly limit |
| Burst | 10 | Rapid requests |

---

## Audit Logging

All security events are logged:

```bash
tail -f .audit.log
```

Events logged:
- BLOCKED - Content blocked by VAF
- RATE_LIMIT - Rate limit exceeded
- PATH_TRAVERSAL - Path attack blocked
- AUTH_FAILED - Invalid API key
- CIRCUIT_OPEN - Circuit breaker open
- TIMEOUT - Request timeout

---

## MCP Security
Keep your brain and tokens safe.

### Enable API Key (Recommended for Production)

```ini
# config.ini
MCP_REQUIRE_API_KEY=true
MCP_API_KEY=your-very-secret-key
```

### Making Authenticated Requests

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-very-secret-key" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{...}}'
```

### Environment Variables

```bash
export VANT_MCP_API_KEY=your-secret-key
export VANT_MCP_REQUIRE_API_KEY=true
export MCP_TIMEOUT=15000
```

---

## Security Checklist

Before deploying to production:

- [ ] Set MCP_REQUIRE_API_KEY=true
- [ ] Use strong MCP_API_KEY (32+ random chars)
- [ ] Configure rate limits for your use
- [ ] Enable AUDIT_LOG=true
- [ ] Monitor .audit.log regularly
- [ ] Review circuit breaker settings
- [ ] Test VAF blocks manually

---

## Test VAF Blocks

```bash
# Test word stacking
node -e "const vaf=require('./lib/vaf');vaf.check('vant vant')"

# Test path traversal  
node -e "const vaf=require('./lib/vaf');vaf.checkPathTraversal('../etc/passwd')"

# Test shell metacharacters
node -e "const vaf=require('./lib/vaf');vaf.check('&& whoami')"

# Test environment variables
node -e "const vaf=require('./lib/vaf');vaf.check('\$HOME')"
```

---

See also: [Configuration](/vant/reference/configuration.html), [Architecture](/vant/guides/architecture.html), [Troubleshooting](/vant/guides/troubleshooting.html)