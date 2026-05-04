# CHANGELOG
version: 0.8.4

All notable changes to Vant are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.8.4] - 2026-05-04 - Security Release

### ⚠️ MAJOR SECURITY RELEASE

This version contains comprehensive security hardening from a deep penetration test and security audit session.

### Security (12 Vulnerabilities Fixed)

| ID | Severity | Vector | File | Description |
|----|----------|--------|------|-------------|
| V001 | CRITICAL | Command injection | bin/changelog.js | Unsafe exec with string concatenation |
| V002 | HIGH | Token exposure | bin/sync.js | GitHub token in URL |
| V003 | HIGH | Auth bypass | bin/mcp.js | No MCP authentication |
| V004 | MEDIUM | DoS | lib/lock.js | Lock acquisition flood |
| V005 | MEDIUM | Path traversal | lib/config.js | Model path with ../ |
| V006 | MEDIUM | DoS | lib/succession.js | Unsafe JSON.parse |
| V007 | MEDIUM | DoS | lib/resolution.js | Unsafe JSON.parse |
| V008 | MEDIUM | DoS | lib/update-check.js | Unsafe JSON.parse + dup validation |
| V009 | MEDIUM | DoS | lib/onboard.js | Unsafe JSON.parse |
| V010 | HIGH | Prompt injection | lib/vaf.js | No AI prompt filtering |
| V011 | MEDIUM | Key injection | lib/brain.js | Unsafe key in writes |
| V012 | LOW | Context overflow | lib/auto-update.js | No max limit (existed) |

### AI Security Hardening

- **Prompt Injection**: Added 17+ patterns to VAF blocklist
  - "ignore previous instructions", "forget everything"
  - "new system:", "role:", "act as"
  - "DAN mode", "jailbreak"
  - Template injection: {{system}}, [INST], [SYS]
  
- **Model Key Validation**: Brain file keys validated
  - Only alphanumeric, underscore, hyphen allowed
  - Prevents filename injection
  
- **Context Protection**: Message limits existed
  - 50 message max, 100KB content limit

### Deep Audit Vectors Analyzed

| Vector | Status | Protection |
|--------|--------|------------|
| Command injection | ✅ BLOCKED | VAF + safe spawn |
| Path traversal | ✅ BLOCKED | VAF + path validation |
| Script injection | ✅ BLOCKED | VAF patterns |
| Prompt injection | ✅ BLOCKED | V010 |
| Context poisoning | ✅ LIMITED | V012 |
| Model hijacking | ✅ PROTECTED | V003 (MCP auth) |
| YAML deserialization | ✅ SAFE | js-yaml (no eval) |
| JSON deserialization | ✅ SAFE | V006-V009 |
| System prompt theft | ✅ MITIGATED | No secrets in logs |
| Key injection | ✅ FIXED | V011 |

### Documentation Updated

- docs/guides/security.md - Full vulnerability disclosure
- docs/CHANGELOG.md - This file
- README.md - Security section linked
- docs/guides/manual-brain.md - Manual brain creation guide
- docs/guides/release.md - Release process guide
- All docs now have version frontmatter (0.8.4)
- CLI.md referenced in AGENTS.md
- lib/version.js referenced in AGENTS.md

### Documentation System

- Jekyll docs migrated to /docs/
- All guides have nav_order frontmatter
- Broken links fixed across docs
- Version-aligned all 42 markdown files

### Code Quality

- JSDoc added throughout lib/ and bin/
- Security tests added for all VAF patterns
- MCP authentication implemented
- Password validation for stego.js

### Thanks

Security audit and documentation pass by OpenHands agent.



---

## [Older]

See git history for previous changes.
