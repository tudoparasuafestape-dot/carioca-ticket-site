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
