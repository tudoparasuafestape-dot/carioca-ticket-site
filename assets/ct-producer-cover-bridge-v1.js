// Opt-in candidate for the existing /eventos-v2 scoped portalRpc only.
// Session remains owned by the existing authenticated bridge, never this UI.
const FIXED_METHODS=['ctEventoCapaRascunhoObterSeguraPROD','ctEventoCapaRascunhoAnexarSeguraPROD','ctEventoCapaRascunhoConfirmarSeguraPROD'];
export function portalCoverBridge(googleRun,{encode=btoa}={}){
 const call=(method,payload)=>new Promise((resolve,reject)=>{
  if(!FIXED_METHODS.includes(method)||typeof googleRun?.withSuccessHandler!=='function')return reject(Error('SESSAO_REQUIRED'));
  googleRun.withSuccessHandler(resolve).withFailureHandler(reject)[method](payload);
 });
 return {
  read:eventId=>call(FIXED_METHODS[0],{eventId}),
  async upload({eventId,revision,ticket,file}){
   if(!file||file.type!=='image/png'||file.size<45||file.size>4194304)throw Error('CAPA_ARQUIVO_INVALIDO');
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(bytes.length!==file.size)throw Error('CAPA_ARQUIVO_INCOMPLETO');
   let binary='';
   for(let o=0;o<bytes.length;o+=16384)binary+=String.fromCharCode(...bytes.subarray(o,o+16384));
   return call(FIXED_METHODS[1],{eventId,expectedRevision:revision,ticket,base64:encode(binary)});
  },
  confirm:({eventId,ticket})=>call(FIXED_METHODS[2],{eventId,ticket})
 };
}
export const portalCoverRoutes=FIXED_METHODS;
