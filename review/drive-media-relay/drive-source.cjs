'use strict';
const {MediaError,MAX_BYTES}=require('./media-core.cjs');
const FIXTURE=Object.freeze({fileId:'1ZKtn5Z7APZpQjiNEVZSOrfCws5liDLIq',sha256:'51641c2541154228a4f9099f4056c1b47daab1598e369c50b91bccd1d76ce570',bytes:1959605,mime:'image/png',url:'https://drive.usercontent.google.com/download?id=1ZKtn5Z7APZpQjiNEVZSOrfCws5liDLIq&export=download'});
// Cancel promptly without waiting on an untrusted/non-cooperative stream cancel.
function cancelBody(response){try{const p=response?.body?.cancel();if(p&&typeof p.catch==='function')p.catch(()=>{});}catch{}}
function cancelReader(reader){try{const p=reader.cancel();if(p&&typeof p.catch==='function')p.catch(()=>{});}catch{}}
function rejectBody(response,code){cancelBody(response);throw new MediaError(code,502);}
function live(signal,response){if(signal?.aborted){cancelBody(response);signal.throwIfAborted();}}
async function readLimited(response,max,expected){
 if(!response||response.status!==200||!response.body)rejectBody(response,'SOURCE_HTTP_REJECTED');
 const encoding=response.headers.get('content-encoding');
 if(encoding&&encoding!=='identity')rejectBody(response,'SOURCE_ENCODING_REJECTED');
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max||(expected!==undefined&&Number(length)!==expected)))rejectBody(response,'SOURCE_SIZE_REJECTED');
 const reader=response.body.getReader();let size=0;const parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max||(expected!==undefined&&size>expected)){cancelReader(reader);throw new MediaError('SOURCE_SIZE_REJECTED',502);}parts.push(Buffer.from(value));}}catch(error){cancelReader(reader);throw error;}finally{reader.releaseLock();}
 if(expected!==undefined&&size!==expected)throw new MediaError('SOURCE_SIZE_REJECTED',502);
 return Buffer.concat(parts,size);
}
function createDriveSource({getAccessToken,transport=globalThis.fetch,allowPublicFixture=false}={}){
 return {async read(record,{signal}={}){
  if(!record||!/^[A-Za-z0-9_-]{10,200}$/.test(record.fileId)||!/^[A-Za-z0-9_-]{10,200}$/.test(record.folderId)||!['image/png','image/jpeg'].includes(record.mime)||!Number.isSafeInteger(record.bytes)||record.bytes<8||record.bytes>MAX_BYTES)throw new MediaError('SOURCE_RECORD_REJECTED');
  let url,headers={Accept:record.mime,'Accept-Encoding':'identity'};
  if(record.sourceKind==='public-fixture'){
   if(allowPublicFixture!==true||!['fileId','sha256','bytes','mime'].every(k=>record[k]===FIXTURE[k]))throw new MediaError('PUBLIC_FIXTURE_DISABLED');
   url=FIXTURE.url;
  }else if(record.sourceKind==='drive-oauth'){
   if(typeof getAccessToken!=='function')throw new MediaError('CREDENTIAL_PROVIDER_MISSING');
   const token=await getAccessToken({fileId:record.fileId,signal});
   live(signal);
   if(typeof token!=='string'||token.length<16||/[\r\n]/.test(token))throw new MediaError('CREDENTIAL_PROVIDER_UNAVAILABLE');
   headers={...headers,Authorization:'Bearer '+token};
   const base='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(record.fileId);
   const fields='id,mimeType,size,sha256Checksum,parents,trashed';
   const metadataResponse=await transport(base+'?fields='+encodeURIComponent(fields),{method:'GET',headers:{...headers,Accept:'application/json'},redirect:'error',credentials:'omit',signal});
   live(signal,metadataResponse);
   if((metadataResponse.headers.get('content-type')||'').split(';')[0].trim()!=='application/json')rejectBody(metadataResponse,'SOURCE_METADATA_REJECTED');
   let meta;try{meta=JSON.parse((await readLimited(metadataResponse,16384)).toString('utf8'));}catch{rejectBody(metadataResponse,'SOURCE_METADATA_REJECTED');}
   if(!meta||meta.trashed||meta.id!==record.fileId||meta.mimeType!==record.mime||Number(meta.size)!==record.bytes||meta.sha256Checksum!==record.sha256||!Array.isArray(meta.parents)||!meta.parents.includes(record.folderId))rejectBody(metadataResponse,'SOURCE_METADATA_REJECTED');
   url=base+'?alt=media';
  }else throw new MediaError('SOURCE_KIND_REJECTED');
  live(signal);
  const response=await transport(url,{method:'GET',headers,redirect:'error',credentials:'omit',signal});
  live(signal,response);
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(mime!==record.mime)rejectBody(response,'SOURCE_MIME_REJECTED');
  return {mime,bytes:await readLimited(response,MAX_BYTES,record.bytes)};
 }};
}
module.exports={createDriveSource,readLimited,FIXTURE};
