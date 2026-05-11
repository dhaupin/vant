---
version: 0.8.6
permalink: /frontend.md/frontend
layout: default
title: Frontend Integration
nav_order: 64
22
---
# Frontend Integration

Get started with Vant in your frontend app in 5 minutes.

---

## Quick Start

### 1. Install

```bash
npm install vant-js-sdk
# or
pip install vant-python-sdk
```

### 2. Connect

```javascript
// JavaScript
import { VantClient } from 'vant-js-sdk';

const vant = new VantClient({
  url: 'http://localhost:3456',
  apiKey: process.env.VANT_API_KEY
});

// Read memory
const identity = await vant.getMemory('identity.md');
console.log(identity);
```

```python
# Python
from vant import VantClient

vant = VantClient(
    url="http://localhost:3456",
    api_key=os.environ["VANT_API_KEY"]
)

# Read memory
identity = vant.get_memory("identity.md")
print(identity)
```

### 3. Use

```javascript
// Read
const memory = await vant.getMemory('goals.md');

// Write
await vant.setMemory('lessons.md', 'New lesson learned');

// Search
const results = await vant.search('authentication');

// Track decision
await vant.trackResolution('chose-postgres', { outcome: 'success' });
```

---

## React Integration

### Hook

```javascript
import { useEffect, useState } from 'react';
import { VantClient } from 'vant-js-sdk';

export function useVantBrain(file) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const vant = new VantClient();

  useEffect(() => {
    vant.getMemory(file).then(c => {
      setContent(c);
      setLoading(false);
    });
  }, [file]);

  return { content, loading };
}

// Usage
function Goals() {
  const { content, loading } = useVantBrain('goals.md');
  if (loading) return <Spinner />;
  return <Markdown>{content}</Markdown>;
}
```

### Provider

```javascript
import { createContext, useContext } from 'react';

const VantContext = createContext();

export function VantProvider({ children }) {
  const vant = new VantClient({
    url: window.ENV.VANT_URL,
    apiKey: window.ENV.VANT_API_KEY
  });

  return (
    <VantContext.Provider value={vant}>
      {children}
    </VantContext.Provider>
  );
}

export function useVant() {
  return useContext(VantContext);
}
```

---

## Next.js Integration

### API Route

```javascript
// pages/api/vant/[...].js
import { VantClient } from 'vant-js-sdk';

const vant = new VantClient({
  url: process.env.VANT_URL,
  apiKey: process.env.VANT_API_KEY
});

export default async function handler(req, res) {
  const { file } = req.query;

  if (req.method === 'GET') {
    const content = await vant.getMemory(file);
    res.status(200).json({ content });
  } else if (req.method === 'POST') {
    const { content } = req.body;
    await vant.setMemory(file, content);
    res.status(200).json({ success: true });
  }
}
```

### Client

```javascript
// lib/vant.js
const VANT_URL = process.env.NEXT_PUBLIC_VANT_URL;

export async function getMemory(file) {
  const res = await fetch(`/api/vant/${file}`);
  return res.json();
}

export async function setMemory(file, content) {
  await fetch(`/api/vant/${file}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
}
```

---

## Vue Integration

### Composable

```javascript
// composables/useVant.js
import { ref } from 'vue';
import { VantClient } from 'vant-js-sdk';

export function useVant() {
  const vant = new VantClient();
  const content = ref('');
  const loading = ref(false);

  async function loadMemory(file) {
    loading.value = true;
    content.value = await vant.getMemory(file);
    loading.value = false;
  }

  async function saveMemory(file, newContent) {
    await vant.setMemory(file, newContent);
    content.value = newContent;
  }

  return { content, loading, loadMemory, saveMemory };
}

// Usage
// <script setup>
// const { content, loading, loadMemory } = useVant()
// loadMemory('identity.md')
// </script>
```

---

## CLI Integration (for tools)

### Claude Code

```bash
# Add to CLAUDE_CODE_TOOLS
claude code tool add vant-memory <<EOF
Read or write to Vant brain.
EOF
```

### Cursor

```json
// .cursor/rules/vant.memory.md
# Vant Integration

Read/write to persistent memory via MCP on port 3456.
```

---

## Full Example App

```javascript
// Full React app with Vant
import { useState, useEffect } from 'react';
import { VantClient } from 'vant-js-sdk';

export default function App() {
  const [brain, setBrain] = useState({
    identity: '',
    goals: '',
    lessons: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const vant = new VantClient();

    async function load() {
      const [identity, goals, lessons] = await Promise.all([
        vant.getMemory('identity.md'),
        vant.getMemory('goals.md'),
        vant.getMemory('lessons.md')
      ]);
      setBrain({ identity, goals, lessons });
      setLoading(false);
    }

    load();
  }, []);

  if (loading) return <div>Loading brain...</div>;

  return (
    <div>
      <h1>My Agent Brain</h1>
      <section>
        <h2>Who I Am</h2>
        <pre>{brain.identity}</pre>
      </section>
      <section>
        <h2>Goals</h2>
        <pre>{brain.goals}</pre>
      </section>
      <section>
        <h2>Lessons</h2>
        <pre>{brain.lessons}</pre>
      </section>
    </div>
  );
}
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VANT_API_KEY` | API key for auth | Yes |
| `VANT_URL` | MCP server URL | Yes |
| `VANT_MCP_PORT` | Port if local | No |

---

See also: [REST API](reference/rest-api), [MCP Guide](guides/mcp), [Schema](reference/schema)