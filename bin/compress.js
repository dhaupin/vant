#!/usr/bin/env node
/**
 * vant compress - Entropy-Patch Deassembler
 * 
 * Compresses files or folders using the Windowed Entropy Scan algorithm.
 * Outputs .vpatch (Vant Patch) files containing the latent seed and deltas.
 * 
 * Usage:
 *   vant compress <file_or_folder> [options]
 *   vant compress <file> --output <dir>
 *   vant compress <folder> --window 16 --threshold 0.9
 * 
 * Options:
 *   --output, -o    Output directory (default: models/latent)
 *   --window, -w   Window size for entropy scan (default: 8)
 *   --threshold, -t Entropy threshold 0-1 (default: 0.85)
 *   --decompress, -d Decompress .vpatch file back to original
 *   --stats, -s      Show entropy statistics only
 */

const entropy = require('../lib/entropy');
const vaf = require('../lib/vaf');
const { readFileSync, statSync, mkdirSync, readdirSync } = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (!args[0] || args[0] === '--help' || args[0] === '-h') {
    console.log(`
╔═══════════════════════════════════════╗
║    vant compress - Entropy Encoder     ║
╚═══════════════════════════════════════╝

Usage: vant compress <input> [options]

Options:
  -o, --output <dir>    Output directory (default: models/latent)
  -w, --window <num>   Window size (default: 8)
  -t, --threshold <num> Entropy threshold 0-1 (default: 0.85)
  -d, --decompress     Decompress .vpatch to original
  -s, --stats          Show entropy statistics only
  -h, --help           Show this help

Examples:
  vant compress models/public/goals.md
  vant compress models/public/ --output models/latent
  vant compress models/latent/goals.vpatch --decompress
  vant compress README.md --stats
`);
    process.exit(0);
}

// Parse flags
let inputPath = args[0];
let outputDir = 'models/latent';
let windowSize = 8;
let threshold = 0.85;
let decompress = false;
let statsOnly = false;

for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
        outputDir = args[++i];
    } else if (arg === '-w' || arg === '--window') {
        windowSize = parseInt(args[++i], 10);
    } else if (arg === '-t' || arg === '--threshold') {
        threshold = parseFloat(args[++i]);
    } else if (arg === '-d' || arg === '--decompress') {
        decompress = true;
    } else if (arg === '-s' || arg === '--stats') {
        statsOnly = true;
    }
}

// Validate input
vaf.check(inputPath, { type: 'path', name: 'inputPath' });

// Main async function
(async () => {
    try {
        if (statsOnly) {
            // Show entropy stats only
            const content = readFileSync(inputPath);
            const stats = entropy.getEntropyStats(content);
            
            console.log(`
╔═══════════════════════════════════════╗
║         Entropy Statistics            ║
╚═══════════════════════════════════════╝

File: ${path.basename(inputPath)}
Size: ${stats.byteCount} bytes
Overall Entropy: ${stats.overall.toFixed(4)}
Min Chunk Entropy: ${stats.min.toFixed(4)}
Max Chunk Entropy: ${stats.max.toFixed(4)}
Mean Entropy: ${stats.mean.toFixed(4)}

Compression Potential:
  ${stats.overall > 0.85 ? 'HIGH - Good candidate for .vpatch' : 'LOW - Low compression benefit'}
`);
        } else if (decompress) {
            // Decompress .vpatch file
            console.log('[Entropy] Decompressing:', inputPath);
            const outputPath = inputPath.replace('.vpatch', '.decompressed');
            entropy.decompress(inputPath, outputPath);
            console.log('[Entropy] Done!');
        } else {
            // Compress input
            console.log('[Entropy] Compressing:', inputPath);
            
            // Ensure output dir exists
            try {
                mkdirSync(outputDir, { recursive: true });
            } catch (e) {
                // already exists
            }
            
            const inputStats = statSync(inputPath);
            
            if (inputStats.isDirectory()) {
                // Compress directory
                const files = readdirSync(inputPath);
                const results = [];
                
                for (const file of files) {
                    const filePath = path.join(inputPath, file);
                    const fileStat = statSync(filePath);
                    
                    if (fileStat.isFile()) {
                        const result = await entropy.compress(filePath, outputDir, {
                            windowSize,
                            threshold,
                            isFile: true
                        });
                        results.push(result);
                    }
                }
                
                console.log(`[Entropy] Compressed ${results.length} files`);
            } else {
                // Compress single file
                const result = await entropy.compress(inputPath, outputDir, {
                    windowSize,
                    threshold,
                    isFile: true
                });
                console.log(`[Entropy] Created: ${result.metadata.totalPatches} patches`);
                console.log(`[Entropy] Spikes: ${result.metadata.spikeCount}`);
                console.log(`[Entropy] Stable: ${result.metadata.stableCount}`);
                console.log(`[Entropy] Latent Seed: ${result.latentSeed}`);
            }
        }
    } catch (e) {
        console.error('[Entropy] Error:', e.message);
        process.exit(1);
    }
})();