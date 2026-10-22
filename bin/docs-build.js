#!/usr/bin/env node
const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Vant Docs Builder

USAGE:
  vant docs-build              # Stamp package.json's version into docs frontmatter
  vant docs-build --commit     # ...then git add -A + commit the stamp

NOTES:
  Version stamping covers the 8 frontmatter'd docs pages. The docs
  SITE build itself is CI's pipeline: Jekyll renders, npm freestruct
  runs over the output (docs/freestruct.config.yml), Pagefind indexes
  (.github/workflows/docs.yml). This door does not build the site.
`);
    process.exit(0);
}

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
const { execFileSync } = require('child_process');

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
    'docs/getting-started/migration.md',
    'docs/reference/cli.md',
    'docs/reference/config.md',
    'docs/reference/schema.md',
    'docs/reference/api-runtime.md'
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
  // (pass 246, issue #200) argv-routed git: the version string rides as
  // data — the interpolated `git commit -m "…v${version}"` shell string
  // was the same pattern the sync.js PoC exploited.
  execFileSync('git', ['add', '-A'], { stdio: 'pipe', cwd: path.join(__dirname, '..') });
  execFileSync('git', ['commit', '-m', `docs: build v${version}`], { stdio: 'pipe', cwd: path.join(__dirname, '..') });
  console.log('Committed. Push to publish.');
}

console.log('Done.');
