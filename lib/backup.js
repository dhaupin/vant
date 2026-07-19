/**
 * Backup Scheduler (v0.8.6)
 * Intelligent backup system supporting multiple formats and strategies
 * 
 * Features:
 * - Multiple backup types: horcrux (SVG), json, incremental
 * - Cron-based scheduled backups
 * - Entropy-based trigger (Nature hit-and-miss engine)
 * - Rotation/retention policies
 * - Horcrux validation before restore
 * - Encryption verification
 * 
 * Backup Types:
 * - horcrux: SVG steganography (default, most secure)
 * - json: Plain JSON backup
 * - incremental: Delta from last backup
 * 
 * Usage:
 *   const backup = require('./lib/backup');
 *   
 *   // Create backup
 *   await backup.create({ type: 'horcrux', outputPath: 'backup.svg' });
 *   
 *   // Validate
 *   await backup.validate('backup.svg');
 *   
 *   // Restore
 *   await backup.restore('backup.svg');
 *   
 *   // Start scheduler
 *   backup.start();
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const BACKUP_TYPES = {
    HORCRUX: 'horcrux',  // SVG steganography (encrypted)
    JSON: 'json',        // Plain JSON
    INCREMENTAL: 'incremental'  // Delta backup
};

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
        if (_nature && _nature.running !== undefined) {
            _nature.running = false;
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
            this._natureInstance.accumulate(amount);
        }
    }
}

// Export singleton
let _instance = null;

module.exports = {
    // Constants
    TYPES: BACKUP_TYPES,
    
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
     * Create a backup (multi-format support)
     * @param {Object} options - { type, outputPath, password, components, incremental }
     */
    async create(options = {}) {
        const transform = require('./transform');
        const vaf = require('./vaf');
        const password = options.password || process.env.VANT_BRAIN_PASSWORD || 'default-backup-2026';
        const type = options.type || 'horcrux';
        
        // VAF: Validate output path
        if (options.outputPath) {
            const pathCheck = vaf.checkPathTraversal(options.outputPath);
            if (pathCheck.blocked) {
                throw new Error('EVIL: Path traversal blocked in backup path');
            }
        }
        
        // Gather data
        const data = await transform.gather(options.components || {});
        
        // Wrap in horcrux format
        const horcruxData = {
            timestamp: Date.now(),
            version: '0.8.6',
            type: 'vant-horcrux',
            backupType: type,
            data
        };
        
        let result;
        
        switch (type) {
            case 'horcrux':
                // SVG steganography (encrypted)
                result = await transform.toHorcrux(options.outputPath, { 
                    password,
                    ...options 
                });
                break;
                
            case 'json':
                // Plain JSON
                const jsonPath = options.outputPath?.replace(/\.svg$/, '.json') || 'backup.json';
                const json = JSON.stringify(horcruxData, null, 2);
                fs.writeFileSync(jsonPath, json, 'utf8');
                result = {
                    path: jsonPath,
                    size: json.length,
                    format: 'json',
                    encrypted: false
                };
                break;
                
            case 'incremental':
                // Delta from last backup
                result = await this._createIncremental(horcruxData, options);
                break;
                
            default:
                throw new Error(`Unknown backup type: ${type}`);
        }
        
        console.log(`[BACKUP] Created: ${result.path} (${result.size} bytes, ${type})`);
        
        // Track backup
        const backup = {
            type,
            path: result.path,
            size: result.size,
            timestamp: Date.now(),
            encrypted: type === 'horcrux'
        };
        _backups.set(backup.timestamp, backup);
        
        return result;
    },
    
    /**
     * Create incremental backup (delta from last backup)
     */
    async _createIncremental(horcruxData, options) {
        // Find last full backup
        const backups = this.list();
        const lastFull = backups.find(b => b.type === 'horcrux');
        
        let baseData = null;
        if (lastFull) {
            try {
                const transform = require('./transform');
                baseData = await transform.fromHorcrux(lastFull.path, { 
                    password: options.password 
                });
            } catch(e) {
                console.warn('[BACKUP] Could not load base for incremental:', e.message);
            }
        }
        
        // Calculate delta
        const delta = this._calculateDelta(baseData, horcruxData.data);
        
        // Save delta
        const deltaPath = options.outputPath?.replace(/\.svg$/, '.delta.json') || 
                         `backup-incremental-${Date.now()}.json`;
        
        const deltaPackage = {
            timestamp: Date.now(),
            version: '0.8.6',
            type: 'vant-horcrux',
            backupType: 'incremental',
            baseTimestamp: lastFull?.timestamp || null,
            delta
        };
        
        fs.writeFileSync(deltaPath, JSON.stringify(deltaPackage, null, 2), 'utf8');
        
        return {
            path: deltaPath,
            size: JSON.stringify(deltaPackage).length,
            format: 'incremental',
            encrypted: false,
            baseTimestamp: lastFull?.timestamp
        };
    },
    
    /**
     * Calculate delta between two datasets
     */
    _calculateDelta(oldData, newData) {
        const delta = {};
        
        for (const [key, newValue] of Object.entries(newData)) {
            if (!oldData || oldData[key] === undefined) {
                delta[key] = { op: 'add', value: newValue };
            } else if (JSON.stringify(oldData[key]) !== JSON.stringify(newValue)) {
                delta[key] = { op: 'update', value: newValue };
            }
        }
        
        return delta;
    },
    
    /**
     * Legacy: Create a one-time backup (horcrux default)
     */
    async backup(options = {}) {
        return this.create({ ...options, type: 'horcrux' });
    },
    
    /**
     * Validate a backup file (with encryption check)
     */
    async validate(backupPath, options = {}) {
        const transform = require('./transform');
        
        // Use new file validator
        const result = await transform.validateHorcruxFile(backupPath, {
            password: options.password || process.env.VANT_BRAIN_PASSWORD,
            checkEncryption: options.checkEncryption !== false,
            strictVersion: options.strictVersion
        });
        
        return result;
    },
    
    /**
     * List all backups
     */
    list() {
        return Array.from(_backups.values())
            .sort((a, b) => b.timestamp - a.timestamp);
    },
    
    /**
     * Get backup info
     */
    async info(backupPath) {
        const fs = require('fs');
        const transform = require('./transform');
        
        if (!fs.existsSync(backupPath)) {
            return { valid: false, error: 'File not found' };
        }
        
        const stats = fs.statSync(backupPath);
        const ext = path.extname(backupPath).toLowerCase();
        
        const info = {
            path: backupPath,
            size: stats.size,
            format: ext === '.svg' ? 'steganography' : ext === '.json' ? 'json' : 'unknown',
            created: stats.birthtime,
            modified: stats.mtime
        };
        
        // Try to get timestamp from content
        try {
            if (ext === '.svg') {
                const validation = await transform.validateHorcruxFile(backupPath, {
                    password: process.env.VANT_BRAIN_PASSWORD
                });
                info.timestamp = validation.timestamp;
                info.version = validation.version;
                info.valid = validation.valid;
            } else if (ext === '.json') {
                const content = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
                info.timestamp = content.timestamp;
                info.version = content.version;
                info.backupType = content.backupType;
            }
        } catch(e) {
            info.error = e.message;
        }
        
        return info;
    }
};
