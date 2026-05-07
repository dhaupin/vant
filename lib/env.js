/**
 * Vant Environment Configuration
 * 
 * Centralized handling for all VANT_* environment variables.
 * Provides defaults, validation, and unified key retrieval.
 * 
 * Usage:
 *   const { Env } = require('./env');
 *   const env = new Env();
 *   const apiKey = env.apiKey({ secret: 'my-key' });
 */

class Env {
    constructor(options = {}) {
        this._options = options;
    }
    
    // ==================== API ====================
    /**
     * Get API key - from options, env, or null
     * @param {object} options - Options with secret key
     */
    apiKey(options = {}) {
        // options.secret takes priority, then env
        const optKey = options && options.secret;
        if (optKey) return optKey;
        
        // Check env
        if (this._options.secret) return this._options.secret;
        return process.env.VANT_API_KEY || null;
    }
    
    /**
     * Check if API key is configured
     */
    hasApiKey() {
        return !!(process.env.VANT_API_KEY || this._options.secret);
    }
    
    // ==================== MCP ====================
    /**
     * Get MCP API key
     */
    mcpApiKey(options = {}) {
        const optKey = options && options.secret;
        if (optKey) return optKey;
        return process.env.VANT_MCP_API_KEY || null;
    }
    
    /**
     * Check if MCP key is configured
     */
    hasMcpApiKey() {
        return !!(process.env.VANT_MCP_API_KEY);
    }
    
    /**
     * Get MCP bind address - default localhost for security
     */
    mcpBindAddress() {
        return process.env.MCP_BIND_ADDRESS || '127.0.0.1';
    }

    /**
     * Get MCP port - default 3456
     */
    mcpPort() {
        return parseInt(process.env.VANT_MCP_PORT) || 3456;
    }
    
    /**
     * Check if MCP requires API key
     */
    mcpRequireKey() {
        return process.env.VANT_MCP_REQUIRE_API_KEY === 'true';
    }
    
    // ==================== MODE ====================
    /**
     * Get Vant mode: cli | mcp | headless
     */
    mode() {
        if (process.env.VANT_MODE) return process.env.VANT_MODE;
        if (process.env.VANT_MCP_PORT) return 'mcp';
        return 'cli';
    }
    
    /**
     * Get agent ID
     */
    agentId() {
        return process.env.VANT_AGENT_ID || `agent-${process.pid}`;
    }
    
    // ==================== WEBHOOK ====================
    webhookPort() {
        return parseInt(process.env.VANT_WEBHOOK_PORT) || 3456;
    }
    
    webhookSecret() {
        return process.env.VANT_WEBHOOK_SECRET || null;
    }
    
    webhookUrl() {
        return process.env.VANT_WEBHOOK_URL || null;
    }
    
    // ==================== GITHUB ====================
    githubToken() {
        return process.env.GITHUB_TOKEN || 
               process.env.VANT_GITHUB_TOKEN || null;
    }
    
    githubRepo() {
        return process.env.VANT_GITHUB_REPO || 
               process.env.GITHUB_REPO || null;
    }
    
    // ==================== LINEAR ====================
    linearApiKey() {
        return process.env.LINEAR_API_KEY || null;
    }
    
    linearTeam() {
        return process.env.LINEAR_TEAM || null;
    }
    
    linearEndpoint() {
        return process.env.LINEAR_ENDPOINT || 'https://api.linear.app/graphql';
    }
    
    // ==================== NOTIFICATIONS ====================
    slackWebhook() {
        return process.env.SLACK_WEBHOOK_URL || null;
    }
    
    discordWebhook() {
        return process.env.DISCORD_WEBHOOK_URL || null;
    }
    
    smtpConfig() {
        return {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            from: process.env.FROM_EMAIL || 'Vant <noreply@vant.dev>'
        };
    }
    
    pushoverKey() {
        return process.env.PUSHOVER_KEY || null;
    }
    
    pushoverToken() {
        return process.env.PUSHOVER_TOKEN || null;
    }
    
    telegramToken() {
        return process.env.TELEGRAM_TOKEN || 
               process.env.TELEGRAM_BOT_TOKEN || null;
    }
    
    agreeAutoSync() {
        return process.env.VANT_AGREE_AUTO_SYNC === 'true';
    }
    
    // ==================== UTILS ====================
    /**
     * Get all configured keys (for debugging)
     */
    getConfiguredKeys() {
        return {
            VANT_API_KEY: this.hasApiKey() ? '[set]' : null,
            VANT_MCP_API_KEY: this.hasMcpApiKey() ? '[set]' : null,
            GITHUB_TOKEN: this.githubToken() ? '[set]' : null,
            LINEAR_API_KEY: this.linearApiKey() ? '[set]' : null,
            SLACK_WEBHOOK: this.slackWebhook() ? '[set]' : null,
            DISCORD_WEBHOOK: this.discordWebhook() ? '[set]' : null
        };
    }
    
    /**
     * Check if running in specific host environment
     */
    isCloudflare() {
        return !!process.env.CLOUDFLARE ||
               !!process.env.CF_PAGES ||
               !!process.env.CF_ACCOUNT_ID;
    }
    
    isVercel() {
        return !!process.env.VERCEL ||
               !!process.env.VERCEL_URL;
    }
    
    isNetlify() {
        return !!process.env.NETLIFY ||
               !!process.env.NETLIFY_SITE_ID;
    }
    
    isDocker() {
        return !!process.env.DOCKER;
    }
    
    isKubernetes() {
        return !!process.env.KUBERNETES_PORT;
    }
    
    /**
     * Get host platform: node | cloudflare | vercel | netlify | docker | kubernetes
     */
    platform() {
        if (this.isCloudflare()) return 'cloudflare';
        if (this.isVercel()) return 'vercel';
        if (this.isNetlify()) return 'netlify';
        if (this.isKubernetes()) return 'kubernetes';
        if (this.isDocker()) return 'docker';
        return 'node';
    }
}

/**
 * Factory for default instance
 */
const defaultEnv = new Env();

module.exports = { Env, env: defaultEnv };

// Shortcuts for convenience
module.exports.apiKey = (opts) => defaultEnv.apiKey(opts);
module.exports.mcpPort = () => defaultEnv.mcpPort();
module.exports.mcpBindAddress = () => defaultEnv.mcpBindAddress();
module.exports.mode = () => defaultEnv.mode();
module.exports.platform = () => defaultEnv.platform();
module.exports.hasApiKey = () => defaultEnv.hasApiKey();
module.exports.githubToken = () => defaultEnv.githubToken();
module.exports.getConfiguredKeys = () => defaultEnv.getConfiguredKeys();
