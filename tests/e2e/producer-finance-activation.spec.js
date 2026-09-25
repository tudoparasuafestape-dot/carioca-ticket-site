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
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';
    try{
      if(method==='ctFinanceiroProdutorMasterListarPROD'){
        resultado={sucesso:true,autorizado:true,ambienteProvider:'PRODUCAO',itens:[{
          financeiroId:'FIN-E2E',organizacaoId:'ORG-E2E',produtorId:'PROD-E2E',produtorNome:'Produtor E2E',
          provedor:'ASAAS',provedorAmbiente:'PRODUCAO',modoConta:'SUBCONTA_PLATAFORMA',
          statusOnboarding:state.activated?'ATIVO':'PENDENTE_CREDENCIAL',
          credencialConfigurada:state.activated,recebimentoHabilitado:state.activated,splitHabilitado:false,
          termosVersao:state.activated?'CT-FIN-PROD-2026-09':'',prontoParaVendas:state.activated
        }],total:1,contagem:{pendentes:state.activated?0:1,prontos:state.activated?1:0},termosVersaoAtual:'CT-FIN-PROD-2026-09',segredoExposto:false};
      }else if(method==='ctFinanceiroProdutorMasterProntidaoPROD'){
        state.validateCalls++;state.ref=String(args[2]||'');
        expect(String(args[1]||'')).toBe('PROD-E2E');
        expect(state.ref).toBe('CT_SECRET_ASAAS_PRODUCAO_PROD_E2E');
        resultado={sucesso:true,autorizado:true,produtorId:'PROD-E2E',organizacaoId:'ORG-E2E',statusAtual:'PENDENTE_CREDENCIAL',referenciaFormatoValido:true,segredoExiste:true,providerValidado:true,saldoDisponivel:1200,saldoFonte:'ASAAS',erroProvider:'',termosVersaoAtual:'CT-FIN-PROD-2026-09',podeAtivar:true,segredoExposto:false,movimentouDinheiro:false,chamouSomenteLeituraProvider:true};
      }else if(method==='ctFinanceiroProdutorMasterAtivarPROD'){
        state.activateCalls++;state.activateArgs=args;
        const d=args[2]||{};
        expect(d.credencialRef).toBe('CT_SECRET_ASAAS_PRODUCAO_PROD_E2E');
        expect(d.confirmacao).toBe('ATIVAR FINANCEIRO');
        expect(d.termosAceitos).toBe(true);
        expect(d.termosVersao).toBe('CT-FIN-PROD-2026-09');
        state.activated=true;
        resultado={sucesso:true,autorizado:true,produtorId:'PROD-E2E',configuracao:{statusOnboarding:'ATIVO',credencialConfigurada:true,recebimentoHabilitado:true,splitHabilitado:false},prontoParaVendas:true,providerValidado:true,segredoExposto:false,movimentouDinheiro:false,transferenciaCriada:false,splitHabilitado:false};
      }else{
        throw new Error('Método não previsto: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\/script></body></html>'});
  });
}

test.describe('Ativação financeira Master do Produtor',()=>{
  test.skip(!BRANCH_MODE,'Ativação financeira roda somente na branch local com backend simulado.');

  test('Master valida referencia opaca e ativa recebimento sem movimentacao financeira',async({page})=>{
    const state={activated:false,validateCalls:0,activateCalls:0,ref:'',activateArgs:null};
    await installMock(page,state);await seed(page,'CT-ADMIN-E2E');
    await page.goto('/backoffice/carioca-pay/produtores/?produtor=PROD-E2E',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Prontidão do produtor'})).toBeVisible();
    await expect(page.getByText('Produtor E2E').first()).toBeVisible();
    await expect(page.locator('#detail')).toContainText('PENDENTE_CREDENCIAL');
    await expect(page.locator('#detail')).toContainText('Vendas bloqueadas').catch(()=>{});

    await page.locator('#credentialRef').fill('CT_SECRET_ASAAS_PRODUCAO_PROD_E2E');
    await page.locator('#validateButton').click();
    await expect.poll(()=>state.validateCalls).toBe(1);
    await expect(page.locator('#readinessBox')).toContainText('Provider: validado');
    await expect(page.locator('#readinessBox')).toContainText('R$ 1.200,00');

    await page.locator('#confirmation').fill('ATIVAR FINANCEIRO');
    await page.locator('#acceptTerms').check();
    await expect(page.locator('#activateButton')).toBeEnabled();
    await page.locator('#activateButton').click();
    await expect.poll(()=>state.activateCalls).toBe(1);
    expect(state.activated).toBe(true);

    await expect(page.locator('#readyCount')).toHaveText('1');
    await expect(page.locator('#pendingCount')).toHaveText('0');
    await expect(page.getByText('Pronto para vendas').first()).toBeVisible();
  });

  test('referencia invalida ou provider nao validado nao habilita ativacao',async({page})=>{
    const state={activated:false,validateCalls:0,activateCalls:0,ref:'',activateArgs:null};
    await page.route('https://script.google.com/**',async route=>{
      const p=new URLSearchParams(route.request().postData()||'');
      const id=String(p.get('ctMinhaCariocaRequestId')||'');
      const method=String(p.get('metodo')||'');
      let resultado=null;
      if(method==='ctFinanceiroProdutorMasterListarPROD')resultado={sucesso:true,autorizado:true,itens:[{produtorId:'PROD-E2E',produtorNome:'Produtor E2E',provedorAmbiente:'PRODUCAO',statusOnboarding:'PENDENTE_CREDENCIAL',credencialConfigurada:false,recebimentoHabilitado:false,splitHabilitado:false,prontoParaVendas:false}],contagem:{pendentes:1,prontos:0}};
      else if(method==='ctFinanceiroProdutorMasterProntidaoPROD')resultado={sucesso:true,autorizado:true,segredoExiste:false,providerValidado:false,podeAtivar:false,segredoExposto:false,movimentouDinheiro:false,erroProvider:'CREDENCIAL_NAO_ENCONTRADA',termosVersaoAtual:'CT-FIN-PROD-2026-09'};
      else throw new Error('Método inesperado: '+method);
      await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,true,resultado,'')+', "*");<\/script></body></html>'});
    });
    await seed(page,'CT-ADMIN-E2E');await page.goto('/backoffice/carioca-pay/produtores/?produtor=PROD-E2E',{waitUntil:'domcontentloaded'});
    await page.locator('#credentialRef').fill('CT_SECRET_ASAAS_PRODUCAO_INEXISTENTE');
    await page.locator('#validateButton').click();
    await expect(page.locator('#readinessBox')).toContainText('não encontrado');
    await page.locator('#confirmation').fill('ATIVAR FINANCEIRO');
    await page.locator('#acceptTerms').check();
    await expect(page.locator('#activateButton')).toBeDisabled();
  });
});
