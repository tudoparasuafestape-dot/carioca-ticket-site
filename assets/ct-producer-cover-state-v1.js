// Isolated upload flow, not wired to production transport.
// Server must independently validate authenticated owner, file, and expected revision.
const DEFAULT_LIMIT=4*1024*1024;
export function createCoverUpload({eventId,revision,inspect,upload,confirm,maxBytes=DEFAULT_LIMIT}){
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,219}$/.test(eventId)||typeof revision!=='string'||!revision||
    ![inspect,upload,confirm].every(fn=>typeof fn==='function'))throw Error('INVALID_CONTEXT');
 let current=revision, generation=0, pending=null, file=null, preview=null, phase='idle';
 const getState=()=>({phase,revision:current,preview,canSave:phase==='ready'});
 function clear(){generation++;file=null;preview=null;phase='idle';}
 return {
  getState,
  cancel(){if(phase==='sending'||pending)return false;clear();return true;},
  async select(next){
   if(pending||phase==='sending')return false;
   clear(); const stamp=generation;
   if(!next||next.type!=='image/png'||!Number.isSafeInteger(next.size)||next.size<32||next.size>maxBytes){phase='invalid';return false;}
   phase='inspecting';
   try{
    const p=await inspect(next);
    if(stamp!==generation)return false;
    if(p?.static!==true||p.width<1||p.height<1||!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||
       p.width*p.height>12000000){phase='invalid';return false;}
    file=next;preview={width:p.width,height:p.height};phase='ready';return true;
   }catch{if(stamp===generation)phase='invalid';return false;}
  },
  async save(ticket){
   if(phase!=='ready'||typeof ticket!=='string'||!/^[A-Za-z0-9_-]{16,90}$/.test(ticket))return false;
   pending={eventId,revision:current,ticket};phase='sending';
   const original=file;
   try{return settle(await upload({...pending,file:original}));}
   catch{phase='unconfirmed';return false;}
  },
  async check(){
   if(!pending||phase!=='unconfirmed')return false;
   phase='checking';
   try{return settle(await confirm({...pending}));}
   catch{phase='unconfirmed';return false;}
  }
 };
 function settle(receipt){
  if(!pending||receipt?.eventId!==eventId||receipt?.ticket!==pending.ticket){phase='unconfirmed';return false;}
  if(receipt.status==='REJECTED'&&receipt.written===false){
   pending=null;clear();phase='rejected';return false;
  }
  if(receipt.status!=='CONFIRMED'||typeof receipt.revision!=='string'||!receipt.revision||
     receipt.revision===pending.revision){phase='unconfirmed';return false;}
  current=receipt.revision;pending=null;clear();phase='saved';return true;
 }
}
