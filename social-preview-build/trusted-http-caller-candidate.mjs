// Future approved build transport only. Importing this module performs no I/O.
import{catalogReadRequest,validateCatalogResponseOrigin}from './public-catalog-transport-candidate.mjs';
export const DEPLOYMENT='https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
export async function readPublicCatalogHtml(id,{fetchImpl,timeoutMs=60000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<=0||timeoutMs>60000)throw Error('Timeout bound');
 if(typeof fetchImpl!=='function')throw Error('Explicit approved HTTP transport required');
 const signal=AbortSignal.timeout(timeoutMs),headers={'Content-Type':'application/x-www-form-urlencoded','Accept':'text/html'};
 let r=await fetchImpl(DEPLOYMENT,{method:'POST',body:catalogReadRequest(id),headers,redirect:'manual',credentials:'omit',signal});
 if([302,303].includes(r.status)){
  const target=new URL(r.headers.get('location')||'',DEPLOYMENT).href;
  validateCatalogResponseOrigin(target,DEPLOYMENT);
  if(new URL(target).hostname!=='script.googleusercontent.com')throw Error('Unexpected redirect');
  await r.body?.cancel();r=await fetchImpl(target,{method:'GET',headers:{Accept:'text/html'},redirect:'manual',credentials:'omit',signal});
 }
 if(r.status!==200||!/^text\/html(?:;|$)/i.test(r.headers.get('content-type')||''))throw Error('Unexpected response; no retries');
 const reader=r.body.getReader(),chunks=[];let count=0;
 try{while(true){const part=await reader.read();if(part.done)break;count+=part.value.length;if(count>1000000)throw Error('Response limit');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel();}
 return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}
