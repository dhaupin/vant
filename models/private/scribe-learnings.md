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

- [ ] Horcrux validation with VAF
- [ ] Backup scheduling with cron/entropy
- [ ] Multi-brain architecture
- [ ] Stegoframe sharing
