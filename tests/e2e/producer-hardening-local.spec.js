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
        let source=fs.readFileSync(file,'utf8');
        if(u.pathname==='/produtor/')source=source.replace('function carregarCatalogoEventosProdutor(){', 'window.__portalTest={state:state,el:el,load:carregarCatalogoEventosProdutor};\nfunction carregarCatalogoEventosProdutor(){');
        const html=source.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'">`);
        seen.push(u.pathname);
        return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
      }
    }
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*',s=>s.close());
  await context.addInitScript(()=>{
    window.__meeting={calls:[],caught:[]};
    sessionStorage.setItem('CT_PORTAL_PRODUTOR_PROD_SESSION_V1',JSON.stringify({token:'SYNTHETIC-LOCAL-SESSION',expiraEm:'2031-01-01T00:00:00Z'}));
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Document is not focused'))}});
    HTMLFormElement.prototype.submit=function(){
      const fields=Object.fromEntries(new FormData(this));
      window.__meeting.calls.push(fields);
    };
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.name+': '+e.message));
  await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2030-01-02T00:00:00Z'));
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

const tickets=()=>({sucesso:true,evento:{id:eventId,nome:'Synthetic event'},tipos:[{id:'T-A',nome:'Synthetic ticket',precoNumero:12,quantidade:100,capacidadePorVenda:1,status:'ATIVO'}],lotes:[],resumo:{tipos:1,tiposAtivos:1,lotes:0,lotesAtivos:0}});
const guest={convidadoId:'G-A',nomeCompleto:'Synthetic guest',whatsapp:'00000000000',quantidadeMaxima:2,quantidadeConsumida:0};
const access=()=>({sucesso:true,autorizado:true,evento:{nome:'Synthetic private event'},configuracaoPersistida:{modoAcesso:'PRIVADO_CONVITE',validacaoConvite:'TOKEN_TELEFONE',mensagemConviteTitulo:'Persisted title'}});
async function bootTickets(page){await open(page,'produtor/ingressos');await reply(page,tickets());}
async function bootGuests(page){await open(page,'produtor/convidados');await reply(page,access());await reply(page,{sucesso:true,convidados:[guest]},{index:1});}
async function sameTick(page,selector){return page.evaluate(sel=>{
  const b=document.querySelector(sel);b.click();b.click();
  return {disabled:b.disabled,text:b.textContent,calls:window.__meeting.calls.length};
},selector);}
for(const kind of ['type','lot']){
  test(kind+' save: immediate feedback, duplicate blocked, success and reload complete',()=>isolated(async(page,errors)=>{
    await bootTickets(page);await page.click(kind==='type'?'#newType':'#newLot');
    await page.fill('#'+kind+'Name','Synthetic new item');
    const now=await sameTick(page,'#'+kind+'Form button[type=submit]');
    assert.equal(now.disabled,true);assert.match(now.text,/Salvando/);assert.equal(now.calls,2);
    await reply(page,{sucesso:true,mensagem:'Saved'},{index:1});
    await reply(page,tickets(),{index:2});
    assert.equal(await page.locator('#'+kind+'Dialog').isVisible(),false);
    assert.equal(await page.locator('#'+kind+'Form button[type=submit]').isEnabled(),true);
    assert.deepEqual(errors,[]);
  }));
  test(kind+' save: RPC failure preserves fields and permits retry',()=>isolated(async(page)=>{
    await bootTickets(page);await page.click(kind==='type'?'#newType':'#newLot');await page.fill('#'+kind+'Name','Retry value');
    await sameTick(page,'#'+kind+'Form button[type=submit]');await reply(page,null,{ok:false,index:1});
    assert.equal(await page.inputValue('#'+kind+'Name'),'Retry value');
    assert.equal(await page.locator('#'+kind+'Form button[type=submit]').isEnabled(),true);
    const now=await sameTick(page,'#'+kind+'Form button[type=submit]');assert.equal(now.calls,3);
  }));
}
test('guest save: immediate pending, one mutation, returned guest visible before reload',()=>isolated(async(page)=>{
  await bootGuests(page);await page.fill('#name','New synthetic guest');await page.fill('#phone','(00) 00000-0000');
  const now=await sameTick(page,'#saveGuest');assert.equal(now.disabled,true);assert.match(now.text,/Salvando/);assert.equal(now.calls,3);
  const payload=JSON.parse((await calls(page))[2].argsJson)[1];assert.equal(payload.whatsapp,'00000000000');
  await reply(page,{sucesso:true,convidado:{...guest,convidadoId:'G-B',nomeCompleto:'New synthetic guest'}},{index:2});
  assert.match(await page.locator('#rows').textContent(),/New synthetic guest/);
  assert.equal(await page.locator('#sGuests').textContent(),'2');
}));
test('guest save failure keeps fields and permits recovery',()=>isolated(async(page)=>{
  await bootGuests(page);await page.fill('#name','Retry guest');await sameTick(page,'#saveGuest');await reply(page,null,{ok:false,index:2});
  assert.equal(await page.inputValue('#name'),'Retry guest');assert.equal(await page.locator('#saveGuest').isEnabled(),true);
  assert.equal((await sameTick(page,'#saveGuest')).calls,4);
}));
test('clipboard rejection keeps generated invite active and offers manual copy without regeneration',()=>isolated(async(page)=>{
  await bootGuests(page);const now=await sameTick(page,'[data-invite]');assert.match(now.text,/Gerando/);assert.equal(now.calls,3);
  await reply(page,{sucesso:true,convite:{conviteId:'I-A',status:'ATIVO',link:'http://127.0.0.1/convite/?token=SYNTHETIC'}},{index:2});
  assert.equal(await page.locator('#sInvites').textContent(),'1');assert.match(await page.locator('#rows').textContent(),/ATIVO/);
  assert.match(await page.locator('#message').textContent(),/Convite gerado com sucesso. Não foi possível copiar automaticamente/);
  assert.equal(await page.locator('#manualCopy').isVisible(),true);
  assert.equal(await page.inputValue('#manualLink'),'http://127.0.0.1/convite/?token=SYNTHETIC');
  assert.equal((await calls(page)).filter(x=>x.metodo==='ctEventoConvidadosGerarConvitePROD').length,1);
}));
test('pending initial config shows no persisted defaults; refresh retains real values and clears stale error',()=>isolated(async(page)=>{
  await open(page,'produtor/convidados');
  assert.equal(await page.locator('#accessMode').isVisible(),false);
  assert.match(await page.locator('#eventName').textContent(),/Carregando/);
  await reply(page,access());await reply(page,{sucesso:true,convidados:[guest]},{index:1});
  await sameTick(page,'#refresh');
  assert.equal(await page.inputValue('#accessMode'),'PRIVADO_CONVITE');assert.equal(await page.inputValue('#inviteTitle'),'Persisted title');
  await reply(page,null,{ok:false,index:2});assert.equal(await page.locator('#refresh').isEnabled(),true);
  await sameTick(page,'#refresh');await reply(page,access(),{index:3});await reply(page,{sucesso:true,convidados:[guest]},{index:4});
  assert.equal(await page.locator('#message').evaluate(e=>e.classList.contains('err')),false);
}));
test('numeric zero focus permits normal typing 25 and preserves zero on blur; editing nonzero is preserved',()=>isolated(async(page)=>{
  await bootTickets(page);
  for(const kind of ['type','lot']){
    await page.click(kind==='type'?'#newType':'#newLot');
    for(const field of ['Price','Quantity']){
      const input=page.locator('#'+kind+field);await input.click();await input.pressSequentially('25');assert.equal(await input.inputValue(),'25');
      await input.fill('0');await page.locator('#'+kind+'Name').focus();await input.focus();await page.locator('#'+kind+'Name').focus();assert.equal(await input.inputValue(),'0');
    }
    await page.locator('#'+kind+'Dialog [data-close]').first().click();
  }
  await page.click('[data-edit-type]');await page.focus('#typePrice');assert.equal(await page.inputValue('#typePrice'),'12');
}));
test('WhatsApp mask retains digits for local mobile, landline and international input',()=>isolated(async(page)=>{
  await bootGuests(page);
  for(const digits of ['00000000000','0000000000','5500000000000','440000000000']){
    await page.fill('#phone',digits);
    const value=await page.inputValue('#phone');assert.equal(value.replace(/\D/g,''),digits);
    if(digits.length===11)assert.match(value,/\(00\) 00000-0000/);
  }
}));
test('Portal catalog failure enables refresh; same-tick retry and successful recovery',()=>isolated(async(page)=>{
  await open(page,'produtor');
  await page.waitForFunction(()=>!!window.__portalTest);
  await page.evaluate(()=>{const {state,el,load}=window.__portalTest;state.token='SYNTHETIC-LOCAL-SESSION';state.produtorAtual={id:'P-A',eventos:[{id:'E-A'}]};state.eventoAtual=null;el.portalView.classList.remove('hidden');el.loginView.classList.add('hidden');load();});
  let c=await calls(page);let i=c.findIndex(x=>x.metodo==='ctPortalProdutorCarregarCatalogoEventosPROD');assert.ok(i>=0);
  await reply(page,null,{ok:false,index:i});assert.equal(await page.locator('#refreshButton').isEnabled(),true);
  const now=await sameTick(page,'#refreshButton');assert.equal(now.disabled,true);assert.match(now.text,/Atualizando/);
  c=await calls(page);assert.equal(c.filter(x=>x.metodo==='ctPortalProdutorCarregarCatalogoEventosPROD').length,2);
  await reply(page,{autenticado:true,autorizado:true,eventos:[{id:'E-A',nome:'Synthetic restored event'}]},{index:c.length-1});
  assert.doesNotMatch(await page.locator('#portalMessage').textContent(),/Não foi possível/);
  assert.match(await page.locator('#eventSelect').textContent(),/Synthetic restored event/);
}));

for(const kind of ['type','lot'])test(kind+' timeout unlocks form without losing numeric payload or retrying automatically',()=>isolated(async(page)=>{
  await bootTickets(page);await page.click(kind==='type'?'#newType':'#newLot');await page.fill('#'+kind+'Name','Synthetic timeout');
  await sameTick(page,'#'+kind+'Form button[type=submit]');
  const payload=JSON.parse((await calls(page))[1].argsJson)[2];assert.equal(payload.preco,'0');assert.equal(payload.quantidade,'0');
  await page.clock.runFor(40000);
  assert.equal(await page.locator('#'+kind+'Form button[type=submit]').isEnabled(),true);
  assert.match(await page.locator('#'+kind+'Feedback').textContent(),/demorou/);
  assert.equal((await calls(page)).length,2);
}));
test('type saved then refresh fails: clear persisted outcome and read-only retry',()=>isolated(async(page)=>{
  await bootTickets(page);await page.click('#newType');await page.fill('#typeName','Synthetic saved');await sameTick(page,'#typeForm button[type=submit]');
  await reply(page,{sucesso:true},{index:1});await reply(page,null,{ok:false,index:2});
  assert.match(await page.locator('#toast').textContent(),/Tipo salvo.*atualizar a lista/);
  await sameTick(page,'#reloadConfig');
  const c=await calls(page);assert.equal(c.filter(x=>x.metodo==='ctIngressosConfigSalvarTipoPROD').length,1);
  await reply(page,tickets(),{index:3});assert.equal(await page.locator('#toast').isVisible(),false);
}));
test('guest timeout preserves fields and offers retry without automatic second mutation',()=>isolated(async(page)=>{
  await bootGuests(page);await page.fill('#name','Synthetic timeout');await sameTick(page,'#saveGuest');
  await page.clock.runFor(60000);assert.equal(await page.locator('#saveGuest').isEnabled(),true);
  assert.equal(await page.inputValue('#name'),'Synthetic timeout');assert.equal((await calls(page)).length,3);
}));
test('generation RPC failure unlocks action without fabricated active invite',()=>isolated(async(page)=>{
  await bootGuests(page);await sameTick(page,'[data-invite]');await reply(page,null,{ok:false,index:2});
  assert.equal(await page.locator('[data-invite]').isEnabled(),true);assert.equal(await page.locator('#sInvites').textContent(),'0');
  assert.equal(await page.locator('#manualCopy').isVisible(),false);
}));
test('clipboard success and subsequent manual-copy failure never generate another invitation',()=>isolated(async(page)=>{
  await bootGuests(page);await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{}});
  await sameTick(page,'[data-invite]');await reply(page,{sucesso:true,convite:{conviteId:'I-A',status:'ATIVO',link:'http://127.0.0.1/convite/?token=SYNTHETIC'}},{index:2});
  assert.match(await page.locator('#message').textContent(),/gerado e copiado/);
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Document is not focused')}});
  await page.click('[data-copy-link]');assert.equal(await page.locator('#manualCopy').isVisible(),true);
  assert.equal((await calls(page)).length,3);
}));
test('invalid ticket reload preserves last confirmed values and permits read-only retry',()=>isolated(async(page,errors)=>{
  await bootTickets(page);await sameTick(page,'#reloadConfig');await reply(page,{sucesso:true,tipos:{}},{index:1});
  assert.equal(await page.locator('#sumTipos').textContent(),'1');
  assert.match(await page.locator('#typeCards').textContent(),/Synthetic ticket/);
  assert.equal(await page.locator('#reloadConfig').isEnabled(),true);
  await sameTick(page,'#reloadConfig');await reply(page,tickets(),{index:2});
  assert.deepEqual(errors,[]);
}));
test('guest batch action blocks repeated click and restores action after failure',()=>isolated(async(page)=>{
  await bootGuests(page);const now=await sameTick(page,'#generateBatch');assert.equal(now.disabled,true);assert.match(now.text,/Gerando/);assert.equal(now.calls,3);
  await reply(page,null,{ok:false,index:2});assert.equal(await page.locator('#generateBatch').isEnabled(),true);
}));
