# 1. OBJECTIVE

Complete MCP server endpoints, add mcp to package.json, and clean up orphaned file.

# 2. CONTEXT SUMMARY

Investigation findings:
- bin/mcp.js is wired up in vant.js CLI but the POST /call endpoint is missing
- The HTTP server has GET /tools and GET /health but POST /call (the core JSON-RPC endpoint) is NOT implemented
- This is the main gap preventing MCP from being functional

### Files to UPDATE:
| File | Change |
|------|--------|
| bin/mcp.js | Add POST /call endpoint for JSON-RPC |

### Files to ADD:
| File | Change |
|------|--------|
| package.json | Add "mcp": "./bin/mcp.js" to bin |

### Files to DELETE:
| File | Path | Reason |
|------|------|--------|
| RELEASE_v0.8.2.txt | Root | No references found |

# 3. APPROACH OVERVIEW

1. Complete the MCP HTTP server by adding POST /call endpoint
2. Add bin/mcp.js to package.json for standalone CLI access
3. Delete orphaned RELEASE_v0.8.2.txt

# 4. IMPLEMENTATION STEPS

**Step 1: Add POST /call endpoint to mcp.js**
- Goal: Make MCP server functional
- Method: Add POST /call handler in the HTTP server
- Reference: bin/mcp.js lines 466-477
- Add body parsing with JSON-RPC request handling

**Step 2: Add mcp to package.json**
- Goal: Enable standalone CLI access
- Method: Add "mcp": "./bin/mcp.js" to bin section

**Step 3: Delete orphaned RELEASE_v0.8.2.txt**
- Goal: Remove unused file
- Method: Delete `/workspace/project/vant/RELEASE_v0.8.2.txt`

**Step 4: Verify changes**
- Goal: Confirm all updates work
- Method: Check mcp.js has POST /call, package.json has mcp entry

# 5. TESTING AND VALIDATION

- bin/mcp.js has POST /call endpoint handling JSON-RPC
- package.json has "mcp": "./bin/mcp.js" in bin section
- vant mcp runs the server
- vant mcp --server starts HTTP server
- POST /call with JSON-RPC request returns result
- `RELEASE_v0.8.2.txt` is deleted
