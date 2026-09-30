'use strict';
// Standalone offline browser tests. No Playwright config, server or external transport.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
let browser;
before(async()=>{
  const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  browser=await chromium.launch({headless:true,executablePath,
    proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'},
    args:['--disable-background-networking','--disable-component-update','--disable-sync','--disable-quic','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
});
after(async()=>{if(browser)await browser.close();});
const eventId='EVENT-SYNTH-A';
const catalog=()=>({sucesso:true,evento:{id:eventId,nome:'Synthetic local event',data:'01/01/2030'},visual:{},tipos:[{id:'TYPE-SYNTH-A',nome:'Synthetic ticket',lotes:[{id:'LOT-SYNTH-A',nome:'Synthetic lot',precoNumero:10,preco:'R$ 10,00',disponiveis:5,quantidadeLimitada:true}]}]});
async function isolated(action){
  const context=await browser.newContext({offline:true,serviceWorkers:'block',acceptDownloads:false});
  const errors=[];const seen=[];
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin==='http://127.0.0.1'&&route.request().isNavigationRequest()&&route.request().method()==='GET'){
      const file=path.resolve(root,'.'+u.pathname,'index.html');
      assert.ok(file.startsWith(root+path.sep));
      if(fs.existsSync(file)){
        const html=fs.readFileSync(file,'utf8').replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'">`);
        seen.push(u.pathname);
        return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
      }
    }
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*',s=>s.close());
  await context.addInitScript(()=>{
    window.__meeting={calls:[],caught:[]};
    HTMLFormElement.prototype.submit=function(){
      const fields=Object.fromEntries(new FormData(this));
      window.__meeting.calls.push(fields);
    };
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.name+': '+e.message));
  await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2030-01-01T00:00:00Z'));
  try{await action(page,errors,seen);}finally{await context.close();}
}
async function open(page,route,query='evento='+eventId){await page.goto('http://127.0.0.1/'+route+'/?'+query,{waitUntil:'load'});}
async function calls(page){return page.evaluate(()=>window.__meeting.calls);}
async function reply(page,result,{ok=true,index=0}={}){
  await page.evaluate(({result,ok,index})=>{
    const f=window.__meeting.calls[index];
    if(!f)throw new Error('No local RPC to answer');
    window.dispatchEvent(new MessageEvent('message',{origin:'https://script.google.com',data:{ctMinhaCariocaPost:true,id:f.ctMinhaCariocaRequestId,ok,resultado:result,erro:ok?'':'SYNTHETIC_RPC_FAILURE'}}));
  },{result,ok,index});
}
for(const route of ['evento','evento-v2','checkout','checkout-v2']){
  test(route+': successful catalog and usable ticket CTA',()=>isolated(async(page,errors)=>{
    await open(page,route);await reply(page,catalog());
    assert.equal(await page.locator('#loading').isVisible(),false);
    if(route.startsWith('evento'))await page.locator('#buyHero').click({trial:true});
    else{
      await page.selectOption('#typeSelect','TYPE-SYNTH-A');
      await page.selectOption('#lotSelect','LOT-SYNTH-A');
      assert.equal(await page.inputValue('#lotSelect'),'LOT-SYNTH-A');
    }
    assert.deepEqual(errors,[]);
  }));
  for(const failure of ['rpc','timeout','invalid','render'])test(route+': '+failure+' ends loading with visible error',()=>isolated(async(page,errors)=>{
    await open(page,route);
    if(failure==='timeout')await page.clock.runFor(45000);
    else await reply(page,failure==='render'?{...catalog(),tipos:{}}:null,{ok:failure!=='rpc'});
    assert.equal(await page.locator('#loading').isVisible(),false);
    assert.equal(await page.locator(route.startsWith('evento')?'#errorBox':'#closedPanel').isVisible(),true);
    assert.deepEqual(errors,[]);
    assert.equal((await calls(page)).length,1,'No campaign or retry after failure');
  }));
}
test('public event v2 CTA navigates to checkout v2 with same event; no cross-event catalog',()=>isolated(async(page,errors,seen)=>{
  await open(page,'evento-v2');await reply(page,catalog());
  await page.locator('#buyHero').click();
  assert.equal(new URL(page.url()).pathname,'/checkout-v2/');
  const c=await calls(page);
  assert.deepEqual(JSON.parse(c[0].argsJson),[eventId,'']);
  await reply(page,catalog());
  await page.selectOption('#typeSelect','TYPE-SYNTH-A');await page.selectOption('#lotSelect','LOT-SYNTH-A');
  assert.deepEqual(seen,['/evento-v2/','/checkout-v2/']);assert.deepEqual(errors,[]);
}));
test('guests return links use official Portal',()=>{
  const html=fs.readFileSync(path.join(root,'produtor/convidados/index.html'),'utf8');
  assert.equal(html.includes('href="/produtor-v2/"'),false);
  assert.ok((html.match(/href="\/produtor\/"/g)||[]).length>=2);
});

const invitation=()=>({sucesso:true,evento:catalog().evento,visual:{},convite:{nomeConvidado:'Synthetic Guest',disponivel:2,validacaoConvite:'TOKEN_TELEFONE_CPF'},experiencia:{}});
test('private invitation validates fields, stores grant and opens checkout without grant in URL',()=>isolated(async(page,errors)=>{
  await open(page,'convite','token=SYNTHETIC-INVITE');await reply(page,invitation());
  assert.equal(await page.locator('#loading').isVisible(),false);
  await page.fill('#phone','00000000000');await page.fill('#cpf','00000000000');
  await page.click('#continue');
  let c=await calls(page);assert.equal(c[1].metodo,'ctEventoConviteValidarPublicoPROD');
  assert.deepEqual(JSON.parse(c[1].argsJson),[{token:'SYNTHETIC-INVITE',telefone:'00000000000',cpf:'00000000000'}]);
  await reply(page,{sucesso:true,autorizado:true,eventoId:eventId,accessGrant:'SYNTHETIC-BROWSER-GRANT',expiraEmEpoch:2000000000},{index:1});
  await page.waitForURL('**/checkout-v2/**');
  assert.equal(new URL(page.url()).searchParams.get('privado'),'1');
  assert.equal(new URL(page.url()).searchParams.has('accessGrant'),false);
  c=await calls(page);assert.deepEqual(JSON.parse(c[0].argsJson),[eventId,'SYNTHETIC-BROWSER-GRANT']);
  await reply(page,catalog());
  await page.selectOption('#typeSelect','TYPE-SYNTH-A');await page.selectOption('#lotSelect','LOT-SYNTH-A');
  assert.deepEqual(errors,[]);
}));
for(const failure of ['rpc','timeout','invalid','render'])test('invitation: '+failure+' ends loading',()=>isolated(async(page,errors)=>{
  await open(page,'convite','token=SYNTHETIC-INVITE');
  if(failure==='render')await page.locator('#eventName').evaluate(e=>e.remove());
  if(failure==='timeout')await page.clock.runFor(45000);
  else await reply(page,failure==='render'?invitation():null,{ok:failure!=='rpc'});
  assert.equal(await page.locator('#loading').isVisible(),false);
  assert.equal(await page.locator('#invalid').isVisible(),true);
  assert.deepEqual(errors,[]);
}));
test('invitation rejected validation permits another attempt and does not store grant',()=>isolated(async(page,errors)=>{
  await open(page,'convite','token=SYNTHETIC-INVITE');await reply(page,invitation());
  await page.click('#continue');await reply(page,null,{ok:false,index:1});
  assert.equal(await page.locator('#continue').isEnabled(),true);
  assert.equal(await page.locator('#message').isVisible(),true);
  assert.equal(await page.evaluate(id=>sessionStorage.getItem('CT_PRIVATE_GRANT_'+id),eventId),null);
  assert.deepEqual(errors,[]);
}));


test('private event card keeps a single modality action instead of generic checkout',()=>{
  const html=
    fs.readFileSync(
      path.join(root,'eventos-v2/index.html'),
      'utf8'
    );

  assert.ok(
    html.includes("evento.modoAcesso === 'PRIVADO_CONVITE'")
  );
  assert.equal(
    html.includes('Gerenciar convidados e convites'),
    false
  );
  assert.ok(
    html.includes('Modalidade e convidados')
  );
});
