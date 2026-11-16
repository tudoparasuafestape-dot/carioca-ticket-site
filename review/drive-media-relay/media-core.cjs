'use strict';
const {createHash}=require('node:crypto');
const MAX_BYTES=2065000;
class MediaError extends Error { constructor(code,status=503){super(code);this.status=status;} }
function recordKey(r,id,now){
 if(!r||r.assetId!==id||r.sha256!==id||r.state!=='READY'||r.publicRelease!==true||r.eventPublic!==true||r.revoked===true)throw new MediaError('NOT_PUBLIC',404);
 if(!/^[a-f0-9]{64}$/.test(r.revision)||!['image/png','image/jpeg'].includes(r.mime)||!Number.isSafeInteger(r.bytes)||r.bytes<8||r.bytes>MAX_BYTES||!Number.isFinite(r.approvalExpiresAt)||r.approvalExpiresAt<=now)throw new MediaError('INVALID_RECORD',404);
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(r.fileId)||!/^[A-Za-z0-9_-]{10,200}$/.test(r.folderId)||!['drive-oauth','public-fixture'].includes(r.sourceKind)||r.validation!=='FULL_DECODE_PASSED'||!['ORIGINAL_METADATA_REVIEWED','SANITIZED_DERIVATIVE'].includes(r.metadataPolicy))throw new MediaError('INVALID_RECORD',404);
 return JSON.stringify([id,r.revision,r.fileId,r.folderId,r.sourceKind,r.mime,r.bytes,r.metadataPolicy,r.approvalExpiresAt]);
}
function createMediaService({registry,source,now=Date.now,maxCacheBytes=16*1024*1024,cacheTtlMs=60000,maxRequestsPerMinute=60,maxConcurrent=2,requestTimeoutMs=5000}={}){
 if(!registry||typeof registry.resolvePublicAsset!=='function'||!source||typeof source.read!=='function')throw new MediaError('PROVIDERS_MISSING');
 // Hard upper bounds cannot be relaxed by caller mistakes.
 if(!Number.isSafeInteger(maxCacheBytes)||maxCacheBytes<0||maxCacheBytes>16*1024*1024||!Number.isFinite(cacheTtlMs)||cacheTtlMs<0||cacheTtlMs>60000||!Number.isSafeInteger(maxRequestsPerMinute)||maxRequestsPerMinute<1||maxRequestsPerMinute>60||!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>2||!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<1||requestTimeoutMs>5000)throw new MediaError('INVALID_LIMITS');
 const cache=new Map();let cacheBytes=0,active=0,windowStart=now(),requests=0;
 function purge(id){for(const [key,item]of cache){if(item.id===id){cacheBytes-=item.bytes.length;cache.delete(key);}}}
 function cachePut(key,id,bytes){
  if(bytes.length>maxCacheBytes)return;
  if(cache.has(key)){cacheBytes-=cache.get(key).bytes.length;cache.delete(key);}
  while(cacheBytes+bytes.length>maxCacheBytes&&cache.size){const first=cache.keys().next().value;cacheBytes-=cache.get(first).bytes.length;cache.delete(first);}
  cache.set(key,{id,bytes:Buffer.from(bytes),until:now()+cacheTtlMs});cacheBytes+=bytes.length;
 }
 async function get(id){
  if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw new MediaError('INVALID_ID',404);
  if(now()-windowStart>=60000){requests=0;windowStart=now();}
  if(++requests>maxRequestsPerMinute||active>=maxConcurrent)throw new MediaError('RATE_LIMIT',429);
  active++;const controller=new AbortController(),signal=controller.signal;
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();purge(id);reject(new MediaError('MEDIA_DEADLINE',503));},requestTimeoutMs);});
  // Keep the slot until actual provider work settles, even after caller timeout.
  // Non-cooperative providers can exhaust these bounded slots, never spawn more.
  const work=(async()=>{try{
   const first=await registry.resolvePublicAsset(id,{signal});signal.throwIfAborted();
   const key=recordKey(first,id,now());
   let item=cache.get(key),bytes;
   if(item&&item.until>now()){bytes=Buffer.from(item.bytes);}else{
    if(item){cacheBytes-=item.bytes.length;cache.delete(key);}
    const result=await source.read(Object.freeze({...first}),{signal});signal.throwIfAborted();
    if(!result||result.mime!==first.mime||!Buffer.isBuffer(result.bytes)||result.bytes.length!==first.bytes||result.bytes.length>MAX_BYTES)throw new MediaError('SOURCE_MISMATCH',502);
    bytes=Buffer.from(result.bytes);
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if((first.mime==='image/png'?!png:!jpeg)||createHash('sha256').update(bytes).digest('hex')!==id)throw new MediaError('SOURCE_MISMATCH',502);
   }
   // Recheck publication/revocation after download AND on cache hits. Never serve
   // stale media on registry failure. Revision must still authorize these bytes.
   const latest=await registry.resolvePublicAsset(id,{signal});signal.throwIfAborted();
   if(recordKey(latest,id,now())!==key)throw new MediaError('RECORD_CHANGED',404);
   if(!item||item.until<=now())cachePut(key,id,bytes);
   return {mime:first.mime,bytes:Buffer.from(bytes),sha256:id};
  }catch(error){purge(id);if(error instanceof MediaError)throw error;throw new MediaError('MEDIA_UNAVAILABLE');}
  finally{active--;}})();
  try{return await Promise.race([work,deadline]);}finally{clearTimeout(timer);}
 }
 return {get,inFlight:()=>active,cacheStats:()=>({entries:cache.size,bytes:cacheBytes})};
}
module.exports={createMediaService,MediaError,MAX_BYTES,recordKey};
