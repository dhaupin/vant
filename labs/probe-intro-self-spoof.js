#!/usr/bin/env node
/** PROBE: self-intro principal forgery: peer-c (no registry entry) introduces a FRESH team member id, then votes as it. */
'use strict';
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT,'lib','sandbox')).defaultSandbox.setCapabilities({canRead:true,canWrite:true,canNetwork:true,canTrade:true,canSpawn:true});
fs.rmSync(path.join(ROOT,'models','private','vant','state'),{recursive:true,force:true});
fs.rmSync(path.join(ROOT,'models','private','vant','orgchart'),{recursive:true,force:true});
const consensus=require(path.join(ROOT,'lib','consensus'));
const sync=require(path.join(ROOT,'lib','agora-sync'));
const registry=require(path.join(ROOT,'lib','node-registry'));
const teams=require(path.join(ROOT,'lib','teams'));
registry.clearState();
registry.register({id:'owner-agent',name:'owner-a',host:'127.0.0.1',port:1});
registry.register({id:'victim-agent',name:'peer-b',host:'127.0.0.1',port:1});
const org=teams.createOrg('probe3d'); const dept=teams.createDept('probe3d-infra',{org:org.id}); const team=teams.createTeam('probe3d-team',{dept:dept.id});
for (const a of ['owner-agent','victim-agent','ghost-member']) teams.assign(a,{org:org.id,dept:dept.id,team:team.id});
const SCOPE={owner:'team:'+team.id,visibility:'scope'};
const handlers=new Map();
const bus={onDispatch:(t,fn)=>handlers.set(t,fn),send:async()=>({ok:true,handlers:1}),
 nodes:()=>[{name:'peer-b',url:'http://127.0.0.1:1'},{name:'peer-c',url:'http://127.0.0.1:2'}],
 status:()=>({name:'owner-a',agentId:'owner-agent'})};
sync.install(bus);
(async()=>{
 await consensus.create('probe3d-topic',{ballot:['yes','no'],minQuorum:5,useTrustWeight:false,scope:SCOPE});
 handlers.get('member.intro')({from:'peer-c',payload:{member:{name:'peer-c',agentId:'ghost-member',url:'http://127.0.0.1:2'}}});
 const resolved=registry.resolvePrincipal('peer-c');
 handlers.get('vote')({from:'peer-c',payload:{topic:'probe3d-topic',outcome:'yes',agentId:'ghost-member',reqId:'poison'}});
 await new Promise(r=>setTimeout(r,40));
 const counted=consensus.hasVoted('probe3d-topic','ghost-member');
 console.log('\n=== PROBE: self-intro principal forgery ===');
 console.log('  resolvePrincipal(peer-c) after intro:',resolved);
 console.log('  ghost-member voted (per owner)?     ',counted);
 console.log('\nVERDICT:',counted?'VULNERABLE — intro forged a vetted principal, then voted as it':'bound');
 process.exit(0);
})().catch(e=>{console.error('probe error:',e.message);process.exit(1);});
