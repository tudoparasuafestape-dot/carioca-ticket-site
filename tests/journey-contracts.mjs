import fs from 'node:fs';

const failures=[];
function read(path){
  try{return fs.readFileSync(path,'utf8')}catch(e){failures.push(path+': arquivo ausente');return ''}
}
function requireAll(path, content, snippets){
  for(const snippet of snippets){
    if(!content.includes(snippet)) failures.push(path+': contrato de jornada ausente -> '+snippet);
  }
}
function requireLink(path, content, id, href){
  const idPos=content.indexOf('id="'+id+'"');
  if(idPos<0){failures.push(path+': link '+id+' ausente');return}
  const block=content.slice(Math.max(0,idPos-220),Math.min(content.length,idPos+520));
  if(!block.includes('href="'+href+'"')) failures.push(path+': '+id+' não aponta para '+href);
}

// Um link legado de ingresso pode envolver o destino assinado em ?destino=.
// A Minha Carioca deve sempre abrir a página oficial de ingresso.
{
  const page=read('minha-carioca/index.html');
  requireAll('minha-carioca/index.html',page,[
    'id="customerAccountCta"',
    'href="/minha-carioca/conta/"',
    '},45000);'
  ]);
  const start=page.indexOf('function officialTicketLink(raw){');
  const end=page.indexOf('function showError(msg){',start);
  if(start<0||end<0){
    failures.push('minha-carioca/index.html: conversor de ingresso ausente');
  }else{
    const {runInNewContext}=await import('node:vm');
    const fn=runInNewContext(page.slice(start,end)+'; officialTicketLink', {
      URL, location:{href:'https://cariocaticket.com.br/minha-carioca/'}
    });
    const ticket='https://script.google.com/macros/s/example/exec?codigo=CT-TEST&sig=ASSINATURA';
    const legacy='https://example.org/ingresso.html?destino='+encodeURIComponent(ticket);
    const expected='/ingresso/?codigo=CT-TEST&sig=ASSINATURA';
    if(fn(legacy)!==expected||fn(ticket)!==expected){
      failures.push('minha-carioca/index.html: ingresso não abre no domínio oficial');
    }
  }
}

// Minha Carioca — entrada pública simples e coerente com OTP somente por e-mail.
{
  const landing=read('minha-carioca/index.html');
  requireAll('minha-carioca/index.html',landing,[
    'Acesse com o e-mail usado na compra',
    'Enviaremos um código de 6 dígitos',
    'id="customerAccountCta"',
    'href="/minha-carioca/conta/"'
  ]);
  for(const forbidden of [
    'Pelo WhatsApp ou ingresso recebido',
    'Já tem um link seguro? Cole aqui',
    'id="secure-link"',
    'id="open-secure"',
    'function openPasted()'
  ]){
    if(landing.includes(forbidden)){
      failures.push('minha-carioca/index.html: fluxo público antigo reapareceu -> '+forbidden);
    }
  }

  const conta=read('minha-carioca/conta/index.html');
  requireAll('minha-carioca/conta/index.html',conta,[
    "e('label','','E-mail da compra')",
    "i.type='email'",
    "i.autocomplete='email'",
    'Seu e-mail cadastrado na compra',
    'código de 6 dígitos para o e-mail cadastrado na sua compra'
  ]);
  for(const forbidden of [
    'WhatsApp ou e-mail',
    'Use preferencialmente seu WhatsApp',
    'Seu e-mail ou WhatsApp cadastrado',
    'Informe seu e-mail ou WhatsApp.',
    'canal seguro disponível na sua conta'
  ]){
    if(conta.includes(forbidden)){
      failures.push('minha-carioca/conta/index.html: texto legado de OTP multicanal reapareceu -> '+forbidden);
    }
  }
}

const home=read('index.html');
requireLink('index.html',home,'producerPortalCta','/produtor/');
requireLink('index.html',home,'partnerProgramCta','/parceiro/programa/');
requireLink('index.html',home,'partnerPortalCta','/parceiro/');
requireAll('index.html',home,[
  'Acessar Portal do Produtor',
  'Programa Parceiro CT',
  'Acessar Portal Parceiro CT'
]);


// P0 UX — depois que o ingresso foi emitido, a tela de sucesso é monotônica.
// Polling/reconcile atrasado nunca pode devolver o cliente ao formulário de compra.
for(const path of ['checkout/index.html','checkout-v2/index.html']){
  const checkout=read(path);
  requireAll(path,checkout,[
    'successRendered:false',
    'state.successRendered=true;',
    'function refreshLocal(){',
    'if(state.successRendered)return;',
    'function reconcile(){'
  ]);
  const refreshStart=checkout.indexOf('function refreshLocal(){');
  const reconcileStart=checkout.indexOf('function reconcile(){');
  const refreshBlock=refreshStart>=0&&reconcileStart>refreshStart
    ? checkout.slice(refreshStart,reconcileStart)
    : '';
  if(!refreshBlock.includes('if(state.successRendered)return;')){
    failures.push(path+': polling local pode reverter a tela após sucesso');
  }
  const reconcileEnd=checkout.indexOf('function startPolling(){',reconcileStart);
  const reconcileBlock=reconcileStart>=0&&reconcileEnd>reconcileStart
    ? checkout.slice(reconcileStart,reconcileEnd)
    : '';
  if(!reconcileBlock.includes('if(state.successRendered)return;')){
    failures.push(path+': reconcile pode reverter a tela após sucesso');
  }
}

// P0 JORNADA DE COMPRA — a experiência só termina quando o ingresso durável
// também possui link seguro oficial utilizável. CONCLUIDO sozinho não libera botão quebrado.
for(const path of ['checkout/index.html','checkout-v2/index.html']){
  const checkout=read(path);
  requireAll(path,checkout,[
    'var ingressosRecebidos=',
    'var ingressosComLinkSeguro=',
    "return officialTicketLink(item)!=='#';",
    'var ingressosProntos=',
    'res.ingressoEmitido===true',
    'ingressosComLinkSeguro.length',
    'if(ingressosProntos){',
    'stopPolling();',
    'stopExpiry();',
    'stopTicketReadyRefresh();',
    'renderSuccess(ingressosComLinkSeguro);',
    'scheduleTicketReadyRefresh();',
    'ticketReadyAttempts:0',
    'state.ticketReadyAttempts>=8',
    'state.ticketReadyAttempts+=1'
  ]);

  const renderOrderStart=checkout.indexOf('function renderOrder(res){');
  const renderOrderEnd=checkout.indexOf('function officialTicketLink',renderOrderStart);
  const renderOrderBlock=renderOrderStart>=0&&renderOrderEnd>renderOrderStart
    ? checkout.slice(renderOrderStart,renderOrderEnd)
    : '';

  if(renderOrderBlock.includes("status==='CONCLUIDO'||ingressosProntos")){
    failures.push(path+': CONCLUIDO sozinho não pode liberar ingresso sem link seguro');
  }

  if(!renderOrderBlock.includes('if(ingressosProntos){')){
    failures.push(path+': checkout precisa exigir ingresso com link seguro antes da tela final');
  }
}

// CARTÃO — deve usar checkout hospedado do Asaas e convergir para a mesma
// experiência terminal de ingresso do PIX.
for(const path of ['checkout/index.html','checkout-v2/index.html']){
  const checkout=read(path);
  requireAll(path,checkout,[
    "state.paymentMethod==='CREDIT_CARD'",
    "el.cardPanel.classList.remove('hidden')",
    'var pagamentoConfirmado=',
    'var invoiceUrl=pagamentoConfirmado',
    'el.cardPaymentLink.href=invoiceUrl',
    'ctCheckoutPixPublicoReconciliarPROD',
    'res.ingressoEmitido===true'
  ]);
}

// P0 PERFORMANCE — o checkout observa o ledger local a cada 4s e
// reconcilia com o Asaas em burst controlado: 10s nos primeiros 2 minutos
// e 30s depois. O webhook imediato segue como caminho principal.
for(const path of ['checkout/index.html','checkout-v2/index.html']){
  const checkout=read(path);
  requireAll(path,checkout,[
    'function refreshLocal(){',
    'ctCheckoutPixPublicoStatusLocalPROD',
    'setInterval(refreshLocal,4000)',
    'function reconcile(){',
    'ctCheckoutPixPublicoReconciliarPROD',
    'reconcilePolling:null',
    'reconcileStartedAt:0',
    "document.visibilityState!=='visible'",
    'elapsed<120000',
    'Math.floor(elapsed/10000)%3===0',
    '},10000)',
    'function stopExpiry(){',
    'if(sec<=0&&!state.expiryReconciled)',
    'el.refreshButton.onclick=reconcile',
    'el.cardRefreshButton.onclick=reconcile'
  ]);
  if(checkout.includes('setInterval(reconcile,30000)')){
    failures.push(path+': reconciliação PIX não pode voltar ao atraso fixo de 30s');
  }
  if(checkout.includes('setInterval(refresh,4000)')){
    failures.push(path+': reconciliação Asaas voltou ao polling de 4s');
  }
  if(/\brefresh\(\);/.test(checkout)){
    failures.push(path+': chamada residual para refresh legado');
  }
  const localStart=checkout.indexOf('function refreshLocal(){');
  const reconcileStart=checkout.indexOf('function reconcile(){',localStart);
  const localBlock=localStart>=0&&reconcileStart>localStart
    ? checkout.slice(localStart,reconcileStart)
    : '';
  if(localBlock.includes('ctCheckoutPixPublicoReconciliarPROD')){
    failures.push(path+': polling local não pode chamar reconciliação externa');
  }
}


// P0 SEGURANÇA/UX — o checkout nunca pode abrir o ingresso em script.google.com.
// Mesmo que o backend devolva um link técnico legado, o navegador converte
// código + assinatura para a rota oficial da Carioca Ticket.
for(const path of ['checkout/index.html','checkout-v2/index.html']){
  const checkout=read(path);
  requireAll(path,checkout,[
    'function officialTicketLink(ticket){',
    "'https://cariocaticket.com.br/ingresso/?codigo='",
    'function openTicketFromOrder(ticket,button){',
    '.ctCheckoutPixPublicoLinkIngressoPROD(',
    'window.location.assign(String(res.link))',
    'var direto=officialTicketLink(t);',
    "if(direto&&direto!=='#'){",
    'a.href=direto;',
    'ev.preventDefault();',
    'openTicketFromOrder(t,a)'
  ]);
  if(checkout.includes("a.href=t.link||'#'")){
    failures.push(path+': link técnico do backend voltou a ser aberto diretamente');
  }
  if(checkout.includes("a.target='_blank'")){
    failures.push(path+': botão do ingresso não pode abrir uma cópia vazia do checkout em nova aba');
  }
}

// REGRA DE PRODUTO — mídia principal do evento é sempre imagem estática.
// A página pública não pode carregar player, iframe, autoplay ou endpoint
// de vídeo na capa principal.
for(const path of ['evento/index.html','evento-v2/index.html']){
  const evento=read(path);
  requireAll(path,evento,[
    'id="coverImage"',
    'function configurarMidiaPrincipal(v){',
    "var imagem=$('coverImage');"
  ]);
  for(const proibido of [
    '<video',
    'coverVideoEmbed',
    'videoControl',
    'ctEventoPublicoCarregarVideoDataPROD',
    'videoInternoDisponivel',
    'videoEmbedUrl',
    'videoUrl'
  ]){
    if(evento.includes(proibido)){
      failures.push(path+': mídia principal voltou a permitir vídeo -> '+proibido);
    }
  }
}


// COMPARTILHAMENTO DE EVENTO — todo evento público deve permitir
// compartilhar facilmente no mobile e copiar o link no fallback desktop.
// O link compartilhado deve ser canônico e não carregar cupom/src/csid.
for(const path of ['evento/index.html','evento-v2/index.html']){
  const evento=read(path);
  requireAll(path,evento,[
    'id="shareHero"',
    'id="shareMobile"',
    'function linkCanonicoEvento(){',
    "return base+'?evento='+encodeURIComponent(state.eventoId);",
    'id="shareMenu"',
    'id="shareNativeAction"',
    'id="copyLinkAction"',
    'function abrirMenuCompartilhamento(){',
    'async function compartilharNativo(){',
    'async function copiarLinkDireto(){',
    'navigator.share',
    'navigator.clipboard.writeText(url)',
    "btn.dataset.shareUrl=url",
    "copyAction.dataset.shareUrl=url",
    "mostrarShareToast('Link do evento copiado!')"
  ]);
  const shareStart=evento.indexOf('function linkCanonicoEvento(){');
  const shareEnd=evento.indexOf('function showError(msg){',shareStart);
  const shareBlock=shareStart>=0&&shareEnd>shareStart
    ? evento.slice(shareStart,shareEnd)
    : '';
  for(const proibido of ['cupomCodigo','campanhaOrigem','campanhaSessaoId','csid=','src=']){
    if(shareBlock.includes(proibido)){
      failures.push(path+': link compartilhado voltou a carregar parametro de campanha -> '+proibido);
    }
  }
}


// ANALYTICS MASTER — telemetria pública deve ser estritamente best-effort.
// Nunca pode bloquear a jornada nem depender de resposta do backend.
{
  const analytics=read('assets/ct-analytics.js');
  requireAll('assets/ct-analytics.js',analytics,[
    "window.addEventListener('load',schedule,{once:true})",
    'window.requestIdleCallback(function(){send()},{timeout:2500})',
    'ctAnalyticsMasterRegistrarLotePublicoPROD',
    "add('ctMinhaCariocaAction','publicRpc')",
    'form.submit()',
    '},2500);',
    'pagina:pagina',
    'sessaoId:sessao',
    'eventoId:eventoId',
    'origem:source()',
    'referrerHost:referrerHost()',
    'dispositivo:device()'
  ]);

  for(const proibido of [
    'fetch(',
    'XMLHttpRequest',
    'sendBeacon(',
    'await ',
    'ScriptLock'
  ]){
    if(analytics.includes(proibido)){
      failures.push('assets/ct-analytics.js: analytics público voltou a usar caminho bloqueante/indevido -> '+proibido);
    }
  }

  for(const path of [
    'index.html',
    'eventos-v2/index.html',
    'evento/index.html',
    'evento-v2/index.html',
    'checkout/index.html',
    'checkout-v2/index.html'
  ]){
    const pagina=read(path);
    if(!pagina.includes('/assets/ct-analytics.js?v=20260923a')){
      failures.push(path+': coletor Analytics Master seguro/versionado ausente');
    }
  }
}

const ajuda=read('ajuda/index.html');
requireLink('ajuda/index.html',ajuda,'helpProducerPortal','/produtor/');
requireLink('ajuda/index.html',ajuda,'helpPartnerPortal','/parceiro/');
requireLink('ajuda/index.html',ajuda,'helpPartnerProgram','/parceiro/programa/');

const central=read('central/index.html');
requireAll('central/index.html',central,[
  'href="/produtor/"',
  'id="logout"',
  '/eventos-v2/',
  '/vendas/',
  '/bar/',
  '/consulta/',
  '/fornecedores/',
  '/crm/',
  '/financeiro/',
  '/relatorios/',
  '/comissoes/',
  '/cupons/'
]);

for(const path of [
  'vendas/index.html',
  'bar/index.html',
  'eventos-v2/index.html',
  'fornecedores/index.html',
  'crm/index.html',
  'financeiro/index.html',
  'relatorios/index.html',
  'comissionado/index.html',
  'comissoes/index.html',
  'consulta/index.html',
  'checkin/index.html',
  'saude-vendas/index.html',
  'reembolsos/index.html'
]){
  const html=read(path);
  if(!/href=["']\/central\/[^"']*["']|href=["']\/central\/["']/.test(html)){
    failures.push(path+': módulo operacional sem retorno claro à Central');
  }
}

const cupons=read('cupons/index.html');
requireAll('cupons/index.html',cupons,[
  'Cupons & Campanhas',
  'href="/central/"',
  '+ CRIAR NOVA CAMPANHA',
  'ctCuponsCampanhasListarPROD',
  'ctCuponsCampanhasSalvarPROD',
  'ctCuponsCampanhasAlterarStatusPROD',
  'PRECO_PROMOCIONAL'
]);

const cuponsAdmin=read('cupons/admin/index.html');
requireAll('cupons/admin/index.html',cuponsAdmin,[
  'Campanhas promocionais',
  'ctCuponsCampanhasAdminListarPROD',
  'ctCuponsCampanhasAdminAlterarStatusPROD',
  'href="/parceiro/admin/"',
  'href="/produtor/"'
]);

const produtor=read('produtor/index.html');
requireLink('produtor/index.html',produtor,'partnerPortalLink','/parceiro/');
requireLink('produtor/index.html',produtor,'partnerAdminLink','/parceiro/admin/');
requireLink('produtor/index.html',produtor,'backofficeMasterLink','/backoffice/');
requireAll('produtor/index.html',produtor,[
  'Portal Parceiro CT',
  'Gestão Parceiros CT',
  'id="logoutButton"'
]);


const eventosProdutor=read('eventos-v2/index.html');
requireAll('eventos-v2/index.html',eventosProdutor,[
  "case 'ctEventosPublicacaoStatusPROD':",
  "method:'ctEventosOperacionalStatusPublicacaoSeguraPROD'",
  'a solicitação de autorização é criada automaticamente',
  'Você não precisa pedir liberação em outra tela.',
  'Ver situação e publicar',
  'function montarMensagemSituacaoPublicacao(',
  'function confirmarPublicacaoEvento(',
  '.ctEventosPublicacaoStatusPROD(',
  'A autorização já foi solicitada automaticamente',
  'Seu evento já está em análise pela Carioca Ticket',
  'A autorização da Carioca Ticket já foi aprovada'
]);
if(eventosProdutor.includes("'COM PENDÊNCIAS'")){
  failures.push('eventos-v2/index.html: listagem rápida voltou a afirmar pendências sem validação completa');
}


// PERFORMANCE P0 — o Portal do Produtor não pode depender de RPC/Drive
// para renderizar a identidade visual na tela de login.
{
  const produtorMarca=read('produtor/index.html');
  requireAll('produtor/index.html',produtorMarca,[
    '/assets/carioca-ticket-logo.png',
    '/assets/carioca-ticket-icon-192.png',
    "'data-brand-source',\n'static'"
  ]);
  const marcaFnStart=produtorMarca.indexOf('function carregarMarcaOficial(){');
  const marcaFnEnd=produtorMarca.indexOf('function registrarFalhaMarcaOficial',marcaFnStart);
  const marcaFn=marcaFnStart>=0&&marcaFnEnd>marcaFnStart
    ? produtorMarca.slice(marcaFnStart,marcaFnEnd)
    : '';
  for(const proibido of [
    'ctMarcaOficialObterDataUriPROD',
    'google.script.run',
    'data-brand-source\',\n\'backend'
  ]){
    if(marcaFn.includes(proibido)){
      failures.push('produtor/index.html: marca oficial estática voltou a depender do backend -> '+proibido);
    }
  }
}

const parceiroAdmin=read('parceiro/admin/index.html');
requireLink('parceiro/admin/index.html',parceiroAdmin,'partnerPortalLink','/parceiro/');
requireLink('parceiro/admin/index.html',parceiroAdmin,'producerRequestsLink','/produtor/solicitacoes/');
if(!parceiroAdmin.includes('href="/backoffice/"')) failures.push('parceiro/admin/index.html: sem acesso ao Backoffice Master');
requireAll('parceiro/admin/index.html',parceiroAdmin,[
  'href="/produtor/"',
  'id="logoutAdminButton"',
  'async function logoutAdmin()',
  "rpc('logoutUsuarioCT2'",
  'sessionStorage.removeItem(STORAGE)',
  'localStorage.removeItem(STORAGE)'
]);

const produtorSolicitacoes=read('produtor/solicitacoes/index.html');
requireAll('produtor/solicitacoes/index.html',produtorSolicitacoes,[
  'href="/parceiro/"',
  'Portal Parceiro CT',
  'href="/parceiro/admin/"',
  'Gestão Parceiros CT',
  'href="/produtor/"',
  'id="logoutAdminButton"',
  'async function logoutAdmin()',
  "rpc('logoutUsuarioCT2'"
]);

const parceiro=read('parceiro/index.html');
requireLink('parceiro/index.html',parceiro,'partnerProgramLink','/parceiro/programa/');
requireAll('parceiro/index.html',parceiro,[
  'Portal Parceiro CT',
  'Programa Parceiro',
  'id="logoutButton"'
]);

const programa=read('parceiro/programa/index.html');
if(!/href=["']\/parceiro\/["']/.test(programa)){
  failures.push('parceiro/programa/index.html: programa sem caminho para o Portal Parceiro CT');
}

if(failures.length){
  console.error('\n❌ GATE DE JORNADA/NAVEGAÇÃO FALHOU\n');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('✅ Gate de jornada: acessos críticos possuem caminho, retorno e saída.');
