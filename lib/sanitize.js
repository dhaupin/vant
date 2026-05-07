/**
 * Vant Sanitize Class
 * Input sanitization
 */

class Sanitize {
    constructor(options = {}) {
        this.options = { 
            stripHtml: options.stripHtml !== false,
            trim: options.trim !== false,
            ...options 
        };
        this._startTime = Date.now();
    }
    
    /**
     * Strip HTML tags
     */
    stripHtml(str) {
        return str.replace(/<[^>]*>/g, '');
    }
    
    /**
     * Trim whitespace
     */
    trim(str) {
        return str.trim();
    }
    
    /**
     * Escape SQL
     */
    escapeSQL(str) {
        return str.replace(/'/g, "''");
    }
    
    /**
     * Escape HTML
     */
    escapeHTML(str) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return str.replace(/[&<>"']/g, c => map[c]);
    }
    
    /**
     * Remove control chars
     */
    removeControlChars(str) {
        return str.replace(/[\x00-\x1F\x7F]/g, '');
    }
    
    /**
     * Normalize whitespace
     */
    normalizeWhitespace(str) {
        return str.replace(/\s+/g, ' ').trim();
    }
    
    /**
     * Sanitize string
     */
    string(str) {
        let s = str;
        if (this.options.stripHtml) s = this.stripHtml(s);
        if (this.options.trim) s = s.trim();
        s = this.removeControlChars(s);
        return s;
    }
    
    /**
     * Sanitize object
     */
    object(obj) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.string(value);
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.object(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }
    
    getLayerStatus() { return { name: 'Sanitize', type: 'validation', enabled: true, config: { stripHtml: this.options.stripHtml, trim: this.options.trim }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Sanitize' }; }
    getStatus() { return { enabled: true }; }
}

module.exports = {
    Sanitize, create: (o) => new Sanitize(o),
    stripHtml: (s) => new Sanitize().stripHtml(s),
    trim: (s) => new Sanitize().trim(s),
    escapeSQL: (s) => new Sanitize().escapeSQL(s),
    escapeHTML: (s) => new Sanitize().escapeHTML(s),
    string: (s) => new Sanitize().string(s),
    object: (o) => new Sanitize().object(o),
    getLayerStatus: () => ({ name: 'Sanitize', type: 'validation', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Sanitize' }),
    getStatus: () => ({ enabled: true })
};