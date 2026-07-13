/**
 * Cloudflare Worker: proxy DNS para el diagnosticador en www.inboxseguro.com
 * Ruta: https://www.inboxseguro.com/api/dns?name=DOMAIN&type=TXT
 */
const ALLOWED_ORIGINS = [
  'https://www.inboxseguro.com',
  'https://inboxseguro.com'
];

const NAME_RE = /^[a-zA-Z0-9.*_@-]+$/;
const ALLOWED_TYPES = new Set(['TXT', 'A', 'AAAA', 'MX', 'CNAME', 'NS', 'SOA']);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=120',
      ...corsHeaders(origin)
    }
  });
}

async function resolveDns(name, type) {
  const upstream = 'https://cloudflare-dns.com/dns-query?name=' +
    encodeURIComponent(name) + '&type=' + encodeURIComponent(type);

  const res = await fetch(upstream, {
    headers: { Accept: 'application/dns-json' }
  });

  if (!res.ok) {
    throw new Error('Upstream DNS HTTP ' + res.status);
  }

  const data = await res.json();
  if (typeof data.Status !== 'number') {
    throw new Error('Upstream DNS invalid response');
  }

  return data;
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (url.pathname !== '/api/dns') {
    return fetch(request);
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin);
  }

  const name = (url.searchParams.get('name') || '').trim().toLowerCase();
  const type = (url.searchParams.get('type') || 'TXT').toUpperCase();

  if (!name || name.length > 253 || !NAME_RE.test(name)) {
    return jsonResponse({ error: 'Invalid DNS name' }, 400, origin);
  }

  if (!ALLOWED_TYPES.has(type)) {
    return jsonResponse({ error: 'Invalid DNS type' }, 400, origin);
  }

  try {
    const data = await resolveDns(name, type);
    return jsonResponse(data, 200, origin);
  } catch (err) {
    return jsonResponse({ error: 'DNS lookup failed', detail: String(err) }, 502, origin);
  }
}

addEventListener('fetch', function (event) {
  event.respondWith(handleRequest(event.request));
});
