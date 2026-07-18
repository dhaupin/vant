#!/usr/bin/env node
/**
 * Vant Auth CLI
 * Authentication management
 * 
 * Usage:
 *   vant auth login <user>          # Login user
 *   vant auth logout                 # Logout
 *   vant auth session               # Show session
 *   vant auth token <user>         # Generate token
 *   vant auth verify <token>       # Verify token
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'session';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Auth CLI - Authentication management

Usage:
  vant auth login <user>             Login user
  vant auth logout                   Logout current user
  vant auth session                  Show current session
  vant auth token <user>            Generate token for user
  vant auth verify <token>          Verify token validity
  vant auth refresh                  Refresh session
`);
    process.exit(0);
}

function run() {
    const auth = require('../lib/auth');
    const config = require('../lib/config');
    
    if (subcmd === 'login' || subcmd === 'signin') {
        const user = args[1];
        if (!user) {
            console.error('Usage: vant auth login <user>');
            process.exit(1);
        }
        console.log('Logging in:', user);
        console.log('(Auth requires GitHub token in config)');
    } else if (subcmd === 'logout' || subcmd === 'signout') {
        console.log('Logging out...');
    } else if (subcmd === 'session' || subcmd === 'whoami') {
        const github = config.getGithub();
        if (github && github.user) {
            console.log('Session:');
            console.log('  User:', github.user);
            console.log('  Token: configured');
        } else {
            console.log('Session: not logged in');
        }
    } else if (subcmd === 'token' || subcmd === 'apikey') {
        const user = args[1] || 'default';
        console.log('Generating token for:', user);
    } else if (subcmd === 'verify' || subcmd === 'check') {
        const token = args[1];
        if (!token) {
            console.error('Usage: vant auth verify <token>');
            process.exit(1);
        }
        console.log('Verifying token...');
    } else if (subcmd === 'refresh' || subcmd === 'renew') {
        console.log('Refreshing session...');
    } else {
        console.log('Usage: vant auth <command>');
        process.exit(1);
    }
}

run();
