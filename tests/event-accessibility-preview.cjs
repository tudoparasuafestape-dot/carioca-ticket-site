// Loopback-only preview. Synthetic transport, no operational RPC and no purchases.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { events, cover } = require('./fixtures/home-stage1.cjs');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.CT_EVENT_PREVIEW_PORT || 42971);
const origin = `http://127.0.0.1:${port}`;
const fixture = {
  sucesso: true,
  evento: { id: 'PREVIEW-EVENT', nome: 'Encontro de música — demonstração', data: '20/12/2030', horario: '18h às 22h', local: 'Espaço de demonstração', cidade: 'Recife', uf: 'PE' },
  visual: { capaUrl: '/__fixture/music.svg', categoria: 'Música · fixture', realizacao: 'Equipe de demonstração', destaque: 'Uma noite para celebrar a música.', descricaoCurta: 'Evento fictício para revisar a página pública.', descricaoCompleta: 'Venha celebrar a música com a gente.\n\nOs portões abrem às dezoito horas. O espaço terá apresentações e uma área de convivência.\n\nEsta é uma demonstração com dados sintéticos, sem venda ou emissão de ingressos.', observacoes: 'Dados sintéticos. Nenhuma compra está disponível nesta prévia.' },
  menorPreco: 'R$ 35,00',
  tipos: [{ nome: 'Entrada — demonstração', descricao: 'Acesso fictício para revisão.', lotes: [{ nome: 'Lote de demonstração', precoNumero: 35, preco: 'R$ 35,00' }] }]
};
const prelude = `<script>
HTMLFormElement.prototype.submit = function () {
  const fields = new FormData(this);
  const method = fields.get('metodo');
  if (fields.get('ctMinhaCariocaAction') !== 'publicRpc' ||
      !['ctEventoPublicoCarregarPROD','ctEventosPublicosListarPROD'].includes(method)) throw new Error('Blocked in synthetic preview');
  const result = method === 'ctEventosPublicosListarPROD' ? ${JSON.stringify({ sucesso: true, eventos: events })} : ${JSON.stringify(fixture)};
  if (method === 'ctEventoPublicoCarregarPROD' && new URL(location.href).searchParams.get('scenario') === 'no-cover') {
    result.visual.capaUrl = '';
    result.visual.posterUrl = '';
  }
  setTimeout(() => window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://script.google.com',
    data: { ctMinhaCariocaPost: true, id: fields.get('ctMinhaCariocaRequestId'), ok: true, resultado: result }
  })), 20);
};
document.addEventListener('click', function(event) {
  const link = event.target.closest('a');
  if (!link) return;
  const target = new URL(link.href, location.href);
  if (target.origin === location.origin && ['/', '/evento/', '/evento-v2/'].includes(target.pathname)) return;
  event.preventDefault();
  document.getElementById('preview-notice').textContent = 'Destino bloqueado nesta prévia. Nenhuma compra ou acesso externo foi feito.';
}, true);
</script>`;
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'";
function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' });
  res.end(body);
}
module.exports = http.createServer((req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, 'text/plain', 'Loopback only');
  if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Writes blocked');
  const url = new URL(req.url, origin);
  if (url.pathname === '/__fixture/music.svg' || url.pathname === '/__fixture/creative.svg') return send(res, 200, 'image/svg+xml', cover('music'));
  if (['/pwa-register.js', '/assets/ct-analytics.js'].includes(url.pathname)) return send(res, 200, 'text/javascript', '// Disabled in isolated preview');
  if (['/', '/evento/', '/evento-v2/'].includes(url.pathname)) {
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1) + 'index.html';
    let html = fs.readFileSync(path.join(root, file), 'utf8');
    html = html.replace('<head>', '<head>' + prelude).replace(/<link rel="prefetch"[^>]+>/g, '');
    html = html.replace(/(<body[^>]*>)/, '$1<aside id="preview-notice" style="padding:8px 16px;background:#ffd66d;color:#171717;text-align:center;font:13px system-ui">Prévia local · dados sintéticos · compras e destinos externos bloqueados</aside>');
    return send(res, 200, 'text/html; charset=utf-8', html);
  }
  const allowed = /^\/assets\/(waze-mark\.svg|home-location\.(?:js|css)|public-i18n\.js|event-i18n\.(?:js|css)|event-(?:directions|map-preview)\.(?:js|css)|event-uber\.(?:js|css)|event-ride-destinations\.js|event-accessibility\.css|event-description-speech\.js|home(?:\.css|-install\.js|-theme\.js|-navigation\.js|-controls\.js|-i18n\.js|-advertisements\.js|-event-rail\.js|-municipalities\.json|-ad-(?:tpssf|priscila)\.png)|public-event-catalog\.js|public-(?:share|privacy)\.(?:js|css)|carioca-ticket-(?:simbolo|logo|icon-192)\.png)$/;
  if (!allowed.test(url.pathname)) return send(res, 403, 'text/plain', 'Destination blocked in synthetic preview');
  const file = path.join(root, url.pathname.slice(1));
  const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'image/png';
  send(res, 200, type, fs.readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`Synthetic event preview: ${origin}/evento/?evento=PREVIEW-EVENT`));


