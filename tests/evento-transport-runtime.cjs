'use strict';
// Run: node --test tests/evento-transport-runtime.cjs
// CT_TEST_BROWSER=webkit exercises desktop WebKit with a mobile viewport, NOT an iPhone.
// CT_TEST_BASELINE=1 records the pre-fix behavior. Every request is fulfilled or aborted.
// Product HTML and scripts run verbatim; the public RPC is a fixture, never production.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pw = require('playwright');
const root = process.env.CT_TEST_SOURCE_ROOT || path.resolve(__dirname, '..');
const baseline = process.env.CT_TEST_BASELINE === '1';
const engine = process.env.CT_TEST_BROWSER || 'chromium';
const host = 'https://cariocaticket.com.br';
const errorText = 'Não foi possível carregar o evento agora. Tente novamente em alguns instantes.';
const fixture = id => ({sucesso:true, evento:{id,nome:'Evento de teste',data:'01/01/2030'},
  visual:{descricaoCurta:'Fixture isolada'},menorPreco:'R$ 10,00',
  tipos:[{nome:'Ingresso de teste',lotes:[{nome:'Lote de teste',precoNumero:10,preco:'R$ 10,00'}]}]});
let browser;
before(async () => {
  browser = await pw[engine].launch({headless:true,
    proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'}});
});
after(async () => { if(browser) await browser.close(); });

async function isolated(routeName, run, {analytics=false, submitThrows=false, event='EVT-TEST-A',pageOrigin=host,userAgent,embedded=false,i18n=false}={}) {
  // Windows WebKit fails before route interception with offline:true, even for
  // an empty fixture. Its unreachable proxy and deny-all routing still isolate it.
  const context = await browser.newContext({offline:engine!=='webkit',serviceWorkers:'block',acceptDownloads:false,
    viewport:{width:390,height:844},hasTouch:true,...(userAgent?{userAgent}:{})});
  const posts=[], errors=[], diagnostics=[], blocked=[];
  const bridgeReplies=new Map();
  const html=fs.readFileSync(path.join(root,routeName,'index.html'),'utf8');
  const app=html.match(/var APP='([^']+)'/)[1];
  const url=pageOrigin+'/'+routeName+'/?evento='+event+'&utm_source=ig&utm_content=link_in_bio';
  const topUrl=embedded?'https://embedded.example/wrapper-test':url;
  await context.route('**/*',async route=>{
    const request=route.request(), u=new URL(request.url());
    if(request.method()==='GET' && request.url()===url)
      return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
    if(embedded && request.method()==='GET' && request.url()===topUrl)
      return route.fulfill({contentType:'text/html',body:'<!doctype html><iframe src="'+url+'"></iframe>'});
    if(request.method()==='GET' && bridgeReplies.has(request.url()))
      return route.fulfill({contentType:'text/html; charset=utf-8',body:bridgeReplies.get(request.url())});
    if(i18n && request.method()==='GET' && u.origin===pageOrigin && ['/assets/public-i18n.js','/assets/event-i18n.js'].includes(u.pathname))
      return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,u.pathname),'utf8')});
    if(request.method()==='GET' && u.origin===host && u.pathname==='/blank-test')
      return route.fulfill({contentType:'text/html',body:'<title>Local navigation fixture</title>'});
    if(analytics && request.method()==='GET' && u.pathname==='/assets/ct-analytics.js')
      return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'assets/ct-analytics.js'),'utf8')});
    if(request.method()==='POST' && request.url()===app){
      const data=new URLSearchParams(request.postData()||'');
      if(data.get('metodo')==='ctEventoPublicoCarregarPROD' && data.get('argsJson')===JSON.stringify([event])) {
        posts.push({id:data.get('ctMinhaCariocaRequestId'),route});return;
      }
    }
    blocked.push({method:request.method(),host:u.hostname,topNavigation:request.isNavigationRequest() && !request.frame().parentFrame()});
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage();
  if(submitThrows) await page.addInitScript(()=>{
    HTMLFormElement.prototype.submit=function(){throw new Error('Synthetic submit failure');};
  });
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',async message=>{
    if(message.text().startsWith('[CT_EVENT_LOAD]'))
      diagnostics.push(await message.args()[1].jsonValue());
  });
  // Only the clock is simulated; no product functions/branches are substituted.
  const epoch=new Date('2030-01-01T00:00:00Z');
  await page.clock.install({time:epoch});
  await page.clock.pauseAt(new Date(epoch.getTime()+60000));
  const waitPosts=async n=>{
    const until=Date.now()+6000;
    while(posts.length<n && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(posts.length,n,'one transport submission per explicit load');
  };
  const reply=async (index=0, {ok=true,resultado=fixture(event),erro='',origin='https://script.google.com'}={})=>{
    const p=posts[index];
    const payload={ctMinhaCariocaPost:true,id:p.id,ok,resultado,erro};
    if(origin!=='https://script.google.com') {
      // Deliberately synthetic invalid origin; successful transport tests below
      // use an actual cross-origin iframe and the browser's real MessageEvent.
      await page.evaluate(({payload,origin})=>window.dispatchEvent(new MessageEvent('message',{data:payload,origin})),{payload,origin});
      return;
    }
    await p.route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><script>top.postMessage('+JSON.stringify(payload)+','+JSON.stringify(pageOrigin)+')</script>'});
  };
  const bridgeReply=async (index=0,{send=true,targets=[host,'https://www.cariocaticket.com.br']}={})=>{
    const p=posts[index],bridgeUrl='https://fixture-script.googleusercontent.com/userCodeAppPanel?request='+index;
    const payload={ctMinhaCariocaPost:true,id:p.id,ok:true,resultado:fixture(event),erro:''};
    // Model Apps Script's nested iframe and exact apex/www target list. No
    // Google script, credential, cookie or live request is used in this fixture.
    bridgeReplies.set(bridgeUrl,'<!doctype html><title>Synthetic bridge</title><script>'+(send?
      targets.map(target=>'try{top.postMessage('+JSON.stringify(payload)+','+JSON.stringify(target)+')}catch(_){}').join(';'):'')+'</script>');
    await p.route.fulfill({contentType:'text/html',body:'<!doctype html><iframe src="'+bridgeUrl+'"></iframe>'});
    await page.waitForLoadState('load');
  };
  const late=async index=>page.evaluate(payload=>window.dispatchEvent(new MessageEvent('message',{
    origin:'https://script.google.com',data:payload})),{ctMinhaCariocaPost:true,id:posts[index].id,ok:true,resultado:fixture(event)});
  const timeout=async ()=>{await page.clock.runFor(45000);await page.locator('#errorBox').waitFor({state:'visible'});};
  try {
    await page.goto(topUrl,{waitUntil:'domcontentloaded'});if(!submitThrows)await waitPosts(1);
    const view=embedded?page.frame({url}):page;
    await run({page,view,posts,reply,bridgeReply,late,timeout,waitPosts,diagnostics,errors,blocked,event,url});
    assert.deepEqual(errors,[],'no unhandled product errors');
    assert.equal(fs.readFileSync(path.join(root,routeName,'index.html'),'utf8'),html);
  } finally {await context.close();}
}

for (const route of ['evento','evento-v2']) {
  if(!baseline) {
  test(`${engine} ${route}: support reference is localized without changing its code`,()=>isolated(route,async ({page,timeout})=>{
    await timeout();
    for(const [locale,label] of [['en-US','Support reference'],['es','Referencia de soporte'],['zh-Hans','支持参考代码'],['pt-BR','Referência para suporte']]) {
      await page.locator('#event-language').selectOption(locale);
      assert.equal(await page.locator('#errorReference span').textContent(),label);
      assert.equal(await page.locator('#errorReferenceCode').textContent(),'E01');
    }
  },{i18n:true}));

  for(const pageOrigin of [host,'https://www.cariocaticket.com.br'])
    test(`${engine} ${route}: nested Google bridge reaches ${new URL(pageOrigin).hostname}`,()=>isolated(route,async ({page,bridgeReply,posts,diagnostics})=>{
      await bridgeReply();await page.locator('#app').waitFor({state:'visible'});
      assert.equal(posts.length,1);assert.equal(diagnostics.length,0);
      assert.equal(await page.locator('#errorBox').isVisible(),false);
      assert.equal(await page.locator('iframe,form').count(),0);
    },{pageOrigin}));

  test(`${engine} ${route}: successful iframe HTTP without an envelope still times out`,()=>isolated(route,async ({page,bridgeReply,timeout,diagnostics})=>{
    await bridgeReply(0,{send:false});
    assert.equal(await page.locator('#app').isVisible(),false);
    await timeout();assert.equal(diagnostics[0].code,'CT_PUBLIC_RPC_TIMEOUT');
    assert.equal(diagnostics[0].elapsedMs,45000);
    assert.equal(await page.getByRole('button',{name:'Tentar novamente',exact:true}).isVisible(),true);
  }));

  test(`${engine} ${route}: wrong postMessage target cannot deliver the event`,()=>isolated(route,async ({page,bridgeReply,timeout,diagnostics})=>{
    await bridgeReply(0,{targets:['https://unrelated.example']});
    assert.equal(await page.locator('#app').isVisible(),false);
    await timeout();assert.equal(diagnostics[0].code,'CT_PUBLIC_RPC_TIMEOUT');
  }));

  test(`${engine} ${route}: a foreign top-level iframe reproduces target mismatch only`,()=>isolated(route,async ({page,view,bridgeReply,diagnostics,posts})=>{
    await bridgeReply();await page.clock.runFor(45000);
    await view.locator('#errorBox').waitFor({state:'visible'});
    assert.equal(await view.locator('#app').isVisible(),false);
    assert.equal(diagnostics[0].code,'CT_PUBLIC_RPC_TIMEOUT');assert.equal(posts.length,1);
    // This is an embedding limitation, not proof about Instagram's top-level WebView.
  },{embedded:true}));

  test(`${engine} ${route}: a mobile in-app user-agent alone does not break delivery`,()=>isolated(route,async ({page,bridgeReply,diagnostics})=>{
    await bridgeReply();await page.locator('#app').waitFor({state:'visible'});
    assert.equal(diagnostics.length,0);
    // Deliberately synthetic UA; no claim to emulate iOS cookies, network or lifecycle.
  },{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram synthetic-test'}));

  test(`${engine} ${route}: unknown request ID is ignored before current reply`,()=>isolated(route,async ({page,reply,posts})=>{
    await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://script.google.com',data:{ctMinhaCariocaPost:true,id:'CTPUBLIC-UNKNOWN',ok:true,resultado:{sucesso:true}}})));
    assert.equal(await page.locator('#app').isVisible(),false);
    assert.equal(posts.length,1);await reply();await page.locator('#app').waitFor({state:'visible'});
  }));
  }

  test(`${engine} ${route}: slow success before deadline and same-event checkout`,()=>isolated(route,async ({page,reply})=>{
    await page.clock.runFor(44000);
    assert.equal(await page.locator('#loading').isVisible(),true);
    await reply();await page.locator('#app').waitFor({state:'visible'});
    const target=await page.locator('#buyHero').getAttribute('href');
    assert.equal(new URL(target,host).searchParams.get('evento'),'EVT-TEST-B');
    assert.equal(new URL(target,host).pathname,route==='evento'?'/checkout/':'/checkout-v2/');
    await page.locator('#buyHero').click({trial:true});
    await page.clock.runFor(90000);
    assert.equal(await page.locator('#errorBox').isVisible(),false);
    assert.equal(await page.locator('iframe,form').count(),0);
  },{event:'EVT-TEST-B'}));

  test(`${engine} ${route}: no response, late response and explicit retry`,()=>isolated(route,async ({page,posts,reply,late,timeout,waitPosts,diagnostics,url})=>{
    await timeout();assert.equal(await page.locator('#errorText').textContent(),errorText);
    if(!baseline) {
      assert.equal(await page.locator('#errorReference').isVisible(),true);
      assert.equal(await page.locator('#errorReferenceCode').textContent(),'E01');
    }
    if(process.env.CT_TEST_EVIDENCE){
      fs.mkdirSync(process.env.CT_TEST_EVIDENCE,{recursive:true});
      await page.screenshot({path:path.join(process.env.CT_TEST_EVIDENCE,`${engine}-${route}-timeout.png`)});
    }
    assert.equal(await page.locator('iframe,form').count(),0);
    await late(0);assert.equal(await page.locator('#app').isVisible(),false);
    assert.equal(posts.length,1);
    if(baseline){assert.equal(await page.getByRole('button',{name:'Tentar novamente'}).count(),0);return;}
    await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await waitPosts(2);
    assert.equal(await page.locator('#errorReferenceCode').textContent(),'','new attempt clears stale support reference');
    await page.evaluate(()=>{document.getElementById('retryEventLoad').click();document.getElementById('retryEventLoad').click();});
    assert.equal(posts.length,2,'repeated clicks cannot duplicate the in-flight read');
    assert.notEqual(posts[0].id,posts[1].id);
    await late(0);assert.equal(await page.locator('#app').isVisible(),false);
    await reply(1);await page.locator('#app').waitFor({state:'visible'});
    assert.equal(await page.locator('#errorBox').isVisible(),false);
    assert.equal(page.url(),url,'query context preserved');
    assert.equal(diagnostics[0].code,'CT_PUBLIC_RPC_TIMEOUT');
    assert.equal(diagnostics[0].elapsedMs,45000);
    assert.deepEqual(Object.keys(diagnostics[0]).sort(),['code','elapsedMs','online','visibility'].sort());
  }));

  test(`${engine} ${route}: remote envelope error is distinct and sanitized`,()=>isolated(route,async ({page,reply,diagnostics})=>{
    await reply(0,{ok:false,resultado:null,erro:'example@example.test PRIVATE_TOKEN_EXAMPLE'});
    await page.locator('#errorBox').waitFor({state:'visible'});
    assert.equal(await page.locator('#errorText').textContent(),errorText);
    if(!baseline) {
      assert.equal(diagnostics[0].code,'CT_PUBLIC_RPC_REMOTE_ERROR');
      assert.doesNotMatch(JSON.stringify(diagnostics),/example|PRIVATE_TOKEN/);
      assert.equal(await page.locator('#errorReferenceCode').textContent(),'E02');
      assert.doesNotMatch(await page.locator('#errorBox').textContent(),/example|PRIVATE_TOKEN/);
      assert.equal(await page.getByRole('button',{name:'Tentar novamente',exact:true}).isVisible(),true);
    }
  }));

  test(`${engine} ${route}: rejected origin cannot render; valid response can`,()=>isolated(route,async ({page,reply})=>{
    await reply(0,{origin:'https://untrusted.example'});
    assert.equal(await page.locator('#app').isVisible(),false);
    assert.equal(await page.locator('iframe').count(),1);
    await reply();await page.locator('#app').waitFor({state:'visible'});
  }));

  test(`${engine} ${route}: gate rejection never offers transport retry`,()=>isolated(route,async ({page,reply})=>{
    await reply(0,{resultado:{sucesso:false,codigo:'EVENTO_PRIVADO_CONVITE',mensagem:'Acesse pelo convite individual.'}});
    await page.locator('#errorBox').waitFor({state:'visible'});
    assert.equal(await page.locator('#errorText').textContent(),'Acesse pelo convite individual.');
    assert.equal(await page.getByRole('button',{name:'Tentar novamente',exact:true}).isVisible(),false);
    if(!baseline) {
      assert.equal(await page.locator('#errorReference').isVisible(),false);
      assert.equal(await page.locator('#errorReferenceCode').textContent(),'');
    }
  }));

  test(`${engine} ${route}: network/foreground events do not create duplicate RPCs`,()=>isolated(route,async ({page,posts,timeout})=>{
    await page.clock.runFor(38000);
    await page.evaluate(()=>{
      window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    });
    assert.equal(posts.length,1);
    await page.clock.runFor(7000);await page.locator('#errorBox').waitFor({state:'visible'});
    await page.evaluate(()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(posts.length,1,'no automatic retry after a transient network/lifecycle signal');
  }));

  test(`${engine} ${route}: interrupted navigation starts a fresh request`,()=>isolated(route,async ({page,posts,reply,late,waitPosts,url})=>{
    await page.clock.runFor(1000);
    await page.goto(host+'/blank-test');
    await page.goBack({waitUntil:'domcontentloaded'});await waitPosts(2);
    assert.notEqual(posts[0].id,posts[1].id);
    await late(0);assert.equal(await page.locator('#app').isVisible(),false);
    await reply(1);await page.locator('#app').waitFor({state:'visible'});
    assert.equal(page.url(),url);
  }));

  test(`${engine} ${route}: delayed timers conclude once`,()=>isolated(route,async ({page,posts})=>{
    await page.clock.fastForward(87000);
    assert.equal(await page.locator('#errorBox').isVisible(),true);
    assert.equal(await page.locator('iframe,form').count(),0);
    assert.equal(posts.length,1);
  }));

  test(`${engine} ${route}: analytics cannot replace a recovery page with Apps Script`,()=>isolated(route,async ({page,timeout,blocked,url})=>{
    await timeout();await page.waitForLoadState('load');await page.clock.runFor(2000);
    // Allow the navigation request caused by location.replace to reach interception.
    await new Promise(resolve=>setTimeout(resolve,100));
    const redirects=blocked.filter(r=>r.topNavigation && r.host==='script.google.com');
    assert.equal(redirects.length,baseline?1:0);
    if(!baseline)assert.equal(page.url(),url);
  },{analytics:true}));

  if(!baseline)test(`${engine} ${route}: synchronous submit failure cleans up and offers recovery`,()=>isolated(route,async ({page,posts,diagnostics})=>{
    await page.locator('#errorBox').waitFor({state:'visible'});
    assert.equal(posts.length,0);assert.equal(await page.locator('iframe,form').count(),0);
    assert.equal(diagnostics[0].code,'CT_PUBLIC_RPC_SUBMIT_ERROR');
    assert.equal(await page.locator('#errorReferenceCode').textContent(),'E03');
    assert.equal(await page.getByRole('button',{name:'Tentar novamente',exact:true}).isVisible(),true);
  },{submitThrows:true}));
}
