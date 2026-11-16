'use strict';
// Review-only Apps Script V8 adapter. No top-level effects or exported RPC.
// Pass real Drive (advanced v3), SpreadsheetApp, LockService, Utilities from
// server composition. Config/auth are server-owned, never request fields.
function createAppsScriptIntake({Drive,SpreadsheetApp,LockService,Utilities,authorize,config}) {
  if(!config || !/^[\w-]{10,200}$/.test(config.folderId)||!/^[\w-]{10,200}$/.test(config.spreadsheetId)||config.sheetName!=='CT_COVER_INTAKE_V1')throw Error('CONFIG_REQUIRED');
  const fields='id,mimeType,size,sha256Checksum,parents,trashed,permissions(type,role),appProperties';
  const header=['key','record'];
  function privateFile(f,folder){
    if(!f||f.trashed||!Array.isArray(f.permissions)||f.permissions.length!==1||f.permissions[0].type!=='user'||f.permissions[0].role!=='owner')throw Error('OWNER_ONLY_REQUIRED');
    if(folder&&(f.id!==config.folderId||f.mimeType!=='application/vnd.google-apps.folder'))throw Error('FOLDER_MISMATCH');
  }
  function sheet(){
    const s=SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(config.sheetName);
    if(!s||s.getLastRow()<1||JSON.stringify(s.getRange(1,1,1,2).getValues()[0])!==JSON.stringify(header))throw Error('REGISTRY_SCHEMA');
    if(s.getLastRow()>10001)throw Error('REGISTRY_CAPACITY');
    return s;
  }
  function rows(s){return s.getLastRow()===1?[]:s.getRange(2,1,s.getLastRow()-1,2).getValues();}
  function write(s,row,key,record){
    const json=JSON.stringify(record);if(json.length>8000)throw Error('RECORD_SIZE');
    s.getRange(row,1,1,2).setValues([[key,json]]);SpreadsheetApp.flush();
    if(JSON.stringify(s.getRange(row,1,1,2).getValues()[0])!==JSON.stringify([key,json]))throw Error('REGISTRY_READBACK');
  }
  function sha(bytes){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(n=>(n&255).toString(16).padStart(2,'0')).join('');}
  async function upload(token,input){
    if(!input||Object.keys(input).some(k=>!['eventId','requestId','base64','mime'].includes(k))||typeof input.eventId!=='string'||!/^EVT-[A-Z0-9-]{1,216}$/.test(input.eventId))throw Error('INVALID_REQUEST');
    const c=await authorize(token,input.eventId);
    if(!c||c.authorized!==true||c.eventId!==input.eventId||!c.userId||!c.producerId)throw Error('ACCESS_DENIED');
    if(!/^[a-f0-9]{32}$/.test(input.requestId)||!['image/png','image/jpeg'].includes(input.mime)||typeof input.base64!=='string'||input.base64.length>2800000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))throw Error('INVALID_PAYLOAD');
    const bytes=Utilities.base64Decode(input.base64),hash=sha(bytes);
    if(bytes.length<8||bytes.length>2065000)throw Error('SIZE_LIMIT');
    const u=bytes.map(n=>n&255);
    if(input.mime==='image/png'?![137,80,78,71,13,10,26,10].every((v,i)=>u[i]===v):!(u[0]===255&&u[1]===216&&u[2]===255))throw Error('SIGNATURE_MISMATCH');
    // Signature is NOT full decode. Every upload remains quarantined.
    const key=sha(Utilities.newBlob(JSON.stringify([c.eventId,c.producerId,input.requestId])).getBytes());
    privateFile(Drive.Files.get(config.folderId,{fields}),true);
    const registryFile=Drive.Files.get(config.spreadsheetId,{fields});privateFile(registryFile,false);
    if(registryFile.id!==config.spreadsheetId||registryFile.mimeType!=='application/vnd.google-apps.spreadsheet')throw Error('REGISTRY_SCOPE');
    let s,row,r,reserved;
    const lock=LockService.getScriptLock();lock.waitLock(10000);
    try{
      const fresh=await authorize(token,input.eventId);
      if(!fresh||fresh.authorized!==true||fresh.userId!==c.userId||fresh.producerId!==c.producerId||fresh.eventId!==c.eventId)throw Error('ACCESS_DENIED');
      s=sheet();const matches=rows(s).map((r,i)=>({r,row:i+2})).filter(x=>x.r[0]===key);
      if(matches.length>1)throw Error('DUPLICATE_REGISTRY_KEY');
      if(matches.length){
        const r=JSON.parse(matches[0].r[1]);
        if(r.sha256!==hash||r.mime!==input.mime||r.eventId!==c.eventId||r.producerId!==c.producerId)throw Error('IDEMPOTENCY_CONFLICT');
        if(r.state!=='QUARANTINED')throw Error('UPLOAD_UNCERTAIN_RECONCILE_REQUIRED');
        return {assetId:r.assetId,state:r.state};
      }
      if(rows(s).filter(x=>{const r=JSON.parse(x[1]);return r.eventId===c.eventId&&r.producerId===c.producerId;}).length>=100)throw Error('EVENT_ASSET_LIMIT');
      const existing=rows(s).map(x=>JSON.parse(x[1])),now=Date.now();
      // Conservative prototype budgets include RESERVED/uncertain uploads.
      if(existing.some(x=>!Number.isSafeInteger(x.bytes)||x.bytes<1||!Number.isFinite(x.createdAt)))throw Error('REGISTRY_INVALID');
      if(existing.reduce((n,x)=>n+x.bytes,0)+bytes.length>50000000)throw Error('TOTAL_STORAGE_LIMIT');
      const producerRows=existing.filter(x=>x.producerId===c.producerId);
      if(producerRows.reduce((n,x)=>n+x.bytes,0)+bytes.length>10000000)throw Error('PRODUCER_STORAGE_LIMIT');
      if(producerRows.filter(x=>x.createdAt>now-3600000).length>=10)throw Error('PRODUCER_RATE_LIMIT');
      // No permission mutation API.

      row=s.getLastRow()+1;
      if(row>10001)throw Error('REGISTRY_CAPACITY');
      r={assetId:'drive-'+key,eventId:c.eventId,producerId:c.producerId,userId:c.userId,sha256:hash,mime:input.mime,bytes:bytes.length,createdAt:now,state:'RESERVED',folderId:config.folderId};
      reserved=JSON.stringify(r);write(s,row,key,r); // If create times out, leave RESERVED; NEVER blindly retry.
    }finally{lock.releaseLock();}
      const created=Drive.Files.create({name:r.assetId+(input.mime==='image/png'?'.png':'.jpg'),mimeType:input.mime,parents:[config.folderId],appProperties:{ctCoverIntake:key}},Utilities.newBlob(bytes,input.mime),{fields});
      if(!created||!created.id)throw Error('UPLOAD_UNCERTAIN_RECONCILE_REQUIRED');
      const f=Drive.Files.get(created.id,{fields});
      privateFile(f,false);
      if(f.id!==created.id||f.sha256Checksum!==hash||f.mimeType!==r.mime||Number(f.size)!==r.bytes||!Array.isArray(f.parents)||!f.parents.includes(config.folderId)||!f.appProperties||f.appProperties.ctCoverIntake!==key)throw Error('UPLOAD_READBACK');
    lock.waitLock(10000);
    try{
      const fresh=await authorize(token,input.eventId);
      if(!fresh||fresh.authorized!==true||fresh.userId!==c.userId||fresh.producerId!==c.producerId||fresh.eventId!==c.eventId)throw Error('ACCESS_DENIED');
      s=sheet();const current=s.getRange(row,1,1,2).getValues()[0];
      if(current[0]!==key||current[1]!==reserved)throw Error('REGISTRY_CONFLICT');
      r.fileId=f.id;r.state='QUARANTINED';write(s,row,key,r);
      return {assetId:r.assetId,state:r.state};
    }finally{lock.releaseLock();}
  }
  // Intentionally no READY/promote/share/save-event. Intake records cannot be
  // used as public registry assets until independent validation/review pipeline.
  return {upload};
}
module.exports={createAppsScriptIntake};
