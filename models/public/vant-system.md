# vant-system.md - Vant Brain Router System

> AI agent persistent memory system with neurons

## Architecture

```
vant (runtime) → brain (os) → agent (replicate) → api/mcp (headless)
```

## Brain Neurons (8)

When `brain.loadBrain(name)` fires, these neurons activate:

1. **fireSynapse** - tracks A→B access chains (memory of what's accessed after what)
2. **predictNext** - predicts next brain to load based on synapse weights
3. **attend** - tracks attention score (0-1) per brain, boosts on access
4. **metabolize** - GC + decays attention 95% every 60s
5. **preload** - speculatively loads predicted brain
6. **forget** - synaptic pruning
7. **dream** - nightly corpus consolidation (scheduled)
8. **onFail** - fallback brain on failure

## State Persistence

- Saves to `models/state.json` on every load, tick, shutdown
- Restores on bootstrap

## Usage

```javascript
const brain = require('./lib/brain');
await brain.bootstrap();
const b = await brain.loadBrain('identity');
const state = brain.getNeuronState();
await brain.shutdown();
```

## Paths

- `lib/brain.js` - router
- `models/private/` - private brain files (per user)
- `models/public/` - public brain files (oss)
- `models/state.json` - persisted state