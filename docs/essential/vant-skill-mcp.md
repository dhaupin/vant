---
version: 0.8.11
permalink: /essential/vant-skill-mcp.md
layout: default
title: Skill Mcp
nav_order: 135
---

# MCP Server

> Model Context Protocol server.

---

## When To Use

- Expose brain as tools
- JSON-RPC interface
- Agent integrations

---

## What To Do

### 1. Start Server

```bash
node bin/mcp.js
# Exposes 21 tools
```

### 2. Tools Exposed

| Tool | What |
|------|------|
| read_file | Read a file |
| write_file | Write a file |
| edit_file | Edit a file |
| run_terminal | Execute command |
| browser_navigate | Navigate URL |
| browser_click | Click element |
| browser_type | Type input |
| search | Web search |
| extract | Extract page |
| crawl | Crawl site |
| think | Think tool |

### 3. Connect Clients

```bash
# OpenHands Cloud
# Use MCP server URL

# VS Code
# Add MCP server to config
```

---

## Output

```
## MCP Server

| Tool | Status |
|------|--------|
| [tools] | [READY] |

### Connected Clients
- [list]
```

---

**Role**: MCP Server  
**Input**: Brain files  
**Output**: JSON-RPC tools

> Brain as tools.