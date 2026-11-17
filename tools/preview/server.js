/* Local preview server: serves the real White Rose Clinic UI + real .gs backend (mocked GAS). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadApp, props, SRC } = require('./mock');
const seed = require('./seed');

const PORT = Number(process.env.PORT || 8787);
const ADMIN_USER = process.env.PREVIEW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PREVIEW_ADMIN_PASSWORD || 'Preview#12345';
const ADMIN_NAME = process.env.PREVIEW_ADMIN_NAME || 'مدیر کلینیک';
const WRC = loadApp();
const read = n => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8').replace(/^\uFEFF/, '');
const include = n => {
  const f = path.join(SRC, n + '.html');
  if (!fs.existsSync(f)) throw new Error('No HTML file named "' + n + '" was found.');
  return read(n);
};

props.AUTH_PEPPER = 'local-preview-pepper';
WRC.Schema.setupAll('preview');
WRC.Auth.bootstrapAdmin({ username: ADMIN_USER, password: ADMIN_PASS, displayName: ADMIN_NAME });
const seedCtx = { user: WRC.Auth.login(ADMIN_USER, ADMIN_PASS, 'seed').user };
const seeded = seed(WRC, seedCtx);
console.log('[preview] seeded:', JSON.stringify(seeded));

function token() {
  try { return WRC.Auth.login(ADMIN_USER, ADMIN_PASS, 'local-preview').token; }
  catch (e) { console.error('[preview] login failed:', e && e.message); return ''; }
}

const MOCK = t => `
<script>
(function(){
  sessionStorage.setItem('wrc_token', ${JSON.stringify(t)});
  function Runner(){ this._s = null; this._f = null; }
  Runner.prototype.withSuccessHandler = function(fn){ this._s = fn; return this; };
  Runner.prototype.withFailureHandler = function(fn){ this._f = fn; return this; };
  Runner.prototype.apiCall = function(action, payload, tk){
    var s = this._s, f = this._f;
    fetch('/api', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action: action, payload: payload || {}, token: tk || '' }) })
      .then(function(r){ return r.json(); })
      .then(function(res){ if (s) s(res); })
      .catch(function(e){ if (f) f({ message: e && e.message ? e.message : 'network error' }); });
  };
  window.google = { script: { run: new Runner() } };
})();
</script>`;

const ROUTER = `
<script>
(function(){
  var target = (location.hash || '').replace('#', '');
  if (!target) return;
  var tries = 0;
  function retry(fn){ if (++tries < 80) setTimeout(fn, 100); }
  function openInvoice(){
    var b = document.querySelector('[data-view]');
    if (b) b.click(); else retry(openInvoice);
  }
  function go(){
    if (target === 'payments') {
      var n = document.querySelector('.nav button[data-route="invoices"]');
      if (n) { n.click(); setTimeout(openInvoice, 150); } else retry(go);
      return;
    }
    var btn = document.querySelector('.nav button[data-route="' + target + '"]');
    if (btn) btn.click(); else retry(go);
  }
  setTimeout(go, 250);
})();
</script>`;

function renderPage() {
  let html = read('Client_Index');
  html = html.replace(/<\?(!?=)\s*JSON\.stringify\(include\((['"])([^'"]+)\2\)\)\s*;?\s*\?>/g,
    (m, e, q, n) => JSON.stringify(include(n)));
  html = html.replace(/<\?(!?=)\s*include\((['"])([^'"]+)\2\)\s*;?\s*\?>/g,
    (m, e, q, n) => include(n));
  html = html.replace('<body>', '<body>' + MOCK(token()));
  html = html.replace('</body>', ROUTER + '</body>');
  return html;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const body = renderPage();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Preview render error: ' + (e && e.message ? e.message : e));
    }
    return;
  }
  if (req.method === 'POST' && req.url === '/api') {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 5e6) req.destroy(); });
    req.on('end', () => {
      let out;
      try {
        const reqBody = JSON.parse(raw || '{}');
        out = apiCall(reqBody.action, reqBody.payload || {}, reqBody.token || '');
        console.log('[api]', reqBody.action, out && out.ok ? 'ok' : 'ERR ' + JSON.stringify(out && out.error));
      } catch (e) {
        out = { ok: false, error: { code: 'PREVIEW', message: String(e && e.message ? e.message : e) } };
        console.error('[api] failure:', e);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[preview] READY http://127.0.0.1:' + PORT + '/');
  console.log('[preview] login: ' + ADMIN_USER + ' (demo credential, see docs/preview.md)');
  console.log('[preview] routes:', ['dashboard', 'customers', 'doctors', 'services', 'invoices', 'payments', 'commissions', 'settings'].join(', '));
});
server.on('error', err => {
  console.error('[preview] server error:', err && err.message ? err.message : err);
  process.exit(1);
});
process.on('uncaughtException', err => console.error('[preview] uncaught exception:', err));
