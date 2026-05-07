/**
 * Vant BodyParser Class
 * Parse request body
 */

class BodyParser {
    constructor(options = {}) {
        this.options = { 
            limit: options.limit || '1mb',
            encoding: options.encoding || 'utf8',
            ...options 
        };
        this._parsers = new Map();
        this._startTime = Date.now();
    }
    
    /**
     * Parse JSON body
     */
    async parseJSON(body) {
        try {
            return JSON.parse(body);
        } catch {
            return null;
        }
    }
    
    /**
     * Parse form body
     */
    parseForm(body) {
        const params = new URLSearchParams(body);
        const obj = {};
        for (const [key, value] of params) {
            obj[key] = value;
        }
        return obj;
    }
    
    /**
     * Parse multipart body
     */
    parseMultipart(body, boundary) {
        return { boundary, parts: [] };
    }
    
    /**
     * Auto-detect and parse
     */
    async parse(contentType, body) {
        if (!body) return null;
        
        if (contentType.includes('application/json')) {
            return this.parseJSON(body);
        }
        
        if (contentType.includes('application/x-www-form-urlencoded')) {
            return this.parseForm(body);
        }
        
        if (contentType.includes('multipart/form-data')) {
            const boundary = contentType.split('boundary=')[1];
            return this.parseMultipart(body, boundary);
        }
        
        return body;
    }
    
    getLayerStatus() {
        return { name: 'BodyParser', type: 'http', enabled: true, config: { limit: this.options.limit }, state: { uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'BodyParser' };
    }
    
    getStatus() {
        return { enabled: true };
    }
}

module.exports = {
    BodyParser, create: (o) => new BodyParser(o),
    parseJSON: (b) => new BodyParser().parseJSON(b),
    parseForm: (b) => new BodyParser().parseForm(b),
    parseMultipart: (b, bn) => new BodyParser().parseMultipart(b, bn),
    parse: async (ct, b) => new BodyParser().parse(ct, b),
    getLayerStatus: () => ({ name: 'BodyParser', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'BodyParser' }),
    getStatus: () => ({ enabled: true })
};