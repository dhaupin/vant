/**
 * Vant UUID Class
 * UUID generation
 */

class UUID {
    constructor(options = {}) {
        this.options = { version: options.version || 4 };
        this._startTime = Date.now();
    }
    
    v4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
    
    nano() {
        const now = Date.now();
        const random = Math.random().toString(36).slice(2, 15);
        return `${now.toString(36)}-${random}`;
    }
    
    getLayerStatus() { return { name: 'UUID', type: 'utility', enabled: true, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'UUID' }; }
    getStatus() { return { enabled: true }; }
}

const defaultUUID = new UUID();

module.exports = {
    UUID, create: (o) => new UUID(o),
    v4: () => defaultUUID.v4(),
    nano: () => defaultUUID.nano(),
    getLayerStatus: () => defaultUUID.getLayerStatus(),
    isOperationAllowed: (op) => defaultUUID.isOperationAllowed(op),
    getStatus: () => defaultUUID.getStatus()
};