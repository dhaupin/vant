#!/usr/bin/env node
/**
 * Vant Vibe Evals
 * 
 * Deterministic keyword trigger tests
 * Ensures correct island fires for keywords
 * 
 * Usage:
 *   node test/evals/vibe.js              # Run all
 *   node test/evals/vibe.js --verbose    # Detailed
 */

const path = require('path');
// Use process.cwd() for the app directory
const APP_DIR = process.cwd();

const args = process.argv;
const verbose = args.includes('--verbose');

// Only test public islands (not private brain islands)
// Private islands like vesc, herbalism, automation exist in mycelium but not public OSS
const EVALS = [
    { keyword: 'github', expected: 'github', prompts: ['create a PR', 'check issue', 'push to repo'] },
    { keyword: 'gitlab', expected: 'gitlab', prompts: ['merge request', 'gitlab repo'] },
    { keyword: 'bitbucket', expected: 'bitbucket', prompts: ['bitbucket PR'] },
    { keyword: 'linear', expected: 'linear', prompts: ['linear issue', 'project tracking'] },
];

function getIslands() {
    return require(path.join(APP_DIR, 'lib', 'islands.js'));
}

function runEval(evalItem) {
    const islands = getIslands();
    const results = [];
    
    for (const prompt of evalItem.prompts) {
        const triggered = islands.findTriggers(prompt);
        const pass = triggered.includes(evalItem.expected);
        
        results.push({
            prompt,
            triggered,
            expected: evalItem.expected,
            pass
        });
    }
    
    return results;
}

function main() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║       Vant Vibe Evals             ║');
    console.log('╚═══════════════════════════════╝\n');
    
    let passed = 0;
    let failed = 0;
    
    for (const evalItem of EVALS) {
        const results = runEval(evalItem);
        const allPass = results.every(r => r.pass);
        
        if (allPass) {
            console.log('[' + evalItem.keyword + '] ✓');
            passed++;
        } else {
            console.log('[' + evalItem.keyword + '] ✗');
            failed++;
        }
        
        if (verbose || !allPass) {
            for (const r of results) {
                const status = r.pass ? '✓' : '✗';
                console.log('  ' + status + ' "' + r.prompt + '" → ' + r.triggered.join(', '));
            }
        }
    }
    
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  Results: ' + passed + '/' + (passed + failed) + ' passed              ║');
    console.log('╚═══════════════════════════════╝');
    
    process.exit(failed > 0 ? 1 : 0);
}

main();