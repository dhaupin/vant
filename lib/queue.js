/**
 * Vant Queue Class
 * 
 * Async task queue with concurrency control
 * Background jobs, deferred execution
 * 
 * Usage:
 *   const queue = require('./queue');
 *   
 *   // Add job
 *   const jobId = await queue.add(myAsyncFunction, { retries: 1 });
 *   
 *   // Start processing
 *   await queue.process();
 *   
 *   // Check allowed
 *   queue.isOperationAllowed('read');
 *   queue.getLayerStatus();
 */

/**
 * Job states
 */
const JobState = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRY: 'retry'
};

/**
 * Job Class
 */
class Job {
    constructor(fn, options = {}) {
        this.id = options.id || `job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this.fn = fn;
        this.options = {
            retries: options.retries || 0,
            timeout: options.timeout || 30000,
            priority: options.priority || 0,
            ...options
        };
        
        this.state = JobState.PENDING;
        this.result = null;
        this.error = null;
        this.attempts = 0;
        this.createdAt = Date.now();
        this.startedAt = null;
        this.completedAt = null;
    }
    
    async execute() {
        this.state = JobState.RUNNING;
        this.attempts++;
        this.startedAt = Date.now();
        
        try {
            // Execute with timeout
            const timeout = this.options.timeout;
            const result = await Promise.race([
                this.fn(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), timeout)
                )
            ]);
            
            this.result = result;
            this.state = JobState.COMPLETED;
            this.completedAt = Date.now();
            
            return result;
        } catch (err) {
            this.error = err;
            
            // Retry if attempts left
            if (this.attempts < this.options.retries + 1) {
                this.state = JobState.RETRY;
            } else {
                this.state = JobState.FAILED;
                this.completedAt = Date.now();
            }
            
            throw err;
        }
    }
}

/**
 * Queue Class
 * Provides async task queue
 */
class Queue {
    /**
     * Create Queue instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            concurrency: options.concurrency || 1,
            maxSize: options.maxSize || 1000,
            autoProcess: options.autoProcess !== false,
            interval: options.interval || 1000,
            ...options
        };
        
        // Job storage
        this._jobs = new Map(); // id → Job
        this._pending = []; // Pending job IDs (priority queue)
        this._running = new Set(); // Running job IDs
        
        // Stats
        this._stats = {
            added: 0,
            completed: 0,
            failed: 0,
            retries: 0
        };
        
        // Processing
        this._processing = false;
        this._processor = null;
        
        // State
        this._startTime = Date.now();
    }
    
    /**
     * Add job to queue
     */
    async add(fn, options = {}) {
        // Check capacity
        if (this._jobs.size >= this.options.maxSize) {
            throw new Error('Queue full');
        }
        
        const job = new Job(fn, options);
        this._jobs.set(job.id, job);
        this._insertPending(job);
        
        this._stats.added++;
        
        // Auto-process if enabled
        if (this.options.autoProcess && !this._processing) {
            this.process();
        }
        
        return job.id;
    }
    
    /**
     * Insert job into pending (priority queue)
     */
    _insertPending(job) {
        // Find insertion point based on priority
        let i = this._pending.length;
        while (i > 0) {
            const prev = this._jobs.get(this._pending[i - 1]);
            if (prev.options.priority >= job.options.priority) break;
            i--;
        }
        this._pending.splice(i, 0, job.id);
    }
    
    /**
     * Get next pending job
     */
    _nextPending() {
        if (this._pending.length === 0) return null;
        return this._pending[0];
    }
    
    /**
     * Process jobs
     */
    async process() {
        if (this._processing) return;
        this._processing = true;
        
        while (this._running.size < this.options.concurrency) {
            const jobId = this._nextPending();
            if (!jobId) break;
            
            const job = this._jobs.get(jobId);
            if (!job || job.state !== JobState.PENDING) {
                this._pending.shift();
                continue;
            }
            
            // Start job
            this._pending.shift();
            this._running.add(jobId);
            
            this._runJob(job).catch(err => {
                console.error(`Job ${job.id} failed:`, err.message);
            });
        }
        
        this._processing = false;
    }
    
    /**
     * Run job
     */
    async _runJob(job) {
        try {
            await job.execute();
            this._stats.completed++;
        } catch (err) {
            if (job.state === JobState.RETRY) {
                this._stats.retries++;
                // Re-queue
                this._insertPending(job);
            } else {
                this._stats.failed++;
            }
        } finally {
            this._running.delete(job.id);
        }
    }
    
    /**
     * Get job by ID
     */
    get(jobId) {
        return this._jobs.get(jobId);
    }
    
    /**
     * Get job status
     */
    getJobStatus(jobId) {
        const job = this._jobs.get(jobId);
        if (!job) return null;
        
        return {
            id: job.id,
            state: job.state,
            result: job.result,
            error: job.error?.message,
            attempts: job.attempts,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt
        };
    }
    
    /**
     * Get queue stats
     */
    getStats() {
        return {
            ...this._stats,
            pending: this._pending.length,
            running: this._running.size,
            total: this._jobs.size,
            maxSize: this.options.maxSize,
            concurrency: this.options.concurrency
        };
    }
    
    /**
     * Clear completed jobs
     */
    clear(completed = true) {
        for (const [id, job] of this._jobs) {
            if (completed && job.state === JobState.COMPLETED) {
                this._jobs.delete(id);
            } else if (!completed && job.state === JobState.FAILED) {
                this._jobs.delete(id);
            }
        }
        this._pending = this._pending.filter(id => this._jobs.has(id));
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Queue',
            type: 'queue',
            enabled: true,
            config: {
                concurrency: this.options.concurrency,
                maxSize: this.options.maxSize,
                autoProcess: this.options.autoProcess
            },
            state: {
                pending: this._pending.length,
                running: this._running.size,
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        const isFull = this._jobs.size >= this.options.maxSize;
        
        if (operationType === 'write' && isFull) {
            return {
                allowed: false,
                reason: 'queue_full',
                layer: 'Queue'
            };
        }
        
        return {allowed: true, layer: 'Queue'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            enabled: true,
            pending: this._pending.length,
            running: this._running.size
        };
    }
}

/**
 * Default Queue instance
 */
const defaultQueue = new Queue();

module.exports = {
    // Class
    Queue,
    Job,
    JobState,
    
    /**
     * Create Queue instance
     */
    create(options = {}) {
        return new Queue(options);
    },
    
    // Methods
    add(fn, options) {
        return defaultQueue.add(fn, options);
    },
    
    process() {
        return defaultQueue.process();
    },
    
    get(jobId) {
        return defaultQueue.get(jobId);
    },
    
    getJobStatus(jobId) {
        return defaultQueue.getJobStatus(jobId);
    },
    
    getStats() {
        return defaultQueue.getStats();
    },
    
    clear(completed) {
        return defaultQueue.clear(completed);
    },
    
    // Class methods
    getLayerStatus() {
        return defaultQueue.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultQueue.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultQueue.getStatus();
    }
};