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
  'parceiro/ativar/index.html',
  'parceiro/manual/index.html',
  'parceiro/regulamento/index.html',
  'parceiro/conduta/index.html'
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
  'central/index.html',
  'saude-vendas/index.html',
  'reembolsos/index.html',
  'financeiro/index.html',
  'relatorios/index.html',
  'acessos/index.html',
  'checkin/index.html'
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

const producerPage = read('produtor/index.html');
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
    !producerPage.includes("ctMarcaOficialObterDataUriPROD") ||
    !producerPage.includes("'DESKTOP'") ||
    !producerPage.includes("'MOBILE'")
  ) {
    fail('produtor/index.html', 'Portal do Produtor sem carregamento da identidade visual oficial');
  }
  if (
    !producerPage.includes('src="/assets/carioca-ticket-logo.png"') ||
    !producerPage.includes('data-brand-source="fallback"') ||
    !producerPage.includes("'/assets/carioca-ticket-icon-192.png'")
  ) {
    fail('produtor/index.html', 'Portal do Produtor sem fallback oficial resiliente');
  }
}

if (producerPage) {
  if (
    !producerPage.includes('Portal | abertura pós-login') ||
    !producerPage.includes('Seu login foi realizado, mas não foi possível carregar toda a área administrativa')
  ) {
    fail('produtor/index.html', 'Portal volta a confundir falha pos-login com falha de autenticacao');
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
    '<span id="anticipationFee">2,5</span>%',
    'for(var tentativa=0;tentativa<3;tentativa++)',
    "CT_PARCEIRO_CADASTRO_RASCUNHO_V1",
    "sessionStorage.setItem(DRAFT_KEY",
    "restoreDraft()",
    "class=\"legal-doc-link\"",
    "origem','parceiro-cadastro"
  ]) {
    if (!parceiroPrograma.includes(required)) {
      fail('parceiro/programa/index.html', 'fallback/retry mobile ausente: ' + required);
    }
  }
}

const parceiroAdmin = read('parceiro/admin/index.html');
if (parceiroAdmin) {
  for (const required of [
    "ctMinhaCariocaAction','portalRpc'",
    'ctParceiroOnboardingAdminListarPROD',
    'ctParceiroOnboardingAdminDetalharPROD',
    'ctParceiroOnboardingAdminDecidirPROD',
    'CT_PORTAL_PRODUTOR_PROD_SESSION_V1'
  ]) {
    if (!parceiroAdmin.includes(required)) {
      fail('parceiro/admin/index.html', 'backoffice Parceiro CT incompleto: ' + required);
    }
  }
  if (/window\.(?:alert|confirm|prompt)\s*\(/i.test(parceiroAdmin)) {
    fail('parceiro/admin/index.html', 'backoffice Parceiro CT usa dialogo nativo');
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
  if (!financeiroProdutor.includes('ctFinanceiroProdutorSimularAntecipacaoPROD')) {
    fail('financeiro/index.html', 'Financeiro sem simulacao de antecipacao');
  }
  if (!financeiroProdutor.includes('ctFinanceiroProdutorSolicitarAntecipacaoPROD')) {
    fail('financeiro/index.html', 'Financeiro sem solicitacao de antecipacao');
  }
  if (!financeiroProdutor.includes('ctFinanceiroProdutorSolicitarSaquePROD')) {
    fail('financeiro/index.html', 'Financeiro sem solicitacao de saque');
  }
  if (!financeiroProdutor.includes("==='ANTECIPAR'")) {
    fail('financeiro/index.html', 'Antecipacao sem confirmacao textual de seguranca');
  }
  if (!financeiroProdutor.includes("==='SOLICITAR SAQUE'")) {
    fail('financeiro/index.html', 'Saque sem confirmacao textual de seguranca');
  }
  if (!financeiroProdutor.includes('2,5%')) {
    fail('financeiro/index.html', 'Taxa CT de antecipacao nao esta transparente na interface');
  }
  if (!financeiroProdutor.includes('Nenhuma transferência Pix/TED é executada automaticamente')) {
    fail('financeiro/index.html', 'Saque nao informa que e apenas solicitacao interna');
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

if (errors.length) {
  console.error('\n❌ CONTRATOS DE REGRESSAO FALHARAM\n');
  for (const e of errors) {
    console.error(`- ${e.file}: ${e.rule}${e.excerpt ? ` -> ${e.excerpt}` : ''}`);
  }
  process.exit(1);
}

console.log(`✅ ${protectedFiles.length} superficies protegidas passaram nos contratos de regressao.`);
