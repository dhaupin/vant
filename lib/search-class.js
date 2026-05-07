/**
 * Vant Search Class
 * 
 * Wrapper for search operations - provides class interface
 * Imports and re-exports existing search.js functionality
 * 
 * Usage:
 *   const search = require('./search');
 *   
 *   // Class instance
 *   const search = search.create();
 *   
 *   // Search operations
 *   const results = await search.search('query');
 *   const ragResults = await search.rag('query');
 *   
 *   // Check allowed
 *   search.isOperationAllowed('read');
 *   search.getLayerStatus();
 */

const existingSearch = require('./search');

/**
 * Search Class
 * Provides class interface for search operations
 */
class Search {
    /**
     * Create Search instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            mode: options.mode || 'basic', // 'basic' or 'rag'
            maxResults: options.maxResults || 10,
            cacheEnabled: options.cacheEnabled !== false
        };
        
        // State
        this._startTime = Date.now();
        this._initialized = true;
    }
    
    /**
     * Search (basic text)
     */
    async search(query, options = {}) {
        return existingSearch.search(query, options);
    }
    
    /**
     * RAG search (semantic)
     */
    async rag(query, options = {}) {
        return existingSearch.rag(query, options);
    }
    
    /**
     * Hybrid search
     */
    async hybrid(query, options = {}) {
        return existingSearch.hybrid(query, options);
    }
    
    /**
     * Get stats
     */
    getStats() {
        return existingSearch.stats();
    }
    
    /**
     * Clear cache
     */
    clearCache() {
        return existingSearch.clearCache();
    }
    
    /**
     * Get cache stats
     */
    getCacheStats() {
        return existingSearch.getCacheStats();
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Search',
            type: 'search',
            enabled: this._initialized,
            config: {
                mode: this.options.mode,
                maxResults: this.options.maxResults,
                cacheEnabled: this.options.cacheEnabled
            },
            state: {
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        // Always allowed for search
        return {allowed: true, layer: 'Search'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            enabled: this._initialized,
            mode: this.options.mode
        };
    }
}

/**
 * Default Search instance
 */
const defaultSearch = new Search();

module.exports = {
    // Class
    Search,
    
    /**
     * Create Search instance
     */
    create(options = {}) {
        return new Search(options);
    },
    
    // Re-export existing functions
    search: existingSearch.search,
    rag: existingSearch.rag,
    hybrid: existingSearch.hybrid,
    stats: existingSearch.stats,
    hyde: existingSearch.hyde,
    clearCache: existingSearch.clearCache,
    getCacheStats: existingSearch.getCacheStats,
    
    // Class methods
    getLayerStatus() {
        return defaultSearch.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultSearch.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultSearch.getStatus();
    }
};