/**
 * Cloudflare Pages Function: /kv
 * 
 * Direct KV operations:
 * - get: Get value by key
 * - put: Put value with key
 * - delete: Delete key
 * - list: List keys with prefix
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { action, key, value, prefix } = body;

  if (!action) {
    return new Response(JSON.stringify({ error: 'action required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const kv = env.VANT_KV;
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  switch (action) {
    case 'get':
      return handleGet(key, kv);
    case 'put':
      return handlePut(key, value, kv);
    case 'delete':
      return handleDelete(key, kv);
    case 'list':
      return handleList(prefix, kv);
    default:
      return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
  }
}

async function handleGet(key, kv) {
  if (!key) {
    return new Response(JSON.stringify({ error: 'key required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const value = await kv.get(key);
  return new Response(JSON.stringify({ ok: true, key, value }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handlePut(key, value, kv) {
  if (!key || value === undefined) {
    return new Response(JSON.stringify({ error: 'key and value required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
  await kv.put(key, valueStr);
  
  return new Response(JSON.stringify({ ok: true, key, stored: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleDelete(key, kv) {
  if (!key) {
    return new Response(JSON.stringify({ error: 'key required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await kv.delete(key);
  
  return new Response(JSON.stringify({ ok: true, key, deleted: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleList(prefix, kv) {
  const list = await kv.list({ prefix: prefix || '' });
  
  return new Response(JSON.stringify({ 
    ok: true, 
    keys: list.keys.map(k => ({ name: k.name, expiration: k.expiration })),
    listComplete: list.list_complete,
    cursor: list.cursor
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
