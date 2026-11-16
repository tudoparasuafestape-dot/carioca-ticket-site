'use strict';
// Offline domain core; NOT a deployed endpoint. Adapters must be server-owned.
// No client-supplied URL/producerId, no credentials, no storage implementation.
function createCoverCore({authorize,registry,legacy=[]}) {
  async function context(token,eventId){
    if(typeof eventId!=='string'||!/^EVT-[A-Z0-9-]{1,216}$/.test(eventId))throw Error('INVALID_EVENT');
    const x=await authorize(token,eventId);
    if(!x||x.authorized!==true||!x.userId||!x.producerId||x.eventId!==eventId)throw Error('ACCESS_DENIED');
    return x;
  }
  function owned(a,c){return a&&a.eventId===c.eventId&&a.producerId===c.producerId;}
  function safe(a){
    if(!a||typeof a.assetId!=='string'||!/^[a-z0-9-]{1,160}$/.test(a.assetId)||!['image/png','image/jpeg'].includes(a.mime)||!Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>10000000||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('INVALID_REGISTRY_RECORD');
    // URL stays server-owned; adapter validates exact configured origin/key.
    if(typeof a.url!=='string'||!a.url.startsWith('https://'))throw Error('INVALID_REGISTRY_RECORD');
    return {assetId:a.assetId,name:a.name,url:a.url,sha256:a.sha256};
  }
  async function ready(c){
    const rows=await registry.list(c.eventId,c.producerId);
    if(!Array.isArray(rows)||rows.length>100)throw Error('REGISTRY_LIMIT');
    const out=[],seen=new Set();
    for(const a of [...legacy,...rows]){
      if(!owned(a,c)||a.state!=='READY')continue;
      const value=safe(a);
      if(seen.has(a.assetId))throw Error('AMBIGUOUS_ASSET');
      seen.add(a.assetId);out.push(value);
    }
    return out;
  }
  return {
    async list(token,eventId){const c=await context(token,eventId);return {eventId,assets:await ready(c)};},
    async resolveSelection(token,data){
      if(!data||Object.keys(data).some(k=>!['eventId','assetId','expectedVersion','motivo'].includes(k))||!/^[a-f0-9]{64}$/.test(data.expectedVersion)||typeof data.motivo!=='string'||data.motivo.trim().length<5||data.motivo.length>500)throw Error('INVALID_SELECTION');
      const c=await context(token,data.eventId),a=(await ready(c)).find(a=>a.assetId===data.assetId);
      if(!a)throw Error('ASSET_NOT_READY_OR_OWNED');
      // Not a save! Existing CAS/audit/readback writer must reauthorize under lock.
      return {eventId:c.eventId,producerId:c.producerId,userId:c.userId,asset:a,expectedVersion:data.expectedVersion,motivo:data.motivo.trim()};
    }
  };
}
module.exports={createCoverCore};
