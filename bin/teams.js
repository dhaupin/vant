#!/usr/bin/env node
/**
 * vant teams CLI - Organization, Department, Team, Role management
 * 
 * Usage:
 *   vant teams create <name> [--plan <plan>]
 *   vant teams list
 *   vant teams get <id>
 *   vant teams dept create <org-id> <name>
 *   vant teams dept list <org-id>
 *   vant teams team create <dept-id> <name>
 *   vant teams team list <dept-id>
 *   vant teams role create <team-id> <name> [--perms <perms>]
 *   vant teams assign <agent-id> <org-id> [--dept <id>] [--team <id>] [--role <id>]
 *   vant teams perms <agent-id> <permission>
 */

const teams = require('../lib/teams');

const args = process.argv.slice(2);
const cmd = args[0];

function main() {
    switch (cmd) {
        case 'create':
            // vant teams create <name> [--plan <plan>]
            const name = args[1];
            const planIdx = args.indexOf('--plan');
            const plan = planIdx > -1 ? args[planIdx + 1] : 'free';
            
            if (!name) {
                console.log('Usage: vant teams create <name> [--plan <plan>]');
                process.exit(1);
            }
            
            const org = teams.createOrg(name, { plan });
            if (org.error) {
                console.log('Error:', org.error);
                process.exit(1);
            }
            console.log('Org created:', org.name, '(' + org.id + ')');
            break;
            
        case 'list':
            // vant teams list
            const orgs = teams.listOrgs();
            console.log('Organizations:', orgs.length);
            orgs.forEach(o => console.log('  -', o.name, '(' + o.id + ')'));
            break;
            
        case 'get':
            // vant teams get <id>
            const orgId = args[1];
            if (!orgId) {
                console.log('Usage: vant teams get <id>');
                process.exit(1);
            }
            const orgData = teams.getOrg(orgId);
            console.log(JSON.stringify(orgData, null, 2));
            break;
            
        case 'dept':
            // vant teams dept create <org-id> <name>
            // vant teams dept list <org-id>
            const deptCmd = args[1];
            
            if (deptCmd === 'create') {
                const deptOrgId = args[2];
                const deptName = args[3];
                
                if (!deptOrgId || !deptName) {
                    console.log('Usage: vant teams dept create <org-id> <name>');
                    process.exit(1);
                }
                
                const dept = teams.createDept(deptName, { org: deptOrgId });
                console.log('Dept created:', dept.name, '(' + dept.id + ')');
            } else if (deptCmd === 'list') {
                const listOrgId = args[2];
                if (!listOrgId) {
                    console.log('Usage: vant teams dept list <org-id>');
                    process.exit(1);
                }
                const depts = teams.listDepts(listOrgId);
                console.log('Departments:', depts.length);
                depts.forEach(d => console.log('  -', d.name, '(' + d.id + ')'));
            } else {
                console.log('Usage: vant teams dept create|list');
            }
            break;
            
        case 'team':
            // vant teams team create <dept-id> <name>
            // vant teams team list <dept-id>
            const teamCmd = args[1];
            
            if (teamCmd === 'create') {
                const teamDeptId = args[2];
                const teamName = args[3];
                
                if (!teamDeptId || !teamName) {
                    console.log('Usage: vant teams team create <dept-id> <name>');
                    process.exit(1);
                }
                
                const team = teams.createTeam(teamName, { dept: teamDeptId });
                console.log('Team created:', team.name, '(' + team.id + ')');
            } else if (teamCmd === 'list') {
                const listDeptId = args[2];
                if (!listDeptId) {
                    console.log('Usage: vant teams team list <dept-id>');
                    process.exit(1);
                }
                const teamsList = teams.listTeams(listDeptId);
                console.log('Teams:', teamsList.length);
                teamsList.forEach(t => console.log('  -', t.name, '(' + t.id + ')'));
            } else {
                console.log('Usage: vant teams team create|list');
            }
            break;
            
        case 'role':
            // vant teams role create <team-id> <name> [--perms <perms>]
            const roleCmd = args[1];
            
            if (roleCmd === 'create') {
                const roleTeamId = args[2];
                const roleName = args[3];
                const permsIdx = args.indexOf('--perms');
                const perms = permsIdx > -1 ? args[permsIdx + 1].split(',') : [];
                
                if (!roleTeamId || !roleName) {
                    console.log('Usage: vant teams role create <team-id> <name> [--perms <perms>]');
                    process.exit(1);
                }
                
                const role = teams.createRole(roleName, { team: roleTeamId, permissions: perms });
                console.log('Role created:', role.name, '(' + role.id + ')');
                console.log('  Permissions:', role.permissions || role.permissions);
            } else {
                console.log('Usage: vant teams role create <team-id> <name> [--perms <perms>]');
            }
            break;
            
        case 'assign':
            // vant teams assign <agent-id> <org-id> [--dept <id>] [--team <id>] [--role <id>]
            const assignAgentId = args[1];
            const assignOrgId = args[2];
            
            if (!assignAgentId || !assignOrgId) {
                console.log('Usage: vant teams assign <agent-id> <org-id> [--dept <id>] [--team <id>] [--role <id>]');
                process.exit(1);
            }
            
            const deptIdx = args.indexOf('--dept');
            const teamIdx = args.indexOf('--team');
            const roleIdx = args.indexOf('--role');
            
            const deptId = deptIdx > -1 ? args[deptIdx + 1] : undefined;
            const teamId = teamIdx > -1 ? args[teamIdx + 1] : undefined;
            const roleId = roleIdx > -1 ? args[roleIdx + 1] : undefined;
            
            const assignment = teams.assign(assignAgentId, { 
                org: assignOrgId, 
                dept: deptId,
                team: teamId,
                role: roleId
            });
            console.log('Assigned:', assignAgentId);
            console.log('  Org:', assignment.org);
            console.log('  Dept:', assignment.dept);
            console.log('  Team:', assignment.team);
            console.log('  Role:', assignment.role);
            break;
            
        case 'perms':
            // vant teams perms <agent-id> <permission>
            const permAgentId = args[1];
            const permission = args[2];
            
            if (!permAgentId || !permission) {
                console.log('Usage: vant teams perms <agent-id> <permission>');
                process.exit(1);
            }
            
            const hasPerm = teams.hasPermission(permAgentId, permission);
            console.log('Has', permission + ':', hasPerm ? 'YES' : 'NO');
            break;
            
        default:
            console.log('vant teams - Organization management');
            console.log('');
            console.log('Usage:');
            console.log('  vant teams create <name> [--plan <plan>]');
            console.log('  vant teams list');
            console.log('  vant teams get <id>');
            console.log('  vant teams dept create <org-id> <name>');
            console.log('  vant teams dept list <org-id>');
            console.log('  vant teams team create <dept-id> <name>');
            console.log('  vant teams team list <dept-id>');
            console.log('  vant teams role create <team-id> <name> [--perms <perms>]');
            console.log('  vant teams assign <agent-id> <org-id> [--dept <id>] [--team <id>] [--role <id>]');
            console.log('  vant teams perms <agent-id> <permission>');
    }
}

main();
