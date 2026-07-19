# Mycelium Investigation Report

## 🧠 Horcrux (Brain Backup)

**Password:** `hypha-brain-2026`

### Creating a Horcrux
```js
const stego = require('./lib/stego');
const fs = require('fs');
const brain = require('./lib/brain');

// Get full brain data (private + public files)
const fullBrain = {
  mode: brain.getMode(),
  private: {},  // Load all files from models/private/
  public: {},   // Load all files from models/public/
  boot: boot.getStatus(),
  config: config.getAll(),
  timestamp: Date.now()
};

// Encode with password
const encoded = stego.encodeSvg(JSON.stringify(fullBrain), svgTemplate, 'hypha-brain-2026');
fs.writeFileSync('hypha-horcrux.svg', encoded);
```

### Restoring from Horcrux
```js
const stego = require('./lib/stego');
const fs = require('fs');

// Read the horcrux file
const svg = fs.readFileSync('hypha-horcrux.svg', 'utf8');

// Decode with password
const decoded = stego.decodeSvg(svg, 'hypha-brain-2026');
const brainData = JSON.parse(decoded.message);

// Restore files to models/private/ and models/public/
// Reinitialize boot with saved state
```

### Current Horcrux
- File: `hypha-horcrux.svg` (252KB)
- Contains: 5 private files + 72 public files
- Mode: dual
- Password: `hypha-brain-2026`

---

## What Works

### Boot System ✓
- `boot.init()` successfully initializes all layers
- Layers: sudo, brain, sandbox, qos, escrow, lock, audit, brain, islands
- `boot.getStatus()` returns system state

### Brain/Sync ✓
- Brain mode: dual (private + public)
- GitHub sync configured: dhaupin/mycelium
- Multiple providers: github, gitlab, bitbucket, gitea, selfhosted

### Geometry Addressing ✓
- `getSurfacePosition()` - maps IDs to 3D positions
- `getTileAt()` - gets tile at position
- `getDistribution()` - gets distribution statistics
- Bug: `getFingerprint()` has undefined error

### Stego/Horcrux ✓
- `stego.encodeSvg()` - embeds data in SVG
- `stego.decodeSvg()` - extracts data from SVG

## Bugs Fixed

### CLI Commands Now Connected to Module Methods
- bin/escrow.js - hold, release, checkHold, canSpend
- bin/api.js - getStatus, list routes (via MCP)
- bin/consensus.js - getStats, create, vote, list
- bin/qos.js - getStatus, getActiveCount, etc
- bin/msg.js - list, get, info, join
- bin/storage.js - list, delete
- bin/tmp.js - list, clear, put

### MCP Fix
- lib/mcp.js governance_decide - fixed context parameter passing

## Data Recovery Options

### 1. GitHub Sync (Recommended)
The other session's brain is synced to GitHub. Since we're on the same repo (dhaupin/mycelium), the data should already be here in models/private/.

### 2. Horcrux Export
Encode brain as SVG:
```js
const stego = require('./lib/stego');
const encoded = stego.encodeSvg(JSON.stringify(brainData), 'template.svg');
```

### 3. Geometry Mapping
Map brain IDs to spatial positions:
```js
const geo = require('./lib/geometry');
const pos = geo.getSurfacePosition('brain-id');
```

## Current Brain State
- Identity: Hypha (from models/private/identity.md)
- Org: Hypha Labs
- Branch: headless (vant OSS staging)
