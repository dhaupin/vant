#!/usr/bin/env node
/**
 * Vant Brain Unlock CLI
 * Unlock brain from encrypted SVG horcrux
 * 
 * Usage:
 *   vant brain-unlock                    # Prompt for password
 *   vant brain-unlock <svg-file>         # Unlock specific file
 *   vant brain-unlock --status           # Check if brain is locked
 *   vant brain-unlock --clear            # Clear cached password
 *   vant brain-unlock --info             # Show horcrux info (no unlock)
 * 
 * Uses lib/secret module for password management
 */

const fs = require('fs');
const path = require('path');
const secret = require('../lib/secret');
const stego = require('../lib/stego');

const args = process.argv.slice(2);

async function main() {
    if (args.includes('--status') || args.includes('-s')) {
        console.log('Brain password status:');
        console.log('  Has secret:', secret.has('brain'));
        console.log('  Env key:', secret.info('brain').envKey);
        return;
    }
    
    if (args.includes('--clear') || args.includes('-c')) {
        secret.clear('brain');
        console.log('Brain password cleared');
        return;
    }
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Vant Brain Unlock - Unlock brain from SVG horcrux

Usage:
  vant brain-unlock                    Prompt for password
  vant brain-unlock <svg-file>         Unlock specific file
  vant brain-unlock --status           Check lock status
  vant brain-unlock --clear            Clear cached password
  vant brain-unlock --info             Show horcrux info (no unlock)

Uses lib/secret for password management:
  - VANT_BRAIN_PASSWORD env var
  - Or prompt user
`);
        return;
    }
    
    if (args.includes('--info')) {
        const svgPath = args[1] || 'hypha-brain.svg';
        if (!fs.existsSync(svgPath)) {
            console.log('File not found:', svgPath);
            return;
        }
        const svg = fs.readFileSync(svgPath, 'utf8');
        if (svg.includes('<brn:secret>')) {
            console.log('Horcrux file:', svgPath);
            console.log('  Encrypted: yes');
            console.log('  Password required: yes');
        } else {
            console.log('Not a valid horcrux file');
        }
        return;
    }
    
    const svgFile = args[0] || 'hypha-brain.svg';
    if (!fs.existsSync(svgFile)) {
        console.error('File not found:', svgFile);
        process.exit(1);
    }
    
    console.log('Reading horcrux:', svgFile);
    
    let password;
    try {
        password = await secret.get('brain');
    } catch (e) {
        console.error('Password required:', e.message);
        process.exit(1);
    }
    
    console.log('Decrypting...');
    
    try {
        const svg = fs.readFileSync(svgFile, 'utf8');
        const result = stego.decodeSvg(svg, password);
        
        if (result.error) {
            console.error('Decryption failed:', result.error);
            secret.clear('brain');
            process.exit(1);
        }
        
        console.log('✓ Brain unlocked successfully!');
        const data = JSON.parse(result.message);
        console.log('  Teams:', data.teams?.length || 0);
        console.log('  Orgs:', data.orgs?.length || 0);
        console.log('  Depts:', data.depts?.length || 0);
        
    } catch (e) {
        console.error('Error:', e.message);
        secret.clear('brain');
        process.exit(1);
    }
}

main();
