import { test, expect } from '@playwright/test';

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';
const ONE_PIXEL_PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=';

async function installMock(page,state){
  await page.route('https://script.google.com/**', async route=>{
    const request=route.request();
    const params=new URLSearchParams(request.postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||'');
    const action=String(params.get('ctMinhaCariocaAction')||'');
    const method=String(params.get('metodo')||'');
    let args=[];
    try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}
    let resultado=null,ok=true,erro='';
    try{
      if(action!=='portalRpc') throw new Error('Ação não prevista: '+action);
      switch(method){
        case 'ctCentralAcessoObterCapacidadesPROD':
          resultado={sucesso:true,loginEmailSenha:{habilitado:true},cadastro:{habilitado:true},recuperacaoSenha:{habilitado:true},google:{habilitado:false}};
          break;
        case 'ctMarcaOficialObterDataUriPROD':
          resultado=ONE_PIXEL_PNG;
          break;
        case 'ctCentralAcessoObterFirebaseConfigPROD':
          resultado={sucesso:false};
          break;
        case 'ctPortalProdutorRestaurarSessaoIsoladaPROD':
          expect(String(args[0]||'')).toBe(state.token);
          resultado={
            sucesso:true,autenticado:true,autorizado:true,
            usuario:{id:'USR-NAV-E2E',nome:'Administrador Jornada',email:'admin@example.invalid',perfil:'ADMINISTRADOR'},
            produtores:[{id:'PROD-NAV-E2E',nomeFantasia:'Produtor Jornada',perfil:'ADMINISTRADOR',eventos:[]}]
          };
          break;
        case 'ctCentralOperacionalCriarHandoffPROD':
          resultado={sucesso:true,handoff:'HANDOFF-NAV-E2E-ABCDEFGHIJKLMNOPQRSTUVWXYZ',destino:String(args[1]||''),expiraEm:'2099-01-01T00:00:00.000Z'};
          break;
        case 'ctParceiroOnboardingAdminListarPROD':
          expect(String(args[0]||'')).toBe(state.token);
          resultado={sucesso:true,autorizado:true,admin:{nome:'Administrador Jornada',perfil:'ADMINISTRADOR'},contagem:{ENVIADO:0,EM_ANALISE:0,PENDENCIA:0,APROVADO:0,ATIVO:1},itens:[]};
          break;
        case 'ctProdutorOnboardingAdminContarPendentesPROD':
          expect(String(args[0]||'')).toBe(state.token);
          resultado={sucesso:true,autorizado:true,total:0,contagem:{ENVIADO:0,EM_ANALISE:0,PENDENCIA:0}};
          break;
        case 'ctProdutorOnboardingAdminListarPROD':
          expect(String(args[0]||'')).toBe(state.token);
          resultado={sucesso:true,autorizado:true,admin:{nome:'Administrador Jornada',perfil:'ADMINISTRADOR'},contagem:{ENVIADO:0,EM_ANALISE:0,PENDENCIA:0,REPROVADO:0,ATIVO:1},itens:[],total:0};
          break;
        case 'logoutUsuarioCT2':
          expect(String(args[0]||'')).toBe(state.token);
          state.logoutCalls+=1;
          resultado={sucesso:true};
          break;
        default:
          throw new Error('Método não previsto no gate de jornada: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    const payload=JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");<\\/script></body></html>'
    });
  });
}

async function seedSession(page,token){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(({key,token})=>{
    const value=JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(key,value);
    localStorage.setItem(key,value);
  },{key:STORAGE,token});
}

test.describe('Gate de jornada e navegação por perfil',()=>{
  test.skip(!BRANCH_MODE,'Executa na branch com backend simulado.');

  test('administrador encontra Portal Parceiro e Gestão Parceiros clicando pela navegação',async({page})=>{
    const state={token:'CT-NAV-E2E-TOKEN',logoutCalls:0};
    await installMock(page,state);
    await seedSession(page,state.token);

    await page.goto('/produtor/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#portalView')).toBeVisible({timeout:15000});
    await expect(page.locator('#partnerPortalLink')).toBeVisible();
    await expect(page.locator('#partnerPortalLink')).toHaveText('Portal Parceiro CT');
    await expect(page.locator('#partnerPortalLink')).toHaveAttribute('href','/parceiro/');
    await expect(page.locator('#partnerAdminLink')).toBeVisible();
    await expect(page.locator('#partnerAdminLink')).toHaveText('Gestão Parceiros CT');
    await expect(page.locator('#partnerAdminLink')).toHaveAttribute('href','/parceiro/admin/');

    await page.locator('#partnerAdminLink').click();
    await expect(page).toHaveURL(/\/parceiro\/admin\//);
    await expect(page.locator('#app')).toBeVisible({timeout:15000});
    await expect(page.locator('#partnerPortalLink')).toHaveAttribute('href','/parceiro/');
    await expect(page.locator('#producerRequestsLink')).toHaveAttribute('href','/produtor/solicitacoes/');
    await expect(page.locator('#logoutAdminButton')).toBeVisible();

    await page.locator('#partnerPortalLink').click();
    await expect(page).toHaveURL(/\/parceiro\/$/);
    await expect(page.getByRole('heading',{name:/Seu resultado em um só lugar/i})).toBeVisible();
    await expect(page.getByRole('link',{name:/Conheça o programa/i})).toHaveAttribute('href','/parceiro/programa/');
  });

  test('backoffice permite sair sem depender de outra tela',async({page})=>{
    const state={token:'CT-NAV-E2E-TOKEN',logoutCalls:0};
    await installMock(page,state);
    await seedSession(page,state.token);
    await page.goto('/parceiro/admin/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#app')).toBeVisible({timeout:15000});

    await page.locator('#logoutAdminButton').click();
    await expect.poll(()=>state.logoutCalls).toBe(1);
    await page.waitForURL(/\/produtor\/?(?:\?.*)?$/,{timeout:15000});
    const stored=await page.evaluate(key=>({session:sessionStorage.getItem(key),local:localStorage.getItem(key)}),STORAGE);
    expect(stored.session).toBeNull();
    expect(stored.local).toBeNull();
  });

  test('gestão de produtores também oferece retorno, ecossistema e saída',async({page})=>{
    const state={token:'CT-NAV-E2E-TOKEN',logoutCalls:0};
    await installMock(page,state);
    await seedSession(page,state.token);
    await page.goto('/produtor/solicitacoes/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#app')).toBeVisible({timeout:15000});
    await expect(page.getByRole('link',{name:'Portal Parceiro CT'})).toHaveAttribute('href','/parceiro/');
    await expect(page.getByRole('link',{name:'Gestão Parceiros CT'})).toHaveAttribute('href','/parceiro/admin/');
    await expect(page.getByRole('link',{name:'Portal do Produtor'})).toHaveAttribute('href','/produtor/');
    await expect(page.locator('#logoutAdminButton')).toBeVisible();
  });
});
