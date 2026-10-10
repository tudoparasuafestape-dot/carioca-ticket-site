// Independent fixture, no application RPC, production page, checkout or credentials.
const {chromium}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const live=process.env.CT_MAP_LIVE==='1';
const out=path.join(root,'test-results',live?'map-live':'map-isolated');fs.mkdirSync(out,{recursive:true});
const destination=live?'Vevets Recepções, Rua Arenópolis, 82, Candeias, Jaboatão dos Guararapes, Pernambuco, Brasil':'Local de teste, Rua Exemplo, 123, Recife, PE, Brasil';
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mapa: teste isolado</title><link rel="stylesheet" href="/assets/event-map-preview.css"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font:16px system-ui}main{max-width:920px;margin:auto}.spacer{height:1800px}body.dark{background:#15171b;color:#f6f6f6;--event-surface:#20242a;--event-text:#f6f6f6;--event-border:#838b96}button,a{min-height:44px;display:inline-flex;align-items:center;margin:8px;padding:8px;color:inherit}#destination{overflow-wrap:anywhere}</style><body class="ct-event"><main><h1>Teste de mapa</h1><div class="spacer"></div><section><h2>Como chegar</h2><p id="destination"></p><a id="maps" href="#">Abrir no Google Maps</a><button id="copy">Copiar endereço</button><div id="map" hidden></div></section></main><script src="/assets/event-map-preview.js"></script><script>const destination=${JSON.stringify(destination)};document.getElementById('destination').textContent=destination;document.getElementById('maps').href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination);window.renderMap=()=>CTEventMapPreview.render(document.getElementById('map'),destination);document.getElementById('copy').onclick=()=>{window.copied=destination};renderMap();</script>`;
const server=http.createServer((req,res)=>{
 const allowed={'/assets/event-map-preview.js':'application/javascript','/assets/event-map-preview.css':'text/css'};
 if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end(html);}
 if(allowed[req.url]){res.writeHead(200,{'Content-Type':allowed[req.url]});return res.end(fs.readFileSync(path.join(root,req.url)));}
 res.writeHead(404);res.end();
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch();const results=[];
 try{
  for(const width of live?[390,1440]:[320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',permissions:[]});
   const page=await context.newPage();let mode='mock',requests=[],blocked=[],errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin===origin)return route.continue();
    if(!live){
     requests.push(u.origin);
     if(mode==='abort')return route.abort();
     if(mode==='hold')return;
     return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><body style="margin:0;background:#dae7df">MAP MOCK — não é mapa real</body></html>'});
    }
    const allowed=/^(?:maps\.google\.com|www\.google\.com|maps\.gstatic\.com|www\.gstatic\.com|fonts\.gstatic\.com|maps\.googleapis\.com|places\.googleapis\.com|fonts\.googleapis\.com|lh[0-9]+\.googleusercontent\.com)$/;
    if(u.protocol!=='https:'||!allowed.test(u.hostname)){blocked.push(u.origin);return route.abort();}
    requests.push(u.origin);return route.continue();
   });
   await page.goto(origin);assert.equal(requests.length,0,'No provider request before viewport');
   assert.equal(await page.locator('iframe').count(),0,'Frame not inserted before viewport');
   await page.locator('#map').scrollIntoViewIfNeeded();await page.locator('iframe').waitFor();
   assert.equal(await page.locator('iframe').getAttribute('referrerpolicy'),'no-referrer');
   assert.match(await page.locator('iframe').getAttribute('allow'),/geolocation 'none'/);
   if(live){
    await page.waitForTimeout(12000);
    const frame=page.frames().find(f=>f!==page.mainFrame());
    const text=frame?await frame.locator('body').innerText({timeout:5000}).catch(e=>'UNREADABLE: '+e.message):'NO FRAME';
    await page.locator('section').screenshot({path:path.join(out,`live-${width}.png`)});
    const cookies=(await context.cookies()).map(({name,domain,sameSite,secure})=>({name,domain,sameSite,secure}));
    results.push({width,status:'captured_requires_human_review',frameURL:frame?.url(),visibleText:text,requests:requests.length,origins:[...new Set(requests)],blocked:[...new Set(blocked)],cookieMetadata:cookies,errors});
    if(/unusual traffic|verify you are human|automated queries|captcha|access denied/i.test(text))throw new Error('Provider challenge or denial; stopped without interaction.');
   }else{
    await page.locator('#map [role="status"]').filter({hasText:'Se o mapa'}).waitFor();
    for(const theme of ['light','dark']){
     await page.locator('body').evaluate((n,t)=>n.classList.toggle('dark',t==='dark'),theme);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
     await page.locator('section').screenshot({path:path.join(out,`mock-${width}-${theme}.png`)});
    }
    await page.locator('#copy').click();assert.equal(await page.evaluate(()=>window.copied),destination);
    const before=await page.locator('#maps').getAttribute('href');
    mode='abort';await page.evaluate(()=>renderMap());await page.waitForTimeout(500);
    assert.equal(await page.locator('#maps').getAttribute('href'),before);assert(await page.locator('#copy').isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.evaluate(()=>CTEventMapPreview.clear());assert.equal(await page.locator('iframe').count(),0);
    assert.deepEqual(errors,[]);results.push({width,status:'mock_geometry_and_fallback_passed'});
   }
   await context.close();
  }
 }finally{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({live,destination,warning:'CI capture success is not verification of venue/pin accuracy.',results},null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
