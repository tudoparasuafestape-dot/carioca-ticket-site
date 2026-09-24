import { test, expect } from '@playwright/test';

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
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const action=String(p.get('ctMinhaCariocaAction')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      expect(action).toBe('portalRpc');
      if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        resultado={sucesso:true,autenticado:true,autorizado:true,usuario:{id:'USR-PROD'},produtores:[{id:'PROD-E2E',nomeFantasia:'Produtor E2E',eventos:[{id:'EVT-E2E',nome:'Evento E2E'}]}]};
      }else if(method==='ctContaCariocaPayPortalResumoPROD'){
        resultado={sucesso:true,autorizado:true,produtorId:'PROD-E2E',eventoId:'EVT-E2E',perfil:'PRODUTOR_TITULAR',financeiro:{configurado:true,movimentacaoRealHabilitada:false,aportePixHabilitado:false},vendas:{confirmado:1800},ledger:{saldoOperacional:1200,porOrigem:{}},solicitacoes:{antecipacoesAbertas:0,saquesAbertos:0,pagamentosPlanejados:0,pagamentosAguardandoAprovacao:0},antecipacao:{percentualMaximo:80,reservaPercentual:20,taxaCtPercentual:3.5,disponivelSolicitar:960,providerHabilitado:false},saque:{minimoSolicitacao:500,saldoDisponivel:1200,jaSolicitadoAberto:0,exigeAprovacaoMaster:true,movimentacaoAutomatica:false},atualizadoEm:'24/09/2026 20:00:00'};
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
        state.masterActions.push(String(args[2]||''));
        state.saqueStatus=String(args[2]||'')==='INICIAR_ANALISE'?'EM_ANALISE':'APROVADA_MASTER';
        resultado={sucesso:true,autorizado:true,solicitacao:{solicitacaoId:'CCP-SAQ',tipo:'SAQUE',produtorNome:'Produtor E2E',evento:{nome:'Evento E2E'},valor:500,status:state.saqueStatus,solicitadoPorPerfil:'PRODUTOR_TITULAR',financeiro:{saldoDisponivelNoMomento:1200,saldoMinimoSolicitacao:500}},providerAcionado:false,movimentouDinheiro:false,transferenciaCriada:false};
      }else{
        throw new Error('Método não previsto: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\/script></body></html>'});
  });
}

test.describe('Conta Carioca Pay — Produtor e Master',()=>{
  test.skip(!BRANCH_MODE,'Fluxo financeiro mutável roda somente na branch local com backend simulado.');

  test('produtor solicita antecipacao e saque sem movimentacao real',async({page})=>{
    const state={advanceCalls:0,withdrawCalls:0,advanceArgs:null,withdrawArgs:null,masterActions:[],saqueStatus:'SOLICITADA'};
    await installMock(page,state);await seed(page,'CT-PROD-E2E');
    await page.goto('/produtor/financeiro/',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Conta Carioca Pay'})).toBeVisible();
    await expect(page.locator('#policyFee')).toContainText('3,50%');
    await page.locator('#advanceValue').fill('600');
    await page.locator('#advanceButton').click();
    await expect.poll(()=>state.advanceCalls).toBe(1);
    expect(Number(state.advanceArgs[2])).toBe(600);
    await expect(page.locator('#message')).toContainText('enviada para análise do Administrador Master');

    await page.locator('#withdrawValue').fill('500');
    await page.locator('#withdrawButton').click();
    await expect.poll(()=>state.withdrawCalls).toBe(1);
    expect(Number(state.withdrawArgs[2])).toBe(500);
    await expect(page.locator('#message')).toContainText('Nenhuma transferência foi executada');
  });

  test('Master enxerga saque, inicia analise e aprova sem transferencia',async({page})=>{
    const state={advanceCalls:0,withdrawCalls:0,advanceArgs:null,withdrawArgs:null,masterActions:[],saqueStatus:'SOLICITADA'};
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
  });
});
