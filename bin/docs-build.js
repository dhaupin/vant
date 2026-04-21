#!/usr/bin/env node
/**
 * docs-build.js - Build docs for release
 * 
 * Usage: node bin/docs-build.js
 * 
 * Updates version in docs frontmatter from package.json
 * Can be run on release tags or manually
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DOCS_DIR = path.join(__dirname, '..', 'docs');

// Get version from package.json
function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

// Update version in all docs/*.md files
function updateDocsVersion(version) {
  console.log(`Updating docs to version ${version}...`);
  
  const files = [
    'docs/index.md',
    'docs/getting-started/install.md',
    'docs/getting-started/quick-start.md',
    'docs/reference/cli.md',
    'docs/reference/configuration.md',
    'docs/reference/api.md',
    'docs/reference/schema.md',
    'docs/guides/architecture.md',
    'docs/guides/security.md',
    'docs/guides/multi-agent.md'
  ];

  let updated = 0;
  for (const file of files) {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping: ${file} not found`);
      continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update version in frontmatter
    const oldVersionMatch = content.match(/^version: .+$/m);
    if (oldVersionMatch) {
      content = content.replace(/^version: .+$/m, `version: ${version}`);
    } else if (content.startsWith('---')) {
      // Add version after first --- if not present
      content = content.replace(/^---\n/, `---\nversion: ${version}\n`);
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated: ${file}`);
    updated++;
  }
  
  console.log(`Updated ${updated} files`);
  return updated;
}

// Main
const version = getVersion();
console.log(`Building docs for v${version}...`);

const updated = updateDocsVersion(version);

if (process.argv.includes('--commit')) {
  console.log('Committing changes...');
  execSync('git add -A', { cwd: path.join(__dirname, '..') });
  execSync(`git commit -m "docs: build v${version}"`, { cwd: path.join(__dirname, '..') });
  console.log('Committed. Push to publish.');
}

console.log('Done.');
