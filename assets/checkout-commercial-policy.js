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

  // Validate the display contract, never calculate or supply the charge authority.
  function validQuote(response,expectedSubtotal){
    if(!response||response.sucesso!==true||response.degradado!==false||response.rolloutAtivo!==true)return false;
    if(typeof response.revisao!=='string'||!response.revisao.trim())return false;
    var summary=response.resumo;
    if(!summary)return false;
    var fields=['subtotalIngressos','taxaCtPercentual','taxaCtTotal','taxaComprador','taxaProdutor','adicionaisComprador','totalComprador'];
    if(fields.some(function(field){
      return typeof summary[field]!=='number'||!isFinite(summary[field])||summary[field]<0;
    }))return false;
    function cents(value){return Math.round(value*100);}
    if(cents(summary.subtotalIngressos)!==cents(expectedSubtotal))return false;
    if(cents(summary.totalComprador)!==cents(summary.subtotalIngressos)+cents(summary.taxaComprador)+cents(summary.adicionaisComprador))return false;
    if(cents(summary.taxaCtTotal)!==cents(summary.taxaComprador)+cents(summary.taxaProdutor))return false;
    if(summary.pagadorTaxa!=='COMPRADOR'||summary.taxaProdutor!==0)return false;
    if(cents(summary.taxaComprador)!==Math.round(summary.subtotalIngressos*summary.taxaCtPercentual))return false;
    // Paid ERA sales must not silently use the zero-fee degraded fallback.
    if(summary.subtotalIngressos>0&&(summary.taxaComprador<=0||summary.taxaCtPercentual<=0))return false;
    return true;
  }

  var api={present:present,money:money,percent:percent,validQuote:validQuote};
  root.CTCheckoutCommercialPolicy=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

