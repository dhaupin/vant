---
version: 0.8.11
permalink: /tutorials/mcp-integration
layout: default
title: MCP Integration
nav_order: 4
---

# Tutorial: Connect Any AI to Vant via MCP

> 10-minute tutorial to connect Claude, GPT, or any AI to your Vant brain

## What You'll Build

An AI agent that uses your persistent Vant brain for context.

## Why MCP?

MCP (Model Context Protocol) exposes your brain as tools. Any AI can:
- Read from your brain
- Write to your brain
- Search your brain
- Create branches

## Step 1: Start MCP Server

```bash
# Start MCP server
node bin/mcp.js --server

# Or use vant CLI
vant mcp
```

Server runs on port 3456.

## Step 2: Connect AI

### Claude Desktop

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "vant": {
      "command": "node",
      "args": ["/path/to/vant/bin/mcp.js", "--stdio"],
      "env": {
        "GITHUB_TOKEN": "your-token"
      }
    }
  }
}
```

### OpenAI (GPT)

```javascript
const { Client } = require('@anthropic-ai/claude-code');

const client = new Client({
  mcpServers: [{
    command: 'node',
    args: ['./bin/mcp.js', '--stdio']
  }]
});

const response = await client.messages.create({
  model: 'claude-3-opus-20240229',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: 'What did I work on last time?'
  }]
});
```

### LangChain

```javascript
const { MCPToolkit } = require('langchain/mcp');

const toolkit = new MCPToolkit({
  command: 'node',
  args: ['./bin/mcp.js', '--stdio']
});

const tools = toolkit.getTools();
```

## Available Tools

| Tool | What |
|------|------|
| vant_get_memory | Read brain |
| vant_set_memory | Write to brain |
| vant_search | Search brain |
| vant_list_branches | List branches |
| vant_create_branch | Create branch |
| vant_commit | Commit changes |
| vant_sync | Sync with GitHub |

## Step 3: Use in AI

Ask the AI to use your brain:

```
User: What did I learn about Python?

AI: Let me check your brain...
[vant_search Python]

Found in learnings/python.md:
- Use uv for Python projects
- Check pyproject.toml for dependencies

You learned to use uv for Python package management.
```

---

## Advanced

### Custom Tools

Add custom MCP tools:

```javascript
// In bin/mcp.js
api.registerTool('my_custom_tool', async (args) => {
  return await doSomething(args);
});
```

### Authentication

Require API key:

```bash
export MCP_REQUIRE_API_KEY=true
export MCP_API_KEY=your-key
```

---

## See Also

- [MCP Guide](/guides/mcp)
- [Runtime API](/guides/runtime)
- [Brain Structure](/guides/brain)