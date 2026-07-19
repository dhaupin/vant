/**
 * Backup Scheduler (v0.8.6)
 * Intelligent backup scheduling using cron + nature/entropy
 * 
 * Features:
 * - Cron-based scheduled backups
 * - Entropy-based trigger (Nature hit-and-miss engine)
 * - Rotation/retention policies
 * - Horcrux validation before restore
 * 
 * Usage:
 *   const backup = require('./lib/backup');
 *   backup.start();  // Start scheduler
 *   backup.stop();   // Stop scheduler
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

let _cron = null;
let _nature = null;
let _transform = null;
let _config = null;
let _running = false;
let _schedules = new Map();
let _backups = new Map();
let _event = null;

const DEFAULT_CONFIG = {
    enabled: true,
    schedules: [
        { id: 'daily', cron: '0 2 * * *', retention: 7 },    // 2am daily, keep 7
        { id: 'weekly', cron: '0 3 * * 0', retention: 4 }    // 3am Sunday, keep 4
    ],
    entropyThreshold: 50,   // Nature threshold for backup
    entropyDecay: 0.3,     // How fast chaos accumulates
    maxBackups: 10,         // Max total backups
    backupPath: 'models/backup',
    validateOnRestore: true
};

class BackupScheduler extends EventEmitter {
    constructor(options = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...options };
        this._jobs = new Map();
    }
    
    /**
     * Start the backup scheduler
     */
    start() {
        if (this._running) return;
        this._running = true;
        
        console.log('[BACKUP] Starting scheduler...');
        
        // Load cron
        if (!_cron) {
            try { _cron = require('./cron'); } catch(e) {
                console.warn('[BACKUP] Cron not available:', e.message);
            }
        }
        
        // Load nature for entropy-based triggers
        if (!_nature) {
            try { _nature = require('./nature'); } catch(e) {
                console.warn('[BACKUP] Nature not available:', e.message);
            }
        }
        
        // Load transform for horcrux
        if (!_transform) {
            try { _transform = require('./transform'); } catch(e) {
                console.error('[BACKUP] Transform required for backups!');
                return;
            }
        }
        
        // Setup cron schedules
        this._setupCronSchedules();
        
        // Setup nature entropy trigger
        this._setupNatureTrigger();
        
        // Ensure backup directory exists
        this._ensureBackupDir();
        
        console.log('[BACKUP] Scheduler started');
        this.emit('started');
    }
    
    /**
     * Stop the backup scheduler
     */
    stop() {
        this._running = false;
        
        // Cancel cron jobs
        for (const [id, job] of this._jobs) {
            if (job.cancel) job.cancel();
        }
        this._jobs.clear();
        
        // Stop nature
        if (_nature) {
            _nature.stop();
        }
        
        console.log('[BACKUP] Scheduler stopped');
        this.emit('stopped');
    }
    
    /**
     * Setup cron-based scheduled backups
     */
    _setupCronSchedules() {
        if (!_cron || !this.config.schedules) return;
        
        for (const schedule of this.config.schedules) {
            try {
                const job = _cron.schedule(schedule.cron, async () => {
                    await this._runBackup(schedule.id);
                }, { id: `backup-${schedule.id}` });
                
                this._jobs.set(schedule.id, job);
                console.log(`[BACKUP] Scheduled: ${schedule.id} (${schedule.cron})`);
            } catch(e) {
                console.error(`[BACKUP] Failed to schedule ${schedule.id}:`, e.message);
            }
        }
    }
    
    /**
     * Setup nature entropy-based backup trigger
     */
    _setupNatureTrigger() {
        if (!_nature) return;
        
        // Create nature instance for backup triggers
        const nature = new _nature({
            threshold: this.config.entropyThreshold,
            decay: this.config.entropyDecay
        });
        
        // Listen for spark events (when momentum drops below threshold)
        nature.on('spark', async () => {
            console.log('[BACKUP] Entropy threshold reached - triggering backup');
            await this._runBackup('entropy');
        });
        
        nature.start();
        this._natureInstance = nature;
        
        console.log(`[BACKUP] Nature trigger active (threshold: ${this.config.entropyThreshold})`);
    }
    
    /**
     * Ensure backup directory exists
     */
    _ensureBackupDir() {
        const backupPath = this.config.backupPath;
        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }
    }
    
    /**
     * Run a backup
     */
    async _runBackup(id) {
        if (!this._running) return;
        
        const timestamp = Date.now();
        const filename = `backup-${id}-${timestamp}.svg`;
        const filepath = path.join(this.config.backupPath, filename);
        
        console.log(`[BACKUP] Starting backup: ${id}`);
        this.emit('backup-start', { id, timestamp });
        
        try {
            // Create horcrux
            const horcruxData = await _transform.toHorcrux({
                password: this._getPassword(),
                outputPath: filepath
            });
            
            // Validate the created horcrux
            if (this.config.validateOnRestore) {
                const validation = _transform.validateHorcrux(JSON.parse(horcruxData));
                if (!validation.valid) {
                    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
                }
            }
            
            // Track backup
            const backup = {
                id,
                timestamp,
                filepath,
                size: fs.statSync(filepath).size,
                validated: true
            };
            _backups.set(timestamp, backup);
            
            // Apply retention policy
            await this._applyRetention(id);
            
            console.log(`[BACKUP] Completed: ${id} (${backup.size} bytes)`);
            this.emit('backup-complete', backup);
            
            return backup;
        } catch(e) {
            console.error(`[BACKUP] Failed: ${id}`, e.message);
            this.emit('backup-error', { id, error: e.message });
            throw e;
        }
    }
    
    /**
     * Apply retention policy
     */
    async _applyRetention(scheduleId) {
        const schedule = this.config.schedules?.find(s => s.id === scheduleId);
        const retention = schedule?.retention || this.config.maxBackups;
        
        // Get backups for this schedule
        const backups = Array.from(_backups.values())
            .filter(b => b.id === scheduleId)
            .sort((a, b) => b.timestamp - a.timestamp);
        
        // Delete old backups beyond retention
        if (backups.length > retention) {
            const toDelete = backups.slice(retention);
            for (const backup of toDelete) {
                try {
                    fs.unlinkSync(backup.filepath);
                    _backups.delete(backup.timestamp);
                    console.log(`[BACKUP] Deleted old backup: ${path.basename(backup.filepath)}`);
                } catch(e) {
                    console.warn(`[BACKUP] Could not delete ${backup.filepath}:`, e.message);
                }
            }
        }
    }
    
    /**
     * Get password from environment or config
     */
    _getPassword() {
        return process.env.VANT_BRAIN_PASSWORD || 'default-backup-2026';
    }
    
    /**
     * List all backups
     */
    list() {
        return Array.from(_backups.values())
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    
    /**
     * Restore from a backup
     */
    async restore(backupPath, options = {}) {
        if (this.config.validateOnRestore) {
            // First validate
            const data = await _transform.fromHorcrux(backupPath, options);
            const validation = _transform.validateHorcrux(data);
            
            if (!validation.valid) {
                throw new Error(`Backup validation failed: ${validation.errors.join(', ')}`);
            }
            
            console.log('[BACKUP] Validation passed, restoring...');
        }
        
        return _transform.restore(data);
    }
    
    /**
     * Add chaos to nature (for entropy-based triggers)
     */
    addChaos(amount = 1) {
        if (this._natureInstance) {
            this._natureInstance.addChaos(amount);
        }
    }
}

// Export singleton
let _instance = null;

module.exports = {
    /**
     * Get or create backup scheduler instance
     */
    getInstance(options = {}) {
        if (!_instance) {
            _instance = new BackupScheduler(options);
        }
        return _instance;
    },
    
    /**
     * Create and start backup scheduler
     */
    start(options = {}) {
        const scheduler = this.getInstance(options);
        scheduler.start();
        return scheduler;
    },
    
    /**
     * Stop backup scheduler
     */
    stop() {
        if (_instance) {
            _instance.stop();
        }
    },
    
    /**
     * Create a one-time backup
     */
    async backup(options = {}) {
        const transform = require('./transform');
        const password = options.password || process.env.VANT_BRAIN_PASSWORD || 'default-backup-2026';
        
        // Correct signature: toHorcrux(outputPath, options)
        const result = await transform.toHorcrux(options.outputPath, { password });
        
        // Result is { embedded, path, size, format } object
        console.log(`[BACKUP] Created: ${result.path} (${result.size} bytes)`);
        return result;
    },
    
    /**
     * Validate a backup file
     */
    async validate(horcruxPath, options = {}) {
        const transform = require('./transform');
        const password = options.password || process.env.VANT_BRAIN_PASSWORD || 'default-backup-2026';
        const data = await transform.fromHorcrux(horcruxPath, { password });
        return transform.validateHorcrux(data);
    }
};
