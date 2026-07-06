# MCP Boot Fix - 2026-07-05

## Problem
`vant.start({ mode: 'mcp' })` was failing with "Escrow: Budget exceeded"

## Root Causes Found

1. **Missing await in execute()**: `beforeExecute()` is async but wasn't awaited
   - This was THE fix - without await, result.allowed was undefined (Promise pending)
2. **getHandler() not using global._escrow**: Brain's handler lookup was using cached/default escrow instead of boot's instance

## Fixes Applied

### lib/escrow.js
- Added `await` before `this.beforeExecute(ctx)` in execute()

### lib/brain.js  
- getHandler() now checks `global._escrow` FIRST before cache/defaults

## Status
✅ MCP boot now completes successfully with defaultBudget = 1000 (unchanged)
- All 4 BRAIN PIPELINE layers pass: sandbox, vaf, qos, escrow
- MCP server starts on port 3457
- Tested: mcp, api, all modes all pass

=== LEARNED ===
