// Local, home-only preview. Never proxy a request to the production site or API.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { events, cover } = require('./fixtures/home-stage1.cjs');
const ROOT = path.resolve(__dirname, '..');
const port = Number(process.env.CT_PREVIEW_PORT || 4174);
const origin = `http://127.0.0.1:${port}`;
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'";
const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type, 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' });
  res.end(body);
};
http.createServer((req, res) => {
  const url = new URL(req.url, origin);
  if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, 'text/plain', 'Local preview only');
  if (req.method === 'POST' && url.pathname === '/__fixture/catalog') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      if (params.get('metodo') !== 'ctEventosPublicosListarPROD' || params.get('argsJson') !== '[]' || params.get('ctMinhaCariocaAction') !== 'publicRpc')
        return send(res, 403, 'text/plain', 'Transactional calls are blocked');
      const scenario = new URL(req.headers.referer || origin).searchParams.get('scenario');
      const amount = Math.min(15, Math.max(1, Number(new URL(req.headers.referer || origin).searchParams.get('count')) || 2));
      const demo = Array.from({ length: amount }, (_, i) => ({ ...events[i % events.length], id: 'PREVIEW-RAIL-' + (i + 1), nome: events[i % events.length].nome + ' ' + (i + 1) }));
      const rows = scenario === 'missing' ? demo.map(row => ({ ...row, visual: {} })) : demo;
      const result = scenario === 'error' ? { sucesso: false } : { sucesso: true, eventos: scenario === 'empty' ? [] : rows };
      const payload = { ctMinhaCariocaPost: true, id: params.get('ctMinhaCariocaRequestId'), ok: true, resultado: result };
      return send(res, 200, 'text/html; charset=utf-8', `<script>parent.postMessage(${JSON.stringify(payload).replace(/</g, '\\u003c')}, ${JSON.stringify(origin)})</script>`);
    });
    return;
  }
  if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Writes are blocked');
  if (/^\/__fixture\/(music|creative)\.svg$/.test(url.pathname)) return send(res, 200, 'image/svg+xml', cover(url.pathname.includes('music') ? 'music' : 'creative'));
  if (url.pathname === '/pwa-register.js' || url.pathname === '/assets/ct-analytics.js') return send(res, 200, 'text/javascript', '// Disabled in isolated preview');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    html = html.replace('<body class="ct-home">', '<body class="ct-home"><aside id="preview-notice" style="padding:6px 16px;background:#d5bb82;color:#242424;text-align:center;font:12px/1.5 system-ui">Preview local · dados sintéticos · destinos externos e transações bloqueados</aside>');
    // Preserve production hrefs in source, but make the review surface safe to click.
    html = html.replace(/<a\b([^>]*?)href="(?!#|\/")([^"]+)"/g, '<a$1href="/__blocked"');
    html = html.replace(/<link rel="prefetch"[^>]+>/, '');
    return send(res, 200, 'text/html; charset=utf-8', html);
  }
  const allowed = /^\/assets\/(home-location\.(?:js|css)|home\.css|home-theme\.js|home-install\.js|home-navigation\.js|home-i18n\.js|home-controls\.js|home-advertisements\.js|home-event-rail\.js|public-share\.(js|css)|home-ad-(tpssf|priscila)\.png|home-municipalities\.json|public-event-catalog\.js|carioca-ticket-(simbolo|logo|icon-192)\.png)$/;
  if (!allowed.test(url.pathname)) return send(res, 403, 'text/html; charset=utf-8', '<h1>Destino bloqueado no preview</h1><p>Este ambiente permite revisar somente a home com dados sintéticos.</p><a href="/">Voltar à home</a>');
  const file = path.join(ROOT, url.pathname.slice(1));
  let body = fs.readFileSync(file);
  if (url.pathname.endsWith('home-advertisements.js')) {
    body = body.toString('utf8').replace(/href: 'https:\/\/[^']+'/g, "href: '/__blocked'");
  }
  if (url.pathname.endsWith('public-event-catalog.js')) {
    body = body.toString('utf8').replace(/https:\/\/script\.google\.com\/macros\/s\/[^']+\/exec/, `${origin}/__fixture/catalog`)
      .replace("event.origin !== 'https://script.google.com'", `event.origin !== '${origin}'`);
  }
  const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'image/png';
  send(res, 200, type, body);
}).listen(port, '127.0.0.1', () => console.log(`Synthetic home preview: ${origin}`));

