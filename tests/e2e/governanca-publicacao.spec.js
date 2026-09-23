import { test, expect } from '@playwright/test';

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

function listFixture(risk='NOVO'){
  return {
    sucesso:true,autorizado:true,
    admin:{usuarioId:'USR-ADMIN-E2E',nome:'Admin Master',perfil:'ADMINISTRADOR'},
    itens:[{
      produtorId:'PROD-E2E',
      nomeFantasia:'Produtor Homologação',
      responsavelNome:'Responsável E2E',
      status:'ATIVO',
      cadastroStatus:'APROVADO',
      riscoStatus:risk,
      publicacaoAutorizada:['VERIFICADO','CONFIAVEL'].includes(risk),
      financeiroPronto:true,
      financeiroStatus:'ATIVO',
      termoFinanceiroAceito:true,
      eventos:1,
      observacao:''
    }],
    total:1,
    riscos:['NOVO','EM_VALIDACAO','VERIFICADO','CONFIAVEL','RESTRITO','BLOQUEADO'],
    versaoModulo:'1.0.0'
  };
}

function eventsFixture(eventAuthorized=false){
  return {
    sucesso:true,autorizado:true,produtorId:'PROD-E2E',total:1,
    itens:[{
      eventoId:'EVT-E2E',
      nome:'Evento Governança E2E',
      data:'30/10/2026',
      status:'RASCUNHO',
      legado:false,
      riscoStatus:eventAuthorized?'APROVADO':'PENDENTE_ANALISE',
      publicacaoAutorizada:eventAuthorized,
      termoEventoAceito:true,
      publicado:false,
      gatePronto:eventAuthorized,
      pendencias:eventAuthorized?[]:['A autorização administrativa deste evento ainda está pendente.']
    }]
  };
}

async function seed(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(key=>{
    const data=JSON.stringify({token:'CT-GOV-E2E-TOKEN',expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(key,data);localStorage.setItem(key,data);
  },STORAGE);
}

async function mockRpc(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const params=new URLSearchParams(route.request().postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||'');
    const action=String(params.get('ctMinhaCariocaAction')||'');
    const method=String(params.get('metodo')||'');
    let args=[];try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      expect(action).toBe('portalRpc');
      expect(String(args[0]||'')).toBe('CT-GOV-E2E-TOKEN');
      if(method==='ctGovernancaPublicacaoAdminListarPROD'){
        state.listCalls++;
        resultado=listFixture(state.risk);
      }else if(method==='ctGovernancaPublicacaoAdminEventosPROD'){
        expect(String(args[1]||'')).toBe('PROD-E2E');
        state.eventCalls++;
        resultado=eventsFixture(state.eventAuthorized);
      }else if(method==='ctGovernancaPublicacaoAdminAtualizarProdutorPROD'){
        expect(String(args[1]||'')).toBe('PROD-E2E');
        state.producerActions.push(String(args[2]||''));
        if(String(args[2]||'')==='VERIFICAR')state.risk='VERIFICADO';
        resultado={sucesso:true,autorizado:true,produtor:{produtorId:'PROD-E2E',riscoStatus:state.risk}};
      }else if(method==='ctGovernancaPublicacaoAdminAtualizarEventoPROD'){
        expect(String(args[1]||'')).toBe('EVT-E2E');
        state.eventActions.push(String(args[2]||''));
        if(String(args[2]||'')==='AUTORIZAR')state.eventAuthorized=true;
        resultado={sucesso:true,autorizado:true,eventoId:'EVT-E2E'};
      }else{
        throw new Error('Método não previsto: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    const payload=JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
    await route.fulfill({
      status:200,contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");<\/script></body></html>'
    });
  });
}

test.describe('Governança e Gate de Publicação',()=>{
  test.skip(!BRANCH_MODE,'Fluxo de governança roda na branch com backend simulado.');

  test('admin verifica produtor e autoriza evento separadamente',async({page})=>{
    const state={risk:'NOVO',eventAuthorized:false,listCalls:0,eventCalls:0,producerActions:[],eventActions:[]};
    await mockRpc(page,state);
    await seed(page);
    await page.goto('/backoffice/governanca/',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Quem pode publicar e por quê'})).toBeVisible();
    await expect(page.locator('#producerList')).toContainText('Produtor Homologação');
    await expect(page.locator('#producerList')).toContainText('NOVO');

    await page.getByRole('button',{name:/Produtor Homologação/i}).click();
    await expect(page.locator('#detail')).toContainText('Evento Governança E2E');
    await expect(page.locator('#detail')).toContainText('PENDENTE_ANALISE');

    await page.getByRole('button',{name:'Marcar verificado'}).click();
    await expect(page.locator('#actionBackdrop')).not.toHaveClass(/hidden/);
    await page.getByRole('button',{name:'Confirmar'}).click();
    await expect.poll(()=>state.producerActions.includes('VERIFICAR')).toBeTruthy();
    await expect(page.locator('#producerList')).toContainText('VERIFICADO');

    await page.getByRole('button',{name:/Produtor Homologação/i}).click();
    await page.getByRole('button',{name:'Autorizar publicação'}).click();
    await page.getByRole('button',{name:'Confirmar'}).click();
    await expect.poll(()=>state.eventActions.includes('AUTORIZAR')).toBeTruthy();

    await page.getByRole('button',{name:/Produtor Homologação/i}).click();
    await expect(page.locator('#detail')).toContainText('APROVADO');
    await expect(page.locator('#detail')).toContainText('SIM');
  });

  test('sem sessão o Backoffice de governança permanece fechado',async({page})=>{
    await page.goto('/backoffice/governanca/',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Acesso restrito'})).toBeVisible();
    await expect(page.locator('#app')).toHaveClass(/hidden/);
  });
});
