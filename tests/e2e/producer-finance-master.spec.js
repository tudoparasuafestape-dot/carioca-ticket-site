import { temporalEnvelope } from '../fixtures/public-temporal-envelope.cjs';
import { test, expect, mockRoute, mockFailure } from './helpers/branch-isolated.cjs';

// Only these actions/methods belong to this fixture; all other RPCs fall through to denial.
const MOCK_CONTRACT = {
  "rpc": {
    "portalRpc": [
      "ctContaCariocaPayMasterContarPendentesPROD",
      "ctContaCariocaPayMasterDecidirPROD",
      "ctContaCariocaPayMasterDetalharPROD",
      "ctContaCariocaPayMasterListarPROD",
      "ctContaCariocaPayPortalResumoPROD",
      "ctContaCariocaPayPortalSolicitarAntecipacaoPROD",
      "ctContaCariocaPayPortalSolicitarSaquePROD",
      "ctPortalProdutorRestaurarSessaoIsoladaPROD"
    ],
    "publicRpc": [
      "ctEventosPublicosListarPROD"
    ]
  }
};

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

async function seed(page,token){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(({storage,token})=>{
    const value=JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(storage,value);localStorage.setItem(storage,value);
  },{storage:STORAGE,token});
}

function envelope(id,ok,resultado,erro=''){
  return JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
}

async function installMock(page,state){
  await mockRoute(page, MOCK_CONTRACT,async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const action=String(p.get('ctMinhaCariocaAction')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      expect(action).toBe(method==='ctEventosPublicosListarPROD'?'publicRpc':'portalRpc');
      if(method==='ctEventosPublicosListarPROD'){
        expect(args).toEqual([]);
        resultado={sucesso:true,...temporalEnvelope('home',await page.evaluate(()=>Date.now())),eventos:[]};
      }else if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        resultado={sucesso:true,autenticado:true,autorizado:true,usuario:{id:'USR-PROD'},produtores:[{id:'PROD-E2E',nomeFantasia:'Produtor E2E',eventos:[{id:'EVT-E2E',nome:'Evento E2E'}]}]};
      }else if(method==='ctContaCariocaPayPortalResumoPROD'){
        resultado={sucesso:true,autorizado:true,produtorId:'PROD-E2E',eventoId:'EVT-E2E',perfil:'PRODUTOR_TITULAR',financeiro:{configurado:true,status:'ATIVO',prontoParaOperar:true,movimentacaoRealHabilitada:false,aportePixHabilitado:false},vendas:{confirmado:1800},ledger:{saldoOperacional:1200,porOrigem:{}},solicitacoes:{antecipacoesAbertas:0,saquesAbertos:0,pagamentosPlanejados:0,pagamentosAguardandoAprovacao:0},antecipacao:{percentualMaximo:80,reservaPercentual:20,taxaCtPercentual:3.5,disponivelSolicitar:960,providerHabilitado:false},saque:{minimoSolicitacao:500,saldoAutoritativoDisponivel:true,saldoConta:1200,saldoDisponivel:1200,jaSolicitadoAberto:0,saldoFonte:'ASAAS',saldoEscopo:'CONTA_ASAAS_PRODUTOR',saldoErro:'',exigeAprovacaoMaster:true,movimentacaoAutomatica:false},atualizadoEm:'24/09/2026 20:00:00'};
      }else if(method==='ctContaCariocaPayPortalSolicitarAntecipacaoPROD'){
        state.advanceCalls++;state.advanceArgs=args;
        resultado={sucesso:true,status:'SOLICITADA',movimentouDinheiro:false,chamouProvider:false};
      }else if(method==='ctContaCariocaPayPortalSolicitarSaquePROD'){
        state.withdrawCalls++;state.withdrawArgs=args;
        resultado={sucesso:true,status:'SOLICITADA',movimentouDinheiro:false,chamouProvider:false};
      }else if(method==='ctContaCariocaPayMasterContarPendentesPROD'){
        resultado={sucesso:true,autorizado:true,contagem:{solicitadas:2,emAnalise:0,abertas:2,notificacoesNaoLidas:2},providerAcionado:false,movimentouDinheiro:false};
      }else if(method==='ctContaCariocaPayMasterListarPROD'){
        resultado={sucesso:true,autorizado:true,itens:[
          {solicitacaoId:'CCP-ANT',tipo:'ANTECIPACAO',produtorId:'PROD-E2E',produtorNome:'Produtor E2E',eventoId:'EVT-E2E',evento:{id:'EVT-E2E',nome:'Evento E2E'},valor:600,status:'SOLICITADA',criadoEm:'2026-09-24T20:00:00.000Z'},
          {solicitacaoId:'CCP-SAQ',tipo:'SAQUE',produtorId:'PROD-E2E',produtorNome:'Produtor E2E',eventoId:'EVT-E2E',evento:{id:'EVT-E2E',nome:'Evento E2E'},valor:500,status:'SOLICITADA',criadoEm:'2026-09-24T20:01:00.000Z'}
        ],total:2,providerAcionado:false,movimentouDinheiro:false};
      }else if(method==='ctContaCariocaPayMasterDetalharPROD'){
        const sid=String(args[1]||'');
        resultado={sucesso:true,autorizado:true,solicitacao:sid==='CCP-SAQ'
          ?{solicitacaoId:'CCP-SAQ',tipo:'SAQUE',produtorId:'PROD-E2E',produtorNome:'Produtor E2E',eventoId:'EVT-E2E',evento:{id:'EVT-E2E',nome:'Evento E2E'},valor:500,status:state.saqueStatus||'SOLICITADA',solicitadoPorPerfil:'PRODUTOR_TITULAR',criadoEm:'2026-09-24T20:01:00.000Z',financeiro:{saldoDisponivelNoMomento:1200,saldoMinimoSolicitacao:500}}
          :{solicitacaoId:'CCP-ANT',tipo:'ANTECIPACAO',produtorId:'PROD-E2E',produtorNome:'Produtor E2E',eventoId:'EVT-E2E',evento:{id:'EVT-E2E',nome:'Evento E2E'},valor:600,status:'SOLICITADA',solicitadoPorPerfil:'PRODUTOR_TITULAR',criadoEm:'2026-09-24T20:00:00.000Z',financeiro:{vendasElegiveis:1800,maximoAntecipavel:1440,reservaSeguranca:360,taxaCtPercentual:3.5,taxaCtValor:21,valorLiquidoProdutor:579}},
          providerAcionado:false,movimentouDinheiro:false};
      }else if(method==='ctContaCariocaPayMasterDecidirPROD'){
        const actionName=String(args[2]||'');
        state.masterActions.push(actionName);
        state.lastReason=String(args[3]||'');
        state.saqueStatus=actionName==='INICIAR_ANALISE'?'EM_ANALISE':(actionName==='APROVAR'?'APROVADA_MASTER':'CONCLUIDO');
        resultado={sucesso:true,autorizado:true,solicitacao:{solicitacaoId:'CCP-SAQ',tipo:'SAQUE',produtorNome:'Produtor E2E',evento:{nome:'Evento E2E'},valor:500,status:state.saqueStatus,solicitadoPorPerfil:'PRODUTOR_TITULAR',financeiro:{saldoDisponivelNoMomento:1200,saldoMinimoSolicitacao:500}},providerAcionado:false,movimentouDinheiro:false,transferenciaCriada:false};
      }else{
        throw new Error('Método não previsto: '+method);
      }
    }catch(e){ mockFailure(route, e);ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\/script></body></html>'});
  });
}

test.describe('Conta Carioca Pay — Produtor e Master',()=>{
  test.skip(!BRANCH_MODE,'Fluxo financeiro mutável roda somente na branch local com backend simulado.');

  test('produtor solicita antecipacao e saque sem movimentacao real',async({page})=>{
    const state={advanceCalls:0,withdrawCalls:0,advanceArgs:null,withdrawArgs:null,masterActions:[],saqueStatus:'SOLICITADA',lastReason:''};
    await installMock(page,state);await seed(page,'CT-PROD-E2E');
    await page.goto('/produtor/financeiro/',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Conta Carioca Pay'})).toBeVisible();
    await expect(page.locator('#policyFee')).toContainText('3,50%');
    await page.locator('#advanceValue').fill('600');
    await page.locator('#advanceButton').click();
    await expect.poll(()=>state.advanceCalls).toBe(1);
    expect(Number(state.advanceArgs[2])).toBe(600);
    await expect(page.locator('#message')).toContainText('enviada para análise do Administrador Master');

    await expect(page.locator('#withdrawAvailable')).toContainText('1.200,00');
    await expect(page.locator('#withdrawButton')).toBeEnabled();
    await page.locator('#withdrawValue').fill('500');
    await page.locator('#withdrawButton').click();
    await expect.poll(()=>state.withdrawCalls).toBe(1);
    expect(Number(state.withdrawArgs[2])).toBe(500);
    await expect(page.locator('#message')).toContainText('Nenhuma transferência foi executada');
  });


  test('financeiro pendente bloqueia antecipacao e saque antes de qualquer mutacao',async({page})=>{
    const state={advanceCalls:0,withdrawCalls:0};
    await mockRoute(page, MOCK_CONTRACT,async route=>{
      const p=new URLSearchParams(route.request().postData()||'');
      const id=String(p.get('ctMinhaCariocaRequestId')||'');
      const method=String(p.get('metodo')||'');
      let resultado=null;
      if(method==='ctEventosPublicosListarPROD'){
        resultado={sucesso:true,...temporalEnvelope('home',await page.evaluate(()=>Date.now())),eventos:[]};
      }else if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        resultado={sucesso:true,autenticado:true,autorizado:true,usuario:{id:'USR-PROD'},produtores:[{id:'PROD-E2E',nomeFantasia:'Produtor E2E',eventos:[{id:'EVT-E2E',nome:'Evento E2E'}]}]};
      }else if(method==='ctContaCariocaPayPortalResumoPROD'){
        resultado={sucesso:true,autorizado:true,produtorId:'PROD-E2E',eventoId:'EVT-E2E',perfil:'PRODUTOR_TITULAR',
          financeiro:{configurado:true,status:'PENDENTE_CREDENCIAL',prontoParaOperar:false,movimentacaoRealHabilitada:false,aportePixHabilitado:false},
          vendas:{confirmado:1800},ledger:{saldoOperacional:0,porOrigem:{}},
          solicitacoes:{antecipacoesAbertas:0,saquesAbertos:0,pagamentosPlanejados:0,pagamentosAguardandoAprovacao:0},
          antecipacao:{percentualMaximo:80,reservaPercentual:20,taxaCtPercentual:3.5,disponivelSolicitar:960,providerHabilitado:false},
          saque:{minimoSolicitacao:500,saldoAutoritativoDisponivel:false,saldoConta:0,saldoDisponivel:0,jaSolicitadoAberto:0,saldoFonte:'ASAAS',saldoEscopo:'CONTA_ASAAS_PRODUTOR',saldoErro:'CT_CARIOCA_PAY_PORTAL_FINANCEIRO_NAO_ATIVO',exigeAprovacaoMaster:true,movimentacaoAutomatica:false},
          atualizadoEm:'24/09/2026 20:00:00'};
      }else if(method==='ctContaCariocaPayPortalSolicitarAntecipacaoPROD'){
        state.advanceCalls++;throw new Error('MUTACAO_NAO_DEVERIA_SER_CHAMADA');
      }else if(method==='ctContaCariocaPayPortalSolicitarSaquePROD'){
        state.withdrawCalls++;throw new Error('MUTACAO_NAO_DEVERIA_SER_CHAMADA');
      }else{
        throw new Error('Método não previsto: '+method);
      }
      await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,true,resultado,'')+', "*");<\/script></body></html>'});
    });
    await seed(page,'CT-PROD-E2E');
    await page.goto('/produtor/financeiro/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#financialConfigured')).toContainText('PENDENTE_CREDENCIAL');
    await expect(page.locator('#advanceButton')).toBeDisabled();
    await expect(page.locator('#withdrawButton')).toBeDisabled();
    expect(state.advanceCalls).toBe(0);
    expect(state.withdrawCalls).toBe(0);
  });

  test('Master enxerga saque, aprova e conclui externamente sem transferencia da plataforma',async({page})=>{
    const state={advanceCalls:0,withdrawCalls:0,advanceArgs:null,withdrawArgs:null,masterActions:[],saqueStatus:'SOLICITADA',lastReason:''};
    await installMock(page,state);await seed(page,'CT-MASTER-E2E');
    await page.goto('/backoffice/carioca-pay/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#list')).toContainText('SAQUE');
    await page.locator('[data-id="CCP-SAQ"]').click();
    await expect(page.locator('#detail')).toContainText('Mínimo para saque');
    await page.getByRole('button',{name:'Iniciar análise'}).click();
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.masterActions).toEqual(['INICIAR_ANALISE']);
    await page.getByRole('button',{name:'Aprovar'}).click();
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.masterActions).toEqual(['INICIAR_ANALISE','APROVAR']);
    await expect(page.locator('#detail')).toContainText('APROVADA MASTER');
    await page.getByRole('button',{name:'Marcar saque como processado'}).click();
    await page.locator('#reason').fill('PIX externo E2E 12345');
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.masterActions).toEqual(['INICIAR_ANALISE','APROVAR','CONCLUIR']);
    expect(state.lastReason).toBe('PIX externo E2E 12345');
    await expect(page.locator('#detail')).toContainText('CONCLUIDO');
  });
});

// Central ticket receipts: read-only, synthetic and isolated from the mutable Pay fixtures above.
const HERMINHO_PRODUCER='PROD-7FD7A8BFD98F4777BB7D92C0D812165E';
const HERMINHO_EVENT='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
const CENTRAL_RECEIPTS_CONTRACT={rpc:{portalRpc:[
  'ctPortalProdutorRestaurarSessaoIsoladaPROD',
  'ctContaCariocaPayPortalResumoPROD',
  'ctFinanceiroProdutorMasterListarPROD'
],publicRpc:['ctEventosPublicosListarPROD']}};
async function installCentralReceiptsMock(page,calls){
  // branch-isolated auto fixture denies every unexpected remote request; this
  // contract intentionally permits no mutation, charge, account or payout RPC.
  await mockRoute(page,CENTRAL_RECEIPTS_CONTRACT,async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let result;
    try{
      const args=JSON.parse(p.get('argsJson')||'[]');
      expect(p.get('ctMinhaCariocaAction')).toBe(method==='ctEventosPublicosListarPROD'?'publicRpc':'portalRpc');
      calls.push(method);
      if(method==='ctEventosPublicosListarPROD'){
        expect(args).toEqual([]);
        result={sucesso:true,...temporalEnvelope('home',await page.evaluate(()=>Date.now())),eventos:[]};
      }else if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        result={sucesso:true,autenticado:true,autorizado:true,usuario:{id:'USR-CENTRAL-SYNTH'},produtores:[{id:HERMINHO_PRODUCER,nomeFantasia:'Herminho · demonstração sintética',eventos:[{id:HERMINHO_EVENT,nome:'Aniversário de Herminho · teste'}]}]};
      }else if(method==='ctContaCariocaPayPortalResumoPROD'){
        expect(args[1]).toBe(HERMINHO_EVENT);
        result={sucesso:true,autorizado:true,produtorId:HERMINHO_PRODUCER,eventoId:HERMINHO_EVENT,
          financeiro:{configurado:true,status:'PENDENTE_CREDENCIAL',recebimentoCentralizado:true,prontoParaOperar:false,movimentacaoRealHabilitada:false,aportePixHabilitado:false},
          vendas:{confirmado:22,composicaoCentralizada:{brutoConfirmado:22,taxaCtConfirmada:2,liquidoProdutorConfirmado:20,outrasDeducoesConfirmadas:0,pagamentosSemComposicao:0},conciliacaoCentralizada:{pagamentosPendentes:1,brutoPendente:22}},
          ledger:{saldoOperacional:0,porOrigem:{}},solicitacoes:{},antecipacao:{disponivelSolicitar:0},saque:{saldoAutoritativoDisponivel:false,saldoDisponivel:0},
          repasse:{status:'BLOQUEADO_CONCILIACAO_PENDENTE',conciliacaoPendente:true,automatico:false,disponivelParaTransferencia:0},atualizadoEm:'28/10/2026 · fixture sintética'};
      }else if(method==='ctFinanceiroProdutorMasterListarPROD'){
        result={sucesso:true,autorizado:true,itens:[{produtorId:HERMINHO_PRODUCER,produtorNome:'Herminho · demonstração sintética',statusOnboarding:'PENDENTE_CREDENCIAL',prontoParaVendas:false,
          vendaIngressos:{modo:'VENDA_PADRAO_REPASSE_POSTERIOR',eventoId:HERMINHO_EVENT,subcontaObrigatoria:false,contaPaySeparada:true}}],contagem:{pendentes:1,prontos:0}};
      }else{throw new Error('Unexpected central receipt RPC: '+method)}
    }catch(error){mockFailure(route,error);await route.abort('blockedbyclient');return}
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,true,result,'')+', "*");<\/script></body></html>'});
  });
}
test.describe('Herminho — ingressos com repasse posterior, sem Conta Pay',()=>{
  test.skip(!BRANCH_MODE,'Somente fixtures offline da branch; nunca executar contra produção.');
  test('produtor vê composição 20 + 2 sem saldo global nem ações de pagamento',async({page},testInfo)=>{
    const calls=[];await installCentralReceiptsMock(page,calls);await seed(page,'CT-CENTRAL-SYNTH');
    await page.goto('/produtor/financeiro/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#financeTitle')).toHaveText('Recebimentos de ingressos');
    await expect(page.locator('#confirmedSales')).toContainText('22,00');
    await expect(page.locator('#eraCtFee')).toContainText('2,00');
    await expect(page.locator('#eraProducerNet')).toContainText('20,00');
    await expect(page.locator('#compositionExplanation')).toContainText('não é saldo disponível para saque');
    await expect(page.locator('#eraCompositionWarning')).toContainText('pendente(s) de conciliação');
    await expect(page.locator('#ledgerBalance')).toBeHidden();
    await expect(page.locator('#actionsSection')).toBeHidden();
    await expect(page.locator('#policySection')).toBeHidden();
    await expect(page.locator('#advanceButton')).toBeDisabled();
    await expect(page.locator('#withdrawButton')).toBeDisabled();
    await expect(page.locator('#financeIntro')).toContainText('Não exige subconta');
    expect(calls.filter(x=>x==='ctContaCariocaPayPortalResumoPROD')).toHaveLength(1);
    await testInfo.attach('herminho-central-producer.png',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  });
  test('master separa cadastro de ingressos de futura conta para pagamentos',async({page},testInfo)=>{
    const calls=[];await installCentralReceiptsMock(page,calls);await seed(page,'CT-MASTER-CENTRAL-SYNTH');
    await page.goto('/backoffice/carioca-pay/produtores/?produtor='+HERMINHO_PRODUCER,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#detailBadge')).toHaveText('INGRESSOS');
    await expect(page.locator('#detail')).toContainText('Não é necessário criar subconta');
    await expect(page.locator('#detail')).toContainText('não ativa vendas nem autoriza repasses');
    await expect(page.locator('#detail')).toContainText('Conta Carioca Pay · etapa separada');
    await expect(page.locator('#detail')).toContainText('PENDENTE_CREDENCIAL');
    await expect(page.locator('#activateButton, #validateButton, #provisionButton, #suspendButton')).toHaveCount(0);
    expect(calls.filter(x=>x==='ctFinanceiroProdutorMasterListarPROD')).toHaveLength(1);
    await testInfo.attach('herminho-central-master.png',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  });
});
