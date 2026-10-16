'use strict';
// UI-only API fixture for this private repo's CI. Not a backend implementation.
// Local integrated validation uses the real backend harness via CT_INVITE_BACKEND.
const crypto=require('node:crypto');
function harness(){
 const state={now:Date.parse('2030-01-01T12:00:00Z'),private:false},event={id:'EVT-SYNTH',nome:'Evento sintético',data:'08/01/2030',status:'ATIVO'};
 const type={id:'TYPE-SYNTH',eventoId:event.id,nome:'Individual',capacidadePorVenda:1,status:'ATIVO'},lot={id:'LOT-SYNTH',tipoId:type.id,eventoId:event.id,nome:'Lote',status:'ATIVO',dentroDoPeriodo:true};
 const invitations=[],rows=[[]],tickets={rows,getLastRow:()=>rows.length},sheets=new Map();
 const fail=s=>{throw Error('CT_CONVITE_'+s)},find=t=>invitations.find(i=>i.token===t)||fail('INDISPONIVEL');
 function summary(i){const active=i.status==='ATIVO'&&Date.parse(i.expiraEm)>state.now;return {conviteId:i.id,quantidade:i.qty,emitidas:i.guests.length,reservadas:active?i.qty-i.guests.length:0,disponiveis:active?i.qty-i.guests.length:0,entradas:0,processando:0,expiraEm:i.expiraEm,status:!active?(i.status==='REVOGADO'?'REVOGADO':'EXPIRADO'):(i.guests.length===i.qty?'ESGOTADO':'ATIVO')}}
 const link=i=>'https://cariocaticket.com.br/cortesia/convite/#'+i.token;
 function create(qty=3,data={}){if(!lot.dentroDoPeriodo)fail('LOTE_INDISPONIVEL');let i=invitations.find(x=>x.key===data.chaveIdempotencia&&x.key);if(!i){i={id:crypto.randomUUID(),token:crypto.randomBytes(32).toString('hex'),qty,status:'ATIVO',expiraEm:new Date(state.now+7*86400000).toISOString(),guests:[],key:data.chaveIdempotencia};invitations.push(i);sheets.set('CT_CORTESIA_CONVITES',{getLastRow:()=>invitations.length+1});}return {sucesso:true,convite:summary(i),link:link(i)}}
 function result(i,g){return {sucesso:true,convite:summary(i),ingresso:{nome:g.name,codigo:g.code,link:'https://cariocaticket.com.br/ingresso/?codigo='+g.code+'&sig=SYNTHETIC_SIGNATURE_000000000000'}}}
 const methods={
 ctCortesiaConviteCriarPROD:(token,id,d)=>create(d.quantidade,d),
 ctCortesiaConviteRevogarPROD:(token,id,inv)=>{const i=invitations.find(x=>x.id===inv);i.status='REVOGADO';return {sucesso:true,convite:summary(i)}},
 ctCortesiaConviteCarregarPublicoPROD:t=>({sucesso:true,evento:{nome:event.nome},convite:summary(find(t))}),
 ctCortesiaConviteCadastrarPublicoPROD:(t,d)=>{
  const i=find(t);let g=i.guests.find(x=>x.key===d.chaveIdempotencia);if(g)return result(i,g);
  if(state.private)fail('EVENTO_EXIGE_CONVIDADO_AUTORIZADO');
  if(!/^[\p{L}]/u.test(d.nome)||!d.sobrenome)fail('NOME_SOBRENOME_INVALIDO');
  if(d.whatsapp.replace(/\D/g,'').length<10)fail('WHATSAPP_INVALIDO');
  if(summary(i).status!=='ATIVO')fail('ENCERRADO');
  g={key:d.chaveIdempotencia,name:d.nome+' '+d.sobrenome,code:'CT-SYNTH-'+rows.length};i.guests.push(g);
  const row=[];row[4]=g.code;rows.push(row);return result(i,g);
 },
 ctCortesiaConviteRecuperarPublicoPROD:(t,key)=>{const i=find(t),g=i.guests.find(g=>g.key===key);if(!g)fail('CADASTRO_NAO_CONFIRMADO');return result(i,g)},
 ctCortesiasCarregarPROD:()=>({sucesso:true,autenticado:true,autorizado:true,evento:event,produtorId:'PROD-SYNTH',tipos:[type],lotes:[lot],config:{limiteCortesiasAcessos:0},resumo:{},operacional:{},reconciliacao:{consistente:true},privado:{privado:false},recentes:[],convites:invitations.map(i=>({...summary(i),link:link(i)}))})
 };
 const ctx={...methods,ctPublicoFirstPartyRpcPROD_:(m,a)=>methods[m](...JSON.parse(a)),ctPortalProdutorRpcPROD_:(m,a)=>methods[m](...JSON.parse(a))};
 return {ctx,state,event,type,lot,tickets,sheets,create};
}
module.exports={harness};
