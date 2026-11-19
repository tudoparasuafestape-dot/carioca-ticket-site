'use strict';
const {directDiagnostic,safeHeaders}=require('./http-diagnostic.cjs');
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto');
const HTML_SHA='d9eca449faa9c0f4c8d3086b73fcb1befdb6d4121c9b99644f4386c23347eebd';
const IMAGE_SHA='51641c2541154228a4f9099f4056c1b47daab1598e369c50b91bccd1d76ce570';
const IMAGE_URL='https://drive.usercontent.google.com/download?id=1ZKtn5Z7APZpQjiNEVZSOrfCws5liDLIq&export=download';
function urlLabel(url,origin){if(url===IMAGE_URL)return 'PUBLIC_FIXTURE';if(url===origin+'/review/drive-cover-lab/')return 'LOCAL_HTML';try{const u=new URL(url);return (u.origin+u.pathname).slice(0,240);}catch{return 'INVALID_URL';}}
function permitted(url,method,origin){return method==='GET'&&(url===origin+'/review/drive-cover-lab/'||url===IMAGE_URL);}
async function probe({chromium,htmlPath,outputPath,approved}){
 if(approved!=='READ_ONLY_EXISTING_PUBLIC_FIXTURE')throw Error('EXPLICIT_PROBE_SCOPE_REQUIRED');
 const html=fs.readFileSync(htmlPath);if(crypto.createHash('sha256').update(html).digest('hex')!==HTML_SHA)throw Error('HTML_CHANGED');
 if(fs.existsSync(outputPath))throw Error('OUTPUT_EXISTS_NO_BLIND_RERUN');
 console.log(JSON.stringify(await directDiagnostic()));
 const server=http.createServer((req,res)=>{if(req.method!=='GET'||req.url!=='/review/drive-cover-lab/'){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,results=[];
 let browser,diagnostic={};
 try{
  browser=await chromium.launch({headless:true});
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
   const context=await browser.newContext({viewport,serviceWorkers:'block',acceptDownloads:false});
   let count=0;const blocked=[];diagnostic={viewport,responses:[],failed:[],console:[]};
   context.on('response',response=>{if(diagnostic.responses.length<12){const h=response.headers();diagnostic.responses.push({url:urlLabel(response.url(),origin),status:response.status(),mime:(h['content-type']||'').slice(0,100),redirect:h.location?urlLabel(h.location,origin):null});}});
   context.on('requestfailed',request=>{if(diagnostic.failed.length<12)diagnostic.failed.push({url:urlLabel(request.url(),origin),error:((request.failure()?.errorText||'').match(/net::ERR_[A-Z_]+/)||['REQUEST_FAILED'])[0]});});
   await context.route('**/*',async route=>{const req=route.request();if(++count>8||!permitted(req.url(),req.method(),origin)){blocked.push({url:urlLabel(req.url(),origin),method:req.method()});await route.abort();return;}await route.continue();});
   const page=await context.newPage();page.setDefaultTimeout(20000);
   const cdp=await context.newCDPSession(page),fixtureIds=new Set();diagnostic.browserNetwork=[];
   cdp.on('Network.requestWillBeSent',event=>{if(event.request.url===IMAGE_URL)fixtureIds.add(event.requestId);});
   cdp.on('Network.responseReceivedExtraInfo',event=>{if(fixtureIds.has(event.requestId)&&diagnostic.browserNetwork.length<4)diagnostic.browserNetwork.push({status:event.statusCode,...safeHeaders(event.headers)});});
   await cdp.send('Network.enable');
   page.on('console',message=>{const t=message.text();const code=t.match(/net::ERR_[A-Z_]+/);if(diagnostic.console.length<8&&(code||/Content Security Policy/i.test(t)))diagnostic.console.push(code?code[0]:'CSP_REFUSAL');});
   const imageResponse=page.waitForResponse(r=>r.url()===IMAGE_URL,{timeout:20000});
   // Catch early rejection so timeout cannot produce an unhandled promise.
   imageResponse.catch(()=>{});
   await page.goto(origin+'/review/drive-cover-lab/',{waitUntil:'domcontentloaded',timeout:20000});
   await page.waitForFunction(()=>{const i=document.querySelector('img');return i&&i.complete&&i.naturalWidth>0;},{},{timeout:20000});
   const dimensions=await page.locator('img').evaluate(i=>({width:i.naturalWidth,height:i.naturalHeight,visible:i.getBoundingClientRect().width>0}));
   const response=await imageResponse,body=await response.body(),mime=(response.headers()['content-type']||'').split(';')[0];
   if(blocked.length||response.status()!==200||mime!=='image/png'||body.length!==1959605||crypto.createHash('sha256').update(body).digest('hex')!==IMAGE_SHA||dimensions.width!==1080||dimensions.height!==1350||!dimensions.visible)throw Error('PUBLIC_IMAGE_BROWSER_CHECK_FAILED');
   results.push({viewport,status:200,mime,bytes:body.length,sha256:IMAGE_SHA,dimensions,blockedRequests:0});
   await context.close();
  }
  fs.writeFileSync(outputPath,JSON.stringify({scope:'READ_ONLY_EXISTING_PUBLIC_FIXTURE',browserVerified:true,ogVerified:false,publicPagePublished:false,productionUnchanged:true,observedAt:new Date().toISOString(),results},null,2),{flag:'wx',mode:0o600});
 }catch(error){console.error(JSON.stringify({browserVerified:false,ogVerified:false,diagnostic}));throw error;}finally{try{if(browser)await browser.close();}finally{await new Promise(r=>server.close(r));}}
}
module.exports={permitted,urlLabel,probe,HTML_SHA,IMAGE_SHA,IMAGE_URL};
if(require.main===module){const {chromium}=require('playwright');probe({chromium,htmlPath:process.argv[2],outputPath:process.argv[3],approved:process.env.CT_PROBE_APPROVAL}).catch(e=>{console.error(e.message);process.exitCode=1;});}
