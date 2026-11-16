'use strict';
const {createReadyRegistry}=require('./ready-registry.cjs');
// Every argument other than selection comes from trusted server composition.
function createSaveRevalidator({Drive,SpreadsheetApp,UrlFetchApp,Utilities,config,legacy=[]}) {
 const registry=createReadyRegistry({Drive,SpreadsheetApp,config});
 const approvedLegacy=JSON.parse(JSON.stringify(legacy));
 const fields='id,mimeType,size,sha256Checksum,parents,trashed,permissions(type,role,allowFileDiscovery),webContentLink,thumbnailLink';
 function digest(bytes){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(n=>(n&255).toString(16).padStart(2,'0')).join('');}
 function driveUrl(url,id){
  if(typeof url!=='string'||url.length>600)return false;
  const m=/^https:\/\/(drive\.google\.com|drive\.usercontent\.google\.com)\/(uc|download)\?([^#]+)$/.exec(url);
  if(!m||m[1]==='drive.google.com'&&m[2]!=='uc')return false;
  const parts=m[3].split('&');if(parts.length!==2)return false;
  const kv={};for(const p of parts){const pair=p.split('=');if(pair.length!==2||!['id','export'].includes(pair[0])||Object.prototype.hasOwnProperty.call(kv,pair[0]))return false;kv[pair[0]]=pair[1];}
  return kv.id===id&&kv.export==='download';
 }
 function metadata(r){
  const f=Drive.Files.get(r.fileId,{fields});
  if(!f||f.trashed||f.id!==r.fileId||f.mimeType!==r.mime||Number(f.size)!==r.bytes||f.sha256Checksum!==r.sha256||!Array.isArray(f.parents)||!f.parents.includes(r.folderId)||!Array.isArray(f.permissions)||!f.permissions.some(p=>p.type==='anyone'&&p.role==='reader'&&p.allowFileDiscovery===false)||f.permissions.some(p=>p.type==='anyone'&&p.role!=='reader')||!driveUrl(f.webContentLink,r.fileId)||r.url===f.thumbnailLink||!driveUrl(r.url,r.fileId))throw Error('SAVE_METADATA_OR_ACL');
  return f;
 }
 function fetchBytes(r,isLegacy){
  let url=r.url;
  for(let redirects=0;redirects<=3;redirects++){
   const response=UrlFetchApp.fetch(url,{method:'get',followRedirects:false,muteHttpExceptions:true,validateHttpsCertificates:true,headers:{Accept:r.mime}});
   const h={};for(const [k,v] of Object.entries(response.getAllHeaders()))h[k.toLowerCase()]=String(v);
   const status=response.getResponseCode();
   if([301,302,303,307,308].includes(status)){
    if(isLegacy||redirects===3||!driveUrl(h.location,r.fileId))throw Error('SAVE_REDIRECT');
    url=h.location;continue;
   }
   if(status!==200||String(h['content-type']||'').split(';')[0].trim().toLowerCase()!==r.mime||h['content-length']!==undefined&&(!/^\d+$/.test(h['content-length'])||Number(h['content-length'])!==r.bytes))throw Error('SAVE_PUBLIC_RESPONSE');
   const bytes=response.getContent();
   if(bytes.length!==r.bytes||digest(bytes)!==r.sha256)throw Error('SAVE_BYTES_MISMATCH');
   return;
  }
  throw Error('SAVE_REDIRECT');
 }
 return async function revalidateAsset(selection){
  const start=Date.now();
  if(!selection||!selection.asset||!selection.eventId||!selection.producerId)throw Error('SAVE_SELECTION');
  const a=selection.asset;
  const old=approvedLegacy.filter(r=>r.eventId===selection.eventId&&r.producerId===selection.producerId&&r.assetId===a.assetId);
  let r,before,isLegacy=false;
  if(old.length){
   if(old.length!==1)throw Error('SAVE_AMBIGUOUS_LEGACY');
   r={...old[0],mime:old[0].mime||'image/jpeg'};isLegacy=true;
   if(r.fileId||r.assetId.startsWith('drive-')||!/^https:\/\/cariocaticket\.com\.br\/assets\/eventos\/[a-z0-9-]+\.(jpg|png)$/.test(r.url)||!['image/jpeg','image/png'].includes(r.mime)||!Number.isSafeInteger(r.bytes)||r.bytes<1||r.bytes>10000000||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('SAVE_LEGACY_CONFIG');
   // Dynamic IDs must use drive-<hash>; legacy IDs cannot use that namespace.
   // No Drive/Sheets dependency is introduced into approved static delivery.
  }else{
   before=registry.lookup(selection.eventId,selection.producerId,a.assetId);r=before.record;
  }
  if(a.url!==r.url||a.sha256!==r.sha256)throw Error('SAVE_SELECTION_CHANGED');
  if(!isLegacy)metadata(r);
  fetchBytes(r,isLegacy);
  if(!isLegacy){
   // Detect revocation or replacement during the public fetch; Drive is also
   // checked again, because registry state alone cannot prove current ACL.
   metadata(r);
   const after=registry.lookup(selection.eventId,selection.producerId,a.assetId);
   if(after.version!==before.version)throw Error('SAVE_REGISTRY_CHANGED');
  }
  const checkedAt=Date.now();if(checkedAt-start>30000)throw Error('SAVE_CHECK_TOO_SLOW');
  return {valid:true,eventId:selection.eventId,producerId:selection.producerId,assetId:r.assetId,url:r.url,sha256:r.sha256,approvalCurrent:true,aclCurrent:true,checkedAt,expiresAt:checkedAt+30000,source:isLegacy?'APPROVED_STATIC_LEGACY':'DRIVE_READY',registryVersion:isLegacy?null:digest(Utilities.newBlob(before.version).getBytes()),sanitized:false};
 };
}
module.exports={createSaveRevalidator};
