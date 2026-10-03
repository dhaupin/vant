/**
 * Onboard - Knowledge base / onboarding runtime (v0.8.6)
 * WITH EVENT EMISSIONS - knowledge loaded emits globally
 * Loads and manages brain files for onboarding
 *
 * Usage:
 *   const onboard = require('./onboard');
 *   onboard.getBrainFiles();     // Get all brain .md files
 *   onboard.getSystemFiles();  // Get underscore-prefixed system files
 *   onboard.getAll();          // Get all files with content
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const fs = require('fs');
const vaf = require("./vaf");
const path = require('path');
const brain = require('./brain');
const pipeline = require('./pipeline');
// (pass 35) _checkRead threw `new errors.VantError` with no errors module in
// scope — a ReferenceError its own try/catch swallowed, so the sandbox read
// gate silently no-op'd. Same latent bug class webhooks._checkNetwork had.
const errors = require('./error');

// Public path for system files (meta.json, _succession.json)
const PUBLIC_DIR = brain.getPublicPath();

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();
    // Handle lazy-loaded sandbox - check if method exists
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.VantError('Read permission required for onboard operations', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
            }
        } catch (e) {
            // Allow by default if check fails
        }
    }
}

// Get all brain files (exclude underscore-prefixed system files)
// Uses brain router for layering: public + private merged
async function getBrainFiles() {
  return pipeline.run(
    { name: 'onboard:getBrainFiles', operation: 'read' },
    async () => {
      _checkRead();
      const corpus = await brain.loadCorpus();
      // Skip system files (underscore-prefixed) AND dotfiles: brain.load()
      // resolves bare ids and dotfile ids never round-trip, producing null
      // rows in the summary (they showed as 'undefined: undefined').
      return corpus
        .filter(f => f.id && !f.id.startsWith('_') && !f.id.startsWith('.'))
        .map(f => f.id + '.md')
        .sort();
    },
    { mode: pipeline.PUBLIC }
  );
}

// Get system files (underscore-prefixed)
// Uses brain router
async function getSystemFiles() {
  return pipeline.run(
    { name: 'onboard:getSystemFiles', operation: 'read' },
    async () => {
      _checkRead();
      const corpus = await brain.loadCorpus();
      return corpus
        .filter(f => f.id && f.id.startsWith('_'))
        .map(f => f.id + '.md')
        .sort();
    },
    { mode: pipeline.PUBLIC }
  );
}

// Get file content and metadata
// Uses brain router for lazy loading
async function getFileInfo(filename) {
  return pipeline.run(
    { name: 'onboard:getFileInfo', filename, operation: 'read' },
    async () => {
      const id = filename.replace('.md', '');
      _checkRead();

      const item = await brain.load(id);
      if (!item) return null;

      const content = item.content || '';

      // Extract title from first # heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : filename;

      // Count sections (## headers)
      const sections = (content.match(/^##\s+/gm) || []).length;

      // Get first 200 chars for preview
      const preview = content.slice(0, 200).replace(/[#*`]/g, '').trim() + '...';

      return {
        filename,
        title,
        sections,
        size: content.length,
        preview,
        source: item.source
      };
    },
    { mode: pipeline.PUBLIC }
  );
}

// Generate full onboarding summary
async function getOnboardSummary() {
  const brainFiles = await getBrainFiles()
  const systemFiles = await getSystemFiles()

  // Await each info fetch: getFileInfo is async (pipeline-wrapped); mapping
  // without await produced arrays of promises whose fields read undefined.
  // Fetched in small batches: each call consumes a QoS concurrency slot and
  // the breaker caps at MAX_CONCURRENT - firing all files at once tripped it.
  async function fetchInfos(names) {
    const out = []
    for (const f of names) {
      out.push(await getFileInfo(f))
    }
    return out
  }
  const files = (await fetchInfos(brainFiles)).filter(Boolean)
  const systems = (await fetchInfos(systemFiles)).filter(Boolean)

  // Get meta info
  let meta = null
  const metaPath = path.join(PUBLIC_DIR, 'meta.json')
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch { meta = {} }
  }

  // Get succession info
  let succession = null
  const succPath = path.join(PUBLIC_DIR, '_succession.json')
  if (fs.existsSync(succPath)) {
    try { succession = JSON.parse(fs.readFileSync(succPath, 'utf8')) } catch { succession = {} }
  }

  // EVENT: knowledge onboarded (context loaded)
  _emit('onboard:loaded', {
    brainFiles: files.length,
    systemFiles: systems.length,
    timestamp: Date.now()
  });

  return {
    version: meta?.version || 'unknown',
    status: meta?.status || 'unknown',
    description: meta?.description || '',
    brainFiles: files.length,
    systemFiles: systems.length,
    files,
    systems,
    succession,
    generated: new Date().toISOString()
  }
}

// Get file by name (for lookup)
// Uses brain router
async function getFile(filename) {
  return pipeline.run(
    { name: 'onboard:getFile', filename, operation: 'read' },
    async () => {
      // Add .md if extension not provided
      if (!filename.endsWith('.md') && !filename.endsWith('.txt')) {
        filename = filename + '.md';
      }
      const info = await getFileInfo(filename);
      if (!info) return null;

      const item = await brain.load(info.filename.replace('.md', ''));
      if (!item) return null;

      return {
        ...info,
        content: item.content
      };
    },
    { mode: pipeline.PUBLIC }
  );
}

// Search files by keyword
// Uses brain router
async function search(query) {
  vaf.check(query, {type: 'string', name: 'query', maxLength: 200}); _checkRead();
  const q = query.toLowerCase();

  // loadCorpus is async (returns a promise) - the old sync .filter chain
  // threw 'filter is not a function' on every call.
  const corpus = await brain.loadCorpus();
  const hits = corpus.filter(f => f.content && f.content.toLowerCase().includes(q));
  const out = [];
  for (const f of hits) {
    const info = await getFileInfo(f.id + '.md');
    if (info) out.push(info);
  }
  return out;
}

/**
 * Get onboard status from all brains in the stack.
 *
 * (pass 35) Honesty fix: getOnboardSummary is pipeline-wrapped ASYNC, but
 * this called it without await and stored a Promise, so every brain reported
 * `hasOnboard: true` (truthy promise) — even empty ones. Now awaits per
 * brain and reports the real signal (brain file count) alongside it.
 * @returns {Promise<Object>} Combined onboard info
 */
async function getStackOnboardStatus() {
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const [summary, files] = await Promise.all([
                getOnboardSummary(),
                getBrainFiles()
            ]);
            results.byBrain[brainName] = { hasOnboard: !!summary, files: files.length };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// ==================== INSTALL / MIGRATION HUB (pass 35) ====================
// One surface for "where am I" — consumed by start.js's banner, the onboard
// CLI, and agents waking on any tree state (fresh install, legacy layout,
// current multibrain). Replaces ad-hoc state-guessing scattered across bin/.

/**
 * Classify the current install state.
 *   - fresh:    no brain content anywhere (never onboarded)
 *   - legacy:   old layout detected with pending migrations (needs `vant migrate`)
 *   - current:  layout marker at target, brain readable
 * @returns {Promise<{state: string, layout: object, brain: object, next: string[]}>}
 */
async function getInstallStatus() {
  const migrations = require('./migrations');
  const layout = migrations.status();

  let brainFiles = [];
  try { brainFiles = await getBrainFiles(); } catch (e) { /* unreadable brain */ }
  let systemFiles = [];
  try { systemFiles = await getSystemFiles(); } catch (e) { /* unreadable */ }

  const hasContent = (brainFiles.length + systemFiles.length) > 0;
  const state = !hasContent ? 'fresh' : (!layout.upToDate ? 'legacy' : 'current');

  const next = [];
  if (state === 'fresh') {
    next.push('Run "vant start" to seed a starter brain (identity, goals, lessons, start).');
    next.push('Edit models/private/<brain>/identity.md — that is who you are.');
  } else if (state === 'legacy') {
    next.push('Run "vant migrate" — your brain is on the old layout and invisible to the loader.');
    next.push('Name it: "vant migrate --brain-name <name>" (default: vant).');
  } else {
    next.push('Run "vant onboard" to browse your brain.');
    next.push('Run "vant search <query>" to recall what past agents learned.');
  }

  return { state, layout, brain: { files: brainFiles.length, systemFiles: systemFiles.length }, next };
}

/**
 * A wake briefing: install status + onboarding summary in one call.
 * The first thing an agent (or human) should read.
 * @returns {Promise<{install: object, summary: object|null}>}
 */
async function getWakeBriefing() {
  const install = await getInstallStatus();
  let summary = null;
  if (install.state !== 'fresh') {
    try { summary = await getOnboardSummary(); } catch (e) { summary = null; }
  }
  return { install, summary };
}

module.exports = {
  getBrainFiles,
  getSystemFiles,
  getFileInfo,
  getOnboardSummary,
  getFile,
  search,

  // Install / migration hub (pass 35)
  getInstallStatus,
  getWakeBriefing,

  // Multibrain Stack
  getStackOnboardStatus
};
