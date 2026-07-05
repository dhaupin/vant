/**
 * Cloudflare Pages Function: /sync
 * 
 * Handles brain sync operations:
 * - handshake: Initialize a sync chain
 * - push: Push encrypted blob with sequence
 * - pull: Pull blobs since sequence
 * 
 * Uses Cloudflare KV for storage.
 */

// CORS headers for browser access
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400);
  }

  const { action, chainId, identity, seq, data, since } = body;

  if (!action) {
    return corsResponse(JSON.stringify({ error: 'action required' }), 400);
  }

  // Route to handler
  switch (action) {
    case 'handshake':
      return handleHandshake(chainId, identity, env);
    case 'push':
      return handlePush(chainId, seq, data, env);
    case 'pull':
      return handlePull(chainId, since, env);
    default:
      return corsResponse(JSON.stringify({ error: 'Unknown action: ' + action }), 400);
  }
}

/**
 * Handshake - Initialize a sync chain
 * Creates chain metadata in KV
 */
async function handleHandshake(chainId, identity, env) {
  if (!chainId) {
    return corsResponse(JSON.stringify({ error: 'chainId required' }), 400);
  }

  const kv = env.VANT_KV;
  if (!kv) {
    return corsResponse(JSON.stringify({ error: 'KV not configured' }), 500);
  }

  // Generate initial sequence
  const seq = Date.now();
  
  // Store chain metadata
  const metaKey = `chain:${chainId}:meta`;
  const meta = {
    chainId,
    identity: identity || {},
    created: seq,
    lastActive: seq
  };
  
  await kv.put(metaKey, JSON.stringify(meta));

  return corsResponse(JSON.stringify({ 
    ok: true, 
    chainId, 
    seq,
    message: 'Chain initialized'
  }));
}

/**
 * Push - Save encrypted blob with sequence
 * Stores blob in KV, updates chain seq
 */
async function handlePush(chainId, seq, data, env) {
  if (!chainId || seq === undefined || !data) {
    return corsResponse(JSON.stringify({ error: 'chainId, seq, and data required' }), 400);
  }

  const kv = env.VANT_KV;
  if (!kv) {
    return corsResponse(JSON.stringify({ error: 'KV not configured' }), 500);
  }

  // Store blob
  const blobKey = `chain:${chainId}:blob:${seq}`;
  const blobData = typeof data === 'string' ? data : JSON.stringify(data);
  await kv.put(blobKey, blobData);

  // Update chain seq
  const seqKey = `chain:${chainId}:seq`;
  await kv.put(seqKey, String(seq));

  // Update last active
  const metaKey = `chain:${chainId}:meta`;
  try {
    const existing = await kv.get(metaKey);
    if (existing) {
      const meta = JSON.parse(existing);
      meta.lastActive = Date.now();
      await kv.put(metaKey, JSON.stringify(meta));
    }
  } catch (e) {
    // Meta doesn't exist, ignore
  }

  return corsResponse(JSON.stringify({ 
    ok: true, 
    chainId, 
    seq,
    message: 'Blob stored'
  }));
}

/**
 * Pull - Get blobs since sequence
 * Returns all blobs after the given seq
 */
async function handlePull(chainId, since, env) {
  if (!chainId) {
    return corsResponse(JSON.stringify({ error: 'chainId required' }), 400);
  }

  const kv = env.VANT_KV;
  if (!kv) {
    return corsResponse(JSON.stringify({ error: 'KV not configured' }), 500);
  }

  // Get current seq
  const seqKey = `chain:${chainId}:seq`;
  const currentSeqStr = await kv.get(seqKey);
  const currentSeq = currentSeqStr ? parseInt(currentSeqStr) : 0;

  // Get chain meta
  const metaKey = `chain:${chainId}:meta`;
  let meta = null;
  try {
    const metaStr = await kv.get(metaKey);
    if (metaStr) meta = JSON.parse(metaStr);
  } catch (e) {
    // Ignore
  }

  // List all blobs (we need to scan - CF KV list_keys is limited)
  // For now, return meta + current seq
  // TODO: Implement proper blob listing with prefix scan
  
  const blobs = [];
  
  // Try to get recent blobs if we have a starting point
  if (since !== undefined && since < currentSeq) {
    // For now, just return the current state
    // Full implementation would need KV list with prefix
    const latestBlobKey = `chain:${chainId}:blob:${currentSeq}`;
    const latestBlob = await kv.get(latestBlobKey);
    if (latestBlob) {
      blobs.push({ seq: currentSeq, data: latestBlob });
    }
  }

  return corsResponse(JSON.stringify({ 
    ok: true, 
    chainId, 
    since: since || 0,
    currentSeq,
    blobs,
    meta
  }));
}

// Handle OPTIONS for CORS preflight
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

// Handle GET for health check
export async function onRequestGet(context) {
  return corsResponse(JSON.stringify({ 
    status: 'ok', 
    service: 'vant-sync',
    timestamp: Date.now()
  }));
}
