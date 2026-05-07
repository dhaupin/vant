/**
 * Vant QueryBuilder Class
 * SQL query builder
 */

class QueryBuilder {
    constructor(options = {}) {
        this.options = { ...options };
        this._type = null;
        this._table = null;
        this._columns = [];
        this._values = {};
        this._where = [];
        this._orderBy = [];
        this._limit = null;
        this._offset = null;
        this._joins = [];
        this._startTime = Date.now();
    }
    
    select(...columns) { this._type = 'SELECT'; this._columns = columns.length ? columns : ['*']; return this; }
    insert(table, values) { this._type = 'INSERT'; this._table = table; this._values = values; return this; }
    update(table, values) { this._type = 'UPDATE'; this._table = table; this._values = values; return this; }
    delete(table) { this._type = 'DELETE'; this._table = table; return this; }
    from(table) { this._table = table; return this; }
    where(condition) { this._where.push(condition); return this; }
    orderBy(column, dir = 'ASC') { this._orderBy.push({ column, dir }); return this; }
    limit(n) { this._limit = n; return this; }
    offset(n) { this._offset = n; return this; }
    join(table, condition) { this._joins.push({ type: 'INNER', table, condition }); return this; }
    
    /**
     * Build SQL
     */
    toSQL() {
        const escape = (v) => typeof v === 'string' ? "'" + v.replace(/'/g, "''") + "'" : v;
        
        if (this._type === 'SELECT') {
            let sql = `SELECT ${this._columns.join(', ')} FROM ${this._table}`;
            if (this._joins.length) sql += ' ' + this._joins.map(j => `${j.type} JOIN ${j.table} ON ${j.condition}`).join(' ');
            if (this._where.length) sql += ' WHERE ' + this._where.join(' AND ');
            if (this._orderBy.length) sql += ' ORDER BY ' + this._orderBy.map(o => `${o.column} ${o.dir}`).join(', ');
            if (this._limit) sql += ` LIMIT ${this._limit}`;
            if (this._offset) sql += ` OFFSET ${this._offset}`;
            return sql;
        }
        
        if (this._type === 'INSERT') {
            const keys = Object.keys(this._values);
            const vals = Object.values(this._values).map(escape).join(', ');
            return `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES (${vals})`;
        }
        
        if (this._type === 'UPDATE') {
            const sets = Object.entries(this._values).map(([k, v]) => `${k} = ${escape(v)}`).join(', ');
            let sql = `UPDATE ${this._table} SET ${sets}`;
            if (this._where.length) sql += ' WHERE ' + this._where.join(' AND ');
            return sql;
        }
        
        if (this._type === 'DELETE') {
            let sql = `DELETE FROM ${this._table}`;
            if (this._where.length) sql += ' WHERE ' + this._where.join(' AND ');
            return sql;
        }
        
        return '';
    }
    
    getLayerStatus() { return { name: 'QueryBuilder', type: 'db', enabled: true, state: { type: this._type, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'QueryBuilder' }; }
    getStatus() { return { enabled: true, type: this._type }; }
}

module.exports = {
    QueryBuilder, create: (o) => new QueryBuilder(o),
    select: (...c) => new QueryBuilder().select(...c),
    insert: (t, v) => new QueryBuilder().insert(t, v),
    update: (t, v) => new QueryBuilder().update(t, v),
    delete: (t) => new QueryBuilder().delete(t),
    getLayerStatus: () => ({ name: 'QueryBuilder', type: 'db', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'QueryBuilder' }),
    getStatus: () => ({ enabled: true })
};