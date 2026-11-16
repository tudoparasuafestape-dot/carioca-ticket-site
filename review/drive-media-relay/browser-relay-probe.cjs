'use strict';
// Explicit test executable only. No live Nest integration, deploy or credentials.
// Run only in the reviewed CI/browser proof context with Playwright 1.55.0.
const {createServer}=require('node:http');
const {createHash}=require('node:crypto');
const {createMediaService}=require('./media-core.cjs');
const {createDriveSource,FIXTURE}=require('./drive-source.cjs');
const {createMediaHandler}=require('./http-handler.cjs');
const listen=(server,host)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,host,()=>{server.removeListener('error',reject);resolve(server.address().port);});});
const close=async server=>{if(!server?.listening)return;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
const check=(condition,code)=>{if(!condition)throw Error(code);};
async function run({publicFixtureLoopback=false}={}){
 const evidence={fixtureRegistry:'SYNTHETIC_PUBLIC_FIXTURE_ONLY',privateDriveCredentials:false,realEventRegistry:false,realOgCrawler:false,deployed:false,securityOverrides:false,sourceRequests:0,blockedBrowserRequests:[],browserGoogleRequests:0,phase:'runtime'};
 let browser,context,mediaServer,pageServer;
 try{
  check(publicFixtureLoopback===true,'PUBLIC_FIXTURE_LOOPBACK_OPT_IN_REQUIRED');
  let playwright;try{check(require('playwright/package.json').version==='1.55.0','PLAYWRIGHT_VERSION_MISMATCH');playwright=require('playwright');}catch{throw Error('PLAYWRIGHT_155_RUNTIME_REQUIRED');}
  // Registry here is intentionally synthetic, not a claim that the production
  // registry, event-public or approval providers exist. Fixture was public before
  // this work and its exact original bytes/hash/dimensions were already recorded.
  const fixtureRecord={assetId:FIXTURE.sha256,sha256:FIXTURE.sha256,state:'READY',publicRelease:true,eventPublic:true,revoked:false,revision:'f'.repeat(64),mime:FIXTURE.mime,bytes:FIXTURE.bytes,approvalExpiresAt:Date.now()+120000,fileId:FIXTURE.fileId,folderId:'SYNTHETIC_FIXTURE_FOLDER',sourceKind:'public-fixture',validation:'FULL_DECODE_PASSED',metadataPolicy:'ORIGINAL_METADATA_REVIEWED'};
  const source=createDriveSource({allowPublicFixture:true,transport:async(url,options)=>{
   check(url===FIXTURE.url&&options.method==='GET'&&options.redirect==='error'&&options.credentials==='omit','SOURCE_REQUEST_SCOPE');
   check(!Object.keys(options.headers||{}).some(key=>/^(authorization|cookie)$/i.test(key)),'SOURCE_CREDENTIALS_FORBIDDEN');
   check(++evidence.sourceRequests===1,'SOURCE_RETRY_FORBIDDEN');
   const response=await fetch(url,options);
   evidence.sourceResponse={status:response.status,mime:response.headers.get('content-type'),disposition:response.headers.get('content-disposition'),corp:response.headers.get('cross-origin-resource-policy')};
   return response;
  }});
  const service=createMediaService({registry:{resolvePublicAsset:async id=>id===FIXTURE.sha256?{...fixtureRecord}:null},source,maxRequestsPerMinute:10,maxConcurrent:2,requestTimeoutMs:5000});
  mediaServer=createServer(createMediaHandler(service));mediaServer.requestTimeout=10000;mediaServer.headersTimeout=10000;
  evidence.phase='bind-media-127.0.0.2';const mediaPort=await listen(mediaServer,'127.0.0.2');
  const mediaOrigin='http://127.0.0.2:'+mediaPort,mediaUrl=mediaOrigin+'/api/v2/media/covers/'+FIXTURE.sha256;
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Local binary media proof</title><meta property="og:image" content="'+mediaUrl+'"></head><body><h1>Loopback cross-site binary proof</h1><img id="fixture" width="400" alt="Previously public test image" src="'+mediaUrl+'"></body></html>';
  check(!html.includes(FIXTURE.fileId)&&!html.includes('google'),'PUBLIC_HTML_MUST_NOT_EXPOSE_SOURCE');
  pageServer=createServer((req,res)=>{
   if(req.method==='GET'&&req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
   if(req.method!=='GET'||req.url!=='/'){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; img-src "+mediaOrigin+"; base-uri 'none'; frame-ancestors 'none'"});res.end(html);
  });
  evidence.phase='bind-page-127.0.0.1';const pagePort=await listen(pageServer,'127.0.0.1');
  const pageUrl='http://127.0.0.1:'+pagePort+'/',allowed=new Set([pageUrl,pageUrl+'favicon.ico',mediaUrl]);
  evidence.phase='launch-chromium';browser=await playwright.chromium.launch({headless:true});
  context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const request=route.request(),url=request.url();
   if(/google/i.test(url))evidence.browserGoogleRequests++;
   if(request.method()!=='GET'||!allowed.has(url)){evidence.blockedBrowserRequests.push(url.split('?')[0]);await route.abort('blockedbyclient');return;}
   await route.continue();
  });
  const page=await context.newPage();const failures=[];
  page.on('requestfailed',request=>{if(request.url()===mediaUrl)failures.push(request.failure()?.errorText||'MEDIA_REQUEST_FAILED');});
  const responsePromise=page.waitForResponse(response=>response.url()===mediaUrl,{timeout:15000}).then(value=>({value}),()=>({missing:true}));
  evidence.phase='navigate-cross-site';await page.goto(pageUrl,{waitUntil:'load',timeout:15000});
  const observed=await responsePromise;check(!observed.missing,'BROWSER_MEDIA_RESPONSE_MISSING');
  const mediaResponse=observed.value;
  const headers=await mediaResponse.allHeaders(),requestHeaders=await mediaResponse.request().allHeaders();
  const dimensions=await page.locator('#fixture').evaluate(img=>({complete:img.complete,width:img.naturalWidth,height:img.naturalHeight}));
  evidence.browser={status:mediaResponse.status(),headers:{mime:headers['content-type'],disposition:headers['content-disposition'],corp:headers['cross-origin-resource-policy'],nosniff:headers['x-content-type-options'],cache:headers['cache-control']},secFetchSite:requestHeaders['sec-fetch-site'],dimensions,failures};
  check(mediaResponse.status()===200,'BROWSER_MEDIA_STATUS');check(requestHeaders['sec-fetch-site']==='cross-site','CROSS_SITE_NOT_OBSERVED');
  check(dimensions.complete&&dimensions.width===1080&&dimensions.height===1350,'BROWSER_IMAGE_NOT_DECODED');
  check(headers['content-type']==='image/png'&&headers['content-disposition']==='inline; filename="cover.png"'&&headers['cross-origin-resource-policy']==='cross-origin'&&headers['x-content-type-options']==='nosniff','BROWSER_MEDIA_HEADERS');
  const bytes=await mediaResponse.body(),digest=createHash('sha256').update(bytes).digest('hex');
  evidence.browser.bytes=bytes.length;evidence.browser.sha256=digest;
  check(bytes.length===FIXTURE.bytes&&digest===FIXTURE.sha256,'BROWSER_BYTES_MISMATCH');
  check(evidence.sourceRequests===1&&evidence.browserGoogleRequests===0&&evidence.blockedBrowserRequests.length===0&&failures.length===0,'REQUEST_SCOPE_OR_BROWSER_FAILURE');
  check(!JSON.stringify(headers).includes(FIXTURE.fileId),'SOURCE_IDENTIFIER_LEAK');
  evidence.phase='completed';evidence.result='PASS';return evidence;
 }catch(error){evidence.result='FAIL';evidence.error=/^[A-Z0-9_]{1,80}$/.test(error?.message||'')?error.message:'PROOF_FAILED';return evidence;}
 finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await close(pageServer);await close(mediaServer);}
}
if(require.main===module){run({publicFixtureLoopback:process.argv.length===2&&process.env.CT_RELAY_PROBE==='READ_ONLY_PUBLIC_FIXTURE'}).then(result=>{process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.result!=='PASS')process.exitCode=1;}).catch(()=>{process.stdout.write('{"result":"FAIL","error":"PROOF_CLEANUP_FAILED"}\n');process.exitCode=1;});}
module.exports={run};
