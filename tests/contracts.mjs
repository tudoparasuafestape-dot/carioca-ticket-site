import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const protectedFiles = [
  'index.html',
  'evento/index.html',
  'checkout/index.html',
  'ingresso/index.html',
  'central/index.html',
  'saude-vendas/index.html',
  'reembolsos/index.html',
  'checkin/index.html',
  'consulta/index.html',
  'produtor/index.html',
  'produtor-v2/index.html',
  'acessos-v2/index.html',
  'eventos-v2/index.html',
  'evento-v2/index.html',
  'checkout-v2/index.html',
  'minha-carioca/index.html',
  'minha-carioca/conta/index.html',
  'minha-carioca/ingressos/index.html',
  'minha-carioca/acesso/index.html',
  'minha-carioca/login/index.html'
];

const errors = [];

function fail(file, rule, excerpt = '') {
  errors.push({ file, rule, excerpt: String(excerpt).slice(0, 220) });
}

function read(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    fail(file, 'arquivo protegido ausente');
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

for (const file of protectedFiles) {
  const html = read(file);
  if (!html) continue;

  if (!/Carioca Ticket/i.test(html)) {
    fail(file, 'identidade Carioca Ticket ausente');
  }

  const forbiddenNavigation = [
    /href\s*=\s*["'][^"']*(?:script\.google\.com|googleusercontent\.com|github\.io)[^"']*["']/gi,
    /action\s*=\s*["'][^"']*(?:script\.google\.com|googleusercontent\.com|github\.io)[^"']*["']/gi,
    /(?:window\.)?(?:top\.)?location(?:\.href)?\s*=\s*["'][^"']*(?:script\.google\.com|googleusercontent\.com|github\.io)[^"']*["']/gi,
    /location\.replace\(\s*["'][^"']*(?:script\.google\.com|googleusercontent\.com|github\.io)[^"']*["']/gi
  ];

  for (const regex of forbiddenNavigation) {
    const hit = html.match(regex);
    if (hit) fail(file, 'navegacao visivel para host tecnico proibido', hit[0]);
  }

  const relativePageNavigation = html.match(/(?:href|action)\s*=\s*["']\?page=[^"']*["']/gi);
  if (relativePageNavigation) {
    fail(file, 'rota relativa ?page= em navegacao publica', relativePageNavigation[0]);
  }

  if (html.includes('</label>\\n') || html.includes('required>\\n')) {
    fail(file, 'escape literal \\n visivel em formulario');
  }

  if (/<body[^>]*>\\\\n/i.test(html)) {
    fail(file, 'escape literal apos <body> fica visivel para o usuario');
  }
}

const home = read('index.html');
if (home) {
  if (!/href=["'][^"']*\/evento\//i.test(home)) {
    fail('index.html', 'home sem rota oficial /evento/');
  }
  if (!/href=["'][^"']*\/checkout\//i.test(home)) {
    fail('index.html', 'home sem rota oficial /checkout/');
  }
}

const eventoPublico = read('evento/index.html');
if (eventoPublico) {
  if (!eventoPublico.includes("ctMinhaCariocaAction','publicRpc'")) {
    fail('evento/index.html', 'evento oficial ainda nao usa ponte first-party');
  }
  if (!eventoPublico.includes('/checkout/')) {
    fail('evento/index.html', 'evento oficial sem rota first-party /checkout/');
  }
  if (/id=["']app["'][^>]*iframe|<iframe[^>]+id=["']app["']/i.test(eventoPublico)) {
    fail('evento/index.html', 'evento oficial ainda depende do iframe legado de aplicacao');
  }
}

const checkoutPublico = read('checkout/index.html');
if (checkoutPublico) {
  if (!checkoutPublico.includes("ctMinhaCariocaAction','publicRpc'")) {
    fail('checkout/index.html', 'checkout oficial ainda nao usa ponte first-party');
  }
  if (!checkoutPublico.includes('/evento/')) {
    fail('checkout/index.html', 'checkout oficial sem retorno first-party /evento/');
  }
  if (/id=["']app["'][^>]*iframe|<iframe[^>]+id=["']app["']/i.test(checkoutPublico)) {
    fail('checkout/index.html', 'checkout oficial ainda depende do iframe legado');
  }
}


for (const file of ['checkout/index.html', 'checkout-v2/index.html']) {
  const html = read(file);
  if (!html) continue;

  if (!html.includes('identidadeCliente') || !html.includes('emailObrigatorio')) {
    fail(file, 'checkout sem requisito adaptativo de e-mail/WhatsApp');
  }

  if (/id=["']buyerEmail["'][^>]*\srequired(?:\s|>|=)/i.test(html)) {
    fail(file, 'e-mail continua rigidamente obrigatorio no HTML');
  }

  if (!html.includes("state.emailRequired&&!email")) {
    fail(file, 'checkout sem fallback seguro para exigir e-mail antes do WhatsApp estar pronto');
  }
}


const reembolsos = read('reembolsos/index.html');
if (reembolsos) {
  if (!reembolsos.includes("ctMinhaCariocaAction','portalRpc'")) {
    fail('reembolsos/index.html', 'Reembolsos sem ponte first-party segura');
  }
  if (!reembolsos.includes('ctReembolsosCarregarPROD')) {
    fail('reembolsos/index.html', 'Reembolsos sem RPC de carga');
  }
  if (!reembolsos.includes('ctReembolsosDiagnosticarPROD')) {
    fail('reembolsos/index.html', 'Reembolsos sem diagnostico previo');
  }
  if (!reembolsos.includes('ctReembolsosExecutarPROD')) {
    fail('reembolsos/index.html', 'Reembolsos sem executor seguro');
  }
  if (!reembolsos.includes("==='REEMBOLSAR'")) {
    fail('reembolsos/index.html', 'Reembolsos sem confirmacao textual de seguranca');
  }
  if (/cardNumber|creditCardNumber|cvv|ccv/i.test(reembolsos)) {
    fail('reembolsos/index.html', 'Reembolsos referencia dados completos de cartao');
  }
}

const saudeVendas = read('saude-vendas/index.html');
if (saudeVendas) {
  if (!saudeVendas.includes("ctMinhaCariocaAction','portalRpc'")) {
    fail('saude-vendas/index.html', 'Saude das Vendas sem ponte first-party segura');
  }
  if (!saudeVendas.includes('ctSaudeVendasCarregarPROD')) {
    fail('saude-vendas/index.html', 'Saude das Vendas sem RPC de diagnostico');
  }
  if (!saudeVendas.includes('ctSaudeVendasReprocessarPedidoPROD')) {
    fail('saude-vendas/index.html', 'Saude das Vendas sem recuperacao segura');
  }
  if (!saudeVendas.includes('sysAsaasCoverage') || !saudeVendas.includes('sysAsaasMissing')) {
    fail('saude-vendas/index.html', 'Saude das Vendas sem auditoria visual do webhook Asaas');
  }
  if (!saudeVendas.includes('sysAsaasHosts')) {
    fail('saude-vendas/index.html', 'Saude das Vendas sem destino sanitizado do webhook Asaas');
  }
  if (/COMPRADOR_(?:NOME|EMAIL|WHATSAPP)/i.test(saudeVendas)) {
    fail('saude-vendas/index.html', 'Saude das Vendas referencia PII do comprador');
  }
}

const centralOficial = read('central/index.html');
if (centralOficial) {
  if (!centralOficial.includes('data-perm="SAUDE_VENDAS"')) {
    fail('central/index.html', 'Central sem permissao SAUDE_VENDAS');
  }
  if (!centralOficial.includes('/saude-vendas/?evento=')) {
    fail('central/index.html', 'Central sem rota first-party para Saude das Vendas');
  }
  if (!centralOficial.includes('data-perm="REEMBOLSOS"')) {
    fail('central/index.html', 'Central sem permissao REEMBOLSOS');
  }
  if (!centralOficial.includes('/reembolsos/?evento=')) {
    fail('central/index.html', 'Central sem rota first-party para Reembolsos');
  }
}

const ingresso = read('ingresso/index.html');
if (ingresso && !/Voltar para Minha Carioca/i.test(ingresso)) {
  fail('ingresso/index.html', 'ingresso sem retorno para Minha Carioca');
}

if (errors.length) {
  console.error('\n❌ CONTRATOS DE REGRESSAO FALHARAM\n');
  for (const e of errors) {
    console.error(`- ${e.file}: ${e.rule}${e.excerpt ? ` -> ${e.excerpt}` : ''}`);
  }
  process.exit(1);
}

console.log(`✅ ${protectedFiles.length} superficies protegidas passaram nos contratos de regressao.`);
