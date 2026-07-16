/**
 * Brain Horcrux (v0.0.1)
 * 
 * Encode brain corpus as PNG images for backup/transmission.
 * Uses stego module under the hood.
 * 
 * Usage:
 *   node bin/brain-horcrux.js backup      # Save brains to image
 *   node bin/brain-horcrux.js restore    # Restore brains from image
 */

const fs = require('fs');
const path = require('path');
const brain = require('../lib/brain');
const stego = require('../lib/stego');

const CORPUS_DIR = brain.getBrainPath();
const PUBLIC_DIR = brain.getPublicPath();
const OUTPUT_DIR = path.join(__dirname, '..', 'models', 'horcrux');

// Ensure output dir
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Get all brain content as single string
 */
async function getCorpusText() {
    const corpus = await brain.loadCorpus();
    const lines = corpus.map(item => 
        `## ${item.id}\n${item.content}`
    ).join('\n\n---\n\n');
    return lines || 'empty';
}

/**
 * Backup brains to image (uses stego)
 */
async function backup(options = {}) {
    const { name = 'brain', template = null } = options;
    const text = await getCorpusText();
    
    // Default template if none provided - create simple one
    let templatePath = template;
    if (!templatePath) {
        // Use a simple 1x1 transparent PNG as base
        templatePath = path.join(OUTPUT_DIR, '.template.png');
        if (!fs.existsSync(templatePath)) {
            // Create minimal valid PNG (1x1 transparent)
            const minimalPng = Buffer.from([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
                0x00, 0x00, 0x00, 0x0D, // IHDR length
                0x49, 0x48, 0x44, 0x52, // IHDR
                0x00, 0x00, 0x01, 0x00, // width: 256
                0x00, 0x00, 0x01, 0x00, // height: 256
                0x08, 0x06, 0x00, 0x00, 0x00, // 8-bit RGBA
                0x5C, 0x72, 0xA8, 0x66, // CRC
                0x00, 0x00, 0x00, 0x0C, // IDAT length  
                0x49, 0x44, 0x41, 0x54, // IDAT
                0x08, 0xD7, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01, // compressed
                0x27, 0x34, 0x27, 0x01, // CRC
                0x00, 0x00, 0x00, 0x00, // IEND length
                0x49, 0x45, 0x4E, 0x44, // IEND
                0xAE, 0x42, 0x60, 0x82  // CRC
            ]);
            fs.writeFileSync(templatePath, minimalPng);
        }
    }
    
    const outputPath = path.join(OUTPUT_DIR, name + '.png');
    const result = stego.encode(text, templatePath, outputPath);
    
    console.log(`[horcrux] Brain backed up to: ${outputPath}`);
    console.log(`[horcrux] Corpus chars: ${text.length}`);
    
    return outputPath;
}

/**
 * Restore brains from image
 */
async function restore(imagePath, options = {}) {
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }
    
    const content = stego.decode(imagePath, options);
    console.log(`[horcrux] Restored ${content.length} chars`);
    
    // Could parse and re-import to brain
    return content;
}

/**
 * List horcrux backups
 */
function list() {
    if (!fs.existsSync(OUTPUT_DIR)) return [];
    return fs.readdirSync(OUTPUT_DIR)
        .filter(f => f.endsWith('.png'))
        .map(f => {
            const stat = fs.statSync(path.join(OUTPUT_DIR, f));
            return {
                name: f.replace('.png', ''),
                size: stat.size,
                created: stat.mtime
            };
        });
}

// CLI
const cmd = process.argv[2];
const opts = process.argv.slice(3);

(async () => {
    try {
        switch (cmd) {
            case 'backup': {
                const name = opts[0] || 'brain';
                await backup({ name });
                break;
            }
            case 'restore': {
                const imagePath = opts[0];
                if (!imagePath) {
                    console.error('Usage: restore <image.png>');
                    process.exit(1);
                }
                await restore(imagePath);
                break;
            }
            case 'list': {
                const files = list();
                if (files.length === 0) {
                    console.log('No horcrux backups found');
                } else {
                    console.log('Backups:');
                    for (const f of files) {
                        console.log(`  ${f.name}.png - ${f.size} bytes`);
                    }
                }
                break;
            }
            default:
                console.log(`
Brain Horcrux - Encode brain in images

Usage:
  vant horcrux backup [name]   # Save brains to image
  vant horcrux restore <file>     # Restore from image  
  vant horcrux list            # List backups

Notes:
  - Uses LSB steganography to encode in PNG
  - Images look like normal PNG files
  - Can encode ~50KB per 256x256 PNG
                `);
        }
    } catch (e) {
        console.error('[horcrux] Error:', e.message);
        process.exit(1);
    }
})();