/**
 * Vant CronParser Class
 * Cron expression parser
 */

class CronParser {
    constructor(options = {}) {
        this.options = options;
        this._startTime = Date.now();
    }
    
    parse(expr) {
        const parts = expr.split(' ');
        return { expr, parts, minute: parts[0], hour: parts[1], day: parts[2], month: parts[3], dow: parts[4] };
    }
    
    next(expr) {
        const parsed = this.parse(expr);
        const now = new Date();
        return new Date(now.getTime() + 60000);
    }
    
    getLayerStatus() { return { name: 'CronParser', type: 'scheduler', enabled: true, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'CronParser' }; }
    getStatus() { return { enabled: true }; }
}

module.exports = {
    CronParser, create: (o) => new CronParser(o),
    parse: (e) => e.split(' ').length,
    getLayerStatus: () => ({ name: 'CronParser', type: 'scheduler', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'CronParser' }),
    getStatus: () => ({ enabled: true })
};