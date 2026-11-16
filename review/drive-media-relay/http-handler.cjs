'use strict';
const {MediaError}=require('./media-core.cjs');
// Prototype composition, NOT mounted on existing Nest app or any live service.
function createMediaHandler(service){return async(req,res)=>{
 const match=(req.url||'').match(/^\/api\/v2\/media\/covers\/([a-f0-9]{64})$/);
 if(!match||!['GET','HEAD'].includes(req.method)){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
 if(req.headers.range){res.writeHead(416,{'Cache-Control':'no-store'});res.end();return;}
 try{
  const image=await service.get(match[1]);
  if(req.destroyed||res.destroyed)return;
  res.writeHead(200,{'Content-Type':image.mime,'Content-Length':String(image.bytes.length),'Content-Disposition':'inline; filename="cover.'+(image.mime==='image/png'?'png':'jpg')+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin','Access-Control-Allow-Origin':'*','Referrer-Policy':'no-referrer'});
  res.end(req.method==='HEAD'?undefined:image.bytes);
 }catch(error){
  if(res.destroyed)return;
  const status=error instanceof MediaError?error.status:503;
  const headers={'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'};
  if(status===429)headers['Retry-After']='60';
  res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:'Image unavailable');
 }
};}
module.exports={createMediaHandler};
