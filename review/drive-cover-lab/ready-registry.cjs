'use strict';
// Server composition only. No RPC, writes, permissions changes or URL probing.
function createReadyRegistry({Drive,SpreadsheetApp,config}) {
 if(!config||!/^[\w-]{10,200}$/.test(config.spreadsheetId)||!/^[\w-]{10,200}$/.test(config.folderId)||config.sheetName!=='CT_COVER_INTAKE_V1')throw Error('REGISTRY_CONFIG');
 function snapshot(eventId,producerId,assetId){
  if(!/^EVT-[A-Z0-9-]{1,216}$/.test(eventId)||!/^PROD-[A-Z0-9-]{1,180}$/.test(producerId))throw Error('REGISTRY_SCOPE');
  const f=Drive.Files.get(config.spreadsheetId,{fields:'id,mimeType,trashed,permissions(type,role)'});
  if(!f||f.id!==config.spreadsheetId||f.trashed||f.mimeType!=='application/vnd.google-apps.spreadsheet'||!Array.isArray(f.permissions)||f.permissions.length!==1||f.permissions[0].type!=='user'||f.permissions[0].role!=='owner')throw Error('REGISTRY_NOT_PRIVATE');
  const s=SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(config.sheetName);
  if(!s||s.getLastRow()<1||s.getLastRow()>10001||JSON.stringify(s.getRange(1,1,1,2).getValues()[0])!==JSON.stringify(['key','record']))throw Error('REGISTRY_SCHEMA');
  const raw=s.getLastRow()===1?[]:s.getRange(2,1,s.getLastRow()-1,2).getValues(),out=[],seen=new Set();
  for(const [key,json] of raw){
   if(typeof json!=='string'||json.length>8000)throw Error('REGISTRY_INVALID');
   let r;try{r=JSON.parse(json);}catch{throw Error('REGISTRY_INVALID');}
   if(!r||typeof r!=='object'||Array.isArray(r)||!/^[a-f0-9]{64}$/.test(key)||r.assetId!=='drive-'+key)throw Error('REGISTRY_INVALID');
   if(seen.has(key))throw Error('REGISTRY_DUPLICATE');seen.add(key);
   if(r.eventId!==eventId||r.producerId!==producerId||(assetId&&r.assetId!==assetId))continue;
   if(r.state!=='READY')continue;
   if(r.folderId!==config.folderId||!/^[\w-]{10,200}$/.test(r.fileId)||!['image/png','image/jpeg'].includes(r.mime)||!Number.isSafeInteger(r.bytes)||r.bytes<1||r.bytes>2065000||!/^[a-f0-9]{64}$/.test(r.sha256)||r.validation!=='FULL_DECODE_PASSED'||typeof r.reviewerId!=='string'||!r.reviewerId||r.metadataPolicy!=='ORIGINAL_METADATA_REVIEWED'||!Number.isFinite(r.promotedAt)||typeof r.url!=='string')throw Error('REGISTRY_READY_INVALID');
   const match=/^https:\/\/(drive\.google\.com|drive\.usercontent\.google\.com)\/(uc|download)\?([^#]+)$/.exec(r.url);
   const expected=['export=download','id='+r.fileId].sort().join('&');
   if(r.url.length>600||!match||match[1]==='drive.google.com'&&match[2]!=='uc'||match[3].split('&').sort().join('&')!==expected)throw Error('REGISTRY_DELIVERY_URL');
   out.push({record:r,version:json});
  }
  if(out.length>100)throw Error('REGISTRY_LIMIT');
  return out;
 }
 return {
  // Must be called only after existing portal authorization. Not an endpoint.
  list(eventId,producerId){return snapshot(eventId,producerId).map(({record:r})=>({eventId:r.eventId,producerId:r.producerId,assetId:r.assetId,name:typeof r.name==='string'&&r.name.trim()?r.name:r.assetId,url:r.url,sha256:r.sha256,mime:r.mime,bytes:r.bytes,state:'READY'}));},
  // Internal server-only. Never serialize this full record to the browser.
  lookup(eventId,producerId,assetId){const rows=snapshot(eventId,producerId,assetId);if(rows.length!==1)throw Error('ASSET_NOT_READY');return rows[0];}
 };
}
// Invoke synchronously INSIDE the existing writer's shared ScriptLock. This
// guard does not acquire/release locks and deliberately has no Drive dependency.
// The revalidator performed ACL checks outside the lock. Do not expose as RPC.
function createRegistryVersionGuard({SpreadsheetApp,Utilities,config}) {
 if(!config||!/^[\w-]{10,200}$/.test(config.spreadsheetId)||config.sheetName!=='CT_COVER_INTAKE_V1')throw Error('REGISTRY_CONFIG');
 return function guardRegistryVersion(selection,proof){
  const now=Date.now();
  if(!selection||!selection.asset||!proof||proof.valid!==true||proof.source!=='DRIVE_READY'||!Number.isFinite(proof.checkedAt)||proof.checkedAt>now||now-proof.checkedAt>30000||proof.eventId!==selection.eventId||proof.producerId!==selection.producerId||proof.assetId!==selection.asset.assetId||proof.sha256!==selection.asset.sha256||proof.url!==selection.asset.url||!/^[a-f0-9]{64}$/.test(proof.registryVersion))throw Error('REGISTRY_GUARD_PROOF');
  const sheet=SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(config.sheetName);
  if(!sheet||sheet.getLastRow()<1||sheet.getLastRow()>10001||JSON.stringify(sheet.getRange(1,1,1,2).getValues()[0])!==JSON.stringify(['key','record']))throw Error('REGISTRY_SCHEMA');
  const rows=sheet.getLastRow()===1?[]:sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues();
  const seen=new Set(),matches=[];
  for(const [key,json] of rows){
   if(typeof json!=='string'||json.length>8000)throw Error('REGISTRY_INVALID');
   let record;try{record=JSON.parse(json);}catch{throw Error('REGISTRY_INVALID');}
   if(!record||typeof record!=='object'||Array.isArray(record)||!/^[a-f0-9]{64}$/.test(key)||record.assetId!=='drive-'+key)throw Error('REGISTRY_INVALID');
   if(seen.has(key))throw Error('REGISTRY_DUPLICATE');seen.add(key);
   if(record.assetId===selection.asset.assetId&&record.eventId===selection.eventId&&record.producerId===selection.producerId)matches.push({record,json});
  }
  if(matches.length!==1||matches[0].record.state!=='READY')throw Error('REGISTRY_GUARD_REVOKED');
  const match=matches[0];
  const version=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.newBlob(match.json).getBytes()).map(n=>(n&255).toString(16).padStart(2,'0')).join('');
  if(version!==proof.registryVersion||match.record.sha256!==proof.sha256||match.record.url!==proof.url)throw Error('REGISTRY_GUARD_CHANGED');
  return true;
 };
}
module.exports={createReadyRegistry,createRegistryVersionGuard};
