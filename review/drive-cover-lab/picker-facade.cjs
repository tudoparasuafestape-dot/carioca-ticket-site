'use strict';
// Server composition only; not exported as an Apps Script RPC.
function createPickerFacade({core,readVisual,readEvent,revalidateAsset,commitSelection}){
 function current(v){if(!v||!v.visual||Array.isArray(v.visual)||!/^[a-f0-9]{64}$/.test(v.version))throw Error('INVALID_VISUAL');return v;}
 function boundary(fn){return async function(...args){try{return await fn(...args);}catch(error){
  const code=String(error.message||'');
  const map={ACCESS_DENIED:'ACESSO_NEGADO',CONFLICT:'CONFLITO',INVALID_SELECTION:'ARGUMENTOS_INVALIDOS',INVALID_REQUEST:'ARGUMENTOS_INVALIDOS',SAVE_REVALIDATION_REQUIRED:'IMAGEM_DIVERGENTE',AUDIT_UNCONFIRMED:'AUDITORIA_NAO_CONFIRMADA',WRITE_UNCERTAIN_READ_REQUIRED:'GRAVACAO_INCERTA_CONSULTE',VISUAL_LIMIT:'LIMITE_VISUAL'};
  if(code.startsWith('CT_CAPA_'))throw error;
  throw Error('CT_CAPA_'+(map[code]||'FALHA_SEGURA'));
 }};}
 return {
  list:boundary(async function(token,eventId){
   const result=await core.list(token,eventId); // Authorization precedes reads.
   const v=current(await readVisual(eventId)),event=await readEvent(eventId);
   if(!event||event.id!==eventId)throw Error('INVALID_EVENT');
   const selected=result.assets.filter(a=>a.url===v.visual.capaUrl&&a.url===v.visual.posterUrl);
   return {ok:true,eventId,eventName:String(event.nome||''),version:v.version,currentAssetId:selected.length===1?selected[0].assetId:'',assets:result.assets};
  }),
  save:boundary(async function(token,input){
   const selection=await core.resolveSelection(token,input);
   if(current(await readVisual(selection.eventId)).version!==selection.expectedVersion)throw Error('CONFLICT');
   if(typeof revalidateAsset!=='function'||typeof commitSelection!=='function')throw Error('SAVE_NOT_CONFIGURED');
   // Required even for previously READY records. Adapter fetches current bytes,
   // ACL and approval/revocation; saved checkedAt or client proof is insufficient.
   const proof=await revalidateAsset(selection);
   function checkProof(){
    if(!proof||proof.valid!==true||!['DRIVE_READY','APPROVED_STATIC_LEGACY'].includes(proof.source)||proof.assetId!==selection.asset.assetId||proof.sha256!==selection.asset.sha256||proof.url!==selection.asset.url||proof.eventId!==selection.eventId||proof.producerId!==selection.producerId||proof.approvalCurrent!==true||proof.aclCurrent!==true||!Number.isFinite(proof.checkedAt)||proof.checkedAt>Date.now()||Date.now()-proof.checkedAt>30000)throw Error('SAVE_REVALIDATION_REQUIRED');
   }
   checkProof();
   // Real writer below reauthorizes, checks proof freshness and CAS under lock.
   return await commitSelection(token,selection,checkProof,proof);
  })
 };
}
function createVisualWriter({authorize,PropertiesService,LockService,Utilities,prefix,readVisual,invalidateCache,assertRegistryVersion}){
 if(typeof prefix!=='string'||!prefix)throw Error('PREFIX_REQUIRED');
 function hash(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(x=>(x&255).toString(16).padStart(2,'0')).join('');}
 return async function commit(token,s,checkProof,proof){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
   const c=await authorize(token,s.eventId);
   if(!c||c.authorized!==true||c.userId!==s.userId||c.producerId!==s.producerId||c.eventId!==s.eventId)throw Error('ACCESS_DENIED');
   checkProof();
   if(proof.source==='DRIVE_READY'&&(typeof assertRegistryVersion!=='function'||await assertRegistryVersion(s,proof)!==true))throw Error('CONFLICT');
   const before=await readVisual(s.eventId);
   if(!before||before.key!==prefix+s.eventId||before.version!==s.expectedVersion||!before.visual||Array.isArray(before.visual))throw Error('CONFLICT');
   if(before.visual.capaUrl===s.asset.url&&before.visual.posterUrl===s.asset.url)return {ok:true,eventId:s.eventId,version:before.version,assetId:s.asset.assetId,unchanged:true};
   const visual={...before.visual,capaUrl:s.asset.url,posterUrl:s.asset.url},raw=JSON.stringify(visual);
   if(Utilities.newBlob(raw).getBytes().length>9000)throw Error('VISUAL_LIMIT');
   const props=PropertiesService.getScriptProperties(),auditKey='CT_CAPA_AUDIT_'+Utilities.getUuid();
   const audit={eventId:s.eventId,producerId:s.producerId,usuarioId:s.userId,motivo:s.motivo,assetId:s.asset.assetId,assetSha256:s.asset.sha256,beforeVersion:before.version,beforeCapaUrl:before.visual.capaUrl||'',beforePosterUrl:before.visual.posterUrl||'',afterVersion:hash('PRESENTE\n'+raw),createdAt:new Date().toISOString(),state:'PREPARED'};
   const intent=JSON.stringify(audit);props.setProperty(auditKey,intent);
   if(props.getProperty(auditKey)!==intent)throw Error('AUDIT_UNCONFIRMED');
   if((await readVisual(s.eventId)).version!==before.version)throw Error('CONFLICT');
   checkProof();
   if(proof.source==='DRIVE_READY'&&await assertRegistryVersion(s,proof)!==true)throw Error('CONFLICT');
   try{props.setProperty(before.key,raw);}catch{if(props.getProperty(before.key)!==raw)throw Error('WRITE_UNCERTAIN_READ_REQUIRED');}
   const after=await readVisual(s.eventId);
   if(after.raw!==raw)throw Error('WRITE_UNCERTAIN_READ_REQUIRED');
   try{props.setProperty(auditKey,JSON.stringify({...audit,state:'CONFIRMED'}));}catch{}
   let cacheInvalidated=false;try{cacheInvalidated=await invalidateCache(s.eventId);}catch{}
   return {ok:true,eventId:s.eventId,version:after.version,assetId:s.asset.assetId,cacheInvalidated:cacheInvalidated===true};
  }finally{lock.releaseLock();}
 };
}
module.exports={createPickerFacade,createVisualWriter};
