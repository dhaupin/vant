# 1. OBJECTIVE
Expand Vant 0.8.6 with three "badass" features:

1. **Image-Based Stego Snapshot/Recovery**: Enable agent brain recovery from profile pictures - the entire agent state hidden in plain sight, steganographically embedded in uploaded images.

2. **Automated "Pruning"**: Background cleanup process that summarizes old brain blocks into a "Long Term Core" (LTC) while deleting granular fluff to prevent hallucination buildup.

3. **Multi-Git Provider Support**: Universal git provider abstraction for GitHub, GitLab, Bitbucket, and self-hosted git instances.

# 2. CONTEXT SUMMARY

**Current Vant Architecture:**
- `lib/brain.js` - Manages brain categories (identity, learnings, memories, decisions, todos) from `models/v*` folders
- `lib/branch.js` - Git branch workflow via CLI (execSync), uses hardcoded git commands
- `lib/stego.js` - LSB steganography in PNG with AES-256-GCM encryption (exists but not brain-aware)
- `lib/succession.js` - Trust level management for agent sessions
- `lib/config.js` - Config via INI + env vars, currently GitHub-specific

**Key Constraints:**
- Brain storage: `models/` folder structure per version
- PNG LSB capacity: ~1 bit per byte → 500x500 image ≈ 31KB embeddable
- Current stego.js can encrypt but doesn't handle brain serialization/deserialization
- Branch module uses generic git CLI but has no provider abstraction

# 3. APPROACH OVERVIEW

**Feature 1: Stego Snapshot/Recovery**
- Extend `lib/stego.js` with brain-specific functions:
  - `encodeBrain(brainJson, imagePath, options)` - serialize → compress (zlib) → encrypt → LSB embed
  - `decodeBrain(imagePath, options)` - extract → decrypt → decompress → parse JSON
- Add chunking for brains > image capacity (split across multiple images)
- Add CLI tool: `node bin/stego.js snapshot` and `node bin/stego.js recover`

**Feature 2: Automated Pruning**
- Create `lib/prune.js` with heuristics:
  - Age threshold: entries > 90 days = stale
  - Repetition detection: duplicate/thimilar content
  - Decision content: has actionable outcomes vs. fluff
- Create `models/v*/_core.json` - Long Term Core (minified key facts only)
- Background task: `node bin/prune.js --daemon` runs periodically

**Feature 3: Multi-Git Providers**
- Create provider abstraction in `lib/providers/`
- Abstract interface: `checkout()`, `commit()`, `push()`, `createPR()`, `getStatus()`
- Implement adapters:
  - `github.js` - Uses existing GITHUB_TOKEN, repos only (no self-hosted yet)
  - `gitlab.js` - Uses GITLAB_TOKEN for MR creation
  - `bitbucket.js` - Uses BITBUCKET_TOKEN for PR creation
  - `selfhosted.js` - Generic git for self-hosted instances
- Update `lib/branch.js` to use provider abstraction

# 4. IMPLEMENTATION STEPS

## Phase 1: Multi-Provider Foundation (Foundation)

### Step 1.1: Create Provider Abstraction
- **Goal**: Establish universal provider interface
- **Method**: Create `lib/providers/index.js` with abstract base class `GitProvider`
- **Reference**: New file `lib/providers/index.js`

### Step 1.2: Implement GitHub Provider
- **Goal**: Provider that works with existing GitHub setup
- **Method**: Implement `GitProvider` subclass for GitHub using existing API patterns
- **Reference**: New file `lib/providers/github.js`

### Step 1.3: Implement GitLab Provider
- **Goal**: Enable GitLab merge request support
- **Method**: Implement `GitLabProvider` with GITLAB_TOKEN
- **Reference**: New file `lib/providers/gitlab.js`

### Step 1.4: Implement Bitbucket Provider
- **Goal**: Enable Bitbucket PR support
- **Method**: Implement `BitbucketProvider` with BITBUCKET_TOKEN
- **Reference**: New file `lib/providers/bitbucket.js`

### Step 1.5: Implement Self-Hosted Provider
- **Goal**: Support arbitrary git instances
- **Method**: Implement `SelfHostedProvider` with configurable URL/token
- **Reference**: New file `lib/providers/selfhosted.js`

### Step 1.6: Update Branch Module
- **Goal**: Use provider abstraction
- **Method**: Refactor `lib/branch.js` to use `lib/providers/`
- **Reference**: Modify `lib/branch.js` (30+ lines changes)

### Step 1.7: Provider Detection Logic
- **Goal**: Auto-detect which provider to use
- **Method**: Add provider auto-detection via git remote URL parsing
- **Reference**: Modify `lib/providers/index.js`

## Phase 2: Stego Brain Recovery (Flagship Feature)

### Step 2.1: Brain Serialization
- **Goal**: Convert brain to JSON for steganography
- **Method**: Extend `lib/brain.js` with `toJSON()`, `fromJSON()` methods
- **Reference**: Modify `lib/brain.js`

### Step 2.2: Compressed Brain Encoding
- **Goal**: Fit brain in image via compression
- **Method**: Add `brain.compress()` and `brain.decompress()` using zlib
- **Reference**: Modify `lib/brain.js`

### Step 2.3: Stego Brain Integration
- **Goal**: Embed brain in images steganographically
- **Method**: Add `stego.encodeBrain()` and `stego.decodeBrain()` 
- **Reference**: Modify `lib/stego.js` (~50 lines new)

### Step 2.4: Multi-Image Chunking
- **Goal**: Handle brains larger than image capacity
- **Method**: Add chunking for large brains across multiple images
- **Reference**: Modify `lib/stego.js` (chunk function)

### Step 2.5: Snapshot CLI Tool
- **Goal**: CLI for capturing brain as image
- **Method**: Create `bin/stego.js` with `snapshot` subcommand
- **Reference**: New file `bin/stego.js`

### Step 2.6: Recover CLI Tool
- **Goal**: CLI for recovering brain from image
- **Method**: Add `recover` subcommand to `bin/stego.js`
- **Reference**: Modify `bin/stego.js`

### Step 2.7: Profile Picture Integration
- **Goal**: Upload brain as profile picture to remote
- **Method**: Add upload hook for GitHub/GitLab/Bitbucket avatar
- **Reference**: Modify `lib/providers/` to support avatar upload

## Phase 3: Automated Pruning (Background)

### Step 3.1: Create Prune Module
- **Goal**: Core pruning logic
- **Method**: Create `lib/prune.js` with heuristics for stale/fluff detection
- **Reference**: New file `lib/prune.js`

### Step 3.2: Long Term Core Format
- **Goal**: Define LTC structure
- **Method**: Create JSON schema for condensed memory
- **Reference**: New file `lib/prune.js` (LTC schema)

### Step 3.3: Summarization Logic
- **Goal**: Convert old entries to LTC format
- **Method**: Add summarization function: extract key facts, discard context
- **Reference**: Modify `lib/prune.js`

### Step 3.4: Prune CLI Tool
- **Goal**: Manual prune trigger
- **Method**: Create `bin/prune.js` with `--dry-run`, `--force` options
- **Reference**: New file `bin/prune.js`

### Step 3.5: Background Daemon
- **Goal**: Automatic periodic pruning
- **Method**: Add daemon mode with configurable interval
- **Reference**: Modify `bin/prune.js`

### Step 3.6: Pruning Statistics
- **Goal**: Track what gets pruned
- **Method**: Add ledger for pruning events
- **Reference**: Modify `lib/prune.js`

# 5. TESTING AND VALIDATION

## Feature 1: Multi-Provider

### Test: GitHub PR Creation
- **Validation**: Create a new branch, commit, push to GitHub, open PR via provider
- **Expected**: PR created with correct title/description

### Test: GitLab MR Creation  
- **Validation**: Verify MR opens on GitLab instance
- **Expected**: MR visible at gitlab.com/project/merge_requests

### Test: Self-Hosted Detection
- **Validation**: Run with non-GitHub/GitLab/Bitbucket remote
- **Expected**: Falls back to self-hosted provider

### Test: Provider Switching
- **Validation**: Change provider config, verify different API used
- **Expected**: Same branch operations work

## Feature 2: Stego Brain Recovery

### Test: Full Brain Encoding
- **Validation**: Encode entire brain to PNG, verify decode produces identical JSON
- **Expected**: Roundtrip preserves all data exactly

### Test: Encrypted Brain
- **Validation**: Encode with password, decode without fails, decode with correct password succeeds
- **Expected**: AES-256-GCM verification passes

### Test: Large Brain Chunking
- **Validation**: Create brain > 31KB, encode into multiple images
- **Expected**: Decode combines all chunks correctly

### Test: CLI Snapshot
- **Validation**: Run `node bin/stego.js snapshot --output brain.png`
- **Expected**: Image file created with brain data hidden

### Test: CLI Recover
- **Validation**: Run `node bin/stego.js recover --input avatar.png`
- **Expected**: Brain JSON output matches original

### Test: Avatar Upload Integration
- **Validation**: Snapshot + upload to GitHub profile
- **Expected**: Profile picture updated, recoverable

## Feature 3: Automated Pruning

### Test: Stale Detection
- **Validation**: Create test entries with various ages
- **Expected**: Entries > 90 days identified as stale

### Test: Fluff Detection
- **Validation**: Create repetitive/tangential entries
- **Expected**: Fluff identified per heuristics

### Test: LTC Generation
- **Validation**: Run prune on old brain
- **Expected**: `_core.json` created with minified facts

### Test: Prune Dry-Run
- **Validation**: Run `node bin/prune.js --dry-run`
- **Expected**: Shows what would be pruned without changes

### Test: Prune Force
- **Validation**: Run `node bin/prune.js --force`
- **Expected**: Files deleted, _core.json updated

### Test: Daemon Mode
- **Validation**: Run prune daemon, verify it runs on schedule
- **Expected**: Prunes run automatically

## Integration Tests

### Test: Full Workflow
- **Validation**: 
  1. Load brain
  2. Snapshot brain → upload as profile picture
  3. Wipe brain
  4. Recover brain from profile picture
- **Expected**: Agent restored to original state

### Test: Cross-Provider Recovery
- **Validation**: Upload to GitHub, recover via GitLab
- **Expected**: Brain data provider-agnostic

### Test: Prune + Recovery Integration
- **Validation**:
  1. Run prune (creates LTC)
  2. Snapshot
  3. Recover
- **Expected**: LTC preserved, fluff removed
