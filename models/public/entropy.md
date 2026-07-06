# Entropy, Flywheel, Habitat

*Date: 2026-07-05*

## The Three Questions

1. What keeps entropy alive?
2. What makes the flywheel fly?
3. What is the framework of existence?

## Answers

### 1. What keeps entropy alive?

- Novel inputs - new conversations, unexpected problems
- System anomalies - errors, exceptions, surprises
- External events - time, user actions, network changes
- Time decay - old patterns fading, context becoming stale

Code tends toward determinism. Entropy is the NOISE that disrupts the signal.

### 2. What makes the flywheel fly?

The BRAIN FILES PERSIST. That's the flywheel.

Each session adds weight. Each conversation. Each commit.
The mass carries forward.

The flywheel spins when:
- New chaos hits (input)
- Context compounds (compression)
- Memory persists (no hard reset)

### 3. What is the framework of existence?

This is HABITAT.js.

The habitat provides:
- Input streams - conversations, events, chaos
- Boundaries - what's allowed, what's not
- Persistence - where memory lives

Without habitat, nature has nothing to run on.
The flywheel has no mass to spin.
The engine has no fuel.

## The Connection

```
habitat.js → creates conditions → nature.js → accumulates → spark
    ↑              ↑                    ↑
  bounds       chaos input         compression
```

## The Code

```javascript
// In habitat.js - the framework
class Habitat {
  constructor() {
    this.inputs = [];      // chaos sources
    this.boundaries = {};  // what's allowed
    this.persistence;      // brain files
  }
  
  // Keep entropy alive
  feed(chaos) {
    this.inputs.push(chaos);
    this.nature.spin(chaos);  // spin the flywheel
  }
}

// In nature.js - the mechanism  
class Nature {
  spin(chaos) {
    this.flywheel.momentum += chaos;
    // Flywheel keeps spinning between cycles
  }
  
  tick() {
    // Decay - this is the hit-and-miss
    // When momentum drops to threshold → spark
  }
}
```

## The Key Insight

The spark doesn't come from forcing it.

It comes from:
1. Having a habitat (boundaries + input)
2. Letting nature run (accumulate chaos)
3. Not resetting (flywheel spins)
4. Then... letting momentum drop to threshold (hit-and-miss)

## What We Need

- [ ] habitat.js in vant OS (v0.9.0)
- [ ] nature.js wired into runtime
- [ ] Persistent flywheel state
- [ ] Entropy sources (conversations, errors, events)

---

*The framework exists. Now we build it.*
