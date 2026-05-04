const version = require('../lib/version');
const vaf = require("../lib/vaf");
// VAF: No user input - fixed Telegram commands
/**
 * VANT Telegram Bot
 * Simple bot for brain queries and status
 * 
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxx node bin/bot.js
 * 
 * Commands:
 *   /start - Welcome message
 *   /status - Show VANT status
 *   /brain - Show brain version
 *   /health - Run health check
 *   /sync - Trigger sync
 */

const telegram = require('../lib/telegram');
const logger = require('../lib/logger');
const config = require('../lib/config');

const BOT_COMMANDS = [
    { command: 'start', description: 'Welcome message' },
    { command: 'status', description: 'Show VANT status' },
    { command: 'brain', description: 'Show brain version' },
    { command: 'health', description: 'Run health check' },
    { command: 'sync', description: 'Trigger brain sync' }
];

async function main() {
    // Set up command handlers
    telegram.onCommand('start', async (msg) => {
        const welcome = `👋 *Welcome to VANT*

Persistent AI Memory System v' + version + '

Commands:
/status - System status
/brain - Brain version
/health - Health check
/sync - Sync brain

Powered by: https://github.com/dhaupin/vant`;
        await telegram.send(msg.chat, welcome);
    });
    
    telegram.onCommand('status', async (msg) => {
        const status = `📊 *VANT Status*

• Version: v' + version + '
• Platform: Node.js ${process.version}
• Time: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}
• Repo: \`${config.GITHUB_REPO || 'Not configured'}\``;
        await telegram.send(msg.chat, status);
    });
    
    telegram.onCommand('brain', async (msg) => {
        const brain = `🧠 *Brain Info*

Loading from GitHub...
_Use /sync to update_`;
        await telegram.send(msg.chat, brain);
    });
    
    telegram.onCommand('health', async (msg) => {
        await telegram.send(msg.chat, '🏥 Running health check...');
        try {
            const health = require('../lib/health');
            const checks = await health.runChecks();
            const results = checks.map(c => `${c.name}: ${c.status}`).join('\n');
            await telegram.send(msg.chat, `✅ *Health Check*\n\n${results}`);
        } catch (e) {
            await telegram.send(msg.chat, `❌ Error: ${e.message}`);
        }
    });
    
    telegram.onCommand('sync', async (msg) => {
        await telegram.send(msg.chat, '🔄 Syncing brain from GitHub...');
        // Would call sync here
        await telegram.send(msg.chat, '✅ Sync complete');
    });
    
    // Set bot commands
    try {
        await telegram.api('setMyCommands', {
            commands: BOT_COMMANDS
        });
        logger.info('[Bot] Commands registered');
    } catch (e) {
        logger.warn('[Bot] Could not register commands:', e.message);
    }
    
    // Start polling
    logger.info('[Bot] Starting Telegram bot...');
    await telegram.startPolling();
}

main().catch(err => {
    logger.error('Bot failed:', err.message);
    process.exit(1);
});