import {test,expect} from '@playwright/test';

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

async function seed(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(({key})=>{
    const value=JSON.stringify({token:'CT-POLICY-E2E',expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(key,value);localStorage.setItem(key,value);
  },{key:STORAGE});
}

function envelope(id,ok,resultado,erro=''){
  return JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?resultado:null,erro:ok?'':erro}).replace(/</g,'\\u003c');
}

async function mock(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    let result=null,ok=true,erro='';
    try{
      if(method==='ctPoliticaComercialMasterListarPROD'){
        result={sucesso:true,autorizado:true,politicas:[
          {politicaId:'POL-1',escopo:'EVENTO',produtorId:'PROD-E2E',eventoId:'EVT-E2E',taxaCtPercentual:7,pagadorTaxa:'PRODUTOR',compradorPercentualTaxa:0,produtorPercentualTaxa:100,chaveResolucao:'EVENTO|PROD-E2E|EVT-E2E',versaoPolitica:2,status:'ATIVA',motivoComercial:'Contrato vigente',beneficiarios:[]}
        ],movimentouDinheiro:false};
      }else if(method==='ctPoliticaComercialMasterSalvarPROD'){
        state.saved=args[1];
        result={sucesso:true,politicaId:'POL-NEW',versaoPolitica:3,movimentouDinheiro:false};
      }else if(method==='ctPoliticaComercialMasterDesativarPROD'){
        state.deactivated={politicaId:String(args[1]||''),motivo:String(args[2]||'')};
        result={sucesso:true,politicaId:state.deactivated.politicaId,status:'INATIVA',movimentouDinheiro:false};
      }else if(method==='ctPoliticaComercialSimularPROD'){
        state.simulated=args[1];
        result={sucesso:true,ator:'MASTER',movimentouDinheiro:false,calculo:{subtotalIngressos:100,taxaCtTotal:10,taxaComprador:4,taxaProdutor:6,comissoesProdutor:2,totalComprador:104,deducoesProdutor:8,liquidoComercialProdutor:92}};
      }else if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        result={sucesso:true,autenticado:true,autorizado:true,produtores:[{id:'PROD-E2E',nomeFantasia:'Produtor E2E',eventos:[{id:'EVT-E2E',nome:'Evento E2E'}]}]};
      }else if(method==='ctPoliticaComercialProdutorResumoPROD'){
        result={sucesso:true,autorizado:true,movimentouDinheiro:false,politica:{politicaId:'POL-1',escopo:'EVENTO',origem:'POLITICA_NEGOCIADA',taxaCtPercentual:7,pagadorTaxa:'PRODUTOR',compradorPercentualTaxa:0,produtorPercentualTaxa:100,beneficiarios:[{perfilTipo:'PROMOTOR',beneficiarioNome:'Promotor E2E',tipoCalculo:'PERCENTUAL_INGRESSOS',valorRegra:2,fonteCusteio:'PRODUTOR'}]}};
      }else{
        throw new Error('Metodo nao previsto: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,result,erro)+', "*");<\/script></body></html>'});
  });
}

test.describe('Politica comercial flexivel',()=>{
  test.skip(!BRANCH_MODE,'Politica comercial mutavel roda somente na branch local com backend simulado.');

  test('Master configura pagador, beneficiario e simula sem cobranca',async({page})=>{
    const state={saved:null,simulated:null,deactivated:null};await mock(page,state);await seed(page);
    await page.goto('/backoffice/politicas-comerciais/',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Taxa, pagador e remunerações'})).toBeVisible();
    await expect(page.locator('#list')).toContainText('EVENTO · 7%');
    await page.locator('.loadPolicy').first().click();
    await expect(page.locator('#producerId')).toHaveValue('PROD-E2E');
    await expect(page.locator('#fee')).toHaveValue('7');

    await page.locator('#scope').selectOption('EVENTO');
    await page.locator('#producerId').fill('PROD-E2E');
    await page.locator('#eventId').fill('EVT-E2E');
    await page.locator('#fee').fill('10');
    await page.locator('#payer').selectOption('DIVIDIDA');
    await expect(page.locator('#buyerShareField')).toBeVisible();
    await page.locator('#buyerShare').fill('40');
    await page.locator('#reason').fill('Contrato E2E');
    await page.locator('#addBenefit').click();
    await page.locator('.bProfile').selectOption('PROMOTOR');
    await page.locator('.bName').fill('Promotor E2E');
    await page.locator('.bValue').fill('2');
    await page.locator('.bSource').selectOption('PRODUTOR');

    await page.locator('#simulate').click();
    await expect.poll(()=>state.simulated&&state.simulated.pagadorTaxa).toBe('DIVIDIDA');
    await expect(page.locator('#simulation')).toContainText('R$ 104,00');

    await page.locator('#save').click();
    await expect.poll(()=>state.saved&&state.saved.taxaCtPercentual).toBe(10);
    expect(state.saved.compradorPercentualTaxa).toBe(40);
    expect(state.saved.beneficiarios[0].perfilTipo).toBe('PROMOTOR');

    await page.locator('.deactivatePolicy').first().click();
    await expect.poll(()=>state.deactivated&&state.deactivated.politicaId).toBe('POL-1');
    expect(state.deactivated.motivo).toBe('Contrato E2E');
  });

  test('Produtor ve somente a regra vigente e simula',async({page})=>{
    const state={saved:null,simulated:null,deactivated:null};await mock(page,state);await seed(page);
    await page.goto('/produtor/politica-comercial/',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Sua política comercial'})).toBeVisible();
    await expect(page.locator('#metrics')).toContainText('7%');
    await expect(page.locator('#metrics')).toContainText('PRODUTOR');
    await expect(page.locator('#commissions')).toContainText('Promotor E2E');
    await page.locator('#simulate').click();
    await expect.poll(()=>state.simulated&&state.simulated.produtorId).toBe('PROD-E2E');
    await expect(page.locator('#simulation')).toContainText('R$ 92,00');
  });
});
