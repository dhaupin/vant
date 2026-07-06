# Vant API Architecture

## Overview

```
lib/vant.js  ← SOURCE OF TRUTH (common calls)
    │
    ├── Brain: { load, save, list, search, corpus, state }
    ├── Islands: { list, get, create, update, delete }
    ├── Search: { semantic, hybrid, rerank }
    ├── Storage: { read, write, list, exists }
    ├── Stream: { enqueue, poll, complete, fail }
    ├── Config: { get, set }
    ├── Audit: { log, list }
    └── ... shared logic
    │
    ├─→ lib/mcp.js   (156 methods - agent tools)
    ├─→ lib/api.js   (REST endpoints - web tools)
    └─→ CLI          (stdin/stdout)
```

## Ownership Model

### VANT OWNED (Source of Truth)
These live in `lib/vant.js` and are delegated to by MCP/API:

| Category | Methods |
|----------|---------|
| **Brain** | `brain_load`, `brain_list`, `brain_state`, `brain_corpus`, `brain_attend`, `brain_synapses`, `brain_discover`, `brain_share`, `brain_link`, `brain_connections` |
| **Branches** | `vant_list_branches`, `vant_create_branch`, `vant_switch_branch`, `vant_commit`, `vant_sync`, `vant_lock`, `vant_branch_is_dirty`, `vant_branch_changed_brains`, `vant_branch_auto` |
| **Islands** | `vant_get_islands`, `vant_load_island`, `vant_create_island`, `vant_update_island_triggers`, `vant_delete_island`, `vant_enable_island`, `vant_disable_island`, `vant_bulk_create_islands`, `vant_export_islands`, `vant_find_islands_by_trigger`, `vant_get_island` |
| **Citations** | `vant_citations_list`, `vant_citations_add`, `vant_citations_format` |
| **Connectors** | `vant_connector_list`, `vant_connector_connect` |
| **Framework** | `vant_framework_status`, `vant_brain_my_stuff`, `vant_brain_update_my_stuff`, `vant_brain_your_stuff`, `vant_brain_stash`, `vant_brain_clear`, `vant_brain_handlers`, `vant_brain_clear_handlers` |
| **Config** | `vant_config_get`, `vant_config_set` |
| **Audit** | `vant_audit_log`, `vant_audit_list` |
| **Search** | `vant_search`, `vant_rerank`, `vant_search_semantic`, `vant_search_hybrid`, `vant_search_hyde`, `vant_search_multiquery` |
| **Storage** | `vant_storage_read`, `vant_storage_write`, `vant_storage_list`, `vant_storage_exists`, `vant_storage_listRecursive`, `vant_storage_rm`, `vant_storage_cp`, `vant_storage_mkdir` |
| **Stream** | `stream_enqueue`, `stream_poll`, `stream_complete`, `stream_fail`, `stream_info`, `stream_list`, `stream_lease`, `stream_release`, `stream_peek`, `stream_stats`, `stream_watch`, `stream_create`, `stream_delete` |
| **Network** | `vant_network_fetch`, `vant_network_fetchJson`, `vant_network_online` |
| **Tmp** | `vant_tmp_*` (all tmp methods) |
| **Boot** | `vant_boot_init`, `vant_boot_status`, `vant_boot_layers`, `vant_boot_reset` |
| **Backup** | `vant_brain_backups`, `vant_brain_backup`, `vant_brain_restore` |
| **Embed** | `vant_embed`, `vant_embed_similarity` |

### MCP UNIQUE (Agent-Specific)
These live only in `lib/mcp.js`:

| Category | Methods |
|----------|---------|
| **Agents** | `agent_spawn`, `agent_list`, `agent_kill` |
| **Agent Proto** | `agent_proto_list`, `agent_proto_load` |
| **Skill Proto** | `skill_proto_list`, `skill_proto_load` |
| **Delegation** | `vant_agents_delegate_mcp`, `vant_agents_broadcast` |
| **Sudo** | `vant_sudo_createTask`, `vant_sudo_getTask`, `vant_sudo_can`, `vant_sudo_grant`, `vant_sudo_revoke`, `vant_sudo_escalate`, `vant_sudo_listTasks`, `vant_sudo_suggest`, `vant_sudo_getScopes` |
| **Shell** | `vant_shell_exec`, `vant_shell_capture`, `vant_shell_spawn` |
| **Internal** | `vant_call`, `vant_remote_call` |
| **Resolution** | `vant_resolution_track` |
| **Stego** | `vant_stego_encode`, `vant_stego_decode` |

### API UNIQUE (REST-Specific)
These live only in `lib/api.js`:

| Category | Methods |
|----------|---------|
| **File Ops** | `brainDropFile`, `brainGetFile`, `brainListFiles`, `brainDeleteFile`, `brainMyDropFile`, `brainMyGetFile`, `brainMyListFiles` |
| **Execute** | `execute`, `read`, `write` |
| **Hooks** | `onBeforeExecute`, `onAfterExecute`, `onError` |
| **Auth** | `setSecret`, `requireAuth`, `authenticate`, `getAuthStatus` |
| **Mode** | `setMode`, `getMode`, `detectMode` |
| **MCP** | `startMCP` |
| **Tool Execution** | `call` |

## Spec Alignment

| Interface | Spec | Notes |
|-----------|------|-------|
| MCP | JSON-RPC 2.0 | 156 methods, full power |
| REST | OpenAPI 3.x | Subset for web tools |
| Embed | OpenAI-compatible | `/v1/embeddings` |
| Search | RAG-ready | Hybrid + rerank |
| Auth | JWT + API Keys | Gate all endpoints |
| Streaming | SSE | Real-time agent updates |

## REST API Design (OpenAPI)

```
POST   /api/v1/embeddings     → OpenAI-compatible
GET    /api/v1/brain/:name   → Load brain file
POST   /api/v1/brain/:name   → Save brain file
GET    /api/v1/brain         → List brains
POST   /api/v1/search        → RAG search
GET    /api/v1/islands       → List islands
POST   /api/v1/islands       → Create island
GET    /api/v1/islands/:name → Get island
DELETE /api/v1/islands/:name → Delete island
GET    /api/v1/config/:key   → Get config
POST   /api/v1/config/:key   → Set config
GET    /api/v1/health        → Health check
WS     /api/v1/stream        → WebSocket stream
```

## Delegation Pattern

```javascript
// lib/vant.js - source of truth
const vant = {
  brain: {
    load: async (name) => { /* ... */ },
    list: async () => { /* ... */ },
    // ...
  },
  search: async (query, options) => { /* ... */ },
  // ...
};

// lib/mcp.js - delegates to vant
mcp.register('brain_load', async (params) => {
  return vant.brain.load(params.name);
});

// lib/api.js - delegates to vant
app.get('/api/v1/brain/:name', async (req, res) => {
  const result = await vant.brain.load(req.params.name);
  res.json(result);
});
```
