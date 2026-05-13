---
version: 0.8.11
permalink: /reference/mcp-tools
layout: default
title: MCP Tools Reference
nav_order: 88
---

# MCP Tools Reference

Complete reference for all 21 MCP tools.

## Core Tools (9)

### vant_get_memory

Read from brain.

**Params:**
| Param | Type | What |
|-------|------|------|
| category | string | Brain category |
| filename | string | File name |

**Example:**
```
vant_get_memory(category="learnings", filename="python")
```

---

### vant_set_memory

Write to brain.

**Params:**
| Param | Type | What |
|-------|------|------|
| category | string | Brain category |
| filename | string | File name |
| content | string | Content to write |

**Example:**
```
vant_set_memory(category="lessons", filename="new", content="# New")
```

---

### vant_list_branches

List brain branches.

**Params:** None

**Example:**
```
vant_list_branches
```

---

### vant_create_branch

Create branch.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Branch name |

**Example:**
```
vant_create_branch(name="agent-1")
```

---

### vant_switch_branch

Switch branch.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Branch name |

**Example:**
```
vant_switch_branch(name="agent-1")
```

---

### vant_commit

Commit changes.

**Params:**
| Param | Type | What |
|-------|------|------|
| message | string | Commit message |

**Example:**
```
vant_commit(message="Updated learnings")
```

---

### vant_sync

Sync with GitHub.

**Params:**
| Param | Type | What |
|-------|------|------|
| direction | string | "push" or "pull" |

**Example:**
```
vant_sync(direction="push")
```

---

### vant_lock

Acquire/release brain lock.

**Params:**
| Param | Type | What |
|-------|------|------|
| action | string | "acquire" or "release" |

**Example:**
```
vant_lock(action="acquire")
```

---

### vant_health

System health check.

**Params:** None

**Example:**
```
vant_health
```

---

## Extended Tools (12)

### vant_get_islands

List islands.

**Params:** None

**Example:**
```
vant_get_islands
```

---

### vant_load_island

Load island.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Island name |

**Example:**
```
vant_load_island(name="github")
```

---

### vant_resolution_track

Track decision.

**Params:**
| Param | Type | What |
|-------|------|------|
| decision | string | Decision text |
| reason | string | Reasoning |

**Example:**
```
vant_resolution_track(decision="Use uv", reason="Faster than pip")
```

---

### vant_stego_encode

Encode PNG steganography.

**Params:**
| Param | Type | What |
|-------|------|------|
| message | string | Secret message |
| input | string | Input PNG path |
| output | string | Output PNG path |

**Example:**
```
vant_stego_encode(message="secret", input="in.png", output="out.png")
```

---

### vant_stego_decode

Decode PNG steganography.

**Params:**
| Param | Type | What |
|-------|------|------|
| input | string | PNG path |

**Example:**
```
vant_stego_decode(input="out.png")
```

---

### vant_config_get

Get config.

**Params:**
| Param | Type | What |
|-------|------|------|
| key | string | Config key |

**Example:**
```
vant_config_get(key="vant.repo")
```

---

### vant_config_set

Set config.

**Params:**
| Param | Type | What |
|-------|------|------|
| key | string | Config key |
| value | string | Config value |

**Example:**
```
vant_config_set(key="agent.name", value="MyAgent")
```

---

### vant_audit_log

Log audit entry.

**Params:**
| Param | Type | What |
|-------|------|------|
| type | string | Event type |
| data | string | Event data |

**Example:**
```
vant_audit_log(type="learn", data="New learning")
```

---

### vant_audit_list

List audit log.

**Params:**
| Param | Type | What |
|-------|------|------|
| limit | number | Max entries |

**Example:**
```
vant_audit_list(limit=10)
```

---

### vant_succession_info

Trust configuration.

**Params:** None

**Example:**
```
vant_succession_info
```

---

### vant_search

Search brain.

**Params:**
| Param | Type | What |
|-------|------|------|
| query | string | Search query |

**Example:**
```
vant_search(query="python")
```

---

### vant_rerank

RAG rerank + compress.

**Params:**
| Param | Type | What |
|-------|------|------|
| query | string | Search query |
| topK | number | Results count |

**Example:**
```
vant_rerank(query="authentication", topK=5)
```

---

## Return Types

| Tool | Returns |
|------|---------|
| vant_get_memory | { content, ... } |
| vant_set_memory | { success } |
| vant_list_branches | [branch1, branch2] |
| vant_create_branch | { success, name } |
| vant_switch_branch | { success } |
| vant_commit | { success, hash } |
| vant_sync | { success } |
| vant_lock | { token } |
| vant_health | { status, version } |