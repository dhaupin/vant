/**
 * Vant SocketIO Class
 * Socket.IO wrapper
 */

const events = require('events');

class SocketIO extends events.EventEmitter {
    constructor(options = {}) {
        super();
        this.options = { ...options };
        this._rooms = new Set();
        this._startTime = Date.now();
    }
    
    /**
     * Join room
     */
    join(room) {
        this._rooms.add(room);
        return this;
    }
    
    /**
     * Leave room
     */
    leave(room) {
        this._rooms.delete(room);
        return this;
    }
    
    /**
     * Emit to room
     */
    emitToRoom(room, event, data) {
        if (this._rooms.has(room)) {
            this.emit(event, data);
        }
        return this;
    }
    
    /**
     * Broadcast
     */
    broadcast(event, data) {
        for (const room of this._rooms) {
            this.emit(event, data);
        }
        return this;
    }
    
    /**
     * Get rooms
     */
    getRooms() {
        return Array.from(this._rooms);
    }
    
    getLayerStatus() { return { name: 'SocketIO', type: 'socket', enabled: true, config: { rooms: this._rooms.size }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'SocketIO' }; }
    getStatus() { return { enabled: true, rooms: this._rooms.size }; }
}

module.exports = {
    SocketIO, create: (o) => new SocketIO(o),
    join: (r) => new SocketIO().join(r),
    leave: (r) => new SocketIO().leave(r),
    emitToRoom: (r, e, d) => new SocketIO().emitToRoom(r, e, d),
    getLayerStatus: () => ({ name: 'SocketIO', type: 'socket', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'SocketIO' }),
    getStatus: () => ({ enabled: true })
};