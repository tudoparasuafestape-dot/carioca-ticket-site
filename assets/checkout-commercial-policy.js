(function(root){
  'use strict';

  function number(v){
    var n=Number(v||0);
    return isFinite(n)?n:0;
  }

  function money(v){
    return number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  function percent(v){
    var n=number(v);
    return n.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
  }

  function present(resumo){
    resumo=resumo||{};
    var pagador=String(resumo.pagadorTaxa||'COMPRADOR').toUpperCase();
    var taxaPct=number(resumo.taxaCtPercentual);
    var taxaTotal=number(resumo.taxaCtTotal);
    var taxaComprador=number(resumo.taxaComprador);
    var taxaProdutor=number(resumo.taxaProdutor);
    var adicionais=number(resumo.adicionaisComprador);
    var pct=percent(taxaPct);
    var label='Taxa Carioca Ticket ('+pct+')';
    var note='';

    if(pagador==='PRODUTOR'){
      label='Taxa Carioca Ticket ('+pct+') · paga pelo produtor';
      note=taxaTotal>0
        ?'O produtor absorve '+money(taxaProdutor||taxaTotal)+'. Nenhuma parte da taxa Carioca Ticket foi adicionada ao seu total.'
        :'Sem taxa adicional para o comprador.';
    }else if(pagador==='DIVIDIDA'){
      label='Sua parte da taxa Carioca Ticket ('+pct+')';
      note='Nesta venda, você paga '+money(taxaComprador)+' da taxa e o produtor absorve '+money(taxaProdutor||Math.max(0,taxaTotal-taxaComprador))+'.';
    }else{
      note=taxaComprador>0
        ?'A taxa Carioca Ticket está incluída no total a pagar.'
        :'Sem taxa adicional para o comprador.';
    }

    if(adicionais>0){
      note+=' Encargos adicionais, quando aplicáveis, são informados separadamente.';
    }

    return {
      label:label,
      note:note,
      infoTitle:'Sobre a taxa Carioca Ticket',
      infoText:'Esta taxa remunera a tecnologia e a operação da plataforma para processar a venda, emitir e validar ingressos. O percentual e quem absorve a taxa seguem a condição comercial vigente deste evento.',
      pagador:pagador,
      percentual:taxaPct
    };
  }

  var api={present:present,money:money,percent:percent};
  root.CTCheckoutCommercialPolicy=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
