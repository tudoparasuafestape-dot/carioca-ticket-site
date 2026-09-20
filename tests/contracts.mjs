import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const protectedFiles = [
  'index.html',
  'evento/index.html',
  'checkout/index.html',
  'ingresso/index.html',
  'central/index.html',
  'checkin/index.html',
  'consulta/index.html',
  'produtor/index.html',
  'produtor-v2/index.html',
  'acessos-v2/index.html',
  'eventos-v2/index.html',
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
