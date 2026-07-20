/**
 * TokenBase — MVP server (zero external dependencies)
 * ------------------------------------------------------------
 *  • Signup -> API key + free credit
 *  • /v1/chat/completions & /v1/messages proxy with per-token billing
 *  • /v1/models, /v1/balance
 *  • Top-up via Paddle / LemonSqueezy (MoR) or local sandbox demo
 * Run:  node server.js   (set env vars as needed)
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

const ROOT = path.join(__dirname, '..');      // landing page assets
const PUBLIC = path.join(__dirname, 'public'); // dashboard assets

/* ---------------- helpers ---------------- */
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > limit) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}
function sendJSON(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) });
  res.end(b);
}
function sendError(res, code, type, message) {
  sendJSON(res, code, { error: { code, type, message } });
}
function estimateTokens(text) { return Math.max(1, Math.ceil((text || '').length / 4)); }
function estimateTokensFromSSE(sse) {
  let text = '';
  const re = /"content":\s*"((?:[^"\\]|\\.)*)"/g; let m;
  while ((m = re.exec(sse))) text += m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  return estimateTokens(text);
}
function requireUser(req, res) {
  const auth = req.headers['authorization'] || '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-api-key'] || '');
  if (!key) { sendError(res, 401, 'auth_error', 'Missing API key'); return null; }
  const user = store.getUserByKey(key);
  if (!user) { sendError(res, 401, 'auth_error', 'Invalid API key'); return null; }
  return user;
}
function priceFor(model) { return config.pricing[model] || config.pricing.default; }
function resolveProvider(model) {
  const m = config.models.find((x) => x.id === model);
  if (!m) return null;
  const p = config.providers[m.provider];
  if (!p) return null;
  return { ...p, upstreamModel: m.upstreamModel || model };
}

/* ---------------- proxy + billing ---------------- */
async function handleProxy(req, res, pathname) {
  const user = requireUser(req, res);
  if (!user) return;

  if (pathname === '/v1/balance') {
    return sendJSON(res, 200, {
      object: 'credit_grants',
      balance: user.balance, bonus_balance: user.bonusBalance, total_balance: store.totalBalance(user),
    });
  }

  if (pathname === '/v1/models') {
    const data = config.models.map((m) => ({
      id: m.id, object: 'model', owned_by: m.by, max_context: m.context,
    }));
    return sendJSON(res, 200, { object: 'list', data });
  }

  if (pathname !== '/v1/chat/completions' && pathname !== '/v1/messages') {
    return sendError(res, 404, 'not_found', 'Unknown endpoint');
  }

  const bodyStr = await readBody(req);
  let body = {};
  try { body = JSON.parse(bodyStr || '{}'); } catch {}
  const model = body.model || 'deepseek-chat';
  const price = priceFor(model);
  const isAnthropic = pathname === '/v1/messages';
  const prov = resolveProvider(model);

  if (store.totalBalance(user) <= 0) {
    return sendError(res, 402, 'insufficient_funds', 'Account balance insufficient');
  }

  // ---- DEMO fallback (provider key not configured) ----
  if (!prov || !prov.apiKey) {
    const promptTok = estimateTokens(JSON.stringify(body.messages || body.input || ''));
    const compTok = 25;
    const cost = (promptTok / 1e6) * price.in + (compTok / 1e6) * price.out;
    store.debit(user, cost);
    const out = isAnthropic
      ? { type: 'message', role: 'assistant', model, content: [{ type: 'text', text: '[Demo] TokenBase proxy works. Set the provider API key (e.g. DASHSCOPE_API_KEY) to route to a real model.' }], stop_reason: 'end_turn', usage: { input_tokens: promptTok, output_tokens: compTok } }
      : { id: 'chatcmpl-demo', object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: '[Demo] TokenBase proxy works. Set the provider API key (e.g. DASHSCOPE_API_KEY) to route to a real model.' }, finish_reason: 'stop' }], usage: { prompt_tokens: promptTok, completion_tokens: compTok, total_tokens: promptTok + compTok } };
    return sendJSON(res, 200, out);
  }

  // ---- real upstream (route to the model's provider) ----
  const upstreamPath = pathname.replace(/^\/v1/, ''); // '/chat/completions' | '/messages'
  let upstreamBody = bodyStr;
  if (prov.upstreamModel && prov.upstreamModel !== model) {
    try { const b = JSON.parse(bodyStr); b.model = prov.upstreamModel; upstreamBody = JSON.stringify(b); } catch {}
  }
  const upstreamRes = await fetch(prov.baseUrl + upstreamPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + prov.apiKey },
    body: upstreamBody,
  });

  if (!body.stream) {
    const txt = await upstreamRes.text();
    if (upstreamRes.status === 200) {
      try {
        const j = JSON.parse(txt);
        const u = j.usage || {};
        const pTok = isAnthropic ? (u.input_tokens || 0) : (u.prompt_tokens || 0);
        const cTok = isAnthropic ? (u.output_tokens || 0) : (u.completion_tokens || 0);
        store.debit(user, (pTok / 1e6) * price.in + (cTok / 1e6) * price.out);
      } catch {}
    }
    res.writeHead(upstreamRes.status, { 'content-type': 'application/json' });
    return res.end(txt);
  }

  // streaming passthrough (approximate billing on completion)
  res.writeHead(upstreamRes.status, Object.fromEntries(upstreamRes.headers));
  let acc = '';
  const reader = upstreamRes.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      acc += chunk; res.write(chunk);
    }
  } finally { res.end(); }
  const cTok = estimateTokensFromSSE(acc);
  const pTok = estimateTokens(JSON.stringify(body.messages || body.input || ''));
  store.debit(user, (pTok / 1e6) * price.in + (cTok / 1e6) * price.out);
}

/* ---------------- payments ---------------- */
async function paddleCheckout(user, pkg) {
  const base = config.paddle.env === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
  const priceId = config.paddle.prices[pkg.id];
  if (!config.paddle.apiKey || !priceId) throw new Error('Paddle not configured for ' + pkg.id);
  const r = await fetch(base + '/checkout/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.paddle.apiKey },
    body: JSON.stringify({ items: [{ price_id: priceId, quantity: 1 }], custom_data: { userId: user.id, packageId: pkg.id }, customer: user.email ? { email: user.email } : undefined }),
  });
  const j = await r.json();
  if (!j.data || !j.data.url) throw new Error('Paddle checkout failed: ' + JSON.stringify(j));
  return j.data.url;
}
async function lsCheckout(user, pkg) {
  const variantId = config.lemonsqueezy.variants[pkg.id];
  if (!config.lemonsqueezy.apiKey || !variantId) throw new Error('LemonSqueezy not configured for ' + pkg.id);
  const r = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + config.lemonsqueezy.apiKey },
    body: JSON.stringify({ data: { type: 'checkouts', attributes: { custom_data: { userId: user.id, packageId: pkg.id } }, relationships: { variant: { data: { type: 'variants', id: String(variantId) } }, store: { data: { type: 'stores', id: String(config.lemonsqueezy.storeId) } } } } }),
  });
  const j = await r.json();
  if (!j.data) throw new Error('LemonSqueezy checkout failed: ' + JSON.stringify(j));
  return j.data.attributes.url;
}
function verifyPaddle(raw, sigHeader) {
  const secret = config.paddle.webhookSecret; if (!secret || !sigHeader) return false;
  const parts = sigHeader.split(','); let ts = '', h1 = '';
  parts.forEach((p) => { const [k, v] = p.split('='); if (k === 'ts') ts = v; if (k === 'h1') h1 = v; });
  const expected = crypto.createHmac('sha256', secret).update(ts + ':' + raw).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(h1)); } catch { return false; }
}
function verifyLS(raw, sigHeader) {
  const secret = config.lemonsqueezy.webhookSecret; if (!secret || !sigHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return expected === sigHeader;
}
function creditFromEvent(user, pkg, note) { if (user && pkg) store.credit(user, pkg.credit, note); }

function successHtml(pkgName, balance) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payment success</title>
  <style>body{font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f7f8fc;color:#0d1222}
  .c{background:#fff;border:1px solid #e4e8f2;border-radius:16px;padding:40px 48px;text-align:center;box-shadow:0 12px 32px rgba(13,18,34,.08)}
  h1{color:#10b981;margin:0 0 8px}.b{font-weight:800;font-size:22px;margin-top:14px}a{display:inline-block;margin-top:22px;background:linear-gradient(120deg,#4f46e5,#7c3aed);color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600}</style></head>
  <body><div class="c"><h1>✅ Payment successful</h1><p>${pkgName ? 'Added ' + pkgName : ''}</p>
  <p class="b">New balance: $${balance.toFixed(2)}</p><a href="/dashboard">Back to dashboard →</a></div></body></html>`;
}

/* ---------------- static ---------------- */
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
function serveFile(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}

/* ---------------- router ---------------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const method = req.method;

    // ---- API: account ----
    if (method === 'POST' && pathname === '/api/register') {
      const body = JSON.parse(await readBody(req) || '{}');
      const user = store.createUser(body.email);
      if (config.freeCreditOnSignup > 0) store.credit(user, config.freeCreditOnSignup, 'free signup credit');
      return sendJSON(res, 200, {
        id: user.id, apiKey: user.apiKey, email: user.email,
        balance: user.balance, bonusBalance: user.bonusBalance, totalBalance: store.totalBalance(user),
      });
    }
    if (method === 'GET' && pathname === '/api/me') {
      const user = store.getUserByKey(url.searchParams.get('key'));
      if (!user) return sendError(res, 401, 'auth_error', 'Invalid API key');
      return sendJSON(res, 200, { id: user.id, email: user.email, balance: user.balance, bonusBalance: user.bonusBalance, totalBalance: store.totalBalance(user) });
    }
    if (method === 'GET' && pathname === '/api/packages') {
      return sendJSON(res, 200, { currency: config.currency, packages: config.packages });
    }

    // ---- API: checkout ----
    if (method === 'POST' && pathname === '/api/checkout') {
      const body = JSON.parse(await readBody(req) || '{}');
      const user = store.getUserByKey(body.key);
      if (!user) return sendError(res, 401, 'auth_error', 'Invalid API key');
      const pkg = config.packages.find((p) => p.id === body.packageId);
      if (!pkg) return sendError(res, 400, 'bad_request', 'Unknown package');
      let url;
      if (config.paymentProvider === 'sandbox') {
        url = `/api/sandbox-pay?key=${encodeURIComponent(user.apiKey)}&packageId=${pkg.id}`;
      } else if (config.paymentProvider === 'paddle') {
        url = await paddleCheckout(user, pkg);
      } else if (config.paymentProvider === 'lemonsqueezy') {
        url = await lsCheckout(user, pkg);
      } else {
        return sendError(res, 500, 'config_error', 'Unknown payment provider');
      }
      return sendJSON(res, 200, { url, provider: config.paymentProvider });
    }
    if (method === 'GET' && pathname === '/api/sandbox-pay') {
      const user = store.getUserByKey(url.searchParams.get('key'));
      const pkg = config.packages.find((p) => p.id === url.searchParams.get('packageId'));
      if (user && pkg) store.credit(user, pkg.credit, 'sandbox top-up ' + pkg.name);
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(successHtml(pkg ? pkg.name : '', user ? store.totalBalance(user) : 0));
    }

    // ---- API: payment webhooks ----
    if (method === 'POST' && pathname === '/api/webhook/paddle') {
      const raw = await readBody(req);
      if (!verifyPaddle(raw, req.headers['paddle-signature'])) return res.writeHead(401), res.end('bad signature');
      const evt = JSON.parse(raw);
      if (evt.event_type === 'transaction.completed') {
        const cd = evt.data?.custom_data || {};
        const user = store.getUserById(cd.userId);
        const pkg = config.packages.find((p) => p.id === cd.packageId);
        creditFromEvent(user, pkg, 'Paddle: ' + (evt.data?.id || ''));
      }
      return sendJSON(res, 200, { received: true });
    }
    if (method === 'POST' && pathname === '/api/webhook/lemonsqueezy') {
      const raw = await readBody(req);
      if (!verifyLS(raw, req.headers['x-signature'])) return res.writeHead(401), res.end('bad signature');
      const evt = JSON.parse(raw);
      const cd = evt.meta?.custom_data || {};
      if (evt.meta?.event_name === 'order_created' || evt.meta?.event_name === 'subscription_payment_success') {
        const user = store.getUserById(cd.userId);
        const pkg = config.packages.find((p) => p.id === cd.packageId);
        creditFromEvent(user, pkg, 'LemonSqueezy: ' + (evt.data?.id || ''));
      }
      return sendJSON(res, 200, { received: true });
    }

    // ---- model proxy ----
    if (pathname.startsWith('/v1/')) return handleProxy(req, res, pathname);

    // ---- pages ----
    if (method === 'GET' && pathname === '/') return serveFile(res, path.join(ROOT, 'index.html'));
    if (method === 'GET' && pathname === '/dashboard') return serveFile(res, path.join(PUBLIC, 'dashboard.html'));
    if (method === 'GET' && (pathname === '/styles.css' || pathname === '/script.js')) return serveFile(res, path.join(ROOT, pathname.slice(1)));
    if (method === 'GET' && pathname === '/dashboard.js') return serveFile(res, path.join(PUBLIC, 'dashboard.js'));

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error('Request error:', err.message);
    if (!res.headersSent) sendError(res, 500, 'server_error', err.message);
    else res.end();
  }
});

server.listen(config.port, () => {
  const configured = Object.entries(config.providers).filter(([, p]) => p.apiKey).map(([k]) => k);
  console.log(`TokenBase MVP running at http://localhost:${config.port}`);
  console.log(`Payment provider: ${config.paymentProvider}`);
  console.log(`Providers with keys: ${configured.length ? configured.join(', ') : 'NONE (DEMO mode for all models)'}`);
});
