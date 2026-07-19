/**
 * Memory - Learning & Pattern Recognition
 * 
 * Stores experiences and patterns with semantic search.
 * Includes data sanitization for security.
 * 
 * Usage:
 *   const memory = require('./memory');
 *   await memory.remember('pattern', { type: 'success', context: {...} });
 *   const patterns = await memory.find('pattern');
 */

const embed = require('./embed');
const fs = require('fs');
const path = require('path');

// Default storage path - can be overridden
const STORAGE_PATH = process.env.VANT_MEMORY_PATH || 
  path.join(process.env.HOME || '.', '.vant', 'memory.json');

class MemorySystem {
  constructor() {
    this.patterns = new Map();
    this.experiences = [];
    this.maxExperiences = 1000;
    this.maxDataSize = 1000000; // 1MB max per item
    this.storagePath = STORAGE_PATH;
    this._load();
  }
  
  /**
   * Load from disk
   */
  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        this.experiences = data.experiences || [];
        // Rebuild patterns index
        this.patterns = new Map();
        for (const exp of this.experiences) {
          if (!this.patterns.has(exp.type)) {
            this.patterns.set(exp.type, []);
          }
          this.patterns.get(exp.type).push(exp);
        }
      }
    } catch (e) {
      // Start fresh on error
      this.experiences = [];
      this.patterns = new Map();
    }
  }
  
  /**
   * Save to disk
   */
  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify({
        experiences: this.experiences,
        savedAt: Date.now()
      }, null, 2));
    } catch (e) {
      // Silently fail on save error
    }
  }
  
  /**
   * Remember an experience or pattern
   */
  sanitizeData(data) {
    if (data === null || data === undefined) return {};
    if (typeof data === 'string') return data;
    if (typeof data !== 'object') return String(data);
    const sanitized = {};
    for (const [key, val] of Object.entries(data)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      sanitized[key] = val;
    }
    return sanitized;
  }

  async remember(type, data) {
    const sanitized = this.sanitizeData(data);

    const size = JSON.stringify(sanitized).length;

    if (size > this.maxDataSize) {

      throw new Error('EMEMORY: Data too large: max ' + this.maxDataSize + ' bytes');

    }

    const exp = {
      type,
      data: sanitized,
      timestamp: Date.now(),
      vector: await embed.embed(JSON.stringify(data))
    };
    
    this.experiences.push(exp);
    
    // Trim old experiences
    if (this.experiences.length > this.maxExperiences) {
      this.experiences = this.experiences.slice(-this.maxExperiences);
    }
    
    // Also store in pattern index
    if (!this.patterns.has(type)) {
      this.patterns.set(type, []);
    }
    this.patterns.get(type).push(exp);
    
    // Persist to disk
    this._save();
    
    return { remembered: true, total: this.experiences.length };
  }
  
  /**
   * Find similar experiences
   */
  async find(query, options = {}) {
    const { topK = 5, type = null } = options;
    
    const queryVec = await embed.embed(query);
    
    let candidates = type 
      ? (this.patterns.get(type) || [])
      : this.experiences;
    
    // Calculate similarities
    const scored = candidates.map(exp => ({
      exp,
      score: embed.cosineSimilarity(queryVec, exp.vector)
    }));
    
    // Sort and return topK
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, topK).map(s => ({
      type: s.exp.type,
      data: s.exp.data,
      score: s.score,
      timestamp: s.exp.timestamp
    }));
  }
  
  /**
   * Get statistics about memory
   */
  getStats() {
    const typeCounts = {};
    for (const [type, exps] of this.patterns) {
      typeCounts[type] = exps.length;
    }
    
    return {
      total: this.experiences.length,
      types: typeCounts,
      capacity: this.maxExperiences
    };
  }
  
  /**
   * Clear all memory (reset)
   */
  clear() {
    this.patterns.clear();
    this.experiences = [];
    return { cleared: true };
  }
}

// Singleton instance
const memory = new MemorySystem();

module.exports = {
  MemorySystem,
  remember: (type, data) => memory.remember(type, data),
  find: (query, opts) => memory.find(query, opts),
  getStats: () => memory.getStats(),
  clear: () => memory.clear()
};
