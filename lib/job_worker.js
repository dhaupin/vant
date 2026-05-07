/**
 * Vant JobWorker Class
 * Background job processing
 */

const events = require('events');

class JobWorker extends events.EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            concurrency: options.concurrency || 1,
            ...options
        };
        this._jobs = [];
        this._running = 0;
        this._startTime = Date.now();
    }
    
    /**
     * Add job to queue
     */
    add(name, handler, payload = {}) {
        this._jobs.push({ name, handler, payload, status: 'pending', addedAt: Date.now() });
        this._process();
        return this;
    }
    
    /**
     * Process jobs
     */
    async _process() {
        while (this._running < this.options.concurrency && this._jobs.some(j => j.status === 'pending')) {
            const job = this._jobs.find(j => j.status === 'pending');
            if (!job) break;
            
            job.status = 'running';
            this._running++;
            
            try {
                await job.handler(job.payload);
                job.status = 'completed';
                this.emit('job:completed', job);
            } catch (e) {
                job.status = 'failed';
                job.error = e.message;
                this.emit('job:failed', job);
            }
            
            this._running--;
        }
    }
    
    /**
     * Get job stats
     */
    stats() {
        return {
            total: this._jobs.length,
            pending: this._jobs.filter(j => j.status === 'pending').length,
            running: this._running,
            completed: this._jobs.filter(j => j.status === 'completed').length,
            failed: this._jobs.filter(j => j.status === 'failed').length
        };
    }
    
    /**
     * Clear completed jobs
     */
    clear() {
        this._jobs = this._jobs.filter(j => j.status !== 'completed' && j.status !== 'failed');
        return this;
    }
    
    getLayerStatus() { return { name: 'JobWorker', type: 'infra', enabled: true, config: { concurrency: this.options.concurrency }, state: this.stats() }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'JobWorker' }; }
    getStatus() { return { enabled: true, ...this.stats() }; }
}

module.exports = {
    JobWorker, create: (o) => new JobWorker(o),
    add: (n, h, p) => new JobWorker().add(n, h, p),
    stats: () => new JobWorker().stats(),
    clear: () => new JobWorker().clear(),
    getLayerStatus: () => ({ name: 'JobWorker', type: 'infra', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'JobWorker' }),
    getStatus: () => ({ enabled: true })
};