/**
 * lib/do.js - Unified async/sync handler
 * 
 * Pattern: wrap async + sync functions into single unified function
 * Usage: const result = do(work, opts)
 * 
 * @param {Function} work - Core work function, receives (isSync) param
 * @param {object} opts - Options: { sync: boolean }
 * @returns {Promise<any>|any} Result (Promise if async, direct if sync)
 * 
 * Example:
 *   function loadCorpus(opts = {}) {
 *       return do((isSync) => {
 *           // core logic using isSync flag
 *           return isSync ? loadSync() : loadAsync();
 *       }, opts);
 *   }
 */
module.exports = {
    /**
     * Unified handler for sync/async functions
     * @param {Function} work - Function receiving (isSync) boolean
     * @param {object} opts - Options: { sync: boolean }
     * @returns {Promise<any>|any}
     */
    do: (work, opts = {}) => {
        const isSync = opts.sync === true;
        
        if (isSync) {
            return work(true);
        } else {
            return (async () => work(false))();
        }
    },
    
    /**
     * Alias for do()
     */
    run: function(work, opts = {}) {
        const isSync = opts.sync === true;
        
        if (isSync) {
            return work(true);
        } else {
            return (async () => work(false))();
        }
    }
};
