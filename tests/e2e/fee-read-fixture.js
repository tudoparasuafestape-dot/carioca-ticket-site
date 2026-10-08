// Explicit no-buyer-fee policy for older, local-only journey fixtures.
exports.feeReadFixture=function(catalog,p){
  return {sucesso:true,eventoId:catalog.evento.id,canal:p.canal,ofertas:catalog.tipos.flatMap(t=>t.lotes.map(l=>{
    const q=p.quantidade||1,base=l.precoNumero*q;
    return {tipoId:t.id,loteId:l.id,quantidade:q,capacidadePorVenda:t.capacidadePorVenda,status:'CONFIRMADO',semTaxaConfirmada:true,
      resumo:{subtotalIngressos:base,taxaComprador:0,adicionaisComprador:0,totalComprador:base}};
  })).filter(o=>!p.tipoId||(o.tipoId===p.tipoId&&o.loteId===p.loteId))};
};
