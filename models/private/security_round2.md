# Security Findings - Round 2

## New Vulnerabilities Identified (Not Fixed - Design Decisions)

### VULN-1: Memory Exhaustion
- **Issue**: brain.setCache has no size/value limits
- **Impact**: DoS via unbounded memory allocation
- **Fix**: Would need cache size limits + eviction policy

### VULN-2: Storage Unlimited
- **Issue**: FileStorage writes unlimited data to disk
- **Impact**: Disk exhaustion DoS
- **Fix**: Would need quota enforcement

### VULN-3: Circular References
- **Issue**: Config/brain accept circular object references
- **Impact**: Potential memory leaks, JSON serialization issues
- **Fix**: Deep clone + cycle detection on set

### VULN-4: No Type Validation
- **Issue**: config.setFlag accepts any type (strings, negatives, etc)
- **Impact**: Logic errors with type confusion
- **Fix**: Schema validation on set

### VULN-5: No Input Sanitization
- **Issue**: Storage reads return raw data to callers
- **Impact**: Potential XSS if displayed in HTML
- **Fix**: Output encoding where needed

---

## Survived Attacks (Properly Blocked)
- Path traversal attempts
- Prototype pollution
- SSRF/internal IPs  
- Symlink escape
- SQL/XSS injection
- ReDoS patterns
- Stack overflow (natural)

---

*Added: 2026-05-24*