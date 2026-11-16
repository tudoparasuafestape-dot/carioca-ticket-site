'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createAppsScriptIntake}=require('./apps-script-adapters.cjs');
function setup(opts={}){
 const data=[['key','record']],calls=[],config={folderId:'private_folder_123',spreadsheetId:'registry_sheet_123',sheetName:'CT_COVER_INTAKE_V1'};
 const sheet={getLastRow:()=>data.length,getRange:(row,col,n)=>({getValues:()=>data.slice(row-1,row-1+n),setValues:values=>{calls.push('write');for(let i=0;i<values.length;i++)data[row-1+i]=values[i];}})};
 const owner=[{type:'user',role:'owner'}];
 const Drive={Files:{get:()=>{calls.push('folder');return {id:config.folderId,mimeType:'application/vnd.google-apps.folder',permissions:opts.public?[{type:'anyone',role:'reader'}]:owner};},create:(meta,blob)=>{calls.push('create');if(opts.timeout)throw Error('TIMEOUT');return {...meta,id:'new_file_id',size:blob.getBytes().length,permissions:owner};}}};
 const Utilities={DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,b)=>[...crypto.createHash(a).update(Buffer.from(b)).digest()],newBlob:(v)=>({getBytes:()=>[...Buffer.from(v)]}),base64Decode:v=>[...Buffer.from(v,'base64')]};
 const api=createAppsScriptIntake({Drive,Utilities,config,SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>calls.push('flush')},LockService:{getScriptLock:()=>({waitLock:()=>calls.push('lock'),releaseLock:()=>calls.push('release')})},authorize:async(t,eventId)=>{calls.push('auth');return opts.denied?null:{authorized:true,eventId,userId:'user',producerId:'producer'};}});
 const input={eventId:'EVT-NEW',requestId:'a'.repeat(32),mime:'image/png',base64:Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64')};
 return {api,input,data,calls};
}
test('real API-shaped adapters reserve, upload private, persist/read back quarantine',async()=>{const x=setup();const r=await x.api.upload('token',x.input);assert.equal(r.state,'QUARANTINED');assert.deepEqual(x.calls,['auth','lock','auth','folder','write','flush','create','write','flush','release']);const row=JSON.parse(x.data[1][1]);assert.equal(row.fileId,'new_file_id');assert.equal(row.url,undefined);});
test('same request is idempotent and no second file is created',async()=>{const x=setup();const a=await x.api.upload('t',x.input);assert.deepEqual(await x.api.upload('t',x.input),a);assert.equal(x.calls.filter(v=>v==='create').length,1);});
test('uncertain creation is never repeated',async()=>{const x=setup({timeout:true});await assert.rejects(x.api.upload('t',x.input),/TIMEOUT/);await assert.rejects(x.api.upload('t',x.input),/UNCERTAIN/);assert.equal(x.calls.filter(v=>v==='create').length,1);assert.equal(JSON.parse(x.data[1][1]).state,'RESERVED');});
test('public/shared folder is refused with no upload or reservation',async()=>{const x=setup({public:true});await assert.rejects(x.api.upload('t',x.input),/OWNER_ONLY/);assert.equal(x.data.length,1);assert.ok(!x.calls.includes('create'));});
test('auth denied before Drive/Sheets/lock',async()=>{const x=setup({denied:true});await assert.rejects(x.api.upload('t',x.input),/ACCESS_DENIED/);assert.deepEqual(x.calls,['auth']);});
test('rejects client destination, URL and producer',async()=>{for(const key of ['folderId','url','producerId']){const x=setup();await assert.rejects(x.api.upload('t',{...x.input,[key]:'evil'}),/INVALID_REQUEST/);assert.deepEqual(x.calls,[]);}});
test('same id with different bytes conflicts',async()=>{const x=setup();await x.api.upload('t',x.input);const b=Buffer.from(x.input.base64,'base64');b[8]=2;await assert.rejects(x.api.upload('t',{...x.input,base64:b.toString('base64')}),/IDEMPOTENCY_CONFLICT/);});
test('signature and size rejected before storage',async()=>{const x=setup();await assert.rejects(x.api.upload('t',{...x.input,base64:Buffer.from('notimagecontent').toString('base64')}),/SIGNATURE/);assert.ok(!x.calls.includes('lock'));});
test('duplicate registry key fails closed',async()=>{const x=setup();await x.api.upload('t',x.input);x.data.push(x.data[1]);await assert.rejects(x.api.upload('t',x.input),/DUPLICATE/);});
