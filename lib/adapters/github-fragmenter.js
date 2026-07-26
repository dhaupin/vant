/**
 * GitHub Fragmenter Adapter (v0.8.6)
 * Bridges AperiodicFragmenter → GitHub API
 * 
 * Uses raw file operations for stateless scatter
 * - Barcode = lattice keys = stateless filenames
 * - No manifests, no database, no correlation possible
 */

const fragmenter = require('../geometry/fragmenter');
const { GitHubProvider } = require('../connectors/github');

// Factory to create provider from config
function createProvider(config) {
    return new GitHubProvider(config);
}

/**
 * GitHub-backed fragmenter
 * Uses GitHub as the "provider" for scatter/retrieve
 */
class GitHubFragmenter {
    constructor(config) {
        this.config = config;
        this.provider = createProvider(config);
    }

    isConfigured() {
        return this.provider.isConfigured();
    }

    /**
     * Derive lattice keys from barcode
     */
    latticeKeys(sequence, numFragments = 5) {
        return fragmenter.deriveLatticeKeys(sequence, numFragments);
    }

    /**
     * Store fragments in GitHub using stateless filenames
     */
    async scatter(data, sequence, options = {}) {
        const { numFragments = 5, prefix = 'vfragment-' } = options;
        
        // Generate lattice keys from barcode sequence
        const keys = this.latticeKeys(sequence, numFragments);
        
        // Fragment data
        const fragments = fragmenter.fragment(data, numFragments);
        
        // Store each fragment directly to GitHub (no git commit needed!)
        const results = [];
        
        for (let i = 0; i < fragments.length; i++) {
            const frag = fragments[i];
            const filename = `${prefix}${keys[i]}-${i}.json`;
            
            // Boring payload - no connection visible!
            const payload = {
                v: 1,
                ts: Date.now(),
                p: frag.data,
                c: frag.checksums
            };
            
            try {
                await this.provider.setFile(filename, JSON.stringify(payload), {
                    message: `Update ${filename}`
                });
                
                results.push({
                    filename,
                    key: keys[i],
                    shard: i
                });
            } catch (e) {
                console.error(`Failed to scatter ${filename}:`, e.message);
            }
        }
        
        return { 
            sequence, 
            keys, 
            fragments: results,
            // Store keys in geometry module for retrieval
            _geo: { sequence, keys }
        };
    }

    /**
     * Retrieve fragments from GitHub - stateless, no manifest!
     */
    async retrieve(sequence, options = {}) {
        const { numFragments = 5, prefix = 'vfragment-' } = options;
        
        // Regenerate lattice keys - SAME calculation, deterministically!
        const keys = this.latticeKeys(sequence, numFragments);
        
        const fragments = [];
        
        for (let i = 0; i < numFragments; i++) {
            const filename = `${prefix}${keys[i]}-${i}.json`;
            
            try {
                const content = await this.provider.getFile(filename);
                
                if (!content) continue;
                
                const record = JSON.parse(content);
                
                fragments.push({
                    shard: i,
                    data: record.p,
                    checksums: record.c
                });
            } catch (e) {
                // File missing or invalid - skip
            }
        }
        
        // Restore original data
        const welded = fragments.length > 0 
            ? fragmenter.weld(fragments)
            : null;
        
        return {
            sequence,
            keys,
            fragments,
            restored: welded ? JSON.parse(welded) : null
        };
    }

    /**
     * Incinerate - overwrite with garbage, destroy linking
     */
    async incinerate(sequence, options = {}) {
        const { numFragments = 5, prefix = 'vfragment-' } = options;
        
        const keys = this.latticeKeys(sequence, numFragments);
        const burned = [];
        
        for (let i = 0; i < numFragments; i++) {
            const filename = `${prefix}${keys[i]}-${i}.json`;
            
            // Overwrite with garbage
            const garbage = {
                _dead: true,
                garbage: Math.random().toString(36)
            };
            
            try {
                await this.provider.setFile(filename, JSON.stringify(garbage), {
                    message: `Cleanup ${filename}`
                });
                burned.push(filename);
            } catch (e) {
                // Already gone is fine
            }
        }
        
        return burned;
    }

    /**
     * Full lifecycle: scatter → retrieve → incinerate
     */
    async deadDrop(data, sequence, options = {}) {
        // 1. Scatter
        const scatterResult = await this.scatter(data, sequence, options);
        
        // 2. Retrieve
        const retrieved = await this.retrieve(sequence, options);
        
        // 3. Incinerate
        const burned = await this.incinerate(sequence, options);
        
        return {
            scattered: scatterResult.fragments.length === (options.numFragments || 5),
            retrieved: !!retrieved.restored,
            burned: burned.length
        };
    }
}

// Export factory function for remote system
function create(config) {
    return new GitHubFragmenter(config);
}

module.exports = {
    create,
    GitHubFragmenter
};