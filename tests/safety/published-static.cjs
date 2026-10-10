'use strict';
// Static HTTP smoke. No browser, JavaScript execution, POST, RPC or redirect.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROUTES = Object.freeze(['/', '/evento/', '/evento-v2/', '/checkout/', '/checkout-v2/', '/produtor-v2/',
  '/parceiro/programa/', '/parceiro/ativar/', '/minha-carioca/conta/',
  '/central/', '/produtor/', '/produtor/solicitar/', '/produtor/solicitacoes/', '/parceiro/', '/parceiro/admin/',
  '/fornecedor/', '/acessos/', '/cupons/', '/cupons/admin/', '/checkin/', '/consulta/', '/vendas/', '/bar/',
  '/eventos-v2/', '/fornecedores/', '/crm/', '/financeiro/', '/reembolsos/', '/saude-vendas/', '/relatorios/', '/comissionado/', '/comissoes/',
  '/ingresso/', '/assets/public-i18n.js', '/assets/event-i18n.js', '/assets/event-i18n.css',
  '/assets/checkout-language.js', '/assets/checkout-language.css', '/assets/checkout-translations.js',
  '/assets/public-privacy.js', '/assets/public-privacy.css', '/assets/event-map-preview.js', '/assets/event-map-preview.css',
  '/manifest.webmanifest', '/sw.js', '/assets/ct-analytics.js', '/assets/carioca-ticket-logo.png',
  '/assets/carioca-ticket-icon-192.png', '/assets/carioca-ticket-icon-512.png', '/assets/carioca-ticket-icon-maskable-512.png']);
function readStatic(base, route) {
  const origin = new URL(base);
  assert.equal(origin.origin, base, 'Explicit origin only');
  assert(origin.protocol === 'https:' && origin.hostname === 'cariocaticket.com.br' ||
    origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname), 'Unapproved static origin');
  assert(ROUTES.includes(route), 'Unapproved static path');
  const url = new URL(route, base);
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).get(url, { timeout: 15000,
      headers: { 'User-Agent': 'CariocaTicket-static-smoke', 'Cache-Control': 'no-cache' } }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('Static HTTP status ' + res.statusCode + ' for ' + route)); return; }
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 5e6) req.destroy(new Error('Static response too large')); else chunks.push(chunk); });
      res.on('end', () => resolve(Buffer.concat(chunks))); res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Static GET timeout'))); req.on('error', reject);
  });
}
const normalize = (body, file) => /\.(?:html|js|webmanifest)$/.test(file) ? Buffer.from(body.toString('utf8').replace(/\r\n/g, '\n')) : body;
async function runSmoke(base, root, routes = ROUTES) {
  const results = [], report = { mode: 'static-http-only', success: false, javascriptExecuted: false, rpcCalls: 0, redirectsFollowed: 0, results };
  let currentRoute;
  try {
  for (const route of routes) {
    currentRoute = route;
    const file = route.endsWith('/') ? route + 'index.html' : route;
    const expected = normalize(fs.readFileSync(path.join(root, file)), file);
    const actual = normalize(await readStatic(base, route), file);
    assert(actual.equals(expected), 'Published static content differs from checkout: ' + route);
    results.push({ path: route, method: 'GET', status: 200, sha256: crypto.createHash('sha256').update(actual).digest('hex') });
  }
  report.success = true;
  return report;
  } catch (error) {
    report.failure = { path: currentRoute, message: error.message };
    error.report = report;
    throw error;
  }
}
function saveReport(report) {
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/published-static.json', JSON.stringify(report, null, 2));
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] !== '--base-url' || args.length !== 2) throw new Error('Usage: node tests/safety/published-static.cjs --base-url https://cariocaticket.com.br');
  runSmoke(args[1], path.resolve(__dirname, '../..')).then(report => {
    saveReport(report);
    console.log('PASS static content matches checkout: ' + report.results.length + ' GETs; JavaScript/RPC never executed');
  }).catch(error => { if (error.report) saveReport(error.report); console.error(error.message); process.exitCode = 1; });
}
module.exports = { ROUTES, readStatic, runSmoke };
