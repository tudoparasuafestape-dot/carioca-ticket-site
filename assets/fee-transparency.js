(function(root){
  'use strict';
  var title='Sobre a taxa de serviço';
  var text='Quando cobrada do comprador, a taxa de serviço é acrescentada ao valor do ingresso. A cobrança segue as condições desta oferta. Confira o valor do ingresso, a taxa e o total antes de concluir sua compra.';
  function validNumber(n){return typeof n==='number'&&isFinite(n)&&n>=0;}
  function cents(n){return Math.round(n*100);}
  function money(n){return validNumber(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'A confirmar';}
  // Validate only the public composition. Do not reimplement rates or charge rules.
  function summary(s){
    if(!s||!['subtotalIngressos','taxaComprador','adicionaisComprador','totalComprador'].every(function(k){return validNumber(s[k]);}))return null;
    if(cents(s.totalComprador)!==cents(s.subtotalIngressos)+cents(s.taxaComprador)+cents(s.adicionaisComprador))return null;
    return {subtotalIngressos:s.subtotalIngressos,taxaComprador:s.taxaComprador,
      adicionaisComprador:s.adicionaisComprador,totalComprador:s.totalComprador,
      taxaProdutor:validNumber(s.taxaProdutor)?s.taxaProdutor:null,pagadorTaxa:s.pagadorTaxa};
  }
  function quote(r){return r&&r.sucesso===true&&r.degradado===false&&r.cacheStale!==true?summary(r.resumo):null;}
  function snapshot(s){
    if(!s||!Array.isArray(s.comissoes))return null;
    var extra=0;
    for(var i=0;i<s.comissoes.length;i++){
      var item=s.comissoes[i];
      if(!item||!validNumber(item.valorCalculado)||['COMPRADOR','PRODUTOR','MARGEM_CT'].indexOf(item.fonteCusteio)<0)return null;
      if(item.fonteCusteio==='COMPRADOR')extra+=cents(item.valorCalculado);
    }
    return summary(Object.assign({},s,{adicionaisComprador:extra/100}));
  }
  function composition(s){
    if(!s)return 'O valor da taxa e o total ainda não foram confirmados.';
    return 'Nesta seleção: ingresso '+money(s.subtotalIngressos)+' + taxa de serviço '+money(s.taxaComprador)+
      (s.adicionaisComprador>0?' + encargos adicionais '+money(s.adicionaisComprador):'')+' = total '+money(s.totalComprador)+'.';
  }
  function note(s){
    if(!s)return '';
    if(s.taxaProdutor>0)return 'O produtor absorve '+money(s.taxaProdutor)+' da taxa de serviço.';
    return s.taxaComprador===0?'Sem taxa de serviço cobrada do comprador nesta oferta.':'A taxa de serviço está incluída no total.';
  }
  function node(tag,cls,value){var n=document.createElement(tag);n.className=cls||'';if(value!==undefined)n.textContent=value;return n;}
  var dialog=null,returnFocus=null;
  function explain(s,trigger){
    if(!dialog){
      dialog=node('dialog','ct-fee-dialog');dialog.id='ctFeeDialog';
      dialog.setAttribute('aria-labelledby','ctFeeTitle');
      var heading=node('h2','',title);heading.id='ctFeeTitle';
      var body=node('p','',text);body.id='ctFeeText';
      var detail=node('p','ct-fee-composition');detail.id='ctFeeComposition';
      var close=node('button','ct-fee-close','Fechar');close.type='button';close.autofocus=true;
      close.onclick=function(){dialog.close();};
      dialog.append(heading,body,detail,close);document.body.appendChild(dialog);
      dialog.addEventListener('close',function(){if(returnFocus&&returnFocus.isConnected)returnFocus.focus();});
      dialog.addEventListener('keydown',function(e){if(e.key==='Tab'){e.preventDefault();close.focus();}});
      // No history entries, navigation interception, network, or checkout callbacks.
      root.addEventListener('pagehide',function(){if(dialog.open)dialog.close();});
    }
    if(dialog.open)return;
    returnFocus=trigger||document.activeElement;
    dialog.querySelector('#ctFeeComposition').textContent=composition(summary(s));
    dialog.showModal();
  }
  function link(s,id){var b=node('button','ct-fee-link','Entenda a taxa de serviço');b.type='button';if(id)b.id=id;b.setAttribute('aria-haspopup','dialog');b.onclick=function(){explain(s,b);};return b;}
  function render(target,s,options){
    options=options||{};s=summary(s);target.replaceChildren();target.classList.add('ct-price');
    var label=options.label||'Total';
    target.appendChild(node('strong','ct-price-total',s?label+' '+money(s.totalComprador):'Total a confirmar'));
    if(s){
      target.appendChild(node('span','ct-price-parts','Ingresso '+money(s.subtotalIngressos)+' + taxa de serviço '+money(s.taxaComprador)));
      if(s.adicionaisComprador>0)target.appendChild(node('span','ct-price-parts','Encargos adicionais '+money(s.adicionaisComprador)));
      if(options.unit)target.appendChild(node('span','ct-price-unit',options.unit));
      target.appendChild(node('span','ct-price-note',note(s)));
    }else target.appendChild(node('span','ct-price-parts',options.loading?'Confirmando ingresso, taxa e total…':'Não foi possível confirmar a composição desta oferta.'));
    target.appendChild(link(s,options.linkId));
  }
  function unit(capacity,quantity){return capacity>1?(quantity||1)+' pacote(s) · '+capacity+' acessos por pacote':(quantity||1)+' ingresso(s)';}
  var api={summary:summary,quote:quote,snapshot:snapshot,money:money,composition:composition,note:note,render:render,explain:explain,unit:unit,title:title,text:text};
  root.CTFeeTransparency=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
