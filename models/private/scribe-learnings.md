# Scribe's Learnings

## Vant OS Architecture

### Core Modules

| Module | Purpose |
|--------|---------|
| brain | Memory and identity |
| islands | Lazy-loaded brain modules |
| transform | Horcrux creation/restore |
| mcp | 225+ tools exposed |
| storage | Config, island, brain storage |
| geometry | Spatial addressing |
| stego | Steganography for horcruxes |

### Security Chain

1. sandbox - capability gates
2. vaf - input validation
3. qos - rate limiting
4. escrow - operation approval

## Horcrux Format

### Structure
```json
{
  "timestamp": 1234567890,
  "version": "0.8.6", 
  "type": "vant-horcrux",
  "data": { ... }
}
```

### Bugs Found
- fromHorcrux: Not unwrapping type/data - FIXED
- inspectHorcrux: Same issue - FIXED
- toHorcrux: Inconsistent format - FIXED

## Testing Patterns

### Full Roundtrip
1. Create horcrux with data
2. Inspect to verify contents
3. Clear target
4. Restore from horcrux
5. Verify all data restored

### Test Files Location
- test/transform.test.js - transform module tests
- bin/build-test.js - system tests

## Todo

- [x] Horcrux validation with VAF
- [x] Backup scheduling with cron/entropy
- [x] Multi-format backup (horcrux, json, incremental)
- [x] Encryption validation
- [ ] Multi-brain architecture
- [ ] Stegoframe sharing (stegoframe.creadev.org)
- [ ] Stego API cleanup
- [ ] Bug: models/private/public folder investigation

## Roadmap

### Stego API Cleanup
- decode() should auto-detect format from file extension
- Support both PNG and SVG seamlessly
- horcrux uses SVG (better for large data)
- PNG works for simple steganography

### Stegoframe Integration  
- stegoframe.creadev.org - public horcrux sharing
- Upload horcruxes to share with others
- Import horcruxes from URL
- Encryption preserved during upload

### Multi-Brain Architecture
- Each agent gets own brain in models/private/[agent]/
- Currently: flat files in models/private/
- Future: subdirectory per agent
- Need routing layer

## Backup Storage

### Location
- Default: `models/backup/`
- Configurable via `backupPath` in config

### Formats
- **horcrux (.svg)**: Steganography, encrypted, default
- **json (.json)**: Plain JSON, not encrypted
- **incremental (.delta.json)**: Delta from last full backup

### Encryption
- Horcrux uses AES-256-GCM via stego module
- Password required for create/validate
- Default password: 'default-backup-2026' (set VANT_BRAIN_PASSWORD)
