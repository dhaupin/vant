/**
 * Onboard - Knowledge base / onboarding runtime
 * Loads and manages brain files for onboarding
 *
 * Usage:
 *   const onboard = require('./onboard');
 *   onboard.getBrainFiles();     // Get all brain .md files
 *   onboard.getSystemFiles();  // Get underscore-prefixed system files
 *   onboard.getAll();          // Get all files with content
 *
 * SECURITY: Validates paths, reads-only
 *
 * Related: guides/ai-onboard.md
 */

const fs = require('fs');
const vaf = require("./vaf");
const path = require('path');
const brain = require('./brain');

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
                throw new Error('Read permission required for onboard operations');
            }
        } catch (e) {
            // Allow by default if check fails
        }
    }
}

// Get all brain files (exclude underscore-prefixed system files)
// Uses brain router for layering: public + private merged
async function getBrainFiles() {
  _checkRead();
  const corpus = await brain.loadCorpus();
  return corpus
    .filter(f => f.id && !f.id.startsWith('_'))
    .map(f => f.id + '.md')
    .sort()
}

// Get system files (underscore-prefixed)
// Uses brain router
async function getSystemFiles() {
  _checkRead();
  const corpus = await brain.loadCorpus();
  return corpus
    .filter(f => f.id && f.id.startsWith('_'))
    .map(f => f.id + '.md')
    .sort()
}

// Get file content and metadata
// Uses brain router for lazy loading
function getFileInfo(filename) {
  const id = filename.replace('.md', '');
  _checkRead();
  
  const item = brain.loadBrain(id);
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
}

// Generate full onboarding summary
async function getOnboardSummary() {
  const brainFiles = await getBrainFiles()
  const systemFiles = await getSystemFiles()
  
  const files = brainFiles.map(f => getFileInfo(f))
  const systems = systemFiles.map(f => getFileInfo(f))
  
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
function getFile(filename) {
  // Add .md if extension not provided
  if (!filename.endsWith('.md') && !filename.endsWith('.txt')) {
    filename = filename + '.md';
  }
  const info = getFileInfo(filename);
  if (!info) return null;
  
  const item = brain.loadBrain(info.filename.replace('.md', ''));
  if (!item) return null;
  
  return {
    ...info,
    content: item.content
  };
}

// Search files by keyword
// Uses brain router
function search(query) {
  vaf.check(query, {type: 'string', name: 'query', maxLength: 200}); _checkRead();
  const q = query.toLowerCase();
  
  return brain.loadCorpus()
    .filter(f => f.content && f.content.toLowerCase().includes(q))
    .map(f => getFileInfo(f.id + '.md'))
    .filter(Boolean);
}

module.exports = {
  getBrainFiles,
  getSystemFiles,
  getFileInfo,
  getOnboardSummary,
  getFile,
  search
}
