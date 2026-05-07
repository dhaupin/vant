/**
 * Vant ServiceContainer Class
 * Dependency injection container
 */

class ServiceContainer {
    constructor(options = {}) {
        this.options = { ...options };
        this._services = new Map();
        this._factories = new Map();
        this._startTime = Date.now();
    }
    
    /**
     * Register singleton service
     */
    register(name, service) {
        this._services.set(name, service);
        return this;
    }
    
    /**
     * Register factory (creates new instance each time)
     */
    factory(name, fn) {
        this._factories.set(name, fn);
        return this;
    }
    
    /**
     * Get service (singleton)
     */
    get(name) {
        if (this._services.has(name)) {
            return this._services.get(name);
        }
        if (this._factories.has(name)) {
            const fn = this._factories.get(name);
            const instance = fn(this);
            this._services.set(name, instance);
            return instance;
        }
        throw new Error('Service not found: ' + name);
    }
    
    /**
     * Check if service exists
     */
    has(name) {
        return this._services.has(name) || this._factories.has(name);
    }
    
    /**
     * Get all services
     */
    keys() {
        return [...this._services.keys(), ...this._factories.keys()];
    }
    
    getLayerStatus() { return { name: 'ServiceContainer', type: 'infra', enabled: true, state: { services: this._services.size, factories: this._factories.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'ServiceContainer' }; }
    getStatus() { return { enabled: true, services: this._services.size, factories: this._factories.size }; }
}

module.exports = {
    ServiceContainer, create: (o) => new ServiceContainer(o),
    register: (n, s) => new ServiceContainer().register(n, s),
    factory: (n, f) => new ServiceContainer().factory(n, f),
    get: (n) => new ServiceContainer().get(n),
    has: (n) => new ServiceContainer().has(n),
    getLayerStatus: () => ({ name: 'ServiceContainer', type: 'infra', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'ServiceContainer' }),
    getStatus: () => ({ enabled: true })
};