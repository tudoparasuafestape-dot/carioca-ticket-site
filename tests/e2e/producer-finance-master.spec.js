import { test, expect } from '@playwright/test';

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

async function seed(page,token){
  await page.addInitScript(({key,token})=>{
    const value=JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(key,value);
    localStorage.setItem(key,value);
  },{key:STORAGE,token});
}

function producerSummary(){
  return {
    sucesso:true,autorizado:true,
    produtorId:'PROD-E2E',eventoId:'EVT-E2E',
    permissoes:{
      visualizarFinanceiroGlobal:true,
      planejarPagamento:true,
      aprovarPagamento:true,
      executarTransferencia:false,
      solicitarAntecipacao:true,
      aprovarAntecipacao:false,
      registrarPatrocinio:true,
      adicionarCapitalProprio:true,
      alterarDestinoFinanceiro:false
    },
    vendas:{confirmado:1000,vendasElegiveisAntecipacao:1000},
    ledger:{saldoOperacional:1000,porOrigem:{VENDAS_INGRESSOS_ONLINE:1000}},
    antecipacao:{
      minimoVendas:500,
      percentualMaximo:80,
      reservaPercentual:20,
      taxaCtPercentual:3.5,
      prazoCreditoDiasUteis:2,
      baseElegivel:1000,
      maximoAntecipavel:800,
      disponivelSolicitar:800,
      providerHabilitado:false
    },
    solicitacoes:{antecipacoesAbertas:0,pagamentosPlanejados:0,pagamentosAguardandoAprovacao:0},
    financeiro:{configurado:true,movimentacaoRealHabilitada:false,aportePixHabilitado:false},
    atualizadoEm:'24/09/2026 18:00'
  };
}

function requestItem(status='SOLICITADA'){
  return {
    solicitacaoId:'ADV-E2E',
    produtorId:'PROD-E2E',
    produtorNome:'Produtor Teste',
    eventoId:'EVT-E2E',
    evento:{id:'EVT-E2E',nome:'Evento Teste'},
    valor:800,
    status,
    criadoEm:'2026-09-24T18:00:00-03:00',
    solicitadoPorPerfil:'PRODUTOR_TITULAR',
    financeiro:{
      vendasElegiveis:1000,
      maximoAntecipavel:800,
      reservaSeguranca:200,
      taxaCtPercentual:3.5,
      taxaCtValor:28,
      valorLiquidoProdutor:772
    }
  };
}

async function mockProducer(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const params=new URLSearchParams(route.request().postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||'');
    const method=String(params.get('metodo')||'');
    let args=[];try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        expect(String(args[0]||'')).toBe(state.token);
        resultado={
          sucesso:true,autenticado:true,autorizado:true,
          usuario:{id:'USR-PROD',nome:'Produtor Teste',perfil:'PRODUTOR'},
          produtores:[{id:'PROD-E2E',nomeFantasia:'Produtor Teste',perfil:'PRODUTOR_TITULAR',eventos:[{id:'EVT-E2E',nome:'Evento Teste'}]}]
        };
      }else if(method==='ctContaCariocaPayPortalResumoPROD'){
        expect(String(args[0]||'')).toBe(state.token);
        expect(String(args[1]||'')).toBe('EVT-E2E');
        const r=producerSummary();
        if(state.requested)r.solicitacoes.antecipacoesAbertas=800;
        resultado=r;
      }else if(method==='ctContaCariocaPayPortalSolicitarAntecipacaoPROD'){
        expect(String(args[0]||'')).toBe(state.token);
        expect(String(args[1]||'')).toBe('EVT-E2E');
        expect(Number(args[2])).toBe(800);
        expect(String(args[3]||'')).toMatch(/^ADV-/);
        state.requested=true;
        state.requestCalls++;
        resultado={
          sucesso:true,
          solicitacao:requestItem('SOLICITADA'),
          providerAcionado:false,
          movimentouDinheiro:false,
          transferenciaCriada:false
        };
      }else{
        throw new Error('Método inesperado: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    const payload=JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");<\\/script></body></html>'});
  });
}

async function mockMaster(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const params=new URLSearchParams(route.request().postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||'');
    const method=String(params.get('metodo')||'');
    let args=[];try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      expect(String(args[0]||'')).toBe(state.token);
      if(method==='ctContaCariocaPayMasterContarPendentesPROD'){
        resultado={sucesso:true,contagem:{
          solicitadas:state.status==='SOLICITADA'?1:0,
          emAnalise:state.status==='EM_ANALISE'?1:0,
          abertas:['SOLICITADA','EM_ANALISE'].includes(state.status)?1:0,
          notificacoesNaoLidas:['SOLICITADA','EM_ANALISE'].includes(state.status)?1:0
        }};
      }else if(method==='ctContaCariocaPayMasterListarPROD'){
        resultado={sucesso:true,itens:[requestItem(state.status)]};
      }else if(method==='ctContaCariocaPayMasterDetalharPROD'){
        expect(String(args[1]||'')).toBe('ADV-E2E');
        resultado={sucesso:true,solicitacao:requestItem(state.status)};
      }else if(method==='ctContaCariocaPayMasterDecidirPROD'){
        expect(String(args[1]||'')).toBe('ADV-E2E');
        const action=String(args[2]||'');
        state.actions.push(action);
        if(action==='INICIAR_ANALISE')state.status='EM_ANALISE';
        else if(action==='APROVAR')state.status='APROVADA_MASTER';
        else throw new Error('Ação inesperada: '+action);
        resultado={
          sucesso:true,
          solicitacao:requestItem(state.status),
          providerAcionado:false,
          movimentouDinheiro:false,
          transferenciaCriada:false,
          mensagem:action==='APROVAR'
            ?'Solicitação aprovada pelo Master. Execução financeira permanece bloqueada.'
            :'Solicitação em análise.'
        };
      }else{
        throw new Error('Método inesperado: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    const payload=JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");<\\/script></body></html>'});
  });
}

test.describe('Financeiro Produtor -> Backoffice Master',()=>{
  test.skip(!BRANCH_MODE,'Fluxo financeiro mutável roda somente em branch com backend simulado.');

  test('produtor solicita com regra vigente sem chamar provider',async({page})=>{
    const state={token:'CT-E2E-PROD',requested:false,requestCalls:0};
    await mockProducer(page,state);
    await seed(page,state.token);
    await page.goto('/produtor/financeiro/?evento=EVT-E2E',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Conta Carioca Pay'})).toBeVisible();
    await expect(page.locator('#policyFee')).toContainText('3,5');
    await expect(page.locator('#policyAdvanceDeadline')).toContainText('2 dias úteis');
    await expect(page.getByText(/mínimo de R\$ 500,00/i)).toBeVisible();
    await expect(page.getByText(/D\+3 úteis · sem taxa/i)).toBeVisible();

    const button=page.locator('#requestAdvanceButton');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.locator('#advanceBackdrop')).not.toHaveClass(/hidden/);
    await expect(page.locator('#advanceValue')).toHaveValue('800.00');
    await page.locator('#advanceSubmit').click();

    await expect.poll(()=>state.requestCalls).toBe(1);
    await expect(page.locator('#message')).toContainText('Backoffice Master');
    await expect(page.locator('#pendingApprovals')).toContainText('800');
  });

  test('Master recebe, analisa e aprova sem movimentar dinheiro',async({page})=>{
    const state={token:'CT-E2E-ADMIN',status:'SOLICITADA',actions:[]};
    await mockMaster(page,state);
    await seed(page,state.token);
    await page.goto('/backoffice/carioca-pay/',{waitUntil:'domcontentloaded'});

    await expect(page.locator('#app')).not.toHaveClass(/hidden/);
    await expect(page.locator('#kOpen')).toHaveText('1');
    await expect(page.getByText('Produtor Teste').first()).toBeVisible();
    await page.getByText('Produtor Teste').first().click();
    await expect(page.locator('#detailStatus')).toHaveText('SOLICITADA');
    await expect(page.locator('#detail')).toContainText('3,50%');
    await expect(page.locator('#detail')).toContainText('não envia dinheiro');

    await page.getByRole('button',{name:'Iniciar análise'}).click();
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.status).toBe('EM_ANALISE');
    await expect(page.locator('#detailStatus')).toHaveText('EM ANÁLISE');

    await page.getByRole('button',{name:'Aprovar',exact:true}).click();
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.status).toBe('APROVADA_MASTER');
    await expect(page.locator('#detailStatus')).toHaveText('APROVADA MASTER');
    expect(state.actions).toEqual(['INICIAR_ANALISE','APROVAR']);
  });
});
