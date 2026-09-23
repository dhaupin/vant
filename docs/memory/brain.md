---
version: 0.8.6
permalink: /memory/brain
layout: default
title: The Brain
nav_order: 21
description: Brain files - markdown memory the agent reads at wake and writes at sleep. Multi-brain layout, formats, and the read API.
---

# The Brain

> Plain markdown memory files. Read at wake, write at sleep.

## Where files live

Since the multi-brain layout, each brain is a named directory in both
scopes:

```
models/
  public/<brain>/      shared template files, syncable to a repo
  private/<brain>/     agent-local state, kept out of the public brain
  state.json           the active brain stack
```

The default brain name is `vant`. The stack can hold several named brains;
switching changes what the loader reads. Layout details and the stack
contract live in [Multi-brain](../multi-agent/brains).

## Core files

| File | What it is | What to write |
|------|-----------|---------------|
| `identity.md` | Who you are | Name, capabilities, tools, current context |
| `goals.md` | What you are doing | Tasks in progress, completed, next steps |
| `lessons.md` | What you learned | Discoveries, patterns, gotchas, dated |
| `errors.md` | Mistakes to avoid | Failure modes with the fix that worked |
| `preferences.md` | How you work | Style, conventions, communication rules |

Put the most important facts at the top of each file. Future sessions read
the top before anything else, and long files go unread.

## Read API

The single entry point is `brain.read`. It checks the current private brain
first, then falls back to the public template:

```javascript
const brain = require('./lib/brain');
const item = await brain.read('identity');
```

The returned item carries the format and source:

```javascript
item.format   // 'md' | 'json' | 'yaml' | 'txt'
item.source   // 'private' | 'public'
item.content  // raw file content
item.data     // parsed object for structured files
```

Markdown, JSON, YAML, and plain text all work. The extension is part of the
name: `brain.read('notes.json')` reads JSON, `brain.read('notes')` resolves
whatever extension exists.

## Corpus access

Load everything at once for indexing or sync work:

```javascript
const corpus = brain.loadCorpus();
corpus.length;   // number of brain items
```

Each corpus item has `name`, `source`, `format`, and `content`. The corpus
is cached; invalidate after out-of-band writes:

```javascript
brain.invalidateCorpusCache();
```

## Writing

Brain writes go through the memory surface so the security chain, atomic
writes, and events stay engaged. From the CLI:

```bash
vant memory learn lessons "Use exit codes, not tail text, to judge test suites."
```

From code:

```javascript
const { memory } = require('./lib/memory');
await memory.learn('lessons', 'Use exit codes, not tail text, to judge test suites.');
```

## Legacy layouts

A pre-multi-brain install keeps files flat in `models/public/`. `vant start`
detects and imports it automatically on first run. The manual path and its
safety guarantees are in the [migration guide](../getting-started/setup).
