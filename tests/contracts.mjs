import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const protectedFiles = [
  'index.html',
  'evento/index.html',
  'checkout/index.html',
  'ingresso/index.html',
  'central/index.html',
  'financeiro/index.html',
  'saude-vendas/index.html',
  'reembolsos/index.html',
  'checkin/index.html',
  'consulta/index.html',
  'produtor/index.html',
  'produtor/carioca-pay/index.html',
  'produtor/financeiro/index.html',
  'produtor/solicitar/index.html',
  'produtor/solicitacoes/index.html',
  'produtor-v2/index.html',
  'acessos-v2/index.html',
  'eventos-v2/index.html',
  'evento-v2/index.html',
  'checkout-v2/index.html',
  'minha-carioca/index.html',
  'minha-carioca/conta/index.html',
  'minha-carioca/ingressos/index.html',
  'minha-carioca/acesso/index.html',
  'minha-carioca/login/index.html',
  'parceiro/index.html',
  'parceiro/programa/index.html',
  'parceiro/admin/index.html',
  'backoffice/index.html',
  'backoffice/carioca-pay/index.html',
  'backoffice/carioca-pay/baas-sandbox/index.html',
  'backoffice/carioca-pay/saldo-extrato/index.html',
  'parceiro/ativar/index.html',
  'parceiro/manual/index.html',
  'parceiro/regulamento/index.html',
  'parceiro/conduta/index.html',
  'parceiro/regras-comerciais/index.html',
  'parceiro/tratamento-dados/index.html'
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

function readPngSize(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    fail(file, 'icone PNG ausente');
    return null;
  }
  const buffer = fs.readFileSync(full);
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer.toString('ascii', 1, 4) !== 'PNG'
  ) {
    fail(file, 'icone nao e PNG valido');
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

for (const spec of [
  ['assets/carioca-ticket-icon-192.png', 192, 192],
  ['assets/carioca-ticket-icon-512.png', 512, 512],
  ['assets/carioca-ticket-icon-maskable-512.png', 512, 512]
]) {
  const size = readPngSize(spec[0]);
  if (size && (size.width !== spec[1] || size.height !== spec[2])) {
    fail(spec[0], `dimensao incorreta: ${size.width}x${size.height}`);
  }
}

const manifest = read('manifest.webmanifest');
if (manifest) {
  let parsed = null;
  try {
    parsed = JSON.parse(manifest);
  } catch {
    fail('manifest.webmanifest', 'manifesto PWA invalido');
  }

  if (parsed) {
    if (parsed.name !== 'Carioca Ticket' || parsed.short_name !== 'Carioca Ticket') {
      fail('manifest.webmanifest', 'nome oficial da aplicacao ausente');
    }
    if (parsed.start_url !== '/' || parsed.scope !== '/' || parsed.display !== 'standalone') {
      fail('manifest.webmanifest', 'escopo/start_url/display PWA incorretos');
    }
    const icons = Array.isArray(parsed.icons) ? parsed.icons : [];
    const requiredIcons = [
      ['/assets/carioca-ticket-icon-192.png', '192x192', 'any'],
      ['/assets/carioca-ticket-icon-512.png', '512x512', 'any'],
      ['/assets/carioca-ticket-icon-maskable-512.png', '512x512', 'maskable']
    ];
    for (const required of requiredIcons) {
      if (!icons.some(icon =>
        icon &&
        icon.src === required[0] &&
        icon.sizes === required[1] &&
        String(icon.purpose || '').includes(required[2])
      )) {
        fail('manifest.webmanifest', `icone PWA ausente/incorreto: ${required[0]}`);
      }
    }
  }
}

for (const file of [
  'index.html',
  'evento/index.html',
  'checkout/index.html',
  'minha-carioca/conta/index.html'
]) {
  const html = read(file);
  if (!html) continue;

  if (!html.includes('rel="manifest" href="/manifest.webmanifest"')) {
    fail(file, 'pagina sem manifesto PWA oficial');
  }
  if (!html.includes('rel="apple-touch-icon" sizes="192x192" href="/assets/carioca-ticket-icon-192.png"')) {
    fail(file, 'pagina sem icone mobile quadrado oficial');
  }
  if (!html.includes('/pwa-register.js')) {
    fail(file, 'pagina sem registro do service worker PWA');
  }
}


const producerManifest = read('manifest-produtor.webmanifest');
if (producerManifest) {
  let parsedProducer = null;
  try {
    parsedProducer = JSON.parse(producerManifest);
  } catch {
    fail('manifest-produtor.webmanifest', 'manifesto PWA do produtor invalido');
  }

  if (parsedProducer) {
    if (
      parsedProducer.id !== '/produtor/' ||
      parsedProducer.name !== 'Carioca Ticket Produtor' ||
      parsedProducer.short_name !== 'CT Produtor'
    ) {
      fail('manifest-produtor.webmanifest', 'identidade do app do produtor incorreta');
    }
    if (
      parsedProducer.start_url !== '/produtor/' ||
      parsedProducer.scope !== '/' ||
      parsedProducer.display !== 'standalone'
    ) {
      fail('manifest-produtor.webmanifest', 'start_url/scope/display do app do produtor incorretos');
    }

    const producerIcons = Array.isArray(parsedProducer.icons) ? parsedProducer.icons : [];
    for (const required of [
      ['/assets/carioca-ticket-icon-192.png', '192x192', 'any'],
      ['/assets/carioca-ticket-icon-512.png', '512x512', 'any'],
      ['/assets/carioca-ticket-icon-maskable-512.png', '512x512', 'maskable']
    ]) {
      if (!producerIcons.some(icon =>
        icon &&
        icon.src === required[0] &&
        icon.sizes === required[1] &&
        String(icon.purpose || '').includes(required[2])
      )) {
        fail('manifest-produtor.webmanifest', `icone do app do produtor ausente/incorreto: ${required[0]}`);
      }
    }
  }
}

for (const file of [
  'produtor/index.html',
  'produtor/financeiro/index.html',
  'backoffice/carioca-pay/index.html',
  'central/index.html',
  'saude-vendas/index.html',
  'reembolsos/index.html',
  'financeiro/index.html',
  'relatorios/index.html',
  'acessos/index.html'
]) {
  const html = read(file);
  if (!html) continue;

  if (!html.includes('rel="manifest" href="/manifest-produtor.webmanifest"')) {
    fail(file, 'area administrativa sem manifesto PWA do produtor');
  }
  if (!html.includes('carioca-ticket-icon-192.png')) {
    fail(file, 'area administrativa sem icone quadrado oficial');
  }
  if (!html.includes('/pwa-register.js')) {
    fail(file, 'area administrativa sem registro PWA');
  }
}

const checkinManifest = read('manifest-checkin.webmanifest');
if (checkinManifest) {
  try {
    const parsedCheckin = JSON.parse(checkinManifest);
    if (
      parsedCheckin.id !== '/checkin/' ||
      parsedCheckin.start_url !== '/checkin/' ||
      parsedCheckin.scope !== '/checkin/' ||
      parsedCheckin.display !== 'standalone' ||
      parsedCheckin.name !== 'Carioca Ticket Check-in'
    ) {
      fail('manifest-checkin.webmanifest', 'identidade/start_url/scope do PWA de Check-in incorretos');
    }
  } catch (error) {
    fail('manifest-checkin.webmanifest', 'JSON inválido');
  }
}
const checkinPagePwa = read('checkin/index.html');
if (checkinPagePwa) {
  if (!checkinPagePwa.includes('rel="manifest" href="/manifest-checkin.webmanifest"')) {
    fail('checkin/index.html', 'Check-in sem manifesto PWA próprio');
  }
  if (!checkinPagePwa.includes('carioca-ticket-icon-192.png')) {
    fail('checkin/index.html', 'Check-in sem ícone oficial');
  }
  if (!checkinPagePwa.includes('/pwa-register.js')) {
    fail('checkin/index.html', 'Check-in sem registro PWA base');
  }
}

const contaCariocaPayPage = read('produtor/financeiro/index.html');
if (contaCariocaPayPage) {
  for (const required of [
    '<title>Conta Carioca Pay | Portal do Produtor</title>',
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'ctPortalProdutorRestaurarSessaoIsoladaPROD',
    'ctContaCariocaPayPortalResumoPROD',
    'Vendas confirmadas',
    'Saldo operacional conciliado',
    'Disponível para solicitar antecipação',
    'Pagamentos planejados',
    'Portaria / Smart App',
    'Bar / Smart App',
    'Patrocínios',
    'Capital próprio',
    'Regras de antecipação',
    '80%',
    '20%',
    '3,5%',
    'D+3 úteis',
    'movimentação real desabilitada',
    'ctContaCariocaPayPortalSolicitarAntecipacaoPROD',
    'ctContaCariocaPayPortalSolicitarSaquePROD',
    'Solicitar saque',
    'Mínimo de R$ 500,00'
  ]) {
    if (!contaCariocaPayPage.includes(required)) {
      fail('produtor/financeiro/index.html', 'Conta Carioca Pay incompleta: ' + required);
    }
  }

  if (
    !contaCariocaPayPage.includes('rel="manifest" href="/manifest-produtor.webmanifest"') ||
    !contaCariocaPayPage.includes('/pwa-register.js')
  ) {
    fail('produtor/financeiro/index.html', 'Conta Carioca Pay sem PWA oficial do produtor');
  }

  if (
    !contaCariocaPayPage.includes("rpc('ctContaCariocaPayPortalSolicitarAntecipacaoPROD'") ||
    !contaCariocaPayPage.includes("rpc('ctContaCariocaPayPortalSolicitarSaquePROD'") ||
    !contaCariocaPayPage.includes('Solicitação registrada e enviada para análise do Administrador Master') ||
    !contaCariocaPayPage.includes('Solicitação de saque registrada e enviada para análise do Administrador Master') ||
    contaCariocaPayPage.includes("rpc('ctContaCariocaPayPortalSolicitarAportePROD'") ||
    contaCariocaPayPage.includes("rpc('ctContaCariocaPayPortalPlanejarPagamentoPROD'") ||
    contaCariocaPayPage.includes("rpc('ctContaCariocaPayPortalRegistrarPatrocinioPROD'")
  ) {
    fail('produtor/financeiro/index.html', 'UI financeira nao converge exclusivamente para solicitacoes protegidas pelo Master');
  }
}

const contaCariocaPayMasterPage = read('backoffice/carioca-pay/index.html');
if (contaCariocaPayMasterPage) {
  for (const required of [
    '<title>Conta Carioca Pay | Backoffice Master</title>',
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'ctContaCariocaPayMasterContarPendentesPROD',
    'ctContaCariocaPayMasterListarPROD',
    'ctContaCariocaPayMasterDetalharPROD',
    'ctContaCariocaPayMasterDecidirPROD',
    'SOLICITADA',
    'EM_ANALISE',
    'APROVADA_MASTER',
    'RECUSADA',
    'Iniciar análise',
    'Aprovar',
    'Recusar',
    'Aprovar nesta tela <b>não envia dinheiro</b>',
    'SAQUE',
    'Saldo disponível no pedido',
    'Transferência automática',
    'providerAcionado===true',
    'movimentouDinheiro===true',
    'transferenciaCriada===true',
    'Integração bloqueada'
  ]) {
    if (!contaCariocaPayMasterPage.includes(required)) {
      fail('backoffice/carioca-pay/index.html', 'Backoffice Master Carioca Pay incompleto: ' + required);
    }
  }

  if (
    !contaCariocaPayMasterPage.includes('rel="manifest" href="/manifest-produtor.webmanifest"') ||
    !contaCariocaPayMasterPage.includes('/pwa-register.js')
  ) {
    fail('backoffice/carioca-pay/index.html', 'Backoffice Carioca Pay sem PWA oficial');
  }

  if (
    /window\.(?:alert|confirm|prompt)\s*\(/i.test(contaCariocaPayMasterPage)
  ) {
    fail('backoffice/carioca-pay/index.html', 'Backoffice Carioca Pay usa dialogo nativo');
  }

  if (
    contaCariocaPayMasterPage.includes('ctAsaasProvider') ||
    contaCariocaPayMasterPage.includes('/transfers') ||
    contaCariocaPayMasterPage.includes('UrlFetchApp')
  ) {
    fail('backoffice/carioca-pay/index.html', 'UI Master nao pode acionar provider diretamente');
  }

  if (
    !contaCariocaPayMasterPage.includes("state.action==='RECUSAR'&&reason.length<3")
  ) {
    fail('backoffice/carioca-pay/index.html', 'recusa sem motivo obrigatorio');
  }
}

const contaCariocaPayBaasPage = read('backoffice/carioca-pay/baas-sandbox/index.html');
if (contaCariocaPayBaasPage) {
  for (const required of [
    '<title>BaaS Sandbox | Conta Carioca Pay</title>',
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'ctContaCariocaPayBaasP4BListarProdutoresPROD',
    'ctContaCariocaPayBaasP4BProntidaoPROD',
    'ctContaCariocaPayBaasP4BCriarSubcontaPROD',
    'ctContaCariocaPayBaasP4BConsultarStatusPROD',
    'CRIAR SANDBOX',
    'SANDBOX • sem dinheiro real',
    'apiKeyExposta===true',
    "r.ambienteProvider&&r.ambienteProvider!=='SANDBOX'",
    'Faturamento / renda mensal de teste',
    'Tipo de empresa (PJ, obrigatório)',
    'Data de nascimento (PF, obrigatória)',
    'Tipo de empresa',
    'Data de nascimento',
    'CPF/CNPJ do titular',
    'Endereço',
    'Número',
    'Bairro',
    'CEP',
    "cpfCnpj:String($('cpfCnpj').value||'').replace(/\\D/g,'')",
    "postalCode:String($('postalCode').value||'').replace(/\\D/g,'')",
    'Configuração interna Sandbox',
    "r.jaPossuiConfiguracaoSandbox?'Preparada':'Ainda não preparada'",
    'Subconta Sandbox já provisionada. Consulte os status cadastrais do Asaas.',
    'if(selectedId()){',
    'checkReadiness();',
    'Asaas · Comercial',
    'Asaas · Conta bancária',
    'Asaas · Documentação',
    'Asaas · Aprovação geral',
    'Consultar onboarding',
    'ctContaCariocaPayBaasP4BConsultarDocumentosPROD',
    'Abrir onboarding oficial',
    'onboardingUrl',
    "rel='noopener noreferrer'",
    'commercialInfo',
    'bankAccountInfo',
    'documentation',
    'general',
    'Aprovação Sandbox',
    'APROVAR SANDBOX',
    'ctContaCariocaPayBaasP4DAprovarSandboxPROD',
    'Aprovar subconta Sandbox',
    'simulação exclusiva do Asaas Sandbox',
    'movimentouDinheiro===true',
    'jaEstavaAprovado===true',
    'aprovadoAgora===true',
    'BaaS Sandbox'
  ]) {
    if (!contaCariocaPayBaasPage.includes(required)) {
      fail('backoffice/carioca-pay/baas-sandbox/index.html', 'Console BaaS Sandbox incompleto: ' + required);
    }
  }

  if (
    /window\.(?:alert|confirm|prompt)\s*\(/i.test(contaCariocaPayBaasPage)
  ) {
    fail('backoffice/carioca-pay/baas-sandbox/index.html', 'Console BaaS Sandbox usa dialogo nativo');
  }

  if (
    contaCariocaPayBaasPage.includes('CT_SECRET_') ||
    contaCariocaPayBaasPage.includes('$aact_') ||
    contaCariocaPayBaasPage.includes('ctAsaasProvider') ||
    contaCariocaPayBaasPage.includes('/transfers') ||
    contaCariocaPayBaasPage.includes('UrlFetchApp')
  ) {
    fail('backoffice/carioca-pay/baas-sandbox/index.html', 'Console BaaS Sandbox expoe detalhe interno ou provider direto');
  }

  if (
    !contaCariocaPayBaasPage.includes('rel="manifest" href="/manifest-produtor.webmanifest"') ||
    !contaCariocaPayBaasPage.includes('/pwa-register.js')
  ) {
    fail('backoffice/carioca-pay/baas-sandbox/index.html', 'Console BaaS Sandbox sem PWA oficial');
  }
}

const contaCariocaPaySaldoMasterPage = read('backoffice/carioca-pay/saldo-extrato/index.html');
if (contaCariocaPaySaldoMasterPage) {
  for (const required of [
    '<title>Saldo e Extrato | Conta Carioca Pay</title>',
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'ctContaCariocaPayBaasP4BListarProdutoresPROD',
    'ctContaCariocaPayP5MasterResumoPROD',
    'Saldo disponível · Asaas',
    'Fonte autoritativa da subconta Sandbox',
    'Ledger · Entradas',
    'Ledger · Saídas',
    'Ledger · Saldo operacional',
    'SANDBOX • somente leitura',
    'somenteLeitura!==true',
    'movimentouDinheiro===true',
    'apiKeyExposta===true'
  ]) {
    if (!contaCariocaPaySaldoMasterPage.includes(required)) {
      fail('backoffice/carioca-pay/saldo-extrato/index.html', 'Saldo/Extrato Master incompleto: ' + required);
    }
  }

  if (
    contaCariocaPaySaldoMasterPage.includes('/transfers') ||
    contaCariocaPaySaldoMasterPage.includes('ctAsaasProvider') ||
    contaCariocaPaySaldoMasterPage.includes('CT_SECRET_') ||
    /window\.(?:alert|confirm|prompt)\s*\(/i.test(contaCariocaPaySaldoMasterPage)
  ) {
    fail('backoffice/carioca-pay/saldo-extrato/index.html', 'Saldo/Extrato Master contem acao/detalhe proibido');
  }
}

const contaCariocaPayProdutorPage = read('produtor/carioca-pay/index.html');
if (contaCariocaPayProdutorPage) {
  for (const required of [
    '<title>Conta Carioca Pay | Portal do Produtor</title>',
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'ctPortalProdutorRestaurarSessaoPROD',
    'ctContaCariocaPayP5ProdutorResumoPROD',
    'Saldo disponível · Asaas',
    'Fonte autoritativa',
    'Ledger · Entradas',
    'Ledger · Saídas',
    'Ledger · Saldo operacional',
    'SANDBOX • somente leitura',
    "r.ator!=='PRODUTOR'",
    'somenteLeitura!==true',
    'movimentouDinheiro===true',
    'apiKeyExposta===true'
  ]) {
    if (!contaCariocaPayProdutorPage.includes(required)) {
      fail('produtor/carioca-pay/index.html', 'Conta Carioca Pay do produtor incompleta: ' + required);
    }
  }

  if (
    contaCariocaPayProdutorPage.includes('/transfers') ||
    contaCariocaPayProdutorPage.includes('ctAsaasProvider') ||
    contaCariocaPayProdutorPage.includes('CT_SECRET_') ||
    /window\.(?:alert|confirm|prompt)\s*\(/i.test(contaCariocaPayProdutorPage)
  ) {
    fail('produtor/carioca-pay/index.html', 'Conta Carioca Pay do produtor contem acao/detalhe proibido');
  }
}

const producerPage = read('produtor/index.html');
if (producerPage) {
  if (
    !producerPage.includes('id="cariocaPayLink"') ||
    !producerPage.includes('href="/produtor/financeiro/"') ||
    !producerPage.includes("perfil === 'PRODUTOR_TITULAR'") ||
    !producerPage.includes("perfil === 'FINANCEIRO'")
  ) {
    fail('produtor/index.html', 'Portal sem acesso protegido à Conta Carioca Pay');
  }
}

if (producerPage && !producerPage.includes('ctPortalProdutorCarregarCatalogoEventosPROD')) {
  fail('produtor/index.html', 'Portal sem catalogo leve pos-login');
}
if (producerPage) {
  if (
    !producerPage.includes('id="eventPickerButton"') ||
    !producerPage.includes('id="eventPickerBackdrop"') ||
    !producerPage.includes('renderizarListaSeletorEvento')
  ) {
    fail('produtor/index.html', 'Portal voltou a depender do seletor nativo de evento');
  }
  if (
    !producerPage.includes('painelEmAndamento') ||
    !producerPage.includes('painelSequencia') ||
    !producerPage.includes('12000')
  ) {
    fail('produtor/index.html', 'Portal sem proteção de concorrência/timeout do painel');
  }
  if (
    !producerPage.includes('id="emailModalBackdrop"') ||
    !producerPage.includes('abrirModalEmail')
  ) {
    fail('produtor/index.html', 'Alteração de e-mail sem modal profissional');
  }
}
if (producerPage) {
  if (
    !producerPage.includes("? 90000 : (") ||
    !producerPage.includes(") ? 15000 : 30000") ||
    !producerPage.includes("'CT_PORTAL_RPC_TIMEOUT'") ||
    !producerPage.includes('Sua senha pode ter sido validada')
  ) {
    fail('produtor/index.html', 'Portal sem tolerancia/diagnostico de timeout no login');
  }
  if (!producerPage.includes('<title>Portal do Produtor | Carioca Ticket</title>')) {
    fail('produtor/index.html', 'titulo do Portal do Produtor incorreto');
  }
  if (
    !producerPage.includes('id="brandLogoDesktop"') ||
    !producerPage.includes('src="/assets/carioca-ticket-logo.png"') ||
    !producerPage.includes("'/assets/carioca-ticket-logo.png'") ||
    !producerPage.includes("'/assets/carioca-ticket-icon-192.png'") ||
    !producerPage.includes("'data-brand-source',\n'static'")
  ) {
    fail('produtor/index.html', 'Portal do Produtor sem identidade visual oficial estatica');
  }

  const marcaInicio = producerPage.indexOf('function carregarMarcaOficial(){');
  const marcaFim = producerPage.indexOf('function registrarFalhaMarcaOficial', marcaInicio);
  const marcaBloco = marcaInicio >= 0 && marcaFim > marcaInicio
    ? producerPage.slice(marcaInicio, marcaFim)
    : '';

  if (
    marcaBloco.includes('ctMarcaOficialObterDataUriPROD') ||
    marcaBloco.includes('google.script.run')
  ) {
    fail('produtor/index.html', 'Portal voltou a depender de RPC/Drive para carregar a marca oficial');
  }
}

if (producerPage) {
  if (
    !producerPage.includes('Portal | abertura pós-login') ||
    !producerPage.includes('Seu login foi realizado, mas não foi possível carregar toda a área administrativa')
  ) {
    fail('produtor/index.html', 'Portal volta a confundir falha pos-login com falha de autenticacao');
  }
  if (
    !producerPage.includes('id="partnerAdminLink"') ||
    !producerPage.includes("state.usuario &&") ||
    !producerPage.includes("state.usuario.perfil") ||
    !producerPage.includes("perfilGlobal === 'ADMINISTRADOR'")
  ) {
    fail('produtor/index.html', 'atalho Parceiros CT nao reconhece administrador global');
  }
}

const produtorSolicitar = read('produtor/solicitar/index.html');
if (produtorSolicitar) {
  for (const required of [
    "ctMinhaCariocaAction','portalRpc'",
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'ctProdutorOnboardingConsultarPROD',
    'ctProdutorOnboardingEnviarPROD',
    'Indicação ',
    'Enviar para análise',
    'id="logoutButton"',
    "rpc('logoutUsuarioCT2'",
    'sessionStorage.removeItem(STORAGE)',
    'localStorage.removeItem(STORAGE)',
    '/produtor/'
  ]) {
    if (!produtorSolicitar.includes(required)) {
      fail('produtor/solicitar/index.html', 'onboarding self-service incompleto: ' + required);
    }
  }
  if (/window\.(?:alert|confirm|prompt)\s*\(/i.test(produtorSolicitar)) {
    fail('produtor/solicitar/index.html', 'onboarding de produtor usa dialogo nativo');
  }
  const submitStart = produtorSolicitar.indexOf("document.getElementById('producerForm').addEventListener");
  const submitBody = submitStart >= 0 ? produtorSolicitar.slice(submitStart) : '';
  if (/codigoIndicacao\s*:/.test(submitBody)) {
    fail('produtor/solicitar/index.html', 'browser tenta enviar codigo de indicacao no onboarding; atribuicao deve ser server-side');
  }
}

const produtorSolicitacoes = read('produtor/solicitacoes/index.html');
if (produtorSolicitacoes) {
  for (const required of [
    "ctMinhaCariocaAction','portalRpc'",
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'ctProdutorOnboardingAdminListarPROD',
    'ctProdutorOnboardingAdminDetalharPROD',
    'ctProdutorOnboardingAdminDecidirPROD',
    'INICIAR_ANALISE',
    'SOLICITAR_PENDENCIA',
    'APROVAR',
    'REPROVAR',
    'Aprovar e ativar',
    'load({skipDetail:true})',
    'function reconcileDecisionState',
    'adjustCounter(antigo,-1)',
    'adjustCounter(novo,1)',
    'renderList();renderDetail()'
  ]) {
    if (!produtorSolicitacoes.includes(required)) {
      fail('produtor/solicitacoes/index.html', 'backoffice de produtores incompleto: ' + required);
    }
  }
  if (/window\.(?:alert|confirm|prompt)\s*\(/i.test(produtorSolicitacoes)) {
    fail('produtor/solicitacoes/index.html', 'backoffice de produtores usa dialogo nativo');
  }
}

if (producerPage) {
  const onboardingRedirects =
    (producerPage.match(/\/produtor\/solicitar\//g) || []).length;
  if (onboardingRedirects < 2) {
    fail('produtor/index.html', 'conta autenticada sem produtor nao e encaminhada ao onboarding no login e restore');
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

  if (!html.includes(String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)) {
    fail(file, 'validação de e-mail não aceita formato padrão');
  }

  if (html.includes(String.raw`/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/`)) {
    fail(file, 'regex de e-mail voltou a ser duplamente escapada');
  }
}


for (const file of ['checkout/index.html','checkout-v2/index.html']) {
  const html=read(file);
  if (!html) continue;
  for (const required of [
    'id="couponToggle"',
    'id="couponCode"',
    'id="couponApply"',
    'id="couponRemove"',
    'id="couponReplace"',
    'ctCuponsPublicoValidarSeguroPROD',
    'cupomCodigo:state.promotion',
    'REMOVER CUPOM'
  ]) {
    if (!html.includes(required)) fail(file,'checkout promocional incompleto: '+required);
  }
  if (html.includes('precoPromocional:state.promotion') ||
      html.includes('desconto:state.promotion') ||
      html.includes('valorTotal:state.promotion')) {
    fail(file,'checkout envia valor promocional calculado pelo navegador');
  }
}

const cuponsProdutor=read('cupons/index.html');
if (cuponsProdutor) {
  for (const required of [
    'Cupons & Campanhas',
    '+ CRIAR NOVA CAMPANHA',
    'PRECO_PROMOCIONAL',
    'PERCENTUAL',
    'VALOR_FIXO',
    'ctCuponsCampanhasListarPROD',
    'ctCuponsCampanhasSalvarPROD',
    'ctCuponsCampanhasAlterarStatusPROD',
    'PAUSAR','REATIVAR','ENCERRAR',
    'href="/central/"'
  ]) {
    if (!cuponsProdutor.includes(required)) fail('cupons/index.html','gestão de campanhas incompleta: '+required);
  }
}

const cuponsAdmin=read('cupons/admin/index.html');
if (cuponsAdmin) {
  for (const required of ['ctCuponsCampanhasAdminListarPROD','ctCuponsCampanhasAdminAlterarStatusPROD','Pausar','Encerrar']) {
    if (!cuponsAdmin.includes(required)) fail('cupons/admin/index.html','backoffice de campanhas incompleto: '+required);
  }
}

const parceiroPortal = read('parceiro/index.html');
if (parceiroPortal) {
  if (!parceiroPortal.includes('Portal Parceiro CT')) {
    fail('parceiro/index.html', 'Portal Parceiro CT existente foi descaracterizado');
  }
  if (!parceiroPortal.includes('/parceiro/programa/')) {
    fail('parceiro/index.html', 'Portal Parceiro CT sem acesso ao novo programa publico');
  }
  if (!parceiroPortal.includes('ctParceiroCTLoginFirebasePROD')) {
    fail('parceiro/index.html', 'login existente do Parceiro CT foi removido');
  }
}

const parceiroPrograma = read('parceiro/programa/index.html');
if (parceiroPrograma) {
  for (const required of [
    'Quero ser Parceiro CT',
    'Já sou parceiro — acessar portal',
    'ctParceiroOnboardingConfigPublicaPROD',
    'ctParceiroOnboardingEnviarSolicitacaoPROD',
    'accept-check',
    'Copiar mensagem',
    'Central de Materiais do Parceiro',
    'id="anticipationFee"'
  ]) {
    if (!parceiroPrograma.includes(required)) {
      fail('parceiro/programa/index.html', 'onboarding publico incompleto: ' + required);
    }
  }
  if (/\b9,5%\b|\b9%\b|\b8,5%\b/i.test(parceiroPrograma)) {
    fail('parceiro/programa/index.html', 'pagina publica expoe condicao comercial interna');
  }
  if (/window\.(?:alert|confirm|prompt)\s*\(/i.test(parceiroPrograma)) {
    fail('parceiro/programa/index.html', 'pagina publica usa dialogo nativo');
  }
  for (const required of [
    '<span id="heroCommission">1</span>%',
    '<span id="serviceFee">10</span>%',
    '<span id="anticipationMax">80</span>%',
    '<span id="anticipationFee">3,5</span>%',
    'for(var tentativa=0;tentativa<3;tentativa++)',
    "CT_PARCEIRO_CADASTRO_RASCUNHO_V1",
    "sessionStorage.setItem(DRAFT_KEY",
    "restoreDraft()",
    "class=\"legal-doc-link\"",
    'id="legalViewerBackdrop"',
    'id="closeLegalViewer"',
    'function openLegalViewer(',
    "if(id==='REGRAS_COMERCIAIS')return'/parceiro/regras-comerciais/'",
    "if(id==='TRATAMENTO_DADOS_PROGRAMA')return'/parceiro/tratamento-dados/'"
  ]) {
    if (!parceiroPrograma.includes(required)) {
      fail('parceiro/programa/index.html', 'fallback/retry mobile ausente: ' + required);
    }
  }
}

const parceiroRegras = read('parceiro/regras-comerciais/index.html');
if (parceiroRegras) {
  for (const required of ['Regras comerciais do Programa Parceiro CT','10%','1%','3,5%']) {
    if (!parceiroRegras.includes(required)) {
      fail('parceiro/regras-comerciais/index.html', 'documento comercial incompleto: ' + required);
    }
  }
}

const parceiroDados = read('parceiro/tratamento-dados/index.html');
if (parceiroDados) {
  for (const required of ['Tratamento de dados no Programa Parceiro CT','Dados do cadastro','Finalidades','contato@cariocaticket.com.br']) {
    if (!parceiroDados.includes(required)) {
      fail('parceiro/tratamento-dados/index.html', 'documento de dados incompleto: ' + required);
    }
  }
}

const analyticsAsset = fs.existsSync(path.join(root,'assets/ct-analytics.js'))
  ? fs.readFileSync(path.join(root,'assets/ct-analytics.js'),'utf8')
  : '';

/*
 * HOTFIX/P0 PERFORMANCE:
 * analytics público permanece desligado da jornada crítica.
 */
if (!analyticsAsset || !/return;/.test(analyticsAsset)) {
  fail('assets/ct-analytics.js','analytics público deve permanecer desativado');
}
for (const file of ['index.html','eventos-v2/index.html','evento-v2/index.html','checkout-v2/index.html','evento/index.html','checkout/index.html']) {
  const html=read(file);
  if (html && !html.includes('/assets/ct-analytics.js')) {
    // O HTML principal ainda pode referenciar o arquivo no-op durante a janela de hotfix.
    // A remoção total da tag está protegida na branch P0, não neste hotfix de teste.
  }
}

const backofficeMaster = read('backoffice/index.html');
if (backofficeMaster) {
  for (const required of [
    'Backoffice Master',
    'Visão executiva da plataforma',
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'ctBackofficeMasterCarregarPROD',
    'Acessos ao site',
    'Sessões únicas',
    'Ingressos vendidos',
    'Receita bruta',
    'Eventos mais acessados',
    'Maior receita',
    'Mais ingressos vendidos',
    'Produtores por receita',
    'Formas de pagamento',
    'Origem dos acessos',
    'Dispositivos',
    'data-preset="7D"',
    'data-preset="30D"',
    'id="dateStart"',
    'id="dateEnd"'
  ]) {
    if (!backofficeMaster.includes(required)) {
      fail('backoffice/index.html', 'Backoffice Master incompleto: ' + required);
    }
  }
  if (/window\.(?:alert|confirm|prompt)\s*\(/i.test(backofficeMaster)) {
    fail('backoffice/index.html', 'Backoffice Master usa dialogo nativo');
  }
}

const parceiroAdmin = read('parceiro/admin/index.html');
if (parceiroAdmin) {
  for (const required of [
    "ctMinhaCariocaAction','portalRpc'",
    'ctParceiroOnboardingAdminListarPROD',
    'ctParceiroOnboardingAdminDetalharPROD',
    'ctParceiroOnboardingAdminDecidirPROD',
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1',
    'id="producerRequestsBadge"',
    'ctProdutorOnboardingAdminContarPendentesPROD',
    'function refreshProducerRequestsBadge()',
    "addEventListener('pageshow'",
    '60000'
  ]) {
    if (!parceiroAdmin.includes(required)) {
      fail('parceiro/admin/index.html', 'backoffice Parceiro CT incompleto: ' + required);
    }
  }
  if (/window\.(?:alert|confirm|prompt)\s*\(/i.test(parceiroAdmin)) {
    fail('parceiro/admin/index.html', 'backoffice Parceiro CT usa dialogo nativo');
  }
  if (!parceiroAdmin.includes('/produtor/solicitacoes/')) {
    fail('parceiro/admin/index.html', 'Backoffice Parceiro CT sem acesso ao onboarding administrativo de produtores');
  }
  if (!parceiroAdmin.includes('/backoffice/')) {
    fail('parceiro/admin/index.html', 'Backoffice Parceiro CT sem acesso ao Backoffice Master');
  }
  for (const required of [
    'function closeAction(force)',
    'closeAction(true)',
    "state.busy=false;await load();",
    'id="activationBackdrop"',
    'id="copyActivation"',
    'function openActivationModal(',
    'function formatVersion(',
    "var selectedId=state.selected&&state.selected.solicitacaoId",
    "ctParceiroOnboardingAdminDetalharPROD',[state.session.token,selectedId]"
  ]) {
    if (!parceiroAdmin.includes(required)) {
      fail('parceiro/admin/index.html', 'pos-decisao/ativacao incompleto: ' + required);
    }
  }
  const doActionStart = parceiroAdmin.indexOf('async function doAction()');
  const doActionEnd = parceiroAdmin.indexOf("document.getElementById('confirmAction')", doActionStart);
  const doActionBody = doActionStart >= 0 && doActionEnd > doActionStart
    ? parceiroAdmin.slice(doActionStart, doActionEnd)
    : '';
  if (doActionBody.includes('navigator.clipboard.writeText')) {
    fail('parceiro/admin/index.html', 'aprovacao tenta copiar link automaticamente antes de atualizar a tela');
  }
}

const parceiroAtivar = read('parceiro/ativar/index.html');
if (parceiroAtivar) {
  for (const required of [
    'ctParceiroOnboardingConsultarAtivacaoPROD',
    'ctParceiroOnboardingPrepararAtivacaoPROD',
    'ctParceiroOnboardingAtivarPROD',
    'createUserWithEmailAndPassword',
    'sendEmailVerification',
    'getIdToken'
  ]) {
    if (!parceiroAtivar.includes(required)) {
      fail('parceiro/ativar/index.html', 'ativacao Parceiro CT incompleta: ' + required);
    }
  }
}

const parceiroConduta = read('parceiro/conduta/index.html');
if (parceiroConduta) {
  for (const required of ['id="backToApplication"', "origem')!=='parceiro-cadastro'", "history.back()"]) {
    if (!parceiroConduta.includes(required)) {
      fail('parceiro/conduta/index.html', 'retorno ao cadastro Parceiro CT ausente: ' + required);
    }
  }
}

const privacidade = read('privacidade/index.html');
if (privacidade) {
  for (const required of ['id="partnerReturnBar"', 'id="backToApplication"', "origem')!=='parceiro-cadastro'", '/parceiro/programa/?retomar=1']) {
    if (!privacidade.includes(required)) {
      fail('privacidade/index.html', 'retorno ao cadastro Parceiro CT ausente: ' + required);
    }
  }
}

const parceiroRegulamento = read('parceiro/regulamento/index.html');
if (parceiroRegulamento) {
  if (!parceiroRegulamento.includes('revisão jurídica')) {
    fail('parceiro/regulamento/index.html', 'regulamento nao identifica status de revisao juridica');
  }
  for (const required of ['id="backToApplication"', "origem')!=='parceiro-cadastro'", "history.back()"]) {
    if (!parceiroRegulamento.includes(required)) {
      fail('parceiro/regulamento/index.html', 'retorno ao cadastro Parceiro CT ausente: ' + required);
    }
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

const financeiroProdutor = read('financeiro/index.html');
if (financeiroProdutor) {
  if (!financeiroProdutor.includes("ctMinhaCariocaAction','portalRpc'")) {
    fail('financeiro/index.html', 'Financeiro sem ponte first-party segura');
  }
  if (!financeiroProdutor.includes('ctFinanceiroProdutorPainelPROD')) {
    fail('financeiro/index.html', 'Financeiro sem painel seguro do produtor');
  }
  if (
    financeiroProdutor.includes("rpc('ctFinanceiroProdutorSimularAntecipacaoPROD'") ||
    financeiroProdutor.includes("rpc('ctFinanceiroProdutorSolicitarAntecipacaoPROD'")
  ) {
    fail('financeiro/index.html', 'Financeiro legado ainda permite antecipacao direta');
  }
  if (!financeiroProdutor.includes('href="/produtor/financeiro/"')) {
    fail('financeiro/index.html', 'Financeiro legado não encaminha para a Conta Carioca Pay');
  }
  if (!financeiroProdutor.includes('Aguardando fluxo Master') ||
      !financeiroProdutor.includes("document.getElementById('withdrawButton').disabled=true;")) {
    fail('financeiro/index.html', 'Saque legado deve permanecer bloqueado ate existir fluxo Master');
  }
  if (!financeiroProdutor.includes('3,5%') || !financeiroProdutor.includes('R$ 500,00')) {
    fail('financeiro/index.html', 'Politica vigente de antecipacao nao esta transparente na interface');
  }
  if (!financeiroProdutor.includes('Nenhuma solicitação de saque será registrada enquanto não existir tela Master')) {
    fail('financeiro/index.html', 'Saque bloqueado sem explicacao do gate Master');
  }
  const nativeDialogFinance = financeiroProdutor.match(/(?:window\.)?(?:alert|confirm|prompt)\s*\(/i);
  if (nativeDialogFinance) {
    fail('financeiro/index.html', 'dialogo nativo do navegador no fluxo financeiro', nativeDialogFinance[0]);
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

for (const file of [
  'produtor/index.html',
  'consulta/index.html',
  'ingresso/index.html',
  'central/index.html',
  'checkin/index.html'
]) {
  const html = read(file);
  if (!html) continue;
  const nativeDialog = html.match(/(?:window\.)?(?:alert|confirm|prompt)\s*\(/i);
  if (nativeDialog) {
    fail(file, 'dialogo nativo do navegador em fluxo critico', nativeDialog[0]);
  }
}

const ingressoPublico = read('ingresso/index.html');
if (ingressoPublico) {
  if (!ingressoPublico.includes('seg.autorizaEntrada===true')) {
    fail('ingresso/index.html', 'Ingresso público não condiciona QR/compartilhamento à autorização de entrada');
  }
  if (!ingressoPublico.includes("autoriza?'")) {
    fail('ingresso/index.html', 'Ingresso público mantém ações de compartilhamento sem validar autorização');
  }
}

const consultaOperacional = read('consulta/index.html');
if (consultaOperacional) {
  if (!consultaOperacional.includes('Aguardando confirmação do pagamento')) {
    fail('consulta/index.html', 'Consulta operacional não sinaliza pagamento pendente sem ações de compartilhamento');
  }
  if (!consultaOperacional.includes("ctMinhaCariocaAction','portalRpc'")) {
    fail('consulta/index.html', 'Consulta operacional sem ponte first-party segura');
  }
  if (!consultaOperacional.includes('ctConsultaIngressosOperacionalPROD')) {
    fail('consulta/index.html', 'Consulta operacional sem gateway autenticado');
  }
  if (/id=["']app["'][^>]*iframe|<iframe[^>]+id=["']app["']/i.test(consultaOperacional)) {
    fail('consulta/index.html', 'Consulta operacional ainda depende do iframe legado');
  }
  if (!consultaOperacional.includes('CT_PORTAL_PRODUTOR_PROD_SESSION_V1')) {
    fail('consulta/index.html', 'Consulta operacional sem sessao do Portal do Produtor');
  }
}

const centralSeguro = read('central/index.html');
if (centralSeguro) {
  if (!centralSeguro.includes('ctCheckinOperacionalCriarCredencialPROD')) {
    fail('central/index.html', 'Central abre Check-in sem credencial operacional');
  }
  if (!centralSeguro.includes('#ct_checkin=')) {
    fail('central/index.html', 'Central nao transfere credencial do Check-in pelo fragmento');
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

const minhaCariocaContaRecovery = read('minha-carioca/conta/index.html');
if (minhaCariocaContaRecovery) {
  for (const required of [
    'CT_MINHA_CARIOCA_COMPRAS_V1',
    'CT_CHECKOUT_RECOVERY_',
    'function comprasSegurasDoAparelho()',
    'function deviceRecovery()',
    'Compra segura encontrada neste aparelho',
    '/minha-carioca/ingressos/?v=20260923-1940&pedido='
  ]) {
    if (!minhaCariocaContaRecovery.includes(required)) {
      fail('minha-carioca/conta/index.html', 'recuperacao segura no mesmo aparelho incompleta: ' + required);
    }
  }
  if (!minhaCariocaContaRecovery.includes('pedidoId:pedido,token:token')) {
    fail('minha-carioca/conta/index.html', 'recuperacao no aparelho sem exigir pedido + token');
  }
}


const produtorOficialEventos = read('produtor/index.html');
if (produtorOficialEventos) {
  for (const required of [
    'id="eventsManagementLink"',
    'href="/eventos-v2/"',
    '>\nEventos\n</a>'
  ]) {
    if (!produtorOficialEventos.includes(required)) {
      fail('produtor/index.html', 'Portal oficial sem acesso direto a Eventos: ' + required);
    }
  }
}

const produtorOnboardingPage = read('produtor-v2/index.html');
if (produtorOnboardingPage) {
  for (const required of [
    'id="onboardingPanel"',
    'id="onboardingForm"',
    'id="onboardingNomeFantasia"',
    'id="onboardingCpfCnpj"',
    'id="onboardingWhatsapp"',
    'id="onboardingCidade"',
    'id="onboardingUf"',
    'id="eventsManagementLink"',
    'href="https://cariocaticket.com.br/eventos-v2/"',
    'function carregarOnboardingProdutor(){',
    'function executarOnboardingProdutor(',
    '.ctProdutorOnboardingConsultarPROD(',
    '.ctProdutorOnboardingEnviarPROD(',
    "state.produtores.length >",
    "el.onboardingPanel",
    "el.selectorsPanel"
  ]) {
    if (!produtorOnboardingPage.includes(required)) {
      fail('produtor-v2/index.html', 'onboarding/autonomia do produtor incompleto: ' + required);
    }
  }

  const loginStart = produtorOnboardingPage.indexOf('async function executarLogin(');
  const loginEnd = produtorOnboardingPage.indexOf('function inicializarFirebaseSilencioso()', loginStart);
  const loginBlock = loginStart >= 0 && loginEnd > loginStart
    ? produtorOnboardingPage.slice(loginStart, loginEnd)
    : '';

  if (loginBlock.includes('resposta.autorizado !==\ntrue')) {
    fail('produtor-v2/index.html', 'conta autenticada sem produtor volta a ser expulsa antes do onboarding');
  }

  const restoreStart = produtorOnboardingPage.indexOf('function tentarRestaurarSessao(){');
  const restoreEnd = produtorOnboardingPage.indexOf('function abrirPortal(){', restoreStart);
  const restoreBlock = restoreStart >= 0 && restoreEnd > restoreStart
    ? produtorOnboardingPage.slice(restoreStart, restoreEnd)
    : '';

  if (restoreBlock.includes('r.autorizado !==\ntrue')) {
    fail('produtor-v2/index.html', 'restauracao de sessao sem produtor volta a bloquear onboarding');
  }
}

if (errors.length) {
  console.error('\n❌ CONTRATOS DE REGRESSAO FALHARAM\n');
  for (const e of errors) {
    console.error(`- ${e.file}: ${e.rule}${e.excerpt ? ` -> ${e.excerpt}` : ''}`);
  }
  process.exit(1);
}

console.log(`✅ ${protectedFiles.length} superficies protegidas passaram nos contratos de regressao.`);
