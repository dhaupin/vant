# lessons.md

## Discovery: 2026-05-15 - Vant Experimental Features

### What We Built

1. **Brain Horcrux** (bin/brain-horcrux.js)
   - Encode entire brain corpus as PNG images via LSB steganography
   - Uses stego.js module under the hood
   - Commands: backup, restore, list

2. **Branch Manager** (bin/branch-manager.js)
   - Auto-git-branch on brain writes
   - Smart commit messages from brain content
   - Commands: status, auto, commit, push, pr, diff

3. **Agent Spawner** (bin/agent-spawner.js)
   - CLI for multi-agent management
   - Spawn up to 4 agents
   - Commands: spawn, list, delegate, fork, kill, mcp

4. **Islands Generator** (bin/islands-generator.js)
   - Create/manage islands programmatically
   - Dynamic trigger registration
   - Commands: create, list, trigger, hydrate

### Architecture Insights

- **Brain Router**: Unified loading with mode switch (dual/public/private/remote)
  - Pipeline chains: sandbox → vaf → qos → escrow
  - Attention scores track brain access frequency
  - Synapses connect brain accesses for predictive preloading

- **Islands**: Lazy-loadable brain components
  - 10 default islands: identity, learnings, github, gitlab, linear, etc
  - Trigger-based auto-hydration from prompts
  - Static islands load from corpus, lazy islands use storage

- **MCP Server**: 21+ JSON-RPC tools exposed on port 3100
  - brain_load, brain_list, brain_corpus, brain_attend
  - agent_spawn, agent_list, agent_kill
  - Stream enqueue/poll/complete

- **Multi-Agent**: Max 4 agents (orchestrator + 3 coworkers)
  - spawn → delegate → fork pattern
  - Shared brain context
  - Stream-based async delegation

### Potential Future Experiments

1. **RAG Pipeline**
   - Full retrieval-augmented generation with search
   - HyDE (hypothetical document embeddings)
   - RRF (reciprocal rank fusion)

2. **Dream Brain Generator**
   - Auto-generate missing brains from patterns
   - Use island trigger system

3. **Vector Store Integration**
   - Full semantic embeddings
   - Similarity search

4. **WebSocket Brain Sync**
   - Real-time brain updates
   - Live co-agent editing

5. **GitHub Auto-PR**
   - Auto-commit + push brain changes
   - Create PRs for brain divergence

### Gotchas

- Module requires need absolute paths when running from bin/
- Islands trigger matching is case-insensitive
- MCP runs on port 3100 by default
- Agent max is 4 (hard limit in code)

=== LEARNED ===