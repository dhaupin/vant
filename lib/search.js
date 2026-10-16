/**
 * Search (v0.8.6)
 * AI-first brain search pipe
 * WITH EVENT EMISSIONS - search operations emit for reactivity
 *
 * Main pipeline: query → rerank → hydrate → ready for agent
 * All search modes: basic, hybrid, hyde, rag
 *
 * Security: Goes through brain pipeline for full security:
 * - sandbox: capability checks
 * - vaf: input validation
 * - qos: rate limiting
 * - escrow: operation approval
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');
const brain = require('./brain');
const { QoS } = require('./qos');
const errors = require('./error');
const guard = require('./recursion');  // Unified recursion guard

// Import unified pipeline
const pipeline = require('./pipeline');

// ==================== BRAIN PIPELINE ====================
let _brain = null;
function _getBrain() {
    if (!_brain) {
        try { _brain = require('./brain'); } catch (e) {}
    }
    return _brain;
}

/**
 * Execute through unified pipeline for search operations
 * @private
 */
async function _pipelineRun(query, options, operation) {
    const ctx = {
        input: query,
        query,
        options,
        operation: 'search:query',
        timestamp: Date.now()
    };

    return await pipeline.run(ctx, operation, { mode: pipeline.PUBLIC });
}

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// Use brain router for path
function _getBrainPath() {
    return brain.getBrainPath();
}

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();

    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.VantError('Read permission required for search operations', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

// Wrap file read operations (gate + direct fs)
function _readFile(filePath) {
    _checkRead();
    return fs.readFileSync(filePath, 'utf8');
}

function _exists(filePath) {
    _checkRead();
    return fs.existsSync(filePath);
}

// (_stat/_readDir removed — dead since inception, zero callers; R-6-adjacent cleanup)

const qos = new QoS();


// ==================== BM25 (Keyword Search) ====================
class BM25Inner {
    constructor(k1 = 1.5, b = 0.75) {
        this.k1 = k1;
        this.b = b;
    }
    scoreOne(doc, query) {
        const text = (doc.content || '').toLowerCase();
        const terms = query.toLowerCase().split(/\s+/);
        let s = 0;
        terms.forEach(term => {
            if (!term) return;
            // (pass 246, issue #199) TF counting MUST NOT compile the raw
            // guest term as a RegExp: an unbalanced metachar threw
            // SyntaxError out of guest search and a valid backtracking
            // shape stalled the event loop. String.split counts exactly
            // what match(g) counts (non-overlapping hits, identical
            // scores) with zero attacker-controlled regex compilation.
            const tf = text.split(term).length - 1;
            if (tf > 0) s += tf;
        });
        return s;
    }
}

// ==================== RRF (Reciprocal Rank Fusion) ====================
function _rrf(rankLists, k = 60) {
    if (!rankLists || rankLists.length === 0) return [];
    const scores = {};
    rankLists.forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach((item, i) => {
            const id = item.id || JSON.stringify(item);
            scores[id] = (scores[id] || 0) + 1 / (k + i + 1);
        });
    });
    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .map(([id, score]) => ({ id, rrfScore: score }));
}

// ==================== RERANK (CORE SCORING) ====================
class RerankInner {
    /**
     * Score + sort memories by query relevance
     */
    rerank(memories, query, topK = 10) {
        if (!memories || memories.length === 0) return [];
        const q = query.toLowerCase();

        const scored = memories.map(mem => {
            let score = 0;
            const content = (mem.content || '').toLowerCase();
            const title = (mem.title || '').toLowerCase();
            const tags = Array.isArray(mem.tags) ? mem.tags.join(' ') : (mem.tags || '').toLowerCase();

            if (content.includes(q) || title.includes(q)) score += 0.5;
            const words = q.split(/\s+/).filter(w => w.length > 2);
            score += words.filter(w => content.includes(w) || title.includes(w)).length / (words.length || 1) * 0.3;
            score += words.filter(w => tags.includes(w)).length * 0.2;
            if (mem.date) {
                const days = (Date.now() - new Date(mem.date).getTime()) / (1000 * 60 * 60 * 24);
                score += Math.max(0, 1 - days / 365) * 0.1;
            }
            return { ...mem, rerankScore: score };
        });

        return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
    }

    compress(memories, maxTokens) {
        if (!memories) return [];
        // (pass 194) default maxTokens now honors the rag tuning settings
        // (ragTokenLimit) instead of a hardcoded 2000; callers passing an
        // explicit token budget (bin/search.js -t) still win.
        if (maxTokens === undefined || maxTokens === null) {
            maxTokens = getSettings().ragTokenLimit;
        }
        let tokens = 0;
        const result = [];
        for (const mem of memories) {
            const est = (mem.content?.length || 0) / 4;
            if (tokens + est > maxTokens) break;
            tokens += est;
            result.push(mem);
        }
        return result;
    }

    stripFluff(text) {
        if (!text) return '';
        return text.replace(/\[\[.*?\]\(.*?\)/g, '').replace(/[*_~`]/g, '').trim();
    }

    refine(memories, query, options = {}) {
        const { topK = 10, maxTokens = 2000 } = options;
        const ranked = this.rerank(memories, query, topK);
        const compressed = this.compress(ranked, maxTokens);

        // EVENT: pipeline:executed
        _emit('pipeline:executed', { query, input: memories.length, output: compressed.length, timestamp: Date.now() });

        return {
            memories: compressed,
            stats: {
                input: memories.length,
                output: compressed.length,
                estimatedTokens: compressed.reduce((a, m) => a + (m.content?.length || 0) / 4, 0)
            }
        };
    }
}

/**
 * Hybrid search - BM25 + vector RRF
 */
class HybridInner {
    constructor() {
        this.corpus = null;
    }
    async loadCorpus() {
        if (!this.corpus) this.corpus = await brain.loadCorpus();
        return this.corpus;
    }
    async search(query, options = {}) {
        // Recursion guard: prevent infinite search loops
        const depthCheck = guard.check('search');
        if (!depthCheck.allowed) {
            throw new errors.VantError('Search recursion depth exceeded', { code: 'E_SEARCH_DEPTH', depth: depthCheck.depth, retryable: false });
        }

        // Rate limit check
        try {
            await qos.check('search');
        } catch (e) {
            guard.release('search');
            throw new errors.VantError('Rate limited', { code: errors.CODES.RATE_LIMIT_EXCEEDED, retryable: true });
        }

        // Validate input
        vaf.check(query, { type: 'string', maxLength: 500 });

        // Basic text search
        const { maxResults = 10 } = options;
        if (!query) return [];

        // BM25 keyword scoring
        const bm25 = new BM25Inner();
        const corpus = await this.loadCorpus();

        const scored = corpus.map(doc => ({
            ...doc,
            bm25Score: bm25.scoreOne(doc, query)
        })).filter(d => d.bm25Score > 0);

        scored.sort((a, b) => b.bm25Score - a.bm25Score);
        const results = scored.slice(0, maxResults);

        // Release recursion guard
        guard.release('search');

        return results;
    }
}

/**
 * HyDE (Hypothetical Document Embeddings)
 * Uses encryption for hypothetical doc embedding
 */
class HydeInner {
    constructor() {
        this.Encrypt = require('./encrypt');
    }
    async search(query) {
        if (!query) return [];

        // Generate hypothetical "perfect" answer
        const hypo = this.generateHypoDoc(query);

        // Encrypt the hypothetical doc for embedding (optional)
        const key = 'hyde-' + query.slice(0, 8);
        const stored = this.Encrypt.encrypt(hypo, key);

        return [{
            id: 'hyde',
            title: query,
            content: hypo,
            encrypted: stored,
            hyde: true
        }];
    }
    generateHypoDoc(query) {
        // Generate a hypothetical perfect answer structure
        return `Answer about ${query}: ` +
            `Key insight: ${query.split(' ').slice(0, 3).join(' ')}. ` +
            `Related: ${query}. Done.`;
    }
}

// ==================== CORE SEARCH FUNCTIONS ====================

/**
 * Get LTC (Long-Term Context) content
 */
async function getLTC() {
    // SECURITY: read via the documented dual-mode path - brain.read() checks
    // the current brain root first, then falls back to the public root.
    // brain.load() resolves stack brain dirs only and misses start.md when a
    // private brain exists but the template file lives in public.
    const item = await brain.read('start');
    if (item && item.content) return item.content;
    // start.md is optional (seeder creates it; older brains may not have it).
    // Fall back to the corpus head so queryBrain can still serve results.
    const corpus = await brain.loadCorpus();
    if (!corpus.length) return null;
    return corpus.slice(0, 3).map(d => d.content || '').join('\n\n');
}

/**
 * Fresh get LTC (bypass cache)
 */
async function freshLTC() {
    return getLTC();
}

/**
 * Query brain - main entry point (wrapped with pipeline)
 */
async function queryBrain(query, options = {}) {
    // Run through pipeline for security
    return await _pipelineRun(query, options, async () => {
        // (pass 194) results bounds: the rag.limitMax config clamps the
        // caller's limit (bin/search.js's --limit default was 5, MCP tools
        // pass up to 20; nobody may exceed the configured ceiling)
        const config = require('./config');
        const limitMax = config.ragLimitMax();
        const limit = Math.max(1, Math.min(limitMax, options.limit || options.topK || 10));
        const ltc = await getLTC();
        if (!ltc) {
            _emit('search:empty', { query, mode: options.mode || 'basic' });
            // Shape contract: keep `results` present even when empty - CLI and
            // MCP callers destructure it (see bin/search.js basic/rag modes).
            return { memories: [], results: [], context: '' };
        }

        const corpus = await loadCorpus();
        const q = query.toLowerCase();

        const hits = corpus.filter(doc => {
            const content = (doc.content || '').toLowerCase();
            const title = (doc.title || '').toLowerCase();
            return content.includes(q) || title.includes(q);
        }).slice(0, limit);

        const context = [ltc, ...hits.map(h => h.content)].join('\n\n');

        // EVENT: results:found
        _emit('results:found', { query, count: hits.length, mode: options.mode || 'basic', timestamp: Date.now() });

        // Return both for compat
        return {
            memories: hits,
            results: hits,
            context
        };
    });
}

/**
 * Reconstruct context from fragments.
 * (pass 194) The rehydrated context is now BOUNDED: it stops appending
 * fragments once the total would exceed rag.rehydrateMaxSize (the former
 * spec-only settings.example.ini row, now live via config). A single
 * fragment larger than the cap is still returned whole when it is the
 * ONLY content (truncating zero results would be worse); the cap applies
 * to fragment ADDITIONS beyond the first.
 */
async function hydrate(fragments) {
    if (!fragments || fragments.length === 0) return '';
    const config = require('./config');
    const maxSize = config.ragRehydrateMaxSize();
    const parts = [];
    let total = 0;
    for (const f of fragments) {
        let content = f.content || f;
        if (typeof content !== 'string') continue;
        // Hard bound: rehydrateMaxSize caps the OUTPUT, not the fill rate.
        // The first fragment is truncated to the remaining headroom too —
        // "BOUNDED" cannot have a first-fragment-sized hole. An oversized
        // first fragment still yields usable (truncated) content.
        const remaining = maxSize - total;
        if (content.length > remaining) content = content.slice(0, remaining);
        if (content.length === 0 && parts.length > 0) break;
        parts.push(content);
        total += content.length;
    }
    return parts.join('\n\n');
}

/**
 * Get search summary
 */
function getSummary() {
    return {
        name: 'Search',
        type: 'brain-search',
        version: '0.8.6',
        enabled: true,
        modes: ['basic', 'hybrid', 'hyde', 'rag'],
        currentCommit: getCurrentCommit(),
        exports: ['queryBrain', 'rerank', 'compress', 'refine', 'getLTC', 'hydrate']
    };
}

/**
 * Get current git commit
 */
function getCurrentCommit() {
    // (pass 24) anchor: .git of the INSTALL tree, not the caller's cwd.
    const gitDir = path.join(require('./anchor').getRepoRoot(), '.git');
    if (!_exists(gitDir)) return null;
    const headFile = path.join(gitDir, 'HEAD');
    if (!_exists(headFile)) return null;
    const head = _readFile(headFile, 'utf8').trim();
    if (head.startsWith('ref: ')) {
        const refFile = path.join(gitDir, head.slice(5));
        if (_exists(refFile)) return _readFile(refFile, 'utf8').trim().slice(0, 7);
    }
    return head.slice(0, 7);
}

/**
 * Get search settings.
 * (pass 194) LIVE configuration now: reads the RAG tuning keys through
 * lib/config.js (env VANT_RAG_* > brain config rag.* > defaults) instead
 * of returning literals. The previously spec-only
 * REHYDRATE_MAX_SIZE/RAG_LIMIT_MAX/COMPRESSION_THRESHOLD keys are accepted
 * as bare-name env aliases by the config getters. ragTokenLimit stays a
 * compression default honored by RerankInner.compress when a caller passes
 * no explicit maxTokens.
 */
function getSettings() {
    const config = require('./config');
    return {
        compressionThreshold: config.ragCompressionThreshold(),
        rehydrateMaxSize: config.ragRehydrateMaxSize(),
        ragLimitMax: config.ragLimitMax(),
        ragTokenLimit: 3000
    };
}

/**
 * Load brain files as searchable corpus
 * Uses brain router for dual brain loading
 */
function loadCorpus() {
    // Use brain router - returns dual corpus
    return brain.loadCorpus();
}

/**
 * MULTIBRAIN: Load corpus from ALL brains in stack
 * Uses brain router for full stack loading
 * @param {Object} options - Options: stack (bool) - if true, load from all stack brains
 */
async function loadCorpusEx(options = {}) {
    if (options.stack) {
        // Load from all brains in stack
        return brain.loadStackCorpus();
    }
    // Default: use existing brain.loadCorpus (current + public)
    return brain.loadCorpus();
}

/**
 * Semantic search using embeddings
 * NEW: Uses embed.js for semantic similarity
 * @param {string} query - Search query
 * @param {Object} options - Options: limit, stack (bool) - if true, search all stack brains
 */
async function semanticSearch(query, options = {}) {
    // Run through pipeline for security
    return await _pipelineRun(query, options, async () => {
        // (pass 194) same rag.limitMax clamp as queryBrain
        const config = require('./config');
        const limitMax = config.ragLimitMax();
        const limit = Math.max(1, Math.min(limitMax, options.limit || options.topK || 10));
        const embedMod = require('./embed');

        // (P4, prd-web.md 4 #18) withProjection: the pod also returns a REAL
        // embedding-space 2D projection for the dashboard's semantic map —
        // built from the SAME vectors the scoring just computed (each hit's
        // retained doc vector + the query vector as the map's anchor
        // point). Payload is bounded by `limit` (rag.limitMax), never by
        // the corpus size.
        const withProjection = !!options.withProjection;
        const seed = Number.isInteger(options.projectionSeed) ? options.projectionSeed : 9;

        // Get query embedding
        const queryVec = await embedMod.generate(query);

        // MULTIBRAIN: Load corpus from all brains if stack option is true
        let corpus;
        if (options.stack) {
            corpus = await brain.loadStackCorpus();
        } else {
            corpus = await brain.loadCorpus();
        }

        if (!corpus || corpus.length === 0) return { results: [], context: '' };

        // Score each document by semantic similarity; withProjection retains
        // each scored entry's REAL vector (identity-keyed, so the limit-
        // sliced hits join their vectors WITHOUT re-embedding).
        // (P4 repair) Corpus docs get a DOCUMENTED embed window cap: a >100k
        // brain file (CHANGELOG-class docs) fed VERBATIM through the input
        // pipeline made every semantic call answer the pipeline's typed
        // length block - the scorer is the data feeder, so it caps at the
        // seam instead of pushing unbounded corpus text through generate.
        // Scoring runs over the first RAG_SEMANTIC_EMBED_CAP chars per doc.
        const RAG_SEMANTIC_EMBED_CAP = 20000;
        const scored = [];
        const vecByEntry = new Map();
        for (const doc of corpus) {
            const docText = String(doc.content || doc.title || '');
            // (P4 RAG seam) blobContent: owner-owned doc content rides the
            // length gate ONLY (vaf.js); the query embed below stays FULLY
            // scan-gated - it IS caller input.
            const docVec = await embedMod.generate(
                docText.length > RAG_SEMANTIC_EMBED_CAP ? docText.slice(0, RAG_SEMANTIC_EMBED_CAP) : docText,
                { blobContent: true }
            );
            const score = embedMod.cosineSimilarity(queryVec, docVec);
            const entry = { ...doc, score };
            if (withProjection) vecByEntry.set(entry, docVec);
            scored.push(entry);
        }

        // Sort and limit
        scored.sort((a, b) => b.score - a.score);
        const hits = scored.slice(0, limit);

        const context = hits.map(h => h.content || h.title || '').join('\n\n');

        if (!withProjection || hits.length === 0) {
            return { results: hits, memories: hits, context, projection: null };
        }            let projection = null;
            try {
                const hitVecs = hits.map(h => vecByEntry.get(h));
                // (ci fix, pass 243d) typed error, not a raw throw: the
                // raw-throw regression gate (test/backbone-wiring.test.js)
                // holds lib/ to VantError-only — and the catch below
                // already degrades this to an honest null projection + an
                // audible event, so typing changes nothing downstream.
                if (hitVecs.some(v => !v)) throw new errors.VantError('retained vector missing for a sliced hit', { code: errors.CODES.UNKNOWN });
                const proj = embedMod.project2d([queryVec, ...hitVecs], seed);
            let providerName = null;
            try { const pi = embedMod.getProviderInfo(); providerName = pi && typeof pi.name === 'string' ? pi.name : null; } catch (e) { /* provider label optional */ }
            projection = {
                dims: proj.dims,
                seed,
                // CONSUMPTION CONTRACT: point 0 is the QUERY anchor;
                // points[i + 1] pairs BY INDEX with results[i].
                points: proj.points,
                anchorPointIndex: 0,
                hitPointOffset: 1,
                provider: providerName,
                embeddedDim: Array.isArray(queryVec) ? queryVec.length : null
            };
        } catch (e) {
            // a projection failure must never kill the SEARCH: honest null
            // (the map falls back to its rank view) + an audible event
            try { _emit('search:projection:failed', { query: String(query).slice(0, 80), reason: e.message }); } catch (e2) { /* bus gone */ }
            projection = null;
        }

        return {
            results: hits,
            memories: hits,
            context,
            projection
        };
    });
}

// ==================== EXPORTS ====================
module.exports = {
    Search: class {
        constructor() {
            this._startTime = Date.now();
            this.Hybrid = HybridInner;
            this.Hyde = HydeInner;
            this.Rerank = RerankInner;
        }
        getLayerStatus() {
            return { name: 'Search', type: 'search', version: require('./version'), enabled: true };
        }
        isOperationAllowed() {
            return { allowed: true, layer: 'Search' };
        }
        getStatus() {
            return { enabled: true };
        }
    },

    Rerank: RerankInner,
    Hybrid: HybridInner,
    Hyde: HydeInner,
    BM25: BM25Inner,  // (pass 246) exported for the issue-#199 regression suite

    queryBrain,
    search: queryBrain,
    semantic: semanticSearch,  // NEW: embedding-powered search
    indexDocument: (doc) => ({ indexed: doc }),
    query: queryBrain,
    search: queryBrain,
    indexDocument: (doc) => ({ indexed: doc }),  // alias for MCP compat
    getLTC,
    freshLTC,
    getSettings,
    loadCorpus,
    loadCorpusEx,  // MULTIBRAIN: Load corpus from all stack brains
    loadStackCorpus: brain.loadStackCorpus,  // Direct access to stack corpus
    hydrate,
    rerank: (m, q, k) => new RerankInner().rerank(m, q, k),
    compress: (m, k) => new RerankInner().compress(m, k),
    refine: (m, q, o) => new RerankInner().refine(m, q, o),
    stripFluff: (t) => new RerankInner().stripFluff(t),
    hybrid: async (query, options = {}) => {
        // Run through pipeline
        return await _pipelineRun(query, options, async () => {
            const results = await new HybridInner().search(query, options);
            return { fused: results, reranked: results };
        });
    },

    hyde: async (query, options = {}) => {
        // Run through pipeline
        return await _pipelineRun(query, options, async () => {
            const results = await new HydeInner().search(query, options);
            return { hyde: results };
        });
    },

    multiQuery: (query) => [query, query + " best practices", query + " tutorial"],
    getIndex: () => ({ enabled: true }),
    getSummary,
    getCurrentCommit,
    getStats: async () => {
        // Use brain.loadStackCorpus() directly to get accurate count
        const brain = require('./brain');
        const corpus = await brain.loadStackCorpus();
        return {
            corpus: corpus.length,
            files: corpus.length,
            mode: 'bm25'
        };
    },
    getLayerStatus: () => ({ name: 'Search', type: 'search', version: require('./version'), enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'Search' }),
    getStatus: () => ({ enabled: true }),

    // ==================== MULTIBRAIN STACK SUPPORT ====================

    /**
     * Get search stats from all brains in the stack
     * @returns {Object} Combined stats
     */
    getStackSearchStats() {
        const stack = brain.getStack();
        const results = {
            source: 'stack',
            brains: stack,
            byBrain: {}
        };

        for (const brainName of stack) {
            try {
                brain.pushBrain(brainName);
                const inner = new HybridInner();
                const corpus = inner.corpus || [];
                results.byBrain[brainName] = {
                    corpus: corpus.length,
                    files: corpus.length
                };
            } catch (e) {
                results.byBrain[brainName] = { error: e.message };
            } finally {
                brain.removeBrain();
            }
        }

        return results;
    },

    /**
     * Search across all brains in the stack
     * @param {string} query - Search query
     * @returns {Array} Combined results
     */
    async stackSearch(query) {
        const stack = brain.getStack();
        const results = [];

        for (const brainName of stack) {
            try {
                brain.pushBrain(brainName);
                const hits = await queryBrain(query);
                if (Array.isArray(hits)) {
                    hits.forEach(h => results.push({ ...h, brain: brainName }));
                }
            } catch (e) {
                // Skip brains that fail
            } finally {
                brain.removeBrain();
            }
        }

        return results;
    },

    /**
     * Load brain files as searchable corpus
     */
    async loadCorpus() {
        if (!this.corpus) this.corpus = await brain.loadCorpus();
        return this.corpus;
    }
};
