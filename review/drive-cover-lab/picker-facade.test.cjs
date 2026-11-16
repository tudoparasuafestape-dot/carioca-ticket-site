const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createPickerFacade,createVisualWriter}=require('./picker-facade.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function fixture(opts={}){
 const store={},writes=[],selection={eventId:'EVT-A',producerId:'PROD-A',userId:'U',asset:{assetId:'a',name:'Capa A',url:'https://example.invalid/a.png',sha256:'a'.repeat(64)},expectedVersion:hash('AUSENTE'),motivo:'nova capa'};
 const readVisual=async id=>{const raw=store['VIS_'+id]??null,visual=raw?JSON.parse(raw):{};return {key:'VIS_'+id,raw,visual,version:hash(raw===null?'AUSENTE':'PRESENTE\n'+raw)};};
 const authorize=async()=>({authorized:!opts.denied,eventId:'EVT-A',producerId:'PROD-A',userId:'U'});
 const commitSelection=createVisualWriter({authorize,prefix:'VIS_',readVisual,invalidateCache:()=>true,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,s)=>[...crypto.createHash(a).update(s).digest()],newBlob:s=>({getBytes:()=>Buffer.from(s)}),getUuid:()=>String(writes.length)},PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]??null,setProperty:(k,v)=>{writes.push(k);if(opts.auditFail&&k.startsWith('CT_CAPA_AUDIT_'))throw Error('AUDIT_FAIL');store[k]=v;}})}});
 let probes=0;
 const api=createPickerFacade({core:{list:async()=>({assets:[selection.asset]}),resolveSelection:async()=>selection},readVisual,readEvent:async()=>({id:'EVT-A',nome:'Evento A'}),commitSelection,revalidateAsset:async()=>{probes++;return {valid:true,assetId:'a',sha256:selection.asset.sha256,url:selection.asset.url,eventId:'EVT-A',producerId:'PROD-A',approvalCurrent:true,aclCurrent:true,checkedAt:Date.now(),...opts.proof};}});
 return {api,selection,store,writes,get probes(){return probes;}};
}
test('picker list returns legacy envelope and selected identity',async()=>{const x=fixture();const r=await x.api.list('t','EVT-A');assert.equal(r.ok,true);assert.equal(r.currentAssetId,'');assert.equal(r.eventName,'Evento A');assert.equal(r.version,x.selection.expectedVersion);assert.equal(r.assets[0].name,'Capa A');});
test('save revalidates and writes only two visual fields plus audit',async()=>{const x=fixture();x.store['VIS_EVT-A']=JSON.stringify({title:'keep',unknown:{x:1}});x.selection.expectedVersion=hash('PRESENTE\n'+x.store['VIS_EVT-A']);assert.equal((await x.api.save('t',{})).ok,true);assert.equal(x.probes,1);assert.deepEqual(JSON.parse(x.store['VIS_EVT-A']),{title:'keep',unknown:{x:1},capaUrl:x.selection.asset.url,posterUrl:x.selection.asset.url});assert.ok(x.writes[0].startsWith('CT_CAPA_AUDIT_'));});
test('stale public proof cannot write',async()=>{const x=fixture({proof:{checkedAt:Date.now()-31000}});await assert.rejects(x.api.save('t',{}),/CT_CAPA_IMAGEM_DIVERGENTE/);assert.equal(x.writes.length,0);});
test('revoked approval or private ACL cannot write',async()=>{for(const proof of [{approvalCurrent:false},{aclCurrent:false},{sha256:'b'.repeat(64)}]){const x=fixture({proof});await assert.rejects(x.api.save('t',{}),/CT_CAPA_IMAGEM_DIVERGENTE/);assert.equal(x.writes.length,0);}});
test('reauthorization under writer lock can deny',async()=>{const x=fixture({denied:true});await assert.rejects(x.api.save('t',{}),/CT_CAPA_ACESSO_NEGADO/);assert.equal(x.writes.length,0);});
test('stale version fails before network revalidation',async()=>{const x=fixture();x.selection.expectedVersion='0'.repeat(64);await assert.rejects(x.api.save('t',{}),/CT_CAPA_CONFLITO/);assert.equal(x.probes,0);});
test('audit failure prevents visual mutation',async()=>{const x=fixture({auditFail:true});await assert.rejects(x.api.save('t',{}),/CT_CAPA_FALHA_SEGURA/);assert.equal(x.store['VIS_EVT-A'],undefined);});

test('legacy nested visual selects saved cover after reopening',async()=>{const x=fixture();await x.api.save('t',{});const r=await x.api.list('t','EVT-A');assert.equal(r.currentAssetId,'a');});
