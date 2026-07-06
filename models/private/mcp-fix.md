# MCP Boot Fix - 2026-07-05

## Problem
`vant.start({ mode: 'mcp' })` was failing with "Escrow: Budget exceeded"

## Root Causes Found

1. **Escrow defaultBudget too low**: Default was 1000, but boot operations consume budget
2. **getHandler() not using global._escrow**: Brain's handler lookup was using cached/default escrow instead of boot's instance with correct budget
3. **Missing await in execute()**: `beforeExecute()` is async but wasn't awaited

## Fixes Applied

### lib/escrow.js
- `defaultBudget: 1000 → 100000`
- Added `await` before `this.beforeExecute(ctx)` in execute()

### lib/brain.js  
- getHandler() now checks `global._escrow` FIRST before cache/defaults

## Files Changed
- lib/escrow.js: defaultBudget + await
- lib/brain.js: getHandler priority

## Status
✅ MCP boot now completes successfully
- All 4 BRAIN PIPELINE layers pass: sandbox, vaf, qos, escrow
- MCP server starts on port 3457

## Next Steps
- [ ] Test API mode: `vant.start({ mode: 'api' })`
- [ ] Test All mode: `vant.start({ mode: 'all' })`
- [ ] Full integration testing

=== LEARNED ===
