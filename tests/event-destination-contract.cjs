const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const registry=fs.readFileSync('assets/event-ride-destinations.js','utf8');
const context={window:{addEventListener(){}},document:{addEventListener(){}}};
vm.runInNewContext(registry,context);vm.runInNewContext(fs.readFileSync('assets/event-uber.js','utf8'),context);
const api=context.window.CTEventUber;
const sambaId=Object.keys(context.window.CTEventRideDestinations)[0],legacy=context.window.CTEventRideDestinations[sambaId];
const samba={id:sambaId,...Object.fromEntries(['local','endereco','cidade','uf'].map(k=>[k,legacy[k]]))};
assert(api.buildUrl(samba,sambaId));
assert.equal(api.buildUrl({...samba,destinoTransporte:null},sambaId),'');
for(const [id,latitude,longitude] of [['TEST-A',-8,-35],['TEST-B',-7,-34]]){
 const location={local:'Local '+id,endereco:'Rua 12, 55 - Bairro',cidade:'Cidade',uf:'PE'};
 const destination={version:1,eventId:id,revision:1,confirmed:true,latitude,longitude,location};
 const event={id,...location,destinoTransporte:destination};
 let u=new URL(api.buildUrl(event,id));assert.equal(JSON.parse(u.searchParams.get('drop[0]')).latitude,latitude);
 for(const patch of [{version:2},{revision:0},{confirmed:false},{eventId:'OTHER'},{latitude:NaN},{latitude:'-8'},{latitude:91},{longitude:181}])assert.equal(api.buildUrl({...event,destinoTransporte:{...destination,...patch}},id),'');
 assert.equal(api.buildUrl({...event,endereco:'Outro endereço'},id),'');assert.equal(api.buildUrl(event,'OTHER'),'');
}
console.log('PASS: actual candidate Uber consumer supports arbitrary confirmed event IDs, keeps legacy absence fallback, rejects explicit revocation and invalid/mismatched payloads');
