#!/usr/bin/env node
/**
 * MCP Tool Schema Validation Tests (audit P1 #14)
 *
 * 269 tools declare inputSchema but NOTHING validated params at dispatch —
 * the audit's "100+ tools define schemas but NONE validated at dispatch".
 * Now all three doors enforce the declared schema:
 *   - mcp.execute / mcp.call  → { error, problems } result
 *   - HTTP JSON-RPC (_executeWithSecurity) → coded VantError → error response
 *
 * Validator contract (fail-closed on DECLARED constraints, permissive on
 * undeclared keys so schemas without `properties` keep passing):
 *   - required missing            → problem
 *   - declared key of wrong type  → problem
 *   - enum violation              → problem
 *   - array minItems/maxItems     → respected
 *   - no schema / bare {type:'object'} → pass through
 *
 * Async harness pattern from security-chain.test.js (promises chained).
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const mcp = require(path.join(ROOT, 'lib', 'mcp'));

const results = { passed: 0, failed: 0 };
const failures = [];
let _chain = Promise.resolve();

function test(name, fn) {
    _chain = _chain.then(() => {
        return Promise.resolve().then(fn).then(ok => {
            if (ok === true || (ok && ok.success)) {
                results.passed++;
                console.log(`  ✓ ${name}`);
            } else {
                results.failed++;
                const msg = (ok && ok.error) || 'failed';
                failures.push(`${name}: ${msg}`);
                console.log(`  ✗ ${name}: ${msg}`);
            }
        }).catch(e => {
            results.failed++;
            failures.push(`${name}: ${e.message}`);
            console.log(`  ✗ ${name}: ${e.message}`);
        });
    });
}

console.log('\n🔌 MCP SCHEMA VALIDATION TESTS (P1 #14)\n');

// Probe tools
mcp.addMethod('test_schema_probe', {
    description: 'schema validation probe',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            count: { type: 'number' },
            mode: { type: 'string', enum: ['fast', 'safe'] },
            tags: { type: 'array', minItems: 1 }
        },
        required: ['name']
    },
    handler: async (params) => ({ ok: true, echo: params })
});

mcp.addMethod('test_schema_loose', {
    description: 'no-constraints probe',
    inputSchema: { type: 'object' },
    handler: async () => ({ ok: true })
});

test('execute: valid params reach handler', async () => {
    const r = await mcp.execute('test_schema_probe', { name: 'x', count: 2, mode: 'fast' });
    return { success: r && r.ok === true, error: JSON.stringify(r).slice(0, 120) };
});

test('execute: missing required param rejected with problems', async () => {
    const r = await mcp.execute('test_schema_probe', {});
    return {
        success: r && r.error === 'MCP_INPUT_INVALID' && Array.isArray(r.problems) && r.problems.length > 0,
        error: JSON.stringify(r).slice(0, 120)
    };
});

test('execute: wrong declared type rejected', async () => {
    const r = await mcp.execute('test_schema_probe', { name: 'x', count: 'two' });
    return { success: r && r.error === 'MCP_INPUT_INVALID' && /count/.test(JSON.stringify(r.problems)) };
});

test('execute: enum violation rejected', async () => {
    const r = await mcp.execute('test_schema_probe', { name: 'x', mode: 'yolo' });
    return { success: r && r.error === 'MCP_INPUT_INVALID' && /mode/.test(JSON.stringify(r.problems)) };
});

test('execute: array minItems respected', async () => {
    const r = await mcp.execute('test_schema_probe', { name: 'x', tags: [] });
    return { success: r && r.error === 'MCP_INPUT_INVALID' && /tags/.test(JSON.stringify(r.problems)) };
});

test('execute: undeclared keys pass through (permissive beyond schema)', async () => {
    const r = await mcp.execute('test_schema_probe', { name: 'x', extra: { a: 1 } });
    return { success: r && r.ok === true, error: JSON.stringify(r).slice(0, 120) };
});

test('call: same enforcement on the JSON-RPC-style door', async () => {
    const r = await mcp.call('test_schema_probe', { count: 1 });
    return { success: r && r.error === 'MCP_INPUT_INVALID', error: JSON.stringify(r).slice(0, 120) };
});

test('execute: unknown tool still returns not-found', async () => {
    const r = await mcp.execute('test_schema_nope', {});
    return { success: r && /not found/.test(r.error || ''), error: JSON.stringify(r).slice(0, 120) };
});

test('execute: bare {type:object} schema accepts anything', async () => {
    const r = await mcp.execute('test_schema_loose', { whatever: [1, 2, 3] });
    return { success: r && r.ok === true };
});

// Meta-test: every registered tool's declared schema must itself be valid
// under the validator (catches malformed schema objects repo-wide).
test('all registered tool schemas are well-formed for the validator', () => {
    const problems = [];
    for (const [name, def] of mcp.methods) {
        const schema = def && def.inputSchema;
        if (schema === undefined) continue; // schema-less tools are allowed
        if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
            problems.push(name + ': schema not an object');
            continue;
        }
        if (schema.type !== undefined && schema.type !== 'object') {
            problems.push(name + ': root type must be object, got ' + schema.type);
        }
        if (schema.properties && typeof schema.properties !== 'object') {
            problems.push(name + ': properties not an object');
        }
        if (schema.required && !Array.isArray(schema.required)) {
            problems.push(name + ': required not an array');
        }
    }
    return { success: problems.length === 0, error: problems.slice(0, 5).join('; ') };
});

// Coded error path used by the HTTP door (exposed for direct assertion)
test('_validateToolInput returns problems list, not throw', () => {
    const problems = mcp._validateToolInput(
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { a: 5 }
    );
    return { success: Array.isArray(problems) && problems.length === 1, error: JSON.stringify(problems) };
});

test('_validateToolInput: non-object params flagged', () => {
    const problems = mcp._validateToolInput({ type: 'object' }, 'not-an-object');
    return { success: problems.length === 1 && /object/.test(problems[0]) };
});

test('_validateToolInput: missing/undefined schema is a no-op', () => {
    return { success: mcp._validateToolInput(undefined, {}).length === 0 };
});

// Run the chained async tests, then report
_chain.then(() => {
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
});
