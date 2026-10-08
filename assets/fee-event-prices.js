(function(root){
  'use strict';
  var sequence=0;
  function node(tag,text){var el=document.createElement(tag);if(text)el.textContent=text;return el;}
  function mount(catalog,eventId,channel){
    var current=++sequence,fee=root.CTFeeTransparency;
    var start=document.getElementById('startingPrice'),tickets=document.getElementById('tickets');
    fee.render(start,null,{loading:true});tickets.replaceChildren();
    var status=node('p','Confirmando os valores dos ingressos, taxas e totais…');status.setAttribute('role','status');tickets.appendChild(status);
    google.script.run.withSuccessHandler(function(result){
      if(current!==sequence)return;
      if(!result||result.sucesso!==true||result.cacheStale===true||result.degradado===true||result.eventoId!==eventId||result.canal!==channel||!Array.isArray(result.ofertas))return failed();
      var offers=result.ofertas;
      tickets.replaceChildren();
      var allKnown=offers.length>0&&offers.every(function(o){return (catalog.tipos||[]).some(function(t){return t.id===o.tipoId&&(t.lotes||[]).some(function(l){return l.id===o.loteId;});});}),min=null;
      (catalog.tipos||[]).forEach(function(type){
        var group=offers.filter(function(o){return o.tipoId===type.id;});if(!group.length)return;
        var card=node('div');card.className='ticket';
        card.appendChild(node('h3',type.nome));if(type.descricao)card.appendChild(node('p',type.descricao));
        var lots=node('div');lots.className='lots';
        group.forEach(function(offer){
          var lot=(type.lotes||[]).find(function(l){return l.id===offer.loteId;});
          var box=node('div');box.className='ct-offer';box.appendChild(node('h4',lot?lot.nome:'Ingresso'));
          var price=node('div');
          var s=offer.status==='CONFIRMADO'?fee.summary(offer.resumo):null;
          if(!s)allKnown=false;
          else if(!min||s.totalComprador<min.resumo.totalComprador)min={resumo:s,capacidade:offer.capacidadePorVenda};
          fee.render(price,s,{unit:fee.unit(offer.capacidadePorVenda,1)});box.appendChild(price);lots.appendChild(box);
        });card.appendChild(lots);tickets.appendChild(card);
      });
      fee.render(start,allKnown&&min?min.resumo:null,{label:'Total a partir de',unit:min?fee.unit(min.capacidade,1):''});
      if(!offers.length){start.replaceChildren(node('span','Sem oferta disponível'));tickets.appendChild(node('p','Nenhum ingresso disponível neste momento.'));}
    }).withFailureHandler(failed).ctPrecoPublicoLeituraPROD({eventoId:eventId,canal:channel});
    function failed(){
      if(current!==sequence)return;
      fee.render(start,null);tickets.replaceChildren(node('p','Não foi possível confirmar os valores dos ingressos, taxas e totais.'));
      var retry=node('button','Atualizar preços');retry.type='button';retry.className='ct-fee-link';
      retry.onclick=function(){mount(catalog,eventId,channel);};tickets.appendChild(retry);
    }
  }
  root.CTFeeEventPrices={mount:mount};
})(window);
