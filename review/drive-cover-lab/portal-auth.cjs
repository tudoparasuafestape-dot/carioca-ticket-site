'use strict';
// Inspected v397 selected contracts match ACTIVE400 hashes (PR440 run43853575373).
// Source equality is NOT proof of transitive dependencies or live integration behavior.
// Composition must pass the existing server functions, never client callbacks.
function createPortalAuthorization({ctCentralOperacionalAutorizarModuloPROD:central,ctPortalProdutorVerificarAcessoFastP1PROD:fast,ctPerfisAcessoPodeAcessarModulo:moduleAllowed,obterEventoPorId:getEvent}){
 return async function authorize(token,eventId){
  if(typeof token!=='string'||!token.trim()||typeof eventId!=='string'||!/^EVT-[A-Z0-9-]{1,216}$/.test(eventId))throw Error('ACCESS_DENIED');
  // Resolve producer from authenticated session's event, not from asset/client.
  const c=central(token,eventId,'EVENTOS');
  if(!c||c.autorizado!==true||c.eventoId!==eventId||typeof c.produtorId!=='string'||!/^PROD-[A-Z0-9-]{1,180}$/.test(c.produtorId))throw Error('ACCESS_DENIED');
  // Recheck exact active user -> producer -> event + permission. No master bypass.
  const a=fast(token,c.produtorId,eventId,'CORE_EVENTO_CONSULTAR');
  if(!a||a.autenticado!==true||a.autorizado!==true||!a.usuarioId||a.produtorId!==c.produtorId||a.eventoId!==eventId||!moduleAllowed([a.perfil],'EVENTOS'))throw Error('ACCESS_DENIED');
  const event=getEvent(eventId);
  if(!event||event.id!==eventId)throw Error('ACCESS_DENIED');
  return {authorized:true,userId:a.usuarioId,producerId:a.produtorId,eventId};
 };
}
module.exports={createPortalAuthorization};
