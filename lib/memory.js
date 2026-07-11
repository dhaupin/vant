/**
 * Learn - Memory & Pattern Recognition
 * 
 * Learns from experiences and improves over time.
 * 
 * Usage:
 *   const learn = require('./learn');
 *   await learn.remember('pattern', { type: 'success', context: {...} });
 *   const patterns = await learn.find('pattern');
 */

const embed = require('./embed');

class MemorySystem {
  constructor() {
    this.patterns = new Map();
    this.experiences = [];
    this.maxExperiences = 1000;
  }
  
  /**
   * Remember an experience or pattern
   */
  async remember(type, data) {
    const exp = {
      type,
      data,
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
  learn: memory,
  remember: (type, data) => memory.remember(type, data),
  recall: (query, opts) => memory.find(query, opts),  // Alias for find
  find: (query, opts) => memory.find(query, opts),
  getStats: () => memory.getStats(),
  clear: () => memory.clear()
};
