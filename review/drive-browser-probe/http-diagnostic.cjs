'use strict';
const https=require('node:https'),crypto=require('node:crypto');
const IMAGE_URL='https://drive.usercontent.google.com/download?id=1ZKtn5Z7APZpQjiNEVZSOrfCws5liDLIq&export=download';
function safeHeaders(headers={}){const h={};for(const [k,v]of Object.entries(headers))h[k.toLowerCase()]=String(v);const location=h.location;let redirect=null;if(location){try{const u=new URL(location);redirect=(u.origin+u.pathname).slice(0,240);}catch{redirect='INVALID';}}return {mime:(h['content-type']||'').split(';')[0].slice(0,100),contentLength:/^\d+$/.test(h['content-length']||'')?Number(h['content-length']):null,disposition:/^attachment/i.test(h['content-disposition']||'')?'attachment':/^inline/i.test(h['content-disposition']||'')?'inline':null,corp:['same-origin','same-site','cross-origin'].includes(h['cross-origin-resource-policy'])?h['cross-origin-resource-policy']:null,nosniff:(h['x-content-type-options']||'').toLowerCase()==='nosniff',redirect};}
function directDiagnostic(get=https.get){return new Promise(resolve=>{
 let done=false;const finish=result=>{if(!done){done=true;resolve(result);}};
 const req=get(IMAGE_URL,{headers:{Accept:'image/png'},timeout:15000},res=>{
  const headers=safeHeaders(res.headers),hash=crypto.createHash('sha256');let bytes=0,first=Buffer.alloc(0);
  res.on('data',chunk=>{bytes+=chunk.length;if(bytes>2065000){res.destroy();finish({kind:'DIRECT_HTTP_NOT_BROWSER',status:res.statusCode,...headers,oversized:true});return;}hash.update(chunk);if(first.length<512)first=Buffer.concat([first,chunk]).subarray(0,512);});
  res.on('end',()=>{const signature=first.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'PNG':first[0]===255&&first[1]===216?'JPEG':/<(?:!doctype\s+html|html|head|body)\b/i.test(first.toString('utf8'))?'HTML':'OTHER';finish({kind:'DIRECT_HTTP_NOT_BROWSER',status:res.statusCode,...headers,bytes,signature,sha256:hash.digest('hex')});});
  res.on('error',()=>finish({kind:'DIRECT_HTTP_NOT_BROWSER',status:res.statusCode,...headers,error:'RESPONSE_ERROR'}));
 });
 req.on('error',()=>finish({kind:'DIRECT_HTTP_NOT_BROWSER',error:'REQUEST_ERROR'}));req.on('timeout',()=>{req.destroy();finish({kind:'DIRECT_HTTP_NOT_BROWSER',error:'TIMEOUT'});});
 });}
module.exports={safeHeaders,directDiagnostic};
