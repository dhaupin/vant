/**
 * Vant Stego Gallery - Linked Image Chunks
 *
 * Gallery of stego images, one per island.
 * Each island can be its own PNG for lazy loading.
 */

const fs = require('fs');
const path = require('path');

const GALLERY_PATH = path.join(__dirname, '..', 'models', 'gallery');
const INDEX_FILE = 'gallery.json';

/**
 * Get gallery index
 * @returns {object} Gallery index
 */
function getIndex() {
    const p = path.join(GALLERY_PATH, INDEX_FILE);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return { version: '1.0', images: {} };
}

/**
 * Save gallery index
 * @param {object} index - Index to save
 */
function saveIndex(index) {
    if (!fs.existsSync(GALLERY_PATH)) fs.mkdirSync(GALLERY_PATH, { recursive: true });
    fs.writeFileSync(path.join(GALLERY_PATH, INDEX_FILE), JSON.stringify(index, null, 2));
}

/**
 * Save island as image
 * @param {string} name - Island name
 * @param {Buffer} imageBuffer - PNG buffer
 * @returns {object} Save result
 */
function saveImage(name, imageBuffer) {
    const index = getIndex();
    
    if (!fs.existsSync(GALLERY_PATH)) fs.mkdirSync(GALLERY_PATH, { recursive: true });
    
    const imgPath = path.join(GALLERY_PATH, name + '.png');
    fs.writeFileSync(imgPath, imageBuffer);
    
    index.images[name] = {
        path: name + '.png',
        size: imageBuffer.length,
        updated: new Date().toISOString()
    };
    
    saveIndex(index);
    return { success: true, island: name, size: imageBuffer.length };
}

/**
 * Load island image
 * @param {string} name - Island name
 * @returns {Buffer|null} Image buffer
 */
function loadImage(name) {
    const index = getIndex();
    if (!index.images[name]) return null;
    
    const imgPath = path.join(GALLERY_PATH, name + '.png');
    if (!fs.existsSync(imgPath)) return null;
    
    return fs.readFileSync(imgPath);
}

/**
 * Get all island images
 * @returns {string[]} Available island names
 */
function getAllImages() {
    const index = getIndex();
    return Object.keys(index.images);
}

/**
 * Link islands to brain
 * Updates the brain manifest with gallery references
 */
function linkToBrain() {
    const index = getIndex();
    const islands = require('./islands');
    const brain = require('./brain');
    
    const manifest = {
        version: '1.0',
        gallery: index.images,
        islands: islands.getAvailable()
    };
    
    brain.embedConfig({ _gallery: manifest });
    return { success: true, islands: Object.keys(index.images).length };
}

module.exports = { getIndex, saveImage, loadImage, getAllImages, linkToBrain };