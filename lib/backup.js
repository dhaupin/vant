const errors = require('./error');
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

// (R-2 assessment) Backup artifacts are mixed: SVG horcrux images are BINARY
// (stego pixel data — FileStorage.read is utf8-only, so those stay on fs per
// prd-storage.md standard #7); JSON artifacts (delta packages, plain JSON
// backups) route through storage.atomicWrite. Scheduled backups anchor at
// config.backupPath (models/backup); all caller-supplied paths pass
// vaf.checkPathTraversal. List/info use fs stat (metadata limitation).
const _backupModelsRoot = path.resolve(process.cwd(), 'models');

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

function _getEvent() {
    if (!_event) {
        try { _event = require('./event'); } catch (e) {}
    }
    return _event;
}

// (pass 24) Lazy transform accessor. The module-level _transform was only
// initialized inside start(), so restore() crashed on a scheduler that was
// never started (bin/backup.js restore path).
function _getTransform() {
    if (!_transform) {
        _transform = require('./transform');
    }
    return _transform;
}

function _emit(event, data) {
    const ev = _getEvent();
    if (ev && ev.emit) {
        ev.emit(event, data);
    }
}

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
     * (anchored: relative backupPath resolves against the models root, not cwd)
     */
    _ensureBackupDir() {
        const backupPath = path.isAbsolute(this.config.backupPath)
            ? this.config.backupPath
            : path.resolve(_backupModelsRoot, this.config.backupPath);
        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }
        return backupPath;
    }

    /**
     * Run a backup
     */
    async _runBackup(id) {
        if (!this._running) return;

        const timestamp = Date.now();
        const filename = `backup-${id}-${timestamp}.svg`;
        const filepath = path.join(this._ensureBackupDir(), filename);

        console.log(`[BACKUP] Starting backup: ${id}`);
        this.emit('backup-start', { id, timestamp });
        _emit('backup:start', { id, timestamp });

        try {
            // Create horcrux
            const horcruxData = await _transform.toHorcrux({
                password: this._getPassword(),
                outputPath: filepath
            });

            // Validate the created horcrux
            if (this.config.validateOnRestore) {
                const validation = _transform.validateHorcruxData(JSON.parse(horcruxData));
                if (!validation.valid) {
                    throw new errors.VantError('Validation failed', { code: errors.CODES.VALIDATION_FAILED });
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
            _emit('backup:complete', backup);

            return backup;
        } catch(e) {
            console.error(`[BACKUP] Failed: ${id}`, e.message);
            this.emit('backup-error', { id, error: e.message });
            _emit('backup:error', { id, error: e.message });
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
        return process.env.VANT_BRAIN_PASSWORD;
    }

    /**
     * List all backups
     */
    list() {
        return Array.from(_backups.values())
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Restore from a backup (pass 24: fixed + validated)
     *
     * Fixes vs pre-pass-24:
     * - `data` was block-scoped inside the validation `if` but referenced
     *   after it — every restore threw ReferenceError before doing anything.
     * - `_transform` was only initialized by start(); a CLI restore on a
     *   non-started scheduler crashed. Now lazily loaded.
     * - The backup file is ALWAYS validated (decoded + checked) before any
     *   restore, matching the "Horcrux validation before restore" promise in
     *   the module header. validateOnRestore=false only skips the *extra*
     *   validation pass on already-decoded data, never the decode itself.
     */
    async restore(backupPath, options = {}) {
        const transform = _getTransform();

        // Decode + validate the backup artifact first. This is the real
        // gate: wrong password / corrupted SVG / truncated JSON all fail
        // here, before any brain state is touched.
        const data = await transform.fromHorcrux(backupPath, options);
        const validation = transform.validateHorcruxData(data);
        if (!validation.valid) {
            throw new errors.VantError('Backup validation failed: ' + (validation.errors || []).join('; '), { code: errors.CODES.VALIDATION_FAILED });
        }
        if (validation.warnings.length > 0) {
            console.warn('[BACKUP] Validation warnings:', validation.warnings.join('; '));
        }

        // Optional second pass over the decoded data (config off = trust the
        // decode+validate above; never a way to skip reading the file).
        if (this.config.validateOnRestore) {
            console.log('[BACKUP] Validation passed, restoring...');
        }

        return transform.restore(data);
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
     * Restore from a backup file (pass 24: was MISSING from exports —
     * bin/backup.js's `if (mod.restore)` was always false, so `vant backup
     * restore` printed 'Restoring from: X' and exited 0 having done nothing.
     * Delegates to the scheduler instance's real restore.)
     */
    async restore(backupPath, options = {}) {
        return this.getInstance().restore(backupPath, options);
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
        const password = options.password || process.env.VANT_BRAIN_PASSWORD;
        const type = options.type || 'horcrux';

        // VAF: Validate output path (require a path for path-based formats)
        if (options.outputPath) {
            const pathCheck = vaf.checkPathTraversal(options.outputPath);
            if (pathCheck.blocked) {
                throw new errors.VantError('VAF: Path traversal blocked in backup path', { code: errors.CODES.SECURITY_PATH_TRAVERSAL });
            }
        } else if (type === 'horcrux' || type === 'json') {
            throw new errors.VantError('outputPath is required for ' + type + ' backups', { code: errors.CODES.VAF_REQUIRED_FIELD });
        }

        // Gather data
        const data = await transform.gather(options.components || {});

        // Wrap in horcrux format
        const horcruxData = {
            timestamp: Date.now(),
            version: require('./version'),
            type: 'vant-horcrux',
            backupType: type,
            data
        };

        let result;

        switch (type) {
            case 'horcrux': {
                // SVG steganography (encrypted)
                // (pass 25) backup-safety via lib/horcrux-safe (same contract
                // as `vant horcrux refresh`): when the target EXISTS, encode
                // to a sibling tmp, round-trip validate (decode + structure),
                // THEN rename over it — a failed encode can no longer destroy
                // the only good backup. New targets are also round-trip
                // checked (a fresh backup that can't decrypt is worthless).
                //
                // backup's relative outputPath is CWD-relative BY DESIGN (the
                // user's project) — pass anchorRoot: process.cwd() so the
                // tmp/rename dance happens there, not in the install tree.
                // Keep relTarget RELATIVE: toHorcrux vaf-blocks absolute
                // paths, and the helper's encode callbacks must receive what
                // it resolves (no chdir needed when anchorRoot === cwd).
                const { safeWriteHorcrux } = require('./horcrux-safe');
                // Helper-only keys are stripped from what the encode/decode
                // callbacks forward into transform — a future anchorRoot or
                // label option there would otherwise silently change behavior.
                const { anchorRoot, label, encode, decode, validate, log, skipDecodeOnNew, ...toHorcruxOpts }
                    = { ...options, password };
                const safe = await safeWriteHorcrux(options.outputPath, {
                    ...toHorcruxOpts,
                    anchorRoot: process.cwd(),
                    label: 'backup',
                    encode: (rel, o) => transform.toHorcrux(rel, o),
                    decode: (rel, o) => transform.validateHorcruxFile(rel, { password: o.password }),
                    validate: (check) => (check && check.valid !== false)
                        ? true
                        : { valid: false, errors: [check && check.error || 'unknown'] }
                });
                // encode() ran against the tmp path in the replaced case —
                // size comes from the helper's stat of the FINAL file; path
                // stays in the caller-supplied form (old output shape).
                result = {
                    ...(safe.result || {}),
                    path: options.outputPath,
                    size: safe.size || (safe.result && safe.result.size) || 0,
                    format: (safe.result && safe.result.format) || 'steganography',
                    replaced: safe.replaced
                };
                break;
            }

            case 'json':
                // Plain JSON (R-2: atomic write via storage utility)
                const jsonPath = options.outputPath?.replace(/\.svg$/, '.json') || 'backup.json';
                const json = JSON.stringify(horcruxData, null, 2);
                require('./storage').atomicWrite(jsonPath, json);
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
                throw new errors.VantError('Unknown backup type', { code: errors.CODES.VAF_INPUT_INVALID });
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

        // Save delta (R-2: atomic write via storage utility; deltaPath is
        // vaf-checked above when caller-supplied via options.outputPath)
        const deltaPath = options.outputPath?.replace(/\.svg$/, '.delta.json') ||
                         path.join(this.config.backupPath, `backup-incremental-${Date.now()}.json`);

        require('./storage').atomicWrite(deltaPath, JSON.stringify(deltaPackage, null, 2));

        const deltaPackage = {
            timestamp: Date.now(),
            version: require('./version'),
            type: 'vant-horcrux',
            backupType: 'incremental',
            baseTimestamp: lastFull?.timestamp || null,
            delta
        };

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
    },

    // Multibrain
    getBrainBackupConfig,
    setBrainBackupConfig,

    // Multibrain Stack
    getStackBackupConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainBackupConfigs = {};

function getBrainBackupConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainBackupConfigs[brainName] || { enabled: true, interval: 3600000 };
}

function setBrainBackupConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainBackupConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackBackupConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const config = getBrainBackupConfig();
            results.byBrain[brainName] = config;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}
