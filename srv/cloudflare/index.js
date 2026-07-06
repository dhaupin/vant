/**
 * Cloudflare Pages Function: Root Handler
 * 
 * General endpoints:
 * - GET / - Health check
 * - GET /health - Health check
 * - POST / - Generic handler (fallback)
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  
  const url = new URL(request.url);
  const path = url.pathname;

  // Health check
  if (path === '/' || path === '/health') {
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'vant-cloudflare',
      version: '0.9.0',
      timestamp: Date.now(),
      endpoints: {
        sync: '/sync',
        kv: '/kv'
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 404 for unknown paths
  return new Response(JSON.stringify({ 
    error: 'Not found',
    path
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  return new Response(JSON.stringify({ 
    error: 'Use /sync or /kv endpoints',
    available: ['/sync', '/kv']
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}
