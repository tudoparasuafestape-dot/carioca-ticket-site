import { test, expect } from '@playwright/test';

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

async function seed(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate((storage)=>{
    const value=JSON.stringify({token:'CT-ADMIN-E2E',expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(storage,value);localStorage.setItem(storage,value);
  },STORAGE);
}

function envelope(id,ok,resultado,erro=''){
  return JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
}

async function installMock(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      if(method==='ctEventoGovernancaMasterListarPROD'){
        resultado={sucesso:true,autorizado:true,itens:[{
          eventoId:'EVT-GOV-E2E',eventoNome:'Evento Governado E2E',eventoData:'20/11/2026',eventoStatus:'RASCUNHO',
          produtorId:'PROD-E2E',produtorNome:'Produtor E2E',origemComercial:'PRODUTOR',
          riscoStatus:state.status,publicacaoAutorizada:state.authorized,financeiroPronto:state.financeReady,
          criadoEm:'2026-09-24T20:00:00.000Z',atualizadoEm:'2026-09-24T20:00:00.000Z'
        }],total:1,contagem:{pendentes:state.authorized?0:(state.status==='BLOQUEADO'?0:1),autorizados:state.authorized?1:0,bloqueados:state.status==='BLOQUEADO'?1:0},movimentouDinheiro:false,publicouVendas:false};
      }else if(method==='ctEventoGovernancaMasterDecidirPROD'){
        const action=String(args[2]||'');state.actions.push(action);
        if(action==='INICIAR_ANALISE'){state.status='EM_ANALISE';state.authorized=false}
        else if(action==='APROVAR'){if(!state.financeReady)throw new Error('CT_EVENTO_GOV_MASTER_FINANCEIRO_NAO_PRONTO');state.status='APROVADO';state.authorized=true}
        else if(action==='REPROVAR'){state.status='BLOQUEADO';state.authorized=false}
        else throw new Error('acao inesperada');
        resultado={sucesso:true,autorizado:true,evento:{eventoId:'EVT-GOV-E2E',eventoNome:'Evento Governado E2E',eventoStatus:'RASCUNHO',produtorId:'PROD-E2E',produtorNome:'Produtor E2E',origemComercial:'PRODUTOR',riscoStatus:state.status,publicacaoAutorizada:state.authorized,financeiroPronto:state.financeReady},movimentouDinheiro:false,publicouVendas:false,mensagem:'Decisão registrada.'};
      }else throw new Error('Método não previsto: '+method);
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\/script></body></html>'});
  });
}

test.describe('Governança Master de eventos',()=>{
  test.skip(!BRANCH_MODE,'Governança mutável roda somente na branch local simulada.');

  test('evento novo passa por analise Master sem publicacao automatica',async({page})=>{
    const state={status:'PENDENTE_ANALISE',authorized:false,financeReady:true,actions:[]};
    await installMock(page,state);await seed(page);
    await page.goto('/backoffice/eventos/',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Eventos novos antes das vendas'})).toBeVisible();
    await expect(page.getByText('Evento Governado E2E').first()).toBeVisible();
    await page.getByText('Evento Governado E2E').first().click();
    await expect(page.locator('#detail')).toContainText('Financeiro produtor');
    await expect(page.locator('#detail')).toContainText('PRONTO');

    await page.getByRole('button',{name:'Iniciar análise'}).click();
    await page.locator('#confirmDecision').click();
    await expect.poll(()=>state.status).toBe('EM_ANALISE');
    await expect(page.getByRole('button',{name:'Aprovar governança'})).toBeVisible();

    await page.getByRole('button',{name:'Aprovar governança'}).click();
    await page.locator('#confirmDecision').click();
    await expect.poll(()=>state.authorized).toBe(true);
    expect(state.actions).toEqual(['INICIAR_ANALISE','APROVAR']);
    await expect(page.locator('#approvedCount')).toHaveText('1');
    await expect(page.locator('#detail')).toContainText('AUTORIZADO');
  });

  test('financeiro não pronto impede aprovação',async({page})=>{
    const state={status:'EM_ANALISE',authorized:false,financeReady:false,actions:[]};
    await installMock(page,state);await seed(page);
    await page.goto('/backoffice/eventos/',{waitUntil:'domcontentloaded'});
    await page.getByText('Evento Governado E2E').first().click();
    await expect(page.getByRole('button',{name:'Aprovar governança'})).toBeDisabled();
    expect(state.authorized).toBe(false);
  });
});


async function installProducerEventMock(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      if(method==='ctEventosOperacionalListarSeguraPROD'){
        resultado={
          sucesso:true,autenticado:true,autorizado:true,total:1,publicados:state.published?1:0,
          eventoAtivo:null,eventoSelecionado:null,listagemRapida:true,
          eventos:[{
            id:'EVT-PROD-E2E',nome:'Evento do Produtor',data:'20/11/2026',horario:'18:00 - 23:00',
            local:'Espaço Teste',cidade:'Jaboatão dos Guararapes',uf:'PE',capacidade:200,
            status:'RASCUNHO',ativo:false,atualizadoEm:'26/09/2026 01:00',
            publicacao:{
              sucesso:true,eventoId:'EVT-PROD-E2E',publicado:state.published,
              prontoPublicar:state.published,pendencias:[],checkoutUrl:'https://cariocaticket.com.br/checkout/?evento=EVT-PROD-E2E',
              validacaoCompleta:false
            }
          }]
        };
      }else if(method==='ctEventosOperacionalStatusPublicacaoSeguraPROD'){
        expect(String(args[0]||'')).toBe('CT-ADMIN-E2E');
        expect(String(args[1]||'')).toBe('EVT-PROD-E2E');
        state.statusCalls+=1;
        resultado={
          sucesso:true,eventoId:'EVT-PROD-E2E',publicado:state.published,
          prontoPublicar:state.ready,
          pendencias:state.ready?[]:[
            'A autorização de risco/financeiro para publicação ainda está pendente.'
          ],
          governancaRisco:{
            sucesso:state.ready,
            governanca:{
              eventoId:'EVT-PROD-E2E',
              riscoStatus:state.ready?'APROVADO':'PENDENTE_ANALISE',
              publicacaoAutorizada:state.ready
            },
            pendencias:state.ready?[]:[
              'A autorização de risco/financeiro para publicação ainda está pendente.'
            ]
          },
          checkoutUrl:'https://cariocaticket.com.br/checkout/?evento=EVT-PROD-E2E'
        };
      }else if(method==='ctEventosOperacionalPublicarSeguraPROD'){
        expect(String(args[0]||'')).toBe('CT-ADMIN-E2E');
        expect(String(args[1]||'')).toBe('EVT-PROD-E2E');
        if(!state.ready)throw new Error('EVENTO_NAO_PRONTO_PARA_PUBLICAR');
        state.publishCalls+=1;state.published=true;
        resultado={sucesso:true,mensagem:'Vendas publicadas com sucesso.',publicacao:{publicado:true,prontoPublicar:true,pendencias:[]}};
      }else{
        throw new Error('Método não previsto no produtor: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\/script></body></html>'
    });
  });
}

test.describe('Jornada do produtor até publicação',()=>{
  test.skip(!BRANCH_MODE,'Jornada mutável roda somente na branch local simulada.');

  test('evento aguardando análise informa autorização automática e não publica',async({page})=>{
    const state={ready:false,published:false,statusCalls:0,publishCalls:0};
    await installProducerEventMock(page,state);await seed(page);
    const dialogs=[];
    page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss()});
    await page.goto('/eventos-v2/',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('button',{name:'Ver situação e publicar'})).toBeVisible();
    await page.getByRole('button',{name:'Ver situação e publicar'}).click();

    await expect.poll(()=>state.statusCalls).toBe(1);
    await expect.poll(()=>dialogs.join('\n')).toContain('autorização já foi solicitada automaticamente');
    expect(state.publishCalls).toBe(0);
  });

  test('evento pronto consulta gates antes de confirmar e publicar',async({page})=>{
    const state={ready:true,published:false,statusCalls:0,publishCalls:0};
    await installProducerEventMock(page,state);await seed(page);
    const dialogs=[];
    page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
    await page.goto('/eventos-v2/',{waitUntil:'domcontentloaded'});

    await page.getByRole('button',{name:'Ver situação e publicar'}).click();

    await expect.poll(()=>state.statusCalls).toBe(1);
    await expect.poll(()=>state.publishCalls).toBe(1);
    expect(dialogs.some(x=>x.includes('Todos os requisitos foram atendidos'))).toBe(true);
    expect(dialogs.some(x=>x.includes('Vendas publicadas com sucesso.'))).toBe(true);
  });
});
