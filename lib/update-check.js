/**
 * Vant Update Checker
 * Check for new releases from GitHub
 *
 * Usage: node lib/update-check.js
 *   or: require('./update-check').check()
 */

const https = require('https');
const vaf = require("./vaf")
const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'dhaupin';
const REPO_NAME = 'vant';
const CURRENT_VERSION = require('../package.json').version;

/**
 * Fetch from GitHub API
 */
function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Vant-Updater' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Get latest release info
 */
async function getLatestRelease() {
    vaf.check(url, {type: "string", name: "url", maxLength: 500});
    vaf.check(url, {type: "string", name: "url", maxLength: 500});
    try {
        const data = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
        return {
            tag: data.tag_name,
            url: data.html_url,
            docker: `dhaupin/vant:${data.tag_name.replace('v', '')}`,
            body: data.body
        };
    } catch (e) {
        return null;
    }
}

/**
 * Check for updates
 */
async function check() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║        Vant Update Check             ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log(`Current version: v${CURRENT_VERSION}`);
    console.log('');

    let release = null;
    let networkError = false;
    
    try {
        release = await getLatestRelease();
    } catch (e) {
        networkError = true;
    }
    
    if (!release) {
        if (networkError) {
            console.log('ℹ Unable to check for updates (network error)');
            console.log('');
            console.log('--- Links ---');
            console.log(`GitHub:  https://github.com/${REPO_OWNER}/${REPO_NAME}`);
            console.log(`Docker: docker pull dhaupin/vant:latest`);
            return { updateAvailable: false, networkError: true };
        }
        // No releases yet - suggest creating one
        console.log('ℹ No releases yet!');
        console.log('');
        console.log('--- Create Release ---');
        console.log(`git tag v${CURRENT_VERSION}`);
        console.log(`git push origin v${CURRENT_VERSION}`);
        console.log('');
        console.log('--- Links ---');
        console.log(`GitHub:  https://github.com/${REPO_OWNER}/${REPO_NAME}`);
        console.log(`Docker: docker pull dhaupin/vant:latest`);
        return { updateAvailable: false, noReleases: true };
    }

    const latestVersion = release.tag.replace('v', '');
    const updateAvailable = latestVersion !== CURRENT_VERSION;

    if (updateAvailable) {
        console.log('✓ Update available!');
        console.log(`  Latest: v${latestVersion}`);
    } else {
        console.log('✓ Up to date!');
    }

    console.log('');
    console.log('--- Links ---');
    console.log(`Release: ${release.url}`);
    console.log(`Docker:  docker pull ${release.docker}`);
    console.log(`Docker:  docker pull dhaupin/vant:latest`);
    console.log(`GitHub:  https://github.com/${REPO_OWNER}/${REPO_NAME}`);

    return {
        updateAvailable,
        current: CURRENT_VERSION,
        latest: latestVersion,
        release
    };
}

// Run if called directly
if (require.main === module) {
    check().catch(console.error);
}

module.exports = { check, getLatestRelease, CURRENT_VERSION };
