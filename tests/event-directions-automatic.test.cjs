// Offline: no providers, RPCs, purchases, SDKs, or location permissions.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const event={id:'SYNTHETIC-NEW',local:'Espaço São João & Arte',endereco:'Rua da Música, 120',cidade:'Recife',uf:'PE'};
function setup(){
 const nodes={};for(const id of ['details','unavailable','address','map','copy','status','uber','uber-label','uber-note','waze','waze-label','waze-note'])nodes['directions-'+id]={hidden:false,attrs:{},textContent:'',setAttribute(k,v){this.attrs[k]=v;if(k==='href')this.href=v},removeAttribute(k){delete this.attrs[k];delete this[k]},focus(){},select(){},setSelectionRange(){}};
 const listeners={},ctx={window:{localStorage:{getItem:()=> 'pt-BR'},addEventListener(k,f){listeners[k]=f},isSecureContext:true},navigator:{clipboard:{writeText:async()=>{}}},document:{getElementById:id=>nodes[id],addEventListener(k,f){listeners[k]=f}}};
 for(const f of ['event-directions.js','event-ride-destinations.js','event-uber.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'assets',f),'utf8'),ctx);
 ctx.$=id=>nodes[id];
 const d=ctx.window.CTEventDirections,u=ctx.window.CTEventUber;
 return {ctx,d,u,nodes,listeners,render(e=event,id=e?.id){d.render(e);u.render(e,id)},node:id=>nodes['directions-'+id]};
}
test('new registered event automatically exposes 3 honest providers from one canonical address',()=>{const t=setup();t.render();const destination=t.d.resolve(event).destination;
 assert.equal(new URL(t.node('map').href).searchParams.get('destination'),destination);
 const waze=new URL(t.node('waze').attrs.href);assert.equal(waze.origin,'https://waze.com');assert.equal(waze.pathname,'/ul');assert.deepEqual([...waze.searchParams.keys()],['q']);assert.equal(waze.searchParams.get('q'),destination);
 assert.equal(t.node('uber').attrs.href,'https://m.uber.com/');assert.equal(t.node('uber-label').textContent,'Abrir Uber');assert.match(t.node('uber-note').textContent,/não está preenchido/);
 for(const id of ['uber','waze']){assert.equal(t.node(id).hidden,false);assert.equal(t.node(id).attrs.rel,'noopener noreferrer')}
});
test('canonical address edits and new event ids recompute links, never retain old pin',()=>{const t=setup();t.render();const old=t.node('waze').attrs.href;t.render({...event,id:'FUTURE',endereco:'Avenida Nova, 9'});assert.notEqual(t.node('waze').attrs.href,old);assert.match(decodeURIComponent(t.node('waze').attrs.href),/Avenida Nova, 9/);assert.equal(t.node('uber').attrs.href,'https://m.uber.com/');});
test('accent, ampersand, quotes, hash and query punctuation safely roundtrip',()=>{const t=setup();const e={...event,endereco:`Rua D'Água "Azul" & Praça #2 ? saída=3, 12`};t.render(e);for(const [id,key] of [['map','destination'],['waze','q']]){const u=new URL(t.node(id).href||t.node(id).attrs.href);assert.equal(u.searchParams.get(key),t.d.resolve(e).destination);assert.equal(u.hash,'');assert.equal(u.searchParams.has('saída'),false)}});
for(const patch of [{endereco:'123'},{endereco:'50000-000'},{local:''},{endereco:''},{endereco:'Rua da Música'},{endereco:'A confirmar'},{endereco:'https://evil.example/12'},{endereco:'<img src=x onerror=alert(1)> 12'},{cidade:''},{uf:'XX'},{local:'Online'},{endereco:'á'.repeat(500)+'12'},{endereco:'\ud800 123'},{endereco:123},{cidade:null}])test('incomplete or unsafe address hides controls '+JSON.stringify(patch),()=>{const t=setup();t.render();t.render({...event,...patch});assert.equal(t.node('details').hidden,true);for(const id of ['uber','waze']){assert.equal(t.node(id).hidden,true);assert.equal(t.node(id).attrs.href,undefined)}assert.equal(t.node('map').href,undefined)});
test('explicit no-number physical address accepted',()=>{const t=setup();assert.ok(t.d.resolve({...event,endereco:'Rua da Música, s/n'}));});
test('requested id mismatch fails closed',()=>{const t=setup();assert.equal(t.u.buildUrl(event,'OTHER'),'');assert.equal(t.u.buildWazeUrl(event,'OTHER'),'')});
test('approved legacy coordinates still work, address edit downgrades transparently',()=>{const t=setup();const id=Object.keys(t.ctx.window.CTEventRideDestinations)[0],p=t.ctx.window.CTEventRideDestinations[id],e={...p,id};t.render(e);assert.equal(t.node('uber-label').textContent,'Ir de Uber');const drop=JSON.parse(new URL(t.node('uber').attrs.href).searchParams.get('drop[0]'));assert.equal(drop.latitude,p.latitude);t.render({...e,endereco:'Outra rua, 18'});assert.equal(t.node('uber').attrs.href,'https://m.uber.com/');assert.equal(t.node('uber-label').textContent,'Abrir Uber')});
for(const patch of [{latitude:null},{latitude:''},{latitude:NaN},{latitude:Infinity},{latitude:91},{longitude:181},{latitude:'0'},{latitude:0,longitude:0},{approved:false},{revision:''}])test('invalid reviewed coordinates never generate a destination '+JSON.stringify(patch),()=>{const t=setup(),id=Object.keys(t.ctx.window.CTEventRideDestinations)[0],p=t.ctx.window.CTEventRideDestinations[id],e={...p,id};t.ctx.window.CTEventRideDestinations={[id]:{...p,...patch}};assert.equal(t.u.buildUrl(e,id),'https://m.uber.com/')});
test('valid zero latitude or longitude separately preserved without coercion',()=>{for(const coords of [{latitude:0,longitude:20},{latitude:10,longitude:0}]){const t=setup(),id=Object.keys(t.ctx.window.CTEventRideDestinations)[0],p=t.ctx.window.CTEventRideDestinations[id];t.ctx.window.CTEventRideDestinations={[id]:{...p,...coords}};const drop=JSON.parse(new URL(t.u.buildUrl({...p,id},id)).searchParams.get('drop[0]'));assert.equal(drop.latitude,coords.latitude);assert.equal(drop.longitude,coords.longitude)}});
test('unreviewed payload coordinates do not override approved or fallback paths',()=>{const t=setup();assert.equal(t.u.buildUrl({...event,latitude:5,longitude:20},event.id),'https://m.uber.com/')});
test('clear, error, repeated render and language changes cannot revive stale links',()=>{const t=setup();for(let i=0;i<3;i++)t.render();for(const locale of ['en-US','es','zh-Hans']){t.ctx.window.CTPublicI18n={getLocale:()=>locale};t.listeners['ct:public-language']();assert.equal(t.node('uber').attrs.lang,locale);assert.equal(t.node('waze').attrs.lang,locale)}t.u.clear();t.listeners.pageshow();t.listeners['ct:public-language']();assert.equal(t.node('uber').attrs.href,undefined);assert.equal(t.node('waze').attrs.href,undefined)});
test('no third-party request, SDK, location or HTML insertion; both templates use same component',()=>{for(const f of ['event-directions.js','event-uber.js'])assert.doesNotMatch(fs.readFileSync(path.join(root,'assets',f),'utf8'),/fetch\(|XMLHttpRequest|navigator\.geolocation|window\.open|innerHTML|\.submit\(/);for(const route of ['evento','evento-v2']){const html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');assert.match(html,/event-directions.js\?v=20261030-auto1/);assert.match(html,/event-uber.js\?v=20261030-pin1/);assert.match(html,/CTEventUber\.render\(e,state.eventoId\)/);assert.match(html,/id="directions-waze" hidden target="_self" rel="noopener noreferrer"/);for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);}});
for(const route of ['evento','evento-v2'])test(route+': accepted availability refresh updates canonical location only on change',()=>{
 const t=setup(),html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');
 const start=html.indexOf('      function refreshEventLocation(res){'),end=html.indexOf('      function renderCommercial(res){',start);
 let previews=0,displays={};t.ctx.state={data:{evento:event},eventoId:event.id};t.ctx.display=(id,value)=>displays[id]=value;t.ctx.window.CTEventMapPreview={renderPublicDirections(){previews++}};
 vm.runInNewContext(html.slice(start,end),t.ctx);t.render();
 t.ctx.refreshEventLocation({evento:{...event}});assert.equal(previews,0);
 const updated={...event,endereco:'Rua Atualizada, 88'};t.ctx.refreshEventLocation({evento:updated});assert.equal(previews,1);assert.match(displays.venue,/Rua Atualizada, 88/);assert.equal(new URL(t.node('map').href).searchParams.get('destination'),t.d.resolve(updated).destination);assert.equal(new URL(t.node('waze').attrs.href).searchParams.get('q'),t.d.resolve(updated).destination);
 t.ctx.state.data={evento:updated};t.ctx.refreshEventLocation({evento:{...updated,endereco:''}});assert.equal(t.node('details').hidden,true);assert.equal(t.node('uber').attrs.href,undefined);assert.equal(t.node('waze').attrs.href,undefined);
 assert.match(html,/function renderCommercial\(res\)\{\s*refreshEventLocation\(res\);\s*state.data=res;/);
 assert.match(html,/if\(availabilityOnly&&!firstRender&&!state.temporalNeedsFullRender\)renderCommercial\(res\)/);
});
test('Herminho verified venue pin is identical in all 3 links and invalidates on canonical edit',()=>{
 const e={id:'EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A',local:'Clube 10 de Novembro.',endereco:'Rua Mestre Antônio Valeriano, 65–205, bairro do Totó, Recife - PE, CEP: 50940-700',cidade:'Recife',uf:'PE'},t=setup();t.render(e);
 const google=new URL(t.node('map').href),waze=new URL(t.node('waze').attrs.href),uber=new URL(t.node('uber').attrs.href),drop=JSON.parse(uber.searchParams.get('drop[0]'));
 assert.equal(google.searchParams.get('destination'),'-8.0804985,-34.9683533');assert.equal(waze.searchParams.get('ll'),google.searchParams.get('destination'));assert.equal(waze.searchParams.get('navigate'),'yes');assert.equal(drop.latitude,-8.0804985);assert.equal(drop.longitude,-34.9683533);assert.equal(drop.addressLine1,'Clube 10 de Novembro');assert.match(drop.addressLine2,/65–205/);assert.equal(t.node('uber-label').textContent,'Ir de Uber');
 const p=t.ctx.window.CTEventRideDestinations[e.id];assert.equal(p.source,'google-maps-public-place');assert.equal(p.precision,'venue-not-entrance');assert.match(p.sourceUrl,/!3d-8.0804985!4d-34.9683533/);assert.match(p.addressEvidenceUrl,/dome.recife.pe.gov.br/);
 for(const patch of [{local:'Outro clube'},{endereco:'Rua Nova, 8'},{cidade:'Olinda'},{uf:'PB'}]){const changed={...e,...patch};t.render(changed);assert.equal(t.node('uber').attrs.href,'https://m.uber.com/');assert.equal(new URL(t.node('waze').attrs.href).searchParams.has('ll'),false);assert.equal(new URL(t.node('map').href).searchParams.get('destination'),t.d.resolve(changed).destination)}
 t.render(e);t.u.clear();assert.equal(t.node('map').href,undefined);assert.equal(t.node('uber').attrs.href,undefined);assert.equal(t.node('waze').attrs.href,undefined);
});
test('real privacy-gated map renderer accepts only the active approved pin and preserves preview',()=>{
 const t=setup(),created=[];
 function node(){return {hidden:false,attrs:{},children:[],handlers:{},classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k];delete this[k]},replaceChildren(...children){this.children=children},addEventListener(k,f){this.handlers[k]=f}}}
 const host=t.nodes['directions-map-preview']=node();t.ctx.document.createElement=tag=>{const n=node();n.tag=tag;created.push(n);return n};t.ctx.URL=URL;t.ctx.setTimeout=()=>1;t.ctx.clearTimeout=()=>{};t.ctx.window.CTPrivacy={allowed:()=>false};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/event-map-preview.js'),'utf8'),t.ctx);
 for(const [id,p] of Object.entries(t.ctx.window.CTEventRideDestinations)){
  const e={...p,id};t.render(e);const href=t.node('map').href;t.ctx.window.CTEventMapPreview.renderPublicDirections();assert.equal(host.hidden,false,'approved pin retains existing map preview');let frame=created.filter(n=>n.tag==='iframe').at(-1);assert.equal(frame.src,undefined,'no iframe request before consent');assert.equal(host.children[1].hidden,false);
  host.children[1].handlers.click();assert.equal(new URL(frame.src).searchParams.get('q'),p.latitude+','+p.longitude);assert.match(frame.attrs.allow,/geolocation 'none'/);
  t.node('map').href='https://www.google.com/maps/dir/?api=1&destination=1,2';t.ctx.window.CTEventMapPreview.renderPublicDirections();assert.equal(host.hidden,true,'arbitrary DOM pin rejected');
  t.node('map').href=href;t.node('address').value='Different address';t.ctx.window.CTEventMapPreview.renderPublicDirections();assert.equal(host.hidden,true,'different canonical address rejected');
  t.render(e);t.u.clear();t.ctx.window.CTEventMapPreview.renderPublicDirections();assert.equal(host.hidden,true,'cleared pin cannot revive');
 }
 t.render(event);t.ctx.window.CTEventMapPreview.renderPublicDirections();assert.equal(host.hidden,false,'unapproved event address preview retained');const frame=created.filter(n=>n.tag==='iframe').at(-1);assert.equal(frame.src,undefined);host.children[1].handlers.click();assert.equal(new URL(frame.src).searchParams.get('q'),t.d.resolve(event).destination);
});
for(const route of ['evento','evento-v2']){
 const html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');
 const helper=html.slice(html.indexOf('      function refreshEventLocation(res){'),html.indexOf('      function renderCommercial(res){'));
 const commercial=html.slice(html.indexOf('      function renderCommercial(res){'),html.indexOf('      function configurarMidiaPrincipal(v){'));
 const originalCommercial=commercial.replace('        refreshEventLocation(res);\n','');
 test(route+': all non-location template bytes match verified main, including checkout/campaign/RPC',()=>{
  const original=html.replace(helper,'').replace('        refreshEventLocation(res);\n','')
   .replace('event-directions.js?v=20261030-auto1','event-directions.js?v=20261009-1')
   .replace('event-ride-destinations.js?v=20261030-herminho1','event-ride-destinations.js?v=20261010-3')
   .replace('event-uber.js?v=20261030-pin1','event-uber.js?v=20261010-4')
   .replace('event-map-preview.js?v=20261030-pin1','event-map-preview.js?v=20261010-privacy1')
   .replaceAll('hidden target="_self" rel="noopener noreferrer" aria-describedby="directions-','hidden target="_self" rel="noreferrer" aria-describedby="directions-');
  const b=Buffer.from(original),sha=require('crypto').createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
  assert.equal(sha,route==='evento'?'43f650fe2c9032fa2275280e147f9cd81d1cfffa':'9975c943105131a1cd1d5a489f9c6ea16c04108f');
 });
 function commercialFixture(code,{fault,cleanupThrows=false,empty=false,ended=false,fresh=true,failed=false,campaign=true,commercialThrows=false}={}){
  const nodes={},calls={stale:0,failure:0};
  function get(id){
   if(nodes[id])return nodes[id];
   const n=nodes[id]={id,hidden:false,attrs:{href:'STALE-PIN'},href:'STALE-PIN',textContent:'',innerHTML:'',classes:new Set(),
    setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k];if(k==='href')delete this.href},replaceChildren(){this.innerHTML=''},
    classList:{add(value){get(id).classes.add(value)},remove(value){get(id).classes.delete(value)}}};
   Object.defineProperties(n,{parentElement:{get:()=>({querySelector:selector=>get(id+' parent '+selector)})},previousElementSibling:{get:()=>get(id+' previous')}});return n;
  }
  // Explicit object construction avoids any browser/network actions.
  const id='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
  const ctx={state:{eventoId:id,data:{evento:{...event,id}},cupomCodigo:campaign?'PUBLIC-CAMPAIGN':'',temporalFailed:failed},$:get,document:{querySelector:s=>{const n=get(s);n.closest=x=>get(s+' closest '+x);return n}},
   display:(id,v,f)=>{if(commercialThrows&&id==='startingPrice')throw Error('existing commercial failure');get(id).textContent=v||f},tr:(s,o)=>o?s.replace('{code}',o.code):s,esc:s=>String(s??''),locale:()=> 'pt-BR',money:n=>'R$ '+Number(n).toFixed(2),queryCampanha:()=>campaign?'&cupom=PUBLIC-CAMPAIGN':'',eventNotice:get('eventNotice'),eventRetry:get('eventRetry'),eventLease:{isFresh:()=>fresh},staleEventOffer(){calls.stale++},eventTemporalFailure(){calls.failure++},window:{CTAdvanceSales:{closed:()=>ended,message:'ENCERRADO'}}};
  for(const [name,method] of [['CTEventDirections','render'],['CTEventUber','render'],['CTEventMapPreview','renderPublicDirections']])ctx.window[name]={[method](){if(fault===name)throw Error('synthetic widget failure')},clear(){if(cleanupThrows)throw Error('synthetic cleanup failure')}};
  for(const n of ['event-directions','directions-details','directions-map-preview','directions-map','directions-uber','directions-waze'])get(n);
  const res={sucesso:true,evento:{...event,id,endereco:'Rua Alterada, 42'},menorPreco:'',tipos:empty?[]:[{nome:'Synthetic ingresso',descricao:'Synthetic',lotes:[{nome:'Lote sintético',precoNumero:35,preco:'R$ 35,00'},{nome:'Outro',precoNumero:0,preco:'R$ 0,00'}]}]};
  vm.runInNewContext(code,ctx);ctx.renderCommercial(res);
  const snapshot={state:JSON.parse(JSON.stringify(ctx.state)),calls};
  for(const n of ['startingPrice','tickets','buyHero','buySide','buyMobile','buyClosing','campaignNotice','eventNotice','eventRetry']){const x=get(n);snapshot[n]={text:x.textContent,html:x.innerHTML,href:x.href,attrs:x.attrs,hidden:x.hidden,classes:[...x.classes]}}
  return {snapshot,nodes};
 }
 test(route+': existing commercial exceptions are never swallowed',()=>{for(const code of [originalCommercial,helper+commercial])assert.throws(()=>commercialFixture(code,{fault:'CTEventDirections',commercialThrows:true}),/existing commercial failure/)});
 for(const fault of ['CTEventDirections','CTEventUber','CTEventMapPreview'])for(const scenario of ['normal','empty','stale','temporal-failure','ended','cleanup-throws'])test(route+': '+fault+' failure preserves baseline commercial output / '+scenario,()=>{
  const options={fault,empty:scenario==='empty',fresh:!['stale','temporal-failure'].includes(scenario),failed:scenario==='temporal-failure',ended:scenario==='ended',cleanupThrows:scenario==='cleanup-throws'};
  const baseline=commercialFixture(originalCommercial,options),actual=commercialFixture(helper+commercial,options);assert.deepEqual(actual.snapshot,baseline.snapshot);
  for(const id of ['event-directions','directions-details','directions-map-preview','directions-map','directions-uber','directions-waze']){assert.equal(actual.nodes[id].hidden,true);assert.equal(actual.nodes[id].href,undefined)}
 });
}

for(const route of ['evento','evento-v2'])for(const component of ['CTEventDirections','CTEventUber','CTEventMapPreview'])test(route+': transient '+component+' failure retries unchanged address and restores links',()=>{
 const t=setup(),html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');
 const helper=html.slice(html.indexOf('      function refreshEventLocation(res){'),html.indexOf('      function renderCommercial(res){'));
 const updated={...event,endereco:'Rua Recuperada, 42'};t.ctx.state={data:{evento:event},eventoId:event.id};t.ctx.display=()=>{};
 t.ctx.window.CTEventMapPreview={renderPublicDirections(){},clear(){}};
 vm.runInNewContext(helper,t.ctx);t.render();
 const module=t.ctx.window[component],method=component==='CTEventMapPreview'?'renderPublicDirections':'render',original=module[method];
 t.ctx.window[component]={...module,[method](){throw Error('transient failure')}};t.ctx.refreshEventLocation({evento:updated});
 assert.equal(t.ctx.refreshEventLocation.failed,true);assert.equal(t.node('map').hidden,true);assert.equal(t.node('map').href,undefined);
 // Commercial state advances even after an optional location error.
 t.ctx.state.data={evento:updated};t.ctx.window[component]=module;t.ctx.refreshEventLocation({evento:updated});
 assert.equal(t.ctx.refreshEventLocation.failed,false);assert.equal(t.node('map').hidden,false);assert.equal(t.node('details').hidden,false);
 assert.equal(new URL(t.node('map').href).searchParams.get('destination'),t.d.resolve(updated).destination);
 assert.equal(t.node('uber').hidden,false);assert.equal(t.node('waze').hidden,false);
});
