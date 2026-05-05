# MYCELIUM CORE LIBRARIES - DISCOVERED

## vaf.js (Vant Application Firewall)
- Input validation and sanitization
- Path traversal protection
- Injection prevention
- Rate limiting per agent/IP
- Content filtering (/dangerous patterns/)
- Audit logging

## rate-limit.js
- Respects GitHub API rate limits
- Per-hour sliding window
- State persistence to JSON

## protection.js (MCP Protection)
- Concurrent request limit (MAX_CONCURRENT)
- Request timeouts (MCP_TIMEOUT)
- Input size limits
- Circuit breaker pattern

## resolution.js
- Per-file thought status tracking
- ACTIVE, RESOLVED, DEPRECATED, REJECTED
- Ledger file for all resolutions

## health.js
- Express health server
- /health, /health/ready, /health/live
- Readiness + liveness probes

## stego.js
- LSB image steganography
- Optional AES-256-GCM encryption
- Encode/decode messages in images

## entropy.js
- Shannon entropy calculation
- Latent transport patches
- Separate stable from high-entropy content

## prompts.js (CLI)
- Inquirer-based prompts
- confirm(), input(), password(), select()
- Validation support

## onboard.js
- Agent onboarding flow
- First-run setup

## misc
- colors.js - Terminal colors
- errors.js - Error types
- logger.js - Logging with verbosity levels
- metrics.js - Performance metrics
- telegram.js - Telegram bot integration
- version.js - Version management

=== CORE LIBS DISCOVERED ===
