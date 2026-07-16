/**
 * Teams Module (v0.8.6)
 * WITH EVENT EMISSIONS - team events emit globally
 * Organization, Department, Team, Role hierarchy for agent management
 *
 * Flexible structure: users define their own org/team/role hierarchies
 * Different industries can model differently:
 * - Software: Engineering > Frontend/Backend/DevOps > Team
 * - Logistics: Operations > Warehouse/Shipping > Team
 * - Math: Research > Applied/Pure > Team
 *
 * Usage:
 *   const teams = require('./teams');
 *   await teams.createOrg('Acme Corp');
 *   await teams.createDept('Engineering', { org: 'Acme Corp' });
 *   await teams.createTeam('Frontend', { dept: 'Engineering' });
 *   await teams.addRole('Senior Engineer', { team: 'Frontend', chain: ['Engineer'] });
 *   await teams.assign('agent_123', { team: 'Frontend', role: 'Senior Engineer' });
 */

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

const path = require('path');
const fs = require('fs');
const Encrypt = require('./encrypt');

// Lazy-load OS modules
let _sandbox = null;
let _config = null;
let _audit = null;
let _rules = null;

function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) {}
    }
    return _config;
}

function _getAudit() {
    if (!_audit) {
        try { _audit = require('./audit'); } catch (e) { _audit = { info: () => {}, warn: () => {} }; }
    }
    return _audit;
}

function _getRules() {
    if (!_rules) {
        try { _rules = require('./rules'); } catch (e) {}
    }
    return _rules;
}

// Capability checks
function _checkCapability(cap) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can) {
        return sandbox.can(cap);
    }
    return true; // Default allow if no sandbox
}

// Rule check
function _checkRule(ruleName, context) {
    const rules = _getRules();
    if (rules && rules.check) {
        return rules.check(ruleName, context);
    }
    return true; // Default allow if no rules
}

// Team persistence - configurable path
function _getStorePath() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.store', '.agent_tmp/teams.json') : '.agent_tmp/teams.json';
}

// In-memory state
const _orgs = new Map();      // orgId -> { id, name, desc, depts, created }
const _depts = new Map();     // deptId -> { id, name, org, teams, created }
const _teams = new Map();     // teamId -> { id, name, dept, roles, members, created }
const _roles = new Map();     // roleId -> { id, name, team, chain, permissions, created }
const _assignments = new Map(); // agentId -> { agentId, org, dept, team, role, assigned }

// Load on init
(async () => {
    await _loadTeams();
})();

function _ensureStoreDir(storePath) {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function _loadTeams() {
    const storePath = _getStorePath();
    _ensureStoreDir(storePath);
    if (fs.existsSync(storePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
            if (data.orgs) data.orgs.forEach(a => _orgs.set(a.id, a));
            if (data.depts) data.depts.forEach(a => _depts.set(a.id, a));
            if (data.teams) data.teams.forEach(a => _teams.set(a.id, a));
            if (data.roles) data.roles.forEach(a => _roles.set(a.id, a));
            if (data.assignments) data.assignments.forEach(a => _assignments.set(a.agentId, a));
            _getAudit().info('[teams] Loaded ' + (_orgs.size + _depts.size + _teams.size) + ' entities');
        } catch (e) { console.warn('[teams] Store corrupted:', e.message); }
    }
}

async function _saveTeams() {
    const storePath = _getStorePath();
    _ensureStoreDir(storePath);
    fs.writeFileSync(storePath, JSON.stringify({
        orgs: Array.from(_orgs.values()),
        depts: Array.from(_depts.values()),
        teams: Array.from(_teams.values()),
        roles: Array.from(_roles.values()),
        assignments: Array.from(_assignments.values())
    }, null, 2));
}

// ==================== ORGANIZATIONS ====================

/**
 * Create organization (top-level container)
 */
async function createOrg(name, options = {}) {
    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required', code: 'E_SANDBOX' };
    }
    
    // SECURITY: Rule check
    if (!_checkRule('team:create', { name, type: 'org' })) {
        return { error: 'Rule denied: team:create', code: 'E_RULE' };
    }
    
    const audit = _getAudit();
    const id = 'org_' + Date.now().toString(36) + Encrypt.key(8);
    const org = {
        id,
        name,
        desc: options.desc || '',
        metadata: options.metadata || {},
        created: Date.now()
    };
    _orgs.set(id, org);
    await _saveTeams();
    audit.info(`[teams] Org created: ${name} (${id})`);
    _emit('team:orgCreated', { id, name, timestamp: Date.now() });
    return org;
}

/**
 * List organizations
 */
function listOrgs() {
    return Array.from(_orgs.values());
}

/**
 * Get organization
 */
function getOrg(orgId) {
    return _orgs.get(orgId);
}

/**
 * Update organization
 */
async function updateOrg(orgId, updates) {
    const org = _orgs.get(orgId);
    if (!org) return { error: 'Org not found' };
    Object.assign(org, updates, { updated: Date.now() });
    await _saveTeams();
    _emit('team:orgUpdated', { id: orgId, timestamp: Date.now() });
    return org;
}

/**
 * Delete organization (cascades to depts/teams)
 */
async function deleteOrg(orgId) {
    if (!_orgs.has(orgId)) return { error: 'Org not found' };
    
    // Delete all depts in org
    for (const [deptId, dept] of _depts) {
        if (dept.org === orgId) {
            await deleteDept(deptId);
        }
    }
    
    _orgs.delete(orgId);
    await _saveTeams();
    _emit('team:orgDeleted', { id: orgId, timestamp: Date.now() });
    return { deleted: true };
}

// ==================== DEPARTMENTS ====================

/**
 * Create department (subdivision of org)
 */
async function createDept(name, options = {}) {
    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required', code: 'E_SANDBOX' };
    }
    
    const org = options.org || (Array.from(_orgs.values())[0]?.id);
    if (!org) return { error: 'No organization found' };
    
    const audit = _getAudit();
    const id = 'dept_' + Date.now().toString(36) + Encrypt.key(8);
    const dept = {
        id,
        name,
        org,
        desc: options.desc || '',
        metadata: options.metadata || {},
        created: Date.now()
    };
    _depts.set(id, dept);
    await _saveTeams();
    audit.info(`[teams] Dept created: ${name} (${id}) in org ${org}`);
    _emit('team:deptCreated', { id, name, org, timestamp: Date.now() });
    return dept;
}

/**
 * List departments (optionally by org)
 */
function listDepts(orgId) {
    const all = Array.from(_depts.values());
    if (orgId) return all.filter(d => d.org === orgId);
    return all;
}

/**
 * Get department
 */
function getDept(deptId) {
    return _depts.get(deptId);
}

/**
 * Delete department (cascades to teams)
 */
async function deleteDept(deptId) {
    if (!_depts.has(deptId)) return { error: 'Dept not found' };
    
    // Delete all teams in dept
    for (const [teamId, team] of _teams) {
        if (team.dept === deptId) {
            await deleteTeam(teamId);
        }
    }
    
    _depts.delete(deptId);
    await _saveTeams();
    _emit('team:deptDeleted', { id: deptId, timestamp: Date.now() });
    return { deleted: true };
}

// ==================== TEAMS ====================

/**
 * Create team (group within dept)
 */
async function createTeam(name, options = {}) {
    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required', code: 'E_SANDBOX' };
    }
    
    const dept = options.dept || (Array.from(_depts.values())[0]?.id);
    if (!dept) return { error: 'No department found' };
    
    const audit = _getAudit();
    const id = 'team_' + Date.now().toString(36) + Encrypt.key(8);
    const team = {
        id,
        name,
        dept,
        desc: options.desc || '',
        metadata: options.metadata || {},
        created: Date.now()
    };
    _teams.set(id, team);
    await _saveTeams();
    audit.info(`[teams] Team created: ${name} (${id}) in dept ${dept}`);
    _emit('team:created', { id, name, dept, timestamp: Date.now() });
    return team;
}

/**
 * List teams (optionally by dept)
 */
function listTeams(deptId) {
    const all = Array.from(_teams.values());
    if (deptId) return all.filter(t => t.dept === deptId);
    return all;
}

/**
 * Get team
 */
function getTeam(teamId) {
    return _teams.get(teamId);
}

/**
 * Delete team (cascades to roles/members)
 */
async function deleteTeam(teamId) {
    if (!_teams.has(teamId)) return { error: 'Team not found' };
    
    // Delete all roles in team
    for (const [roleId, role] of _roles) {
        if (role.team === teamId) {
            _roles.delete(roleId);
        }
    }
    
    // Remove members from team
    for (const [agentId, assign] of _assignments) {
        if (assign.team === teamId) {
            _assignments.delete(agentId);
        }
    }
    
    _teams.delete(teamId);
    await _saveTeams();
    _emit('team:deleted', { id: teamId, timestamp: Date.now() });
    return { deleted: true };
}

// ==================== ROLES ====================

/**
 * Create role within team
 * Chain defines hierarchy: ['Engineer', 'Senior', 'Lead'] means Lead > Senior > Engineer
 */
async function createRole(name, options = {}) {
    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required', code: 'E_SANDBOX' };
    }
    
    const team = options.team || (Array.from(_teams.values())[0]?.id);
    if (!team) return { error: 'No team found' };
    
    const audit = _getAudit();
    const id = 'role_' + Date.now().toString(36) + Encrypt.key(8);
    const role = {
        id,
        name,
        team,
        chain: options.chain || [], // e.g., ['Engineer', 'Senior'] - Engineer reports to Senior
        permissions: options.permissions || [], // e.g., ['canWrite', 'canDeploy']
        metadata: options.metadata || {},
        created: Date.now()
    };
    _roles.set(id, role);
    await _saveTeams();
    audit.info(`[teams] Role created: ${name} (${id}) in team ${team}`);
    _emit('team:roleCreated', { id, name, team, timestamp: Date.now() });
    return role;
}

/**
 * List roles (optionally by team)
 */
function listRoles(teamId) {
    const all = Array.from(_roles.values());
    if (teamId) return all.filter(r => r.team === teamId);
    return all;
}

/**
 * Get role
 */
function getRole(roleId) {
    return _roles.get(roleId);
}

/**
 * Get role chain (all roles this role reports to)
 */
function getRoleChain(roleId) {
    const role = _roles.get(roleId);
    if (!role) return [];
    return role.chain || [];
}

/**
 * Check if role has permission
 */
function hasPermission(roleId, permission) {
    const role = _roles.get(roleId);
    if (!role) return false;
    return role.permissions.includes(permission);
}

// ==================== ASSIGNMENTS ====================

/**
 * Assign agent to team with role
 */
async function assign(agentId, options = {}) {
    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required', code: 'E_SANDBOX' };
    }
    
    const audit = _getAudit();
    const team = options.team;
    const role = options.role;
    const dept = options.dept;
    const org = options.org;
    
    const assignment = {
        agentId,
        org: org || (team ? _teams.get(team)?.dept ? _depts.get(_teams.get(team).dept)?.org : null : null),
        dept: dept || (team ? _teams.get(team)?.dept : null),
        team,
        role,
        assigned: Date.now()
    };
    
    _assignments.set(agentId, assignment);
    await _saveTeams();
    audit.info(`[teams] Assigned agent ${agentId} to team ${team} with role ${role}`);
    _emit('team:assigned', { agentId, team, role, timestamp: Date.now() });
    return assignment;
}

/**
 * Get agent's assignment
 */
function getAssignment(agentId) {
    return _assignments.get(agentId);
}

/**
 * List all assignments (optionally by team/org)
 */
function listAssignments(options = {}) {
    let all = Array.from(_assignments.values());
    if (options.org) all = all.filter(a => a.org === options.org);
    if (options.dept) all = all.filter(a => a.dept === options.dept);
    if (options.team) all = all.filter(a => a.team === options.team);
    return all;
}

/**
 * Remove agent from team
 */
async function unassign(agentId) {
    const removed = _assignments.delete(agentId);
    if (removed) {
        await _saveTeams();
        _emit('team:unassigned', { agentId, timestamp: Date.now() });
    }
    return { removed };
}

// ==================== PERMISSIONS & FLOW ====================

/**
 * Check if agent can perform action (based on role chain)
 */
function can(agentId, permission) {
    const assign = _assignments.get(agentId);
    if (!assign || !assign.role) return false;
    
    // Check role and all roles in chain
    const role = _roles.get(assign.role);
    if (!role) return false;
    
    // Direct permission
    if (role.permissions.includes(permission)) return true;
    
    // Check chain
    for (const chainRoleName of role.chain || []) {
        const chainRole = Array.from(_roles.values()).find(r => 
            r.team === role.team && r.name === chainRoleName
        );
        if (chainRole && chainRole.permissions.includes(permission)) return true;
    }
    
    return false;
}

/**
 * Get delegation path (who can delegate to whom)
 */
function getDelegationPath(fromAgentId, toAgentId) {
    const fromAssign = _assignments.get(fromAgentId);
    const toAssign = _assignments.get(toAgentId);
    
    if (!fromAssign || !toAssign) return null;
    
    // Same team - can delegate
    if (fromAssign.team === toAssign.team) return ['same_team'];
    
    // Check role hierarchy
    const fromRole = fromAssign.role ? _roles.get(fromAssign.role) : null;
    const toRole = toAssign.role ? _roles.get(toAssign.role) : null;
    
    if (fromRole && toRole) {
        // fromRole is higher in chain than toRole
        if (toRole.chain.includes(fromRole.name)) return ['role_hierarchy'];
    }
    
    // Check dept hierarchy
    if (fromAssign.dept === toAssign.dept) return ['same_dept'];
    if (fromAssign.org === toAssign.org) return ['same_org'];
    
    return null;
}

/**
 * Get accountability chain (who is responsible for agent)
 */
function getAccountabilityChain(agentId) {
    const assign = _assignments.get(agentId);
    if (!assign) return [];
    
    const chain = [assign.agentId];
    
    // Find supervisor (role higher in chain)
    if (assign.role) {
        const role = _roles.get(assign.role);
        if (role && role.chain.length > 0) {
            const supervisorRole = Array.from(_roles.values()).find(r =>
                r.team === role.team && r.name === role.chain[role.chain.length - 1]
            );
            if (supervisorRole) {
                // Find agent with this role
                for (const [aId, a] of _assignments) {
                    if (a.role === supervisorRole.id && aId !== agentId) {
                        chain.push(aId);
                        break;
                    }
                }
            }
        }
    }
    
    return chain;
}

// ==================== HIERARCHY TRAVERSAL ====================

/**
 * Get full hierarchy for an agent
 */
function getHierarchy(agentId) {
    const assign = _assignments.get(agentId);
    if (!assign) return null;
    
    return {
        org: assign.org ? _orgs.get(assign.org) : null,
        dept: assign.dept ? _depts.get(assign.dept) : null,
        team: assign.team ? _teams.get(assign.team) : null,
        role: assign.role ? _roles.get(assign.role) : null,
        assignment: assign
    };
}

/**
 * Get team members
 */
function getTeamMembers(teamId) {
    const members = [];
    for (const [agentId, assign] of _assignments) {
        if (assign.team === teamId) {
            members.push({ agentId, ...assign });
        }
    }
    return members;
}

/**
 * Get department members
 */
function getDeptMembers(deptId) {
    const members = [];
    for (const [agentId, assign] of _assignments) {
        if (assign.dept === deptId) {
            members.push({ agentId, ...assign });
        }
    }
    return members;
}

/**
 * Get organization members
 */
function getOrgMembers(orgId) {
    const members = [];
    for (const [agentId, assign] of _assignments) {
        if (assign.org === orgId) {
            members.push({ agentId, ...assign });
        }
    }
    return members;
}

// ==================== EXPORTS ====================

module.exports = {
    // Organizations
    createOrg,
    listOrgs,
    getOrg,
    updateOrg,
    deleteOrg,
    
    // Departments
    createDept,
    listDepts,
    getDept,
    deleteDept,
    
    // Teams
    createTeam,
    listTeams,
    getTeam,
    deleteTeam,
    
    // Roles
    createRole,
    listRoles,
    getRole,
    getRoleChain,
    hasPermission,
    
    // Assignments
    assign,
    getAssignment,
    listAssignments,
    unassign,
    
    // Permissions & Flow
    can,
    getDelegationPath,
    getAccountabilityChain,
    
    // Hierarchy
    getHierarchy,
    getTeamMembers,
    getDeptMembers,
    getOrgMembers,
    
    // Config
    getStorePath: _getStorePath
};
