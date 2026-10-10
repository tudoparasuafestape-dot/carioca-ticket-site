'use strict';
// Loads actual repository HTML/JS/CSS with all traffic intercepted. No production RPC.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const origin='http://127.0.0.1:4191';
const pages=['ajuda','sobre','termos','privacidade','cancelamento-reembolso'];
const legal=new Set(['termos','privacidade','cancelamento-reembolso']);
const screenshots=path.join(root,'test-results/public-language');
const sourceText=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/institutional-source-text.json'),'utf8'));
const normalize=s=>s.replace(/\s+/g,' ').trim();
const catalog=[{id:'FIXTURE-LANGUAGE-1',nome:'Evento original',data:'10/10/2026',horario:'18:00',local:'Local original',cidade:'Recife',uf:'PE',visual:{categoria:'Beleza',descricaoCurta:'Descrição original em português.'},links:{evento:'/evento/?evento=FIXTURE-LANGUAGE-1',comprar:'/checkout/?evento=FIXTURE-LANGUAGE-1'}}];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CT_CHROMIUM_EXECUTABLE?{executablePath:process.env.CT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({serviceWorkers:'block'});const unexpected=[],errors=[];let rpc=0;
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin==='https://script.google.com'&&req.method()==='POST'){
   const p=new URLSearchParams(req.postData()||'');
   if(p.get('metodo')==='ctEventosPublicosListarPROD'&&p.get('argsJson')==='[]'&&p.get('ctMinhaCariocaAction')==='publicRpc'){
    rpc++;const payload={ctMinhaCariocaPost:true,id:p.get('ctMinhaCariocaRequestId'),ok:true,resultado:{sucesso:true,eventos:catalog}};
    return route.fulfill({contentType:'text/html; charset=utf-8',body:'<script>parent.postMessage('+JSON.stringify(payload)+',"*")</script>'});
   }
  }
  if(u.origin==='https://fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:'/* offline font fallback */'});
  if(u.origin===origin&&req.method()==='GET'){
   if(u.pathname==='/pwa-register.js'||u.pathname==='/assets/ct-analytics.js')return route.fulfill({contentType:'text/javascript',body:'/* analytics/PWA disabled in isolated test */'});
   const file=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));
   if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){
    const type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':'image/png';
    return route.fulfill({contentType:type,body:fs.readFileSync(file)});
   }
  }
  unexpected.push(req.method()+' '+req.url());return route.abort();
 });
 try{
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  fs.mkdirSync(screenshots,{recursive:true});
  let cases=0;
  for(const width of [320,1440]){
   await page.setViewportSize({width,height:1000});
   for(const locale of ['pt-BR','en-US','es','zh-Hans']){
    await page.goto(origin);await page.waitForFunction(()=>window.CTHome&&window.CTPublicI18n);
    // Exercise the same API called by the visible home selector; institutional
    // selectors below are operated through their real accessible controls.
    await page.evaluate(l=>CTHome.setLocale(l),locale);
    await page.waitForFunction(()=>document.querySelectorAll('.catalog-card').length>0);
    assert.equal(await page.evaluate(()=>CTHome.locale),locale);
    assert.equal(await page.evaluate(()=>CTPublicI18n.getLocale()),locale);
    // Consolidated main features must survive the shared-language bridge.
    assert.equal(await page.locator('html').getAttribute('data-home-theme'),'dark');
    assert.equal(await page.locator('.producer-section a[href="/como-funciona/"]').count(),1);
    const learn=page.locator('a[data-i18n="adLearnMore"][href="/anuncie/"]');
    assert.ok(await learn.count()>0);assert.equal(await learn.first().textContent(),await page.evaluate(()=>CTHome.t('adLearnMore')));
    const geoLabels={'pt-BR':'Usar minha localização','en-US':'Use my location',es:'Usar mi ubicación','zh-Hans':'使用我的位置'};
    assert.equal(await page.locator('#location-use-device').textContent(),geoLabels[locale]);
    const shared=await page.locator('.catalog-card').first().evaluate(e=>({date:e.dataset.shareDate,venue:e.dataset.shareVenue}));
    assert.equal(shared.date,'10/10/2026 · 18:00');assert.equal(shared.venue,'Local original · Recife · PE');

    const originalCard=await page.locator('.catalog-description').first().evaluate(e=>({text:e.textContent,lang:e.lang}));
    assert.equal(originalCard.text,catalog[0].visual.descricaoCurta);assert.equal(originalCard.lang,'pt-BR');
    assert.equal(await page.locator('footer a[href="/anuncie/"]').count(),1);
    const wa=await page.locator('#advertising-contact').getAttribute('href');assert.ok(wa.startsWith('https://wa.me/5581999311509'));
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(screenshots,'home-'+width+'-'+locale+'.png'),fullPage:true});
    await page.locator('footer a[href="/ajuda/"]').first().click();await page.waitForURL(origin+'/ajuda/');
    assert.equal(await page.locator('#public-language').inputValue(),locale);
    for(const name of pages){
     await page.goto(origin+'/'+name+'/');await page.waitForFunction(()=>!!window.CTInstitutionalTranslations);
     assert.equal(await page.locator('#public-language').inputValue(),locale);
     assert.equal(await page.locator('html').getAttribute('lang'),locale);
     const labels=await page.locator('[data-public-i18n]').evaluateAll(nodes=>nodes.map(n=>({key:n.dataset.publicI18n,text:n.textContent,lang:n.lang,expected:CTPublicI18n.message(n.dataset.publicI18n).text})));
     for(const label of labels){assert.equal(label.text,label.expected,name+' '+label.key);assert.equal(label.lang,locale);}
     assert.equal(await page.locator('#public-language').evaluate(e=>e.labels.length),1);
     const options=await page.locator('#public-language option').evaluateAll(nodes=>nodes.map(n=>n.value));assert.deepEqual(options,['pt-BR','en-US','es','zh-Hans']);
     const home=page.locator('.footer-home-logo');assert.equal(await home.getAttribute('href'),'/');
     const image=await home.locator('img').getAttribute('src');assert.equal(image,'/assets/carioca-ticket-logo.png');
     await home.focus();assert.notEqual(await home.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
     assert.ok(await page.locator('link[href="/assets/public-logo-links.css?v=20261010-public-logo"]').count());
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' horizontal overflow '+width+' '+locale);
     if(legal.has(name)){
      const original=page.locator('#legal-original');const notice=page.locator('#legal-translation-notice');
      assert.equal(await original.isVisible(),locale!=='pt-BR');assert.equal(await notice.isVisible(),locale!=='pt-BR');
      if(locale!=='pt-BR'){
       await original.locator('summary').click();assert.equal(await original.getAttribute('open'),'');
       assert.equal(await original.locator('.ct-legal-original-content').getAttribute('lang'),'pt-BR');
       // Compare exact meaningful PT source text nodes to the approved source set.
       const textNodes=await original.locator('.ct-legal-original-content').evaluate(e=>{const out=[],w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);while(w.nextNode()){const t=w.currentNode.textContent.trim();if(t)out.push(t);}return out;});
       for(const text of textNodes)assert.ok(sourceText.includes(text),'Unexpected changed legal original: '+text);
      }
     }
     await page.evaluate(()=>{scrollTo(0,0);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
     await page.screenshot({path:path.join(screenshots,name+'-'+width+'-'+locale+'.png'),fullPage:true});
     await page.reload();assert.equal(await page.locator('#public-language').inputValue(),locale);
     cases++;
    }
    await page.goto(origin+'/sobre/');await page.locator('#public-language').selectOption(locale==='es'?'en-US':'es');
    const selected=await page.locator('#public-language').inputValue();await page.locator('.footer-home-logo').click();await page.waitForURL(origin+'/');
    assert.equal(await page.evaluate(()=>CTHome.locale),selected);await page.goBack();assert.equal(await page.locator('#public-language').inputValue(),selected);
   }
  }
  // Native storage events on real home and institutional documents.
  await page.goto(origin);const tab=await context.newPage();await tab.goto(origin+'/termos/');await tab.locator('#public-language').selectOption('zh-Hans');
  await page.waitForFunction(()=>CTHome.locale==='zh-Hans');
  await page.evaluate(()=>CTHome.setLocale('en-US'));await tab.waitForFunction(()=>CTPublicI18n.getLocale()==='en-US'&&document.querySelector('#public-language').value==='en-US');
  // Browser Back/reload above are real navigation; this additionally covers the
  // specific persisted-pageshow branch without claiming actual BFCache use.
  await page.evaluate(()=>{localStorage.setItem('ct-home-locale','es');dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});assert.equal(await page.evaluate(()=>CTHome.locale),'es');
  // Blocked browser storage remains usable on an actual institutional page.
  const isolated=await context.newPage();await isolated.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});await isolated.goto(origin+'/ajuda/');await isolated.locator('#public-language').selectOption('zh-Hans');assert.equal(await isolated.locator('html').getAttribute('lang'),'zh-Hans');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.ok(rpc>0);
  console.log(JSON.stringify({passed:true,actualPageCases:cases,widths:[320,1440],locales:['pt-BR','en-US','es','zh-Hans'],interceptedCatalogCalls:rpc,unexpectedRequests:unexpected,legalOriginalsPreserved:true,screenshots:'test-results/public-language'}));
 }catch(error){const active=context.pages()[0];if(active)await active.screenshot({path:path.join(screenshots,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

