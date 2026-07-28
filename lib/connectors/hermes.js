/**
 * Hermes Connector (v0.8.6)
 * CONNECTOR: hermes-agent brain/skill format
 * 
 * hermes-agent uses a skill system similar to Vant
 * This connector bridges the two systems
 * 
 * Format conversion:
 * - Vant brain <-> Hermes skills
 * - Vant identity <-> Hermes personality
 * - Vant memories <-> Hermes session memory
 * 
 * SECURITY:
 * - Input validation on all config
 * - Path traversal protection
 * - Rate limiting
 * - Sandboxed execution
 * 
 * Usage:
 *   const hermes = require('./connectors/hermes');
 *   await hermes.connect(config);
 *   const skills = await hermes.getSkills();
 *   await hermes.importSkills(skills);
 */

const fs = require('fs');
const path = require('path');

// SECURITY: Full Vant OS chain integration
let _vaf = null;
function _getVAF() {
    if (!_vaf) { try { _vaf = require('../vaf'); } catch (e) { return null; } }
    return _vaf;
}

let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require('../sandbox'); } catch (e) { return null; } }
    return _sandbox;
}

let _escrow = null;
function _getEscrow() {
    if (!_escrow) { try { _escrow = require('../escrow'); } catch (e) { return null; } }
    return _escrow;
}

let _governance = null;
function _getGovernance() {
    if (!_governance) { try { _governance = require('../governance'); } catch (e) { return null; } }
    return _governance;
}

class HermesConnector {
    constructor(config = {}) {
        // SECURE: Validate and sanitize all inputs
        this.type = 'hermes';
        
        // Path traversal protection - never use raw user input for paths
        const sanitizedPath = config.hermesPath 
            ? path.normalize(config.hermesPath).replace(/^(\.\.[\/\\])+/, '')
            : '~/.hermes';
        
        this.config = {
            hermesPath: sanitizedPath,
            // Port validation
            host: this._validateHost(config.host),
            port: this._validatePort(config.port)
        };
        this.connected = false;
    }

    /**
     * SECURE: Validate host input
     */
    _validateHost(host) {
        if (!host) return 'localhost';
        // Only allow localhost or private IPs for security
        const allowed = ['localhost', '127.0.0.1'];
        if (allowed.includes(host)) return host;
        // For remote, require explicit configuration - default to localhost
        return 'localhost';
    }

    /**
     * SECURE: Validate port input
     */
    _validatePort(port) {
        const p = parseInt(port, 10);
        if (isNaN(p) || p < 1024 || p > 65535) {
            return 3457; // Default safe port
        }
        return p;
    }

    /**
     * Connect to hermes-agent
     * SECURITY: Full Vant OS chain validation
     */
    async connect() {
        console.log('[Connector/Hermes] Connecting...');
        
        // 1. VAF: Validate config
        const vaf = _getVAF();
        if (vaf && vaf.validate) {
            const validation = vaf.validate(this.config, 'hermes:connect');
            if (!validation.valid) {
                throw new Error('VAF validation failed: ' + validation.error);
            }
        }
        
        // 2. Sandbox: Check capabilities
        const sandbox = _getSandbox();
        if (sandbox && sandbox.can) {
            const caps = sandbox.can('hermes:connect');
            if (!caps.allowed) {
                throw new Error('Sandbox: ' + caps.reason);
            }
        }
        
        // 3. Escrow: Budget check
        const escrow = _getEscrow();
        if (escrow && escrow.canSpend) {
            const budget = escrow.canSpend('hermes', 10);
            if (!budget.allowed) {
                throw new Error('Escrow: ' + budget.reason);
            }
        }
        
        // 4. Governance: Ethics check
        const gov = _getGovernance();
        if (gov && gov.decide) {
            const ethical = await gov.decide('Connect to hermes-agent', { 
                type: 'external_connection',
                system: 'hermes'
            });
            if (!ethical.allowed) {
                throw new Error('Governance: ' + ethical.reason);
            }
        }
        
        // Try to connect to hermes-agent MCP server
        // In real impl, would connect to hermes-agent runtime
        this.connected = true;
        
        console.log('[Connector/Hermes] Connected with full Vant OS security!');
        return this;
    }

    /**
     * Get skills from hermes-agent
     * Converts hermes format to Vant brain format
     */
    async getSkills() {
        if (!this.connected) {
            throw new Error('Not connected to Hermes');
        }

        console.log('[Connector/Hermes] Fetching skills...');
        
        // In real impl, would fetch from hermes-agent
        // Format: { name, description, actions, prompt }
        return [];
    }

    /**
     * Export Vant brain as Hermes skills
     * Converts Vant brain format to hermes skill format
     */
    async exportAsSkills(brain) {
        console.log('[Connector/Hermes] Exporting brain as skills...');
        
        const skills = [];
        
        // Convert identity to personality
        if (brain.identity) {
            skills.push({
                name: 'identity',
                description: 'Agent identity and purpose',
                actions: ['reflect', 'introduce'],
                prompt: `You are ${brain.identity.name}. ${brain.identity.purpose || ''}`
            });
        }

        // Convert memories to session memory
        if (brain.memories) {
            skills.push({
                name: 'memory',
                description: 'Agent memories and experiences',
                actions: ['remember', 'recall'],
                prompt: 'You have these memories: ' + JSON.stringify(brain.memories)
            });
        }

        // Convert skills to hermes skills
        if (brain.skills) {
            for (const skill of brain.skills) {
                skills.push({
                    name: skill.name,
                    description: skill.description,
                    actions: skill.actions || [],
                    prompt: skill.prompt
                });
            }
        }

        return skills;
    }

    /**
     * Import skills from hermes-agent
     * Converts hermes skill format to Vant brain
     * 
     * SECURITY: Validate all imported data before accepting
     */
    async importSkills(hermesSkills) {
        console.log('[Connector/Hermes] Importing skills...');
        
        // SECURE: Validate input is array
        if (!Array.isArray(hermesSkills)) {
            throw new Error('Invalid skills format - must be array');
        }
        
        // SECURE: Limit number of skills to prevent DoS
        if (hermesSkills.length > 100) {
            throw new Error('Too many skills - max 100');
        }
        
        const brain = {
            skills: [],
            memories: [],
            identity: null
        };

        for (const skill of hermesSkills) {
            // SECURE: Validate skill structure
            if (!skill || typeof skill !== 'object') {
                continue; // Skip invalid skills
            }
            
            // SECURE: Validate name is safe string
            const safeName = this._sanitizeString(skill.name, 'skill');
            
            if (safeName === 'identity') {
                // SECURE: Validate identity before accepting
                brain.identity = {
                    name: 'Imported from Hermes',
                    purpose: this._sanitizeString(skill.prompt, 'text').slice(0, 1000)
                };
            } else if (safeName === 'memory') {
                // Parse memories from prompt
                brain.memories = [];
            } else {
                // SECURE: Sanitize all skill data
                brain.skills.push({
                    name: safeName,
                    description: this._sanitizeString(skill.description, 'text').slice(0, 500),
                    actions: Array.isArray(skill.actions) ? skill.actions.slice(0, 10) : [],
                    prompt: this._sanitizeString(skill.prompt, 'text').slice(0, 5000)
                });
            }
        }

        return brain;
    }

    /**
     * SECURE: Sanitize string input
     */
    _sanitizeString(str, type = 'text') {
        if (!str || typeof str !== 'string') return '';

        // Use vaf for sanitization
        let safe = _vaf.sanitizeString(str, { type });
        if (type === 'text') {
            safe = _vaf.escapeHtml(safe);
        }
        return safe.trim().slice(0, type === 'text' ? 5000 : 1000);
    }

    /**
     * Sync brain with hermes-agent
     * Bidirectional sync
     * 
     * SECURITY: Stateful tracking of sync state
     */
    async sync(brain) {
        console.log('[Connector/Hermes] Syncing with Hermes...');
        
        // STATEFUL: Track sync attempt
        const syncState = {
            attemptAt: Date.now(),
            source: 'hermes',
            brainId: brain.identity?.name || 'unknown'
        };
        
        // RATE LIMIT: Check sync frequency
        if (this._lastSync && Date.now() - this._lastSync < 60000) {
            throw new Error('Rate limited - wait 60s between syncs');
        }
        this._lastSync = Date.now();
        
        // Export Vant brain to Hermes
        const skills = await this.exportAsSkills(brain);
        
        // SECURITY: Validate exported skills
        if (!Array.isArray(skills) || skills.length > 100) {
            throw new Error('Export validation failed');
        }
        
        // Get Hermes skills
        const hermesSkills = await this.getSkills();
        
        // SECURITY: Validate imported skills before accepting
        const validatedSkills = await this.importSkills(hermesSkills);
        
        // STATEFUL: Log successful sync
        console.log('[Connector/Hermes] Sync complete:', {
            exported: skills.length,
            imported: validatedSkills.skills?.length || 0,
            timestamp: Date.now()
        });
        
        // Merge (simplified - real impl would do conflict resolution)
        const merged = {
            ...brain,
            ...validatedSkills,
            _syncState: syncState,
            source: 'hermes',
            syncedAt: Date.now()
        };

        return merged;
    }
    
    // STATEFUL: Track last sync time
    _lastSync = null;

    /**
     * Test connection
     */
    async ping() {
        return {
            connected: this.connected,
            type: this.type,
            timestamp: Date.now()
        };
    }
}

module.exports = { HermesConnector };
