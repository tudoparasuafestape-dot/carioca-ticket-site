// Real portal HTML and RPC bridge; every browser request is fulfilled/aborted locally.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.CT_PLAYWRIGHT_MODULE||'@playwright/test');
const base=new URL(process.env.CT_BASE_URL||'about:blank');
if(base.protocol!=='http:'||!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Set CT_BASE_URL explicitly to local HTTP');
const root=path.resolve(__dirname,'..'),rpcOrigin='https://ct-rpc.example.invalid';
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
const source=fs.readFileSync(path.join(root,'parceiro/index.html'),'utf8');
const html=source.replace(/https:\/\/script.google.com\/macros\/s\/[^']+\/exec/g,rpcOrigin+'/rpc')
  .replace("ev.origin!=='https://script.google.com'",`ev.origin!=='${rpcOrigin}'`);
const app=`export const getApps=()=>[];export const initializeApp=()=>({});`;
const auth=`export const getAuth=()=>({});export const setPersistence=async()=>{};export const browserSessionPersistence={};
export const signInWithEmailAndPassword=async()=>{throw Error('LOGIN_UNEXPECTED')};export const getIdToken=async()=>{throw Error('TOKEN_UNEXPECTED')};export const signOut=async()=>{};`;
const scenarios=[
  {name:'old backend',cap:undefined,nominal:false},
  {name:'new backend missing schema',cap:{baseVersao:'INGRESSOS_NOMINAIS_V1',nominalPersistido:false},nominal:false},
  {name:'unknown capability version',cap:{baseVersao:'UNKNOWN',nominalPersistido:true},nominal:false},
  {name:'new backend schema ready',cap:{baseVersao:'INGRESSOS_NOMINAIS_V1',nominalPersistido:true},nominal:true},
  {name:'paid refund review',cap:{baseVersao:'INGRESSOS_NOMINAIS_V1',nominalPersistido:true},nominal:true,review:true}
];
(async()=>{
  const browser=await chromium.launch({headless:true});let passed=0;
  try{for(const mobile of [false,true])for(const scenario of scenarios){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:768},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    try{
      const blocked=[],calls=[],errors=[];
      await context.addInitScript(()=>{
        sessionStorage.setItem('CT_PARCEIRO_CT_SESSION_V1',JSON.stringify({token:'SYNTHETIC-SESSION'}));
        localStorage.setItem('CT_PARCEIRO_FIREBASE_CONFIG_V1',JSON.stringify({apiKey:'SYNTHETIC',projectId:'offline'}));
      });
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin===base.origin&&url.pathname==='/parceiro/')return route.fulfill({contentType:'text/html',body:html});
        if(url.hostname==='www.gstatic.com'&&url.pathname.endsWith('firebase-app.js'))return route.fulfill({contentType:'text/javascript',body:app});
        if(url.hostname==='www.gstatic.com'&&url.pathname.endsWith('firebase-auth.js'))return route.fulfill({contentType:'text/javascript',body:auth});
        if(url.hostname==='cariocaticket.com.br'&&['/assets/carioca-ticket-logo.png','/assets/carioca-ticket-simbolo.png'].includes(url.pathname))
          return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,url.pathname.slice(1)))});
        if(url.origin===rpcOrigin){
          const params=new URLSearchParams(route.request().postData()||'');calls.push(params.get('metodo'));
          assert.equal(params.get('metodo'),'ctParceiroCTRestaurarSessaoPROD');
          assert.deepEqual(JSON.parse(params.get('argsJson')),['SYNTHETIC-SESSION']);
          const partner={nome:'Parceiro fictício',codigoIndicacao:'SINTETICO-A',linkIndicacao:base.origin+'/produtor/?ref=SINTETICO-A',percentualBase:1};
          const panel={parceiro:partner,usuario:{nome:'Parceiro fictício'},resumo:{comissaoPagaNumero:scenario.review?2:0,comissaoPagaEmAnaliseNumero:scenario.review?2:0,totalValidoNumero:scenario.review?0:2},
            capacidadesComissao:scenario.cap,produtores:[],lancamentosRecentes:scenario.review?[{status:'PAGA',reversaoStatus:'PENDENTE_ANALISE',comissaoNumero:2,baseNumero:200,percentual:1}]:[]};
          if(scenario.cap)panel.politicaRepasse={diasUteisAposEvento:3,pagamentoAutomatico:false,dataElegibilidade:null};
          const payload=JSON.stringify({ctMinhaCariocaPost:true,id:params.get('ctMinhaCariocaRequestId'),ok:true,resultado:{autenticado:true,autorizado:true,parceiro:partner,painel:panel}}).replace(/</g,'\\u003c');
          return route.fulfill({contentType:'text/html; charset=utf-8',body:`<script>top.postMessage(${payload},'*')</script>`});
        }
        if(!url.pathname.endsWith('.ico'))blocked.push(url.href);return route.abort();
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base.origin+'/parceiro/');await page.locator('#portalView').waitFor({state:'visible'});
      const rate=await page.locator('#metricRate').innerText();
      assert.equal(rate.includes('% do nominal, sem taxas ou juros'),scenario.nominal);
      if(!scenario.nominal)assert.match(rate,/base registrada/);
      assert.match(await page.locator('#repassePolicy').innerText(),/não há pagamento automático/);
      if(scenario.review){
        assert.match(await page.locator('#commissionTable').innerText(),/PAGA[\s\S]*comissão paga em análise/);
        assert.match(await page.locator('#metricPaid').innerText(),/2,00/);
        assert.match(await page.locator('#paidReviewNote').innerText(),/2,00 com venda revertida em análise/);
        assert.match(await page.locator('#validCommissionBadge').innerText(),/0,00 válido/);
        if(mobile)await page.screenshot({path:path.join(root,'test-results/partner-panel-mobile.png'),fullPage:true});
      }
      assert.deepEqual(calls,['ctParceiroCTRestaurarSessaoPROD']);assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
      passed++;console.log('PASS '+(mobile?'mobile ':'desktop ')+scenario.name);
    }finally{await context.close();}
  }}finally{await browser.close();}
  console.log(`PARTNER_PANEL_OFFLINE: ${passed} passed; no real RPC/Firebase traffic`);
})().catch(e=>{console.error(e);process.exitCode=1;});
