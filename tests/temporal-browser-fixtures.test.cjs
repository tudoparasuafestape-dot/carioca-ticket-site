'use strict';
// Exercises fixture builders in Node VM only. Does not launch browser or execute HTML/RPC.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {temporalEnvelope,legacyNoEndTemporal,PROFILE_MS}=require('./fixtures/public-temporal-envelope.cjs');
const Clock=require('../assets/public-catalog-clock.js');
const NOW=Date.UTC(2030,0,1,12),plain=value=>JSON.parse(JSON.stringify(value));
for(const profile of ['home','detail','checkout'])test('positive browser fixture uses exact '+profile+' exclusive profile',()=>{
 let now=0;const lease=Clock.create({now:()=>now,maxAgeMs:PROFILE_MS[profile],schedule:()=>1,cancel:()=>{}});
 const value=temporalEnvelope(profile,NOW);assert.equal(lease.accept(value,lease.begin()),true);
 now=PROFILE_MS[profile]-1;assert.equal(lease.isFresh(),true);now++;assert.equal(lease.isFresh(),false);lease.dispose();
});
test('fixture builder rejects missing instant and unknown profile instead of repairing',()=>{assert.throws(()=>temporalEnvelope('home'));assert.throws(()=>temporalEnvelope('unknown',NOW));});
test('home demonstration fixtures have explicit legacy-without-end data',()=>{
 const {events}=require('./fixtures/home-stage1.cjs');assert.equal(events.length,2);
 for(const row of events)assert.deepEqual(row.temporal,legacyNoEndTemporal());
});
async function catalogResponse(options={},now=NOW){
 let handler,fulfilled;const context={},page={on(){},context:()=>context,goto:async()=>{},evaluate:async()=>now};
 const source=fs.readFileSync(path.join(__dirname,'e2e/public-event-catalog.spec.js'),'utf8');
 const sandbox={URL,URLSearchParams,Date,console,__dirname:path.join(__dirname,'e2e'),require(name){
  if(name==='./helpers/branch-isolated.cjs')return{test(){},expect(actual){return{toBe:expected=>assert.equal(actual,expected),toEqual:expected=>assert.deepEqual(plain(actual),plain(expected))};},mockRoute:async(c,d,h)=>{assert.equal(c,context);handler=h;}};
  if(name==='../fixtures/public-temporal-envelope.cjs')return{temporalEnvelope,legacyNoEndTemporal};
  if(name==='node:fs'||name==='node:path')return require(name);throw Error('UNEXPECTED_REQUIRE:'+name);
 }};
 vm.createContext(sandbox);vm.runInContext(source+'\nglobalThis.build=fixture;globalThis.positiveRows=rows;',sandbox,{timeout:1000});
 await sandbox.build(page,options);
 const fields=new URLSearchParams({metodo:'ctEventosPublicosListarPROD',argsJson:'[]',ctMinhaCariocaAction:'publicRpc',ctMinhaCariocaRequestId:'SYNTHETIC'});
 await handler({request:()=>({url:()=> 'https://script.google.com/synthetic-not-requested',postData:()=>fields.toString(),method:()=> 'POST'}),fulfill:async value=>{fulfilled=value;},abort:()=>{throw Error('unexpected abort');}});
 const decoded=fulfilled.body.replace(/&quot;/g,'"').replace(/&amp;/g,'&');
 return JSON.parse(decoded.match(/postMessage\((.*), "\*"\)/)[1]).resultado;
}
test('catalog browser default envelope is generated at each controlled response instant',async()=>{
 for(const now of [NOW,NOW+600000]){const response=await catalogResponse({},now);assert.equal(Date.parse(response.serverNow),now);assert.equal(Date.parse(response.validUntil),now+300000);assert.equal(response.eventos.length,4);for(const event of response.eventos)assert.deepEqual(event.temporal,legacyNoEndTemporal());}
});
test('catalog malformed row remains malformed and is not fabricated by root fixture',async()=>{
 const response=await catalogResponse({result:(attempt,now)=>({sucesso:true,...temporalEnvelope('home',now),eventos:[{nome:'Missing identifier'}]})});assert.equal(response.eligibilityContract,Clock.eligibilityContract);assert.deepEqual(response.eventos,[{nome:'Missing identifier'}]);
});
test('catalog explicit missing temporal contract is not auto-repaired',async()=>{
 const original={sucesso:true,eventos:[]};assert.deepEqual(await catalogResponse({result:original}),original);
});
test('catalog explicit incompatible contract is not auto-repaired',async()=>{
 const original={sucesso:true,eventos:[],...temporalEnvelope('home',NOW),eligibilityContract:'CT_PUBLIC_ELIGIBILITY_INCLUSIVE_V0'};assert.deepEqual(await catalogResponse({result:original}),original);
});
test('catalog API-negative payload is not auto-repaired',async()=>{assert.deepEqual(await catalogResponse({result:{sucesso:false}}),{sucesso:false});});
