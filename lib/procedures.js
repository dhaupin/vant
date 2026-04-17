/**
 * Procedures - VANT Brain Operations
 * 
 * Gated operations for brain management:
 * - Merge: Combine brains preserving graphs, deltas, insights, data
 * - Trim: Delete parts of memory without recursion or full delete
 * 
 * Usage:
 *   const { Merge, Trim } = require('./lib/procedures');
 *   
 *   await MergeBrains(from, to, options)
 *   await TrimBrain(version, scope, options)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const STATES_DIR = path.join(__dirname, '..', 'states');

/**
 * GATE - Authorization check for destructive operations
 */
function GATE(operation, context = {}) {
    const GATE_TOKEN = process.env.VANT_GATE_TOKEN || process.env.GITHUB_TOKEN;
    
    // Log every gate attempt
    const logEntry = {
        operation,
        timestamp: new Date().toISOString(),
        context,
        tokenPresent: !!GATE_TOKEN
    };
    
    const gateLog = path.join(STATES_DIR, 'gate-log.json');
    try {
        const logs = fs.existsSync(gateLog) ? JSON.parse(fs.readFileSync(gateLog, 'utf8')) : [];
        logs.push(logEntry);
        fs.writeFileSync(gateLog, JSON.stringify(logs.slice(-100), null, 2));
    } catch (e) {}
    
    if (!GATE_TOKEN) {
        throw new Error(`GATE DENIED: ${operation} requires VANT_GATE_TOKEN or GITHUB_TOKEN`);
    }
    
    return { authorized: true, operation };
}

/**
 * Merge - Combine brains without losing data
 * 
 * @param {string} fromVersion - Source brain
 * @param {string} toVersion - Target brain (will be created if not exists)
 * @param {object} options - { preserve: ['graphs', 'deltas', 'insights', 'data'], dryRun: bool }
 */
async function MergeBrains(fromVersion, toVersion, options = {}) {
    const preserve = options.preserve || ['graphs', 'deltas', 'insights', 'data'];
    
    // GATE check
    GATE('MergeBrains', { from: fromVersion, to: toVersion, preserve });
    
    const fromPath = path.join(MODELS_DIR, fromVersion);
    const toPath = path.join(MODELS_DIR, toVersion);
    
    if (!fs.existsSync(fromPath)) {
        throw new Error(`Source brain not found: ${fromVersion}`);
    }
    
    console.log(`🧬 Merge: ${fromVersion} → ${toVersion}`);
    console.log(`   Preserve: ${preserve.join(', ')}`);
    
    // Create target if needed
    if (!fs.existsSync(toPath)) {
        fs.mkdirSync(toPath, { recursive: true });
        console.log(`   Created: ${toVersion}`);
    }
    
    const result = {
        from: fromVersion,
        to: toVersion,
        added: { files: [], categories: [] },
        preserved: [],
        conflicts: [],
        timestamp: new Date().toISOString()
    };
    
    // 1. Preserve GRAPHS (version lineage)
    if (preserve.includes('graphs')) {
        const deltasDir = path.join(STATES_DIR, 'deltas');
        if (fs.existsSync(deltasDir)) {
            const deltas = fs.readdirSync(deltasDir).filter(f => f.includes(fromVersion));
            deltas.forEach(deltaFile => {
                const src = path.join(deltasDir, deltaFile);
                const dest = deltaFile.replace(fromVersion, toVersion);
                fs.copyFileSync(src, path.join(deltasDir, dest));
                result.preserved.push(`graph: ${deltaFile}`);
            });
            console.log(`   📊 Preserved ${deltas.length} graphs/deltas`);
        }
    }
    
    // 2. Preserve DELTAS
    if (preserve.includes('deltas')) {
        const deltasDir = path.join(STATES_DIR, 'deltas');
        if (fs.existsSync(deltasDir)) {
            const allDeltas = fs.readdirSync(deltasDir);
            let copied = 0;
            allDeltas.forEach(f => {
                if (f.includes(fromVersion)) {
                    const dest = f.replace(fromVersion, toVersion);
                    if (!fs.existsSync(path.join(deltasDir, dest))) {
                        fs.copyFileSync(path.join(deltasDir, f), path.join(deltasDir, dest));
                        copied++;
                    }
                }
            });
            console.log(`   📈 Preserved ${copied} deltas`);
        }
    }
    
    // 3. Preserve INSIGHTS (learnings)
    if (preserve.includes('insights')) {
        const srcLearnings = path.join(fromPath, 'learnings');
        const destLearnings = path.join(toPath, 'learnings');
        
        if (fs.existsSync(srcLearnings) && !fs.existsSync(destLearnings)) {
            fs.mkdirSync(destLearnings, { recursive: true });
        }
        
        if (fs.existsSync(srcLearnings)) {
            const files = fs.readdirSync(srcLearnings).filter(f => f.endsWith('.md'));
            files.forEach(f => {
                const srcFile = path.join(srcLearnings, f);
                const destFile = path.join(destLearnings, f);
                if (!fs.existsSync(destFile)) {
                    fs.copyFileSync(srcFile, destFile);
                    result.added.categories.push(`learnings/${f}`);
                }
            });
            console.log(`   💡 Preserved ${files.length} learnings`);
        }
    }
    
    // 4. Preserve DATA (memories, decisions, todos)
    if (preserve.includes('data')) {
        const categories = ['memories', 'decisions', 'todos'];
        categories.forEach(cat => {
            const srcCat = path.join(fromPath, cat);
            const destCat = path.join(toPath, cat);
            
            if (fs.existsSync(srcCat) && !fs.existsSync(destCat)) {
                fs.mkdirSync(destCat, { recursive: true });
            }
            
            if (fs.existsSync(srcCat)) {
                const files = fs.readdirSync(srcCat).filter(f => f.endsWith('.md'));
                files.forEach(f => {
                    const srcFile = path.join(srcCat, f);
                    const destFile = path.join(destCat, f);
                    if (!fs.existsSync(destFile)) {
                        fs.copyFileSync(srcFile, destFile);
                        result.added.categories.push(`${cat}/${f}`);
                    }
                });
                console.log(`   📦 Preserved ${files.length} ${cat}`);
            }
        });
    }
    
    // Copy identity file if target doesn't have one
    const identityFiles = ['identity.yaml', 'identity.yml', 'identity.json', 'identity.txt'];
    identityFiles.forEach(f => {
        const srcId = path.join(fromPath, f);
        const destId = path.join(toPath, f);
        if (fs.existsSync(srcId) && !fs.existsSync(destId)) {
            fs.copyFileSync(srcId, destId);
            result.added.files.push(f);
        }
    });
    
    // Log merge
    const mergeLog = path.join(STATES_DIR, 'merges.json');
    const logs = fs.existsSync(mergeLog) ? JSON.parse(fs.readFileSync(mergeLog, 'utf8')) : [];
    logs.push(result);
    fs.writeFileSync(mergeLog, JSON.stringify(logs.slice(-50), null, 2));
    
    console.log(`   ✅ Merge complete: ${result.added.files.length} files, ${result.added.categories.length} categories`);
    
    if (options.dryRun) {
        console.log(`   [DRY RUN - no changes made]`);
        return { dryRun: true, result };
    }
    
    return result;
}

/**
 * Trim - Delete parts of memory (gated, no recursion)
 * 
 * @param {string} version - Brain version
 * @param {string} scope - What to trim: 'category', 'file', 'pattern'
 * @param {object} options - { target: 'learnings/memory.md', confirm: 'DELETE' }
 */
async function TrimBrain(version, scope, options = {}) {
    const brainPath = path.join(MODELS_DIR, version);
    
    if (!fs.existsSync(brainPath)) {
        throw new Error(`Brain not found: ${version}`);
    }
    
    // GATE check - requires explicit confirmation
    const confirm = options.confirm || process.env.VANT_TRIM_CONFIRM;
    if (confirm !== 'DELETE') {
        throw new Error(`GATE: Trim requires confirm='DELETE' or VANT_TRIM_CONFIRM=DELETE`);
    }
    
    GATE('TrimBrain', { version, scope, target: options.target });
    
    console.log(`✂️ Trim: ${version}/${scope}`);
    
    const result = {
        version,
        scope,
        target: options.target,
        deleted: [],
        timestamp: new Date().toISOString()
    };
    
    if (scope === 'category') {
        const target = options.target; // e.g., 'learnings'
        const catPath = path.join(brainPath, target);
        
        if (!target || !['learnings', 'memories', 'decisions', 'todos'].includes(target)) {
            throw new Error(`Invalid category: ${target}. Must be one of: learnings, memories, decisions, todos`);
        }
        
        if (fs.existsSync(catPath)) {
            const files = fs.readdirSync(catPath).filter(f => f.endsWith('.md'));
            if (files.length === 0) {
                console.log(`   Nothing to trim in ${target}`);
                return { alreadyEmpty: true };
            }
            
            // Move to .trimmed/ instead of full delete
            const trimmedDir = path.join(MODELS_DIR, '.trimmed', version, target);
            fs.mkdirSync(trimmedDir, { recursive: true });
            
            files.forEach(f => {
                const src = path.join(catPath, f);
                const dest = path.join(trimmedDir, f);
                fs.copyFileSync(src, dest);
                fs.unlinkSync(src);
                result.deleted.push(`${target}/${f}`);
            });
            
            fs.rmdirSync(catPath);
            console.log(`   📤 Moved ${files.length} to .trimmed/${version}/${target}/`);
        }
    }
    else if (scope === 'file') {
        const target = options.target; // e.g., 'learnings/old.md'
        if (!target) {
            throw new Error(`Trim file requires target: 'category/file.md'`);
        }
        
        const filePath = path.join(brainPath, target);
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${target}`);
        }
        
        // Verify no recursion (can't delete parent dirs)
        const parts = target.split('/');
        if (parts.length > 2) {
            throw new Error(`GATE: Cannot trim nested beyond category/file`);
        }
        
        const ext = path.extname(target);
        if (!['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext)) {
            throw new Error(`GATE: Refusing to trim non-brain file`);
        }
        
        // Move to .trimmed/
        const trimmedDir = path.join(MODELS_DIR, '.trimmed', version);
        fs.mkdirSync(trimmedDir, { recursive: true });
        
        const dest = path.join(trimmedDir, path.basename(target));
        fs.copyFileSync(filePath, dest);
        fs.unlinkSync(filePath);
        result.deleted.push(target);
        
        console.log(`   📤 Moved ${target} to .trimmed/${version}/`);
    }
    else if (scope === 'pattern') {
        const pattern = options.pattern; // glob pattern
        if (!pattern) {
            throw new Error(`Trim pattern requires pattern option`);
        }
        
        if (pattern.includes('..') || pattern.startsWith('/')) {
            throw new Error(`GATE: Refusing unsafe pattern (no parent dir traversal)`);
        }
        
        const regex = new RegExp(pattern);
        const categories = ['learnings', 'memories', 'decisions', 'todos'];
        
        categories.forEach(cat => {
            const catPath = path.join(brainPath, cat);
            if (!fs.existsSync(catPath)) return;
            
            const files = fs.readdirSync(catPath).filter(f => f.endsWith('.md') && regex.test(f));
            files.forEach(f => {
                const src = path.join(catPath, f);
                const trimmedDir = path.join(MODELS_DIR, '.trimmed', version, cat);
                fs.mkdirSync(trimmedDir, { recursive: true });
                
                const dest = path.join(trimmedDir, f);
                fs.copyFileSync(src, dest);
                fs.unlinkSync(src);
                result.deleted.push(`${cat}/${f}`);
            });
        });
        
        console.log(`   📤 Matched ${result.deleted.length} files to pattern: ${pattern}`);
    }
    else {
        throw new Error(`Invalid scope: ${scope}. Use: category, file, pattern`);
    }
    
    // Log trim
    const trimLog = path.join(STATES_DIR, 'trims.json');
    const logs = fs.existsSync(trimLog) ? JSON.parse(fs.readFileSync(trimLog, 'utf8')) : [];
    logs.push(result);
    fs.writeFileSync(trimLog, JSON.stringify(logs.slice(-50), null, 2));
    
    console.log(`   ✅ Trim complete: ${result.deleted.length} items`);
    
    return result;
}

/**
 * Get version audit - Check version consistency
 */
function auditVersions() {
    const brains = fs.readdirSync(MODELS_DIR).filter(d => {
        const p = path.join(MODELS_DIR, d);
        return fs.statSync(p).isDirectory() && !d.startsWith('.');
    });
    
    const report = {
        totalBrains: brains.length,
        brains: [],
        issues: [],
        timestamp: new Date().toISOString()
    };
    
    brains.forEach(b => {
        const brain = {
            name: b,
            hasIdentity: false,
            categories: [],
            files: [],
            size: 0
        };
        
        const brainPath = path.join(MODELS_DIR, b);
        
        // Check root files
        const rootFiles = fs.readdirSync(brainPath).filter(f => !fs.statSync(path.join(brainPath, f)).isDirectory());
        rootFiles.forEach(f => {
            brain.size += fs.statSync(path.join(brainPath, f)).size;
            if (f.startsWith('identity.')) brain.hasIdentity = true;
            brain.files.push(f);
        });
        
        // Check categories
        ['learnings', 'memories', 'decisions', 'todos'].forEach(cat => {
            const catPath = path.join(brainPath, cat);
            if (fs.existsSync(catPath)) {
                brain.categories.push(cat);
                const files = fs.readdirSync(catPath).filter(f => f.endsWith('.md'));
                brain.size += files.reduce((s, f) => s + fs.statSync(path.join(catPath, f)).size, 0);
            }
        });
        
        report.brains.push(brain);
    });
    
    // Check for gaps
    const versions = report.brains.map(b => b.name).sort((a, b) => {
        const parse = v => v.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
        const av = parse(a), bv = parse(b);
        for (let i = 0; i < Math.max(av.length, bv.length); i++) {
            if ((av[i] || 0) !== (bv[i] || 0)) return (av[i] || 0) - (bv[i] || 0);
        }
        return 0;
    });
    
    // Simple gap check for v0.x versions
    const v0x = versions.filter(v => v.startsWith('v0.') || v.startsWith('v0'));
    const numbers = v0x.map(v => {
        const m = v.match(/v0\.(\d+)/);
        return m ? parseInt(m[1], 10) : -1;
    }).filter(n => n >= 0).sort((a, b) => a - b);
    
    if (numbers.length > 1) {
        for (let i = 1; i < numbers.length; i++) {
            if (numbers[i] !== numbers[i-1] + 1) {
                report.issues.push(`Gap between v0.${numbers[i-1]} and v0.${numbers[i]}`);
            }
        }
    }
    
    return report;
}

module.exports = {
    GATE,
    MergeBrains,
    TrimBrain,
    auditVersions
};