// onboard.js - Knowledge base / onboarding runtime

const fs = require('fs')
const vaf = require("./vaf")
const path = require('path')

const PUBLIC_DIR = path.join(__dirname, '..', 'models', 'public')

// Get all brain files (exclude underscore-prefixed system files)
function getBrainFiles() {
  if (!fs.existsSync(PUBLIC_DIR)) return []
  
  return fs.readdirSync(PUBLIC_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
}

// Get system files (underscore-prefixed)
function getSystemFiles() {
  if (!fs.existsSync(PUBLIC_DIR)) return []
  
  return fs.readdirSync(PUBLIC_DIR)
    .filter(f => f.startsWith('_') || f === 'meta.json')
    .sort()
}

// Get file content and metadata
function getFileInfo(filename) {
  const filepath = path.join(PUBLIC_DIR, filename)
  if (!fs.existsSync(filepath)) return null
  
  const content = fs.readFileSync(filepath, 'utf8')
  const stats = fs.statSync(filepath)
  
  // Extract title from first # heading
  const titleMatch = content.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1] : filename
  
  // Count sections (## headers)
  const sections = (content.match(/^##\s+/gm) || []).length
  
  // Get first 200 chars for preview
  const preview = content.slice(0, 200).replace(/[#*`]/g, '').trim() + '...'
  
  return {
    filename,
    title,
    sections,
    size: stats.size,
    preview,
    path: filepath
  }
}

// Generate full onboarding summary
function getOnboardSummary() {
  const brainFiles = getBrainFiles()
  const systemFiles = getSystemFiles()
  
  const files = brainFiles.map(f => getFileInfo(f))
  const systems = systemFiles.map(f => getFileInfo(f))
  
  // Get meta info
  let meta = null
  const metaPath = path.join(PUBLIC_DIR, 'meta.json')
  if (fs.existsSync(metaPath)) {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  }
  
  // Get succession info
  let succession = null
  const succPath = path.join(PUBLIC_DIR, '_succession.json')
  if (fs.existsSync(succPath)) {
    succession = JSON.parse(fs.readFileSync(succPath, 'utf8'))
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
function getFile(filename) {
  // Add .md if extension not provided
  if (!filename.endsWith('.md') && !filename.endsWith('.txt')) {
    filename = filename + '.md'
  }
  const info = getFileInfo(filename)
  if (!info) return null
  
  return {
    ...info,
    content: fs.readFileSync(info.path, 'utf8')
  }
}

// Search files by keyword
function search(query) {
  vaf.check(query, {type: 'string', name: 'query', maxLength: 200});
  const brainFiles = getBrainFiles()
  const results = []
  
  for (const filename of brainFiles) {
    const content = fs.readFileSync(path.join(PUBLIC_DIR, filename), 'utf8').toLowerCase()
    if (content.includes(query.toLowerCase())) {
      const info = getFileInfo(filename)
      results.push(info)
    }
  }
  
  return results
}

module.exports = {
  getBrainFiles,
  getSystemFiles,
  getFileInfo,
  getOnboardSummary,
  getFile,
  search
}
