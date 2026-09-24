import { test, expect } from '@playwright/test';

const BRANCH_MODE = String(process.env.CT_BRANCH_MODE || '') === '1';
const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

function fixture(filters={}) {
  return {
    sucesso:true,autorizado:true,
    admin:{usuarioId:'USR-ADMIN-E2E',nome:'Administrador Master',perfil:'ADMINISTRADOR'},
    periodo:{inicio:filters.inicio||'2026-09-16',fim:filters.fim||'2026-09-22',dias:7},
    resumo:{acessos:1240,sessoes:730,pedidos:84,pedidosPagos:67,pedidosAguardando:8,pedidosFalha:9,pedidosCancelados:3,pedidosExpirados:4,pedidosFalhasTecnicas:2,vendas:72,ingressos:91,receitaBruta:6840,ticketMedio:95},
    funil:{home:1240,eventos:920,evento:780,checkout:260,pedidos:84,pagos:67,conversaoEventoPedido:10.77,conversaoPedidoPago:79.76},
    financeiro:{
      vendasPorForma:[{forma:'PIX',valor:4200,vendas:45},{forma:'CREDIT_CARD',valor:2640,vendas:27}],
      online:{confirmado:67,pendente:8,cancelado:3,falha:2,estornado:2,chargeback:1,reembolso:1,totalConfirmado:6350,totalEstornado:180,totalReembolsado:120},
      promocoes:{ativo:true,campanhas:2,pedidos:6,usos:8,usosLiquidos:6,reembolsados:1,chargebacks:1,descontoConcedido:80,descontoRevertido:20,descontoLiquido:60,receitaPromocionalBruta:120,receitaPromocionalRevertida:30,receitaPromocionalLiquida:90}
    },
    analytics:{porPagina:{HOME:1240,EVENTOS:920,EVENTO:780,CHECKOUT:260},porOrigem:{DIRETO:600,WHATSAPP:420,INSTAGRAM:220},porDispositivo:{MOBILE:900,DESKTOP:280,TABLET:60}},
    plataforma:{produtoresTotal:8,produtoresAtivos:6,eventosTotal:19,eventosAtivos:7},
    serieDiaria:[
      {dia:'2026-09-16',acessos:120,sessoes:80,receita:700,ingressos:10,pedidos:9,pedidosPagos:7},
      {dia:'2026-09-17',acessos:160,sessoes:95,receita:820,ingressos:12,pedidos:10,pedidosPagos:8},
      {dia:'2026-09-18',acessos:180,sessoes:104,receita:900,ingressos:13,pedidos:11,pedidosPagos:9},
      {dia:'2026-09-19',acessos:210,sessoes:118,receita:1040,ingressos:15,pedidos:14,pedidosPagos:11},
      {dia:'2026-09-20',acessos:170,sessoes:102,receita:980,ingressos:14,pedidos:12,pedidosPagos:10},
      {dia:'2026-09-21',acessos:190,sessoes:111,receita:1120,ingressos:15,pedidos:13,pedidosPagos:11},
      {dia:'2026-09-22',acessos:210,sessoes:120,receita:1280,ingressos:12,pedidos:15,pedidosPagos:11}
    ],
    rankings:{
      eventosMaisAcessados:[
        {eventoId:'EVT-1',eventoNome:'Roda de Samba Estilo Carioca',produtorId:'PROD-1',produtorNome:'Tudo Para Sua Festa',acessos:640,sessoes:390,receita:3900,ingressos:52,vendas:40,pedidos:48,pedidosPagos:39,conversao:10}
      ],
      eventosMaiorReceita:[
        {eventoId:'EVT-1',eventoNome:'Roda de Samba Estilo Carioca',produtorId:'PROD-1',produtorNome:'Tudo Para Sua Festa',acessos:640,sessoes:390,receita:3900,ingressos:52,vendas:40,pedidos:48,pedidosPagos:39,conversao:10}
      ],
      eventosMaisIngressos:[
        {eventoId:'EVT-1',eventoNome:'Roda de Samba Estilo Carioca',produtorId:'PROD-1',produtorNome:'Tudo Para Sua Festa',acessos:640,sessoes:390,receita:3900,ingressos:52,vendas:40,pedidos:48,pedidosPagos:39,conversao:10}
      ],
      eventosMaiorConversao:[],
      produtoresMaiorReceita:[
        {produtorId:'PROD-1',produtorNome:'Tudo Para Sua Festa',receita:3900,ingressos:52,vendas:40,pedidos:48,pedidosPagos:39,acessos:640,sessoes:390}
      ],
      produtoresMaisIngressos:[]
    },
    geradoEm:'2026-09-22T23:50:00.000Z',versaoModulo:'1.1.0'
  };
}

async function seed(page) {
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(({key})=>{
    const value=JSON.stringify({token:'CT-MASTER-E2E-TOKEN',expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(key,value);localStorage.setItem(key,value);
  },{key:STORAGE});
}

async function mock(page,state){
  await page.route('https://script.google.com/**', async route => {
    const params=new URLSearchParams(route.request().postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||'');
    const action=String(params.get('ctMinhaCariocaAction')||'');
    const method=String(params.get('metodo')||'');
    let args=[];try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      expect(action).toBe('portalRpc');
      expect(method).toBe('ctBackofficeMasterCarregarPROD');
      expect(String(args[0]||'')).toBe('CT-MASTER-E2E-TOKEN');
      state.calls++;
      state.lastFilters=args[1]||{};
      resultado=fixture(state.lastFilters);
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    const payload=JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");<\/script></body></html>'});
  });
}

test.describe('Backoffice Master BI',()=>{
  test.skip(!BRANCH_MODE,'Backoffice mutável roda somente contra branch local com backend simulado.');

  test('dashboard global carrega KPIs, rankings, financeiro e filtros sem evento ativo',async({page})=>{
    const state={calls:0,lastFilters:null};
    await mock(page,state);await seed(page);
    await page.goto('/backoffice/',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Visão executiva da plataforma'})).toBeVisible();
    await expect(page.locator('#adminLabel')).toContainText('ADMINISTRADOR');
    await expect(page.locator('#kViews')).toHaveText('1.240');
    await expect(page.locator('#kSessions')).toHaveText('730');
    await expect(page.locator('#kRevenue')).toContainText('6.840,00');
    await expect(page.locator('#kTickets')).toHaveText('91');
    await expect(page.locator('#kCancelled')).toHaveText('3');
    await expect(page.locator('#kExpired')).toHaveText('4');
    await expect(page.locator('#kDiscount')).toContainText('60,00');
    await expect(page.locator('#pReimburse')).toHaveText('1');
    await expect(page.locator('#pReimburseValue')).toContainText('120,00');
    await expect(page.locator('#promoCampaigns')).toHaveText('2');
    await expect(page.locator('#promoOrders')).toHaveText('6');
    await expect(page.locator('#promoUses')).toHaveText('6');
    await expect(page.locator('#promoNet')).toContainText('60,00');
    await expect(page.locator('#promoRevenue')).toContainText('90,00');
    await expect(page.locator('#rankAccess')).toContainText('Roda de Samba Estilo Carioca');
    await expect(page.locator('#rankProducers')).toContainText('Tudo Para Sua Festa');
    await expect(page.locator('#paymentMethods')).toContainText('PIX');
    await expect(page.locator('#sources')).toContainText('WHATSAPP');
    await expect(page.locator('#devices')).toContainText('MOBILE');
    expect(state.calls).toBe(1);
    expect(state.lastFilters).toEqual({preset:'7D'});

    await page.getByRole('button',{name:'30 dias'}).click();
    await expect.poll(()=>state.calls).toBe(2);
    expect(state.lastFilters).toEqual({preset:'30D'});

    await page.locator('#dateStart').fill('2026-09-01');
    await page.locator('#dateEnd').fill('2026-09-22');
    await page.getByRole('button',{name:'Aplicar período'}).click();
    await expect.poll(()=>state.calls).toBe(3);
    expect(state.lastFilters).toEqual({inicio:'2026-09-01',fim:'2026-09-22'});
  });

  test('sem sessão não expõe o Backoffice Master',async({page})=>{
    await page.goto('/backoffice/',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Acesso restrito'})).toBeVisible();
    await expect(page.locator('#app')).toHaveClass(/hidden/);
  });
});


function eventGovernanceFixture(status='PENDENTE_ANALISE') {
  return {
    eventoId:'EVT-GOV-E2E',
    produtorId:'PROD-E2E',
    status,
    publicacaoAutorizada:status==='APROVADO',
    origemComercial:'PRODUTOR',
    possuiReferenciaComercial:false,
    atualizadoEm:'2026-09-24T20:30:00.000Z',
    evento:{
      id:'EVT-GOV-E2E',
      nome:'Evento Teste Governança',
      data:'25/10/2026',
      horario:'15:00 às 22:00',
      local:'Local Teste',
      cidade:'Jaboatão dos Guararapes',
      uf:'PE',
      capacidade:300,
      status:'RASCUNHO'
    }
  };
}

async function eventGovernanceMock(page,state){
  await page.route('https://script.google.com/**', async route => {
    const params=new URLSearchParams(route.request().postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||'');
    const method=String(params.get('metodo')||'');
    let args=[];try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      expect(String(args[0]||'')).toBe('CT-MASTER-E2E-TOKEN');
      if(method==='ctEventosGovernancaMasterContarPendentesPROD'){
        resultado={
          sucesso:true,autorizado:true,
          contagem:{
            pendenteAnalise:state.status==='PENDENTE_ANALISE'?1:0,
            emAnalise:state.status==='EM_ANALISE'?1:0,
            aprovados:state.status==='APROVADO'?1:0,
            bloqueados:state.status==='BLOQUEADO'?1:0,
            abertos:['PENDENTE_ANALISE','EM_ANALISE'].includes(state.status)?1:0
          }
        };
      }else if(method==='ctEventosGovernancaMasterListarPROD'){
        resultado={sucesso:true,autorizado:true,itens:[eventGovernanceFixture(state.status)],total:1};
      }else if(method==='ctEventosGovernancaMasterDetalharPROD'){
        expect(String(args[1]||'')).toBe('EVT-GOV-E2E');
        resultado={
          sucesso:true,autorizado:true,
          governanca:eventGovernanceFixture(state.status),
          validacaoPublicacao:{
            sucesso:state.status==='APROVADO',
            pendencias:state.status==='APROVADO'?[]:['A autorização de risco/financeiro para publicação ainda está pendente.']
          }
        };
      }else if(method==='ctEventosGovernancaMasterDecidirPROD'){
        expect(String(args[1]||'')).toBe('EVT-GOV-E2E');
        const action=String(args[2]||'');
        const reason=String(args[3]||'');
        state.actions.push({action,reason});
        if(action==='INICIAR_ANALISE'){
          expect(state.status).toBe('PENDENTE_ANALISE');
          state.status='EM_ANALISE';
        }else if(action==='AUTORIZAR_PUBLICACAO'){
          expect(state.status).toBe('EM_ANALISE');
          state.status='APROVADO';
        }else if(action==='BLOQUEAR'){
          expect(state.status).toBe('EM_ANALISE');
          expect(reason.length).toBeGreaterThanOrEqual(3);
          state.status='BLOQUEADO';
        }else{
          throw new Error('Ação de governança inesperada: '+action);
        }
        resultado={
          sucesso:true,autorizado:true,
          governanca:eventGovernanceFixture(state.status),
          publicacaoExecutada:false,
          criouVenda:false,
          criouCobranca:false,
          criouIngresso:false,
          movimentouDinheiro:false,
          mensagem:action==='AUTORIZAR_PUBLICACAO'
            ?'Evento autorizado pelo Master. O produtor ainda precisa publicar as vendas.'
            :action==='BLOQUEAR'
              ?'Publicação bloqueada pelo Master.'
              :'Evento colocado em análise.'
        };
      }else{
        throw new Error('Método de governança não previsto: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    const payload=JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");<\/script></body></html>'
    });
  });
}

test.describe('Backoffice Master — governança de eventos',()=>{
  test.skip(!BRANCH_MODE,'Governança de eventos roda somente na branch com backend simulado.');

  test('evento RASCUNHO passa por análise e autorização sem publicar vendas',async({page})=>{
    const state={status:'PENDENTE_ANALISE',actions:[]};
    await eventGovernanceMock(page,state);
    await seed(page);

    await page.goto('/backoffice/eventos/',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Aprovação de Eventos'})).toBeVisible();
    await expect(page.locator('#kPending')).toHaveText('1');
    await expect(page.locator('#list')).toContainText('Evento Teste Governança');
    await expect(page.locator('#list')).toContainText('PENDENTE ANÁLISE');

    await page.getByText('Evento Teste Governança').first().click();
    await expect(page.locator('#detailStatus')).toHaveText('PENDENTE ANÁLISE');
    await expect(page.locator('#detail')).toContainText('Publicação autorizada');
    await expect(page.locator('#detail')).toContainText('NÃO');
    await expect(page.locator('#detail')).toContainText('não cria venda, cobrança, ingresso ou transferência');

    await page.getByRole('button',{name:'Iniciar análise'}).click();
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.status).toBe('EM_ANALISE');
    await expect(page.locator('#detailStatus')).toHaveText('EM ANÁLISE');

    await page.getByRole('button',{name:'Autorizar publicação'}).click();
    await expect(page.locator('#decisionText')).toContainText('não publica');
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.status).toBe('APROVADO');
    await expect(page.locator('#detailStatus')).toHaveText('APROVADO');
    await expect(page.locator('#detail')).toContainText('SIM');
    await expect(page.locator('#detail')).toContainText('O produtor ainda precisa publicar as vendas');
    expect(state.actions.map(x=>x.action)).toEqual(['INICIAR_ANALISE','AUTORIZAR_PUBLICACAO']);
  });

  test('bloqueio exige motivo e continua sem publicar',async({page})=>{
    const state={status:'PENDENTE_ANALISE',actions:[]};
    await eventGovernanceMock(page,state);
    await seed(page);

    await page.goto('/backoffice/eventos/',{waitUntil:'domcontentloaded'});
    await page.getByText('Evento Teste Governança').first().click();
    await page.getByRole('button',{name:'Iniciar análise'}).click();
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.status).toBe('EM_ANALISE');

    await page.getByRole('button',{name:'Bloquear'}).click();
    await page.locator('#decisionConfirm').click();
    await expect(page.locator('#toast')).toContainText('Informe o motivo do bloqueio');
    expect(state.status).toBe('EM_ANALISE');

    await page.locator('#reason').fill('Documentação financeira pendente');
    await page.locator('#decisionConfirm').click();
    await expect.poll(()=>state.status).toBe('BLOQUEADO');
    await expect(page.locator('#detailStatus')).toHaveText('BLOQUEADO');
    await expect(page.locator('#detail')).toContainText('NÃO');
    expect(state.actions.map(x=>x.action)).toEqual(['INICIAR_ANALISE','BLOQUEAR']);
  });
});
