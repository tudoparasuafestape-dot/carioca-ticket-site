import { test, expect } from '@playwright/test';

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

function envelope(id,ok,resultado,erro=''){
  return JSON.stringify({
    ctMinhaCariocaPost:true,
    id,
    ok,
    resultado:ok?resultado:null,
    erro:ok?'':erro
  }).replace(/</g,'\\u003c');
}

async function seed(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate((storage)=>{
    const value=JSON.stringify({
      token:'CT-PROD-COM-E2E',
      expiraEm:'2099-01-01T00:00:00.000Z'
    });
    sessionStorage.setItem(storage,value);
    localStorage.setItem(storage,value);
  },STORAGE);
}

function person(state){
  const hasRule=state.hasRule;
  const hasChannel=state.hasChannel;
  const paid=state.paid;
  return {
    usuarioId:'USR-COM-1',
    nome:'Promotor E2E',
    email:'promotor@example.com',
    whatsappMascarado:'81*****0000',
    perfil:'COMISSIONADO',
    canal:hasChannel?{
      configurado:true,
      canalId:'CAN-E2E',
      papelComercial:'INFLUENCIADOR',
      codigoPublico:'PROMO-E2E',
      status:'ATIVO',
      ativo:true,
      tokenVersao:1,
      linkDisponivel:hasRule,
      link:hasRule?'https://cariocaticket.com.br/evento-v2/?evento=EVT-COM-E2E&seller=ASSINADO.E2E&refcode=PROMO-E2E':''
    }:{
      configurado:false,
      ativo:false,
      linkDisponivel:false
    },
    regras:hasRule?[{
      regraId:'COMREG-E2E',
      usuarioComissionadoId:'USR-COM-1',
      tipoRegra:'PERCENTUAL',
      valorRegra:10,
      tipoIngressoId:'',
      loteId:'',
      status:'ATIVO',
      beneficiarioNome:'Promotor E2E',
      pixTipo:'PIX',
      pixConfigurado:true
    }]:[],
    resumoVendas:{
      vendasConfirmadas:3,
      acessosConfirmados:3,
      valorVendidoNumero:150,
      recentes:[]
    },
    resumoComissao:{
      lancamentos:3,
      aReceberNumero:paid?0:15,
      aReceber:paid?'R$ 0,00':'R$ 15,00',
      pagoNumero:paid?15:0,
      pago:paid?'R$ 15,00':'R$ 0,00'
    },
    metas:state.hasGoal?[{
      incentivoId:'INC-E2E',
      tipoMeta:'VENDAS',
      metaNumero:10,
      progressoNumero:3,
      percentual:30,
      atingida:false,
      recompensaTipo:'BONUS_FIXO',
      recompensaValor:50,
      beneficioDescricao:'',
      status:'ATIVO',
      aplicacaoAutomatica:false
    }]:[],
    lancamentos:[{
      lancamentoId:'LAN-E2E',
      regraId:'COMREG-E2E',
      vendaId:'VEN-E2E',
      tipoRegra:'PERCENTUAL',
      valorRegra:10,
      baseNumero:150,
      quantidadeVendas:3,
      quantidadeAcessos:3,
      comissaoNumero:15,
      status:paid?'PAGA':'A_RECEBER',
      statusVenda:'CONFIRMADA',
      criadoEm:'2026-09-26T12:00:00.000Z'
    }]
  };
}

function loaded(state){
  return {
    sucesso:true,
    autenticado:true,
    autorizado:true,
    eventoId:'EVT-COM-E2E',
    evento:{id:'EVT-COM-E2E',nome:'Evento Comissão E2E'},
    produtorId:'PROD-E2E',
    comissionados:[person(state)],
    tipos:[{id:'TIPO-1',nome:'Individual'}],
    lotes:[{id:'LOTE-1',nome:'1º lote',tipoId:'TIPO-1'}],
    tiposRegra:[
      {id:'PERCENTUAL',nome:'Percentual sobre o valor da venda'},
      {id:'FIXO_POR_VENDA',nome:'Valor fixo por venda'},
      {id:'FIXO_POR_ACESSO',nome:'Valor fixo por acesso/ingresso'}
    ],
    resumo:{regras:state.hasRule?1:0,lancamentos:1,totalAReceberNumero:state.paid?0:15},
    linkOnlinePermitido:true,
    modoAcesso:'PUBLICO',
    pagamentoAutomatico:{habilitado:false},
    incentivoAutomatico:{habilitado:false}
  };
}

async function installMock(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];
    try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    state.methods.push(method);

    let ok=true,resultado=null,erro='';
    try{
      if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        resultado={
          sucesso:true,
          autenticado:true,
          autorizado:true,
          usuario:{id:'USR-PROD',nome:'Produtor E2E',perfil:'PRODUTOR_TITULAR'},
          produtores:[{
            id:'PROD-E2E',
            nomeFantasia:'Produtor E2E',
            perfil:'PRODUTOR_TITULAR',
            eventos:[{id:'EVT-COM-E2E',nome:'Evento Comissão E2E'}]
          }]
        };
      }else if(method==='ctComissoesPromotoresCarregarPROD'){
        state.loadCalls++;
        expect(args[0]).toBe('CT-PROD-COM-E2E');
        expect(args[1]).toBe('EVT-COM-E2E');
        resultado=loaded(state);
      }else if(method==='ctGestaoAcessosAdicionarUsuarioPROD'){
        state.addCalls++;
        expect(args).toEqual(['CT-PROD-COM-E2E','PROD-E2E','novo@example.com','COMISSIONADO']);
        resultado={sucesso:true,usuarioId:'USR-NOVO',email:'novo@example.com',perfil:'COMISSIONADO'};
      }else if(method==='ctComissoesPromotoresSalvarCanalPROD'){
        state.channelCalls++;
        expect(args[2].usuarioComissionadoId).toBe('USR-COM-1');
        expect(args[2].papelComercial).toBe('INFLUENCIADOR');
        state.hasChannel=true;
        resultado={sucesso:true,canal:person(state).canal};
      }else if(method==='ctComissoesEventoSalvarRegraPROD'){
        state.ruleCalls++;
        expect(args[2].usuarioComissionadoId).toBe('USR-COM-1');
        expect(args[2].tipoRegra).toBe('PERCENTUAL');
        expect(Number(args[2].valorRegra)).toBe(10);
        state.hasRule=true;
        resultado={sucesso:true,regraId:'COMREG-E2E',status:'ATIVO'};
      }else if(method==='ctComissoesPromotoresSalvarMetaPROD'){
        state.goalCalls++;
        expect(args[2].usuarioComissionadoId).toBe('USR-COM-1');
        expect(args[2].tipoMeta).toBe('VENDAS');
        state.hasGoal=true;
        resultado={sucesso:true,incentivoId:'INC-E2E',aplicacaoAutomatica:false};
      }else if(method==='ctComissoesPromotoresRegistrarPagamentoPROD'){
        state.payCalls++;
        expect(args[2].usuarioComissionadoId).toBe('USR-COM-1');
        state.paid=true;
        resultado={
          sucesso:true,
          registrado:true,
          pagamentoId:'COMPAG-E2E',
          valorTotalNumero:15,
          lancamentos:1,
          movimentoFinanceiroExecutado:false
        };
      }else{
        throw new Error('Método inesperado: '+method);
      }
    }catch(e){
      ok=false;
      erro=e&&e.message?e.message:String(e);
    }

    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\/script></body></html>'
    });
  });
}

function stateBase(overrides={}){
  return {
    hasChannel:false,
    hasRule:false,
    hasGoal:false,
    paid:false,
    loadCalls:0,
    addCalls:0,
    channelCalls:0,
    ruleCalls:0,
    goalCalls:0,
    payCalls:0,
    methods:[],
    ...overrides
  };
}

test.describe('Comissões de promotores',()=>{
  test.skip(!BRANCH_MODE,'Comissões mutáveis rodam somente na branch local simulada.');

  test('produtor configura regra, canal assinado e link individual',async({page})=>{
    const state=stateBase();
    await installMock(page,state);
    await seed(page);
    await page.goto('/produtor/comissoes/?evento=EVT-COM-E2E',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Promotores, influenciadores e vendedores'})).toBeVisible();
    await expect(page.getByText('Promotor E2E')).toBeVisible();

    await page.getByRole('button',{name:'Comissão'}).click();
    await page.locator('#ruleType').selectOption('PERCENTUAL');
    await page.locator('#ruleValue').fill('10');
    await page.locator('#pixType').selectOption('EMAIL');
    await page.locator('#pixKey').fill('promotor@example.com');
    await page.locator('#saveRule').click();
    await expect.poll(()=>state.ruleCalls).toBe(1);

    await page.getByRole('button',{name:'Canal/link'}).click();
    await page.locator('#channelRole').selectOption('INFLUENCIADOR');
    await page.locator('#channelCode').fill('PROMO-E2E');
    await page.locator('#saveChannel').click();
    await expect.poll(()=>state.channelCalls).toBe(1);

    await expect(page.getByText('PROMO-E2E')).toBeVisible();
    await expect(page.getByText(/seller=ASSINADO.E2E/)).toBeVisible();

    expect(state.methods.some(x=>/Asaas|transfer|ParceiroCT/i.test(x))).toBe(false);
  });

  test('adiciona conta existente como COMISSIONADO',async({page})=>{
    const state=stateBase();
    await installMock(page,state);
    await seed(page);
    await page.goto('/produtor/comissoes/?evento=EVT-COM-E2E',{waitUntil:'domcontentloaded'});

    await page.locator('#newEmail').fill('novo@example.com');
    await page.locator('#addButton').click();
    await expect.poll(()=>state.addCalls).toBe(1);
    await expect(page.getByText('Comissionado adicionado à equipe')).toBeVisible();
  });

  test('acompanha meta sem bônus automático e registra pagamento externo',async({page})=>{
    const state=stateBase({hasChannel:true,hasRule:true});
    await installMock(page,state);
    await seed(page);

    page.on('dialog',async dialog=>{
      if(dialog.type()==='prompt') await dialog.accept('PIX E2E');
      else await dialog.accept();
    });

    await page.goto('/produtor/comissoes/?evento=EVT-COM-E2E',{waitUntil:'domcontentloaded'});

    await page.getByRole('button',{name:'Meta'}).click();
    await page.locator('#goalType').selectOption('VENDAS');
    await page.locator('#goalValue').fill('10');
    await page.locator('#rewardType').selectOption('BONUS_FIXO');
    await page.locator('#rewardValue').fill('50');
    await page.locator('#saveGoal').click();
    await expect.poll(()=>state.goalCalls).toBe(1);

    await page.getByRole('button',{name:'Detalhes'}).click();
    await expect(page.getByText(/30.0%/)).toBeVisible();

    await page.getByRole('button',{name:'Registrar pagamento'}).click();
    await expect.poll(()=>state.payCalls).toBe(1);
    await expect(page.getByText(/Nenhuma transferência foi executada/)).toBeVisible();

    expect(state.methods.some(x=>/Asaas|transfer/i.test(x))).toBe(false);
  });
});
