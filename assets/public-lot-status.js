/* Server-projected lot states. This module never selects a successor or mutates stock. */
(function (root) {
  'use strict';
  var labels = {
    'pt-BR': { retryOriginal:'Repetindo a tentativa original com os mesmos dados e a mesma chave.', recover:'Recuperar pedido iniciado', recoverHelp:'Use Recuperar pedido iniciado para consultar a tentativa anterior com os mesmos dados.', current:'Lote atual', closed:'Encerrado', paused:'Pausado', soon:'Em breve', early:'Antecipado', pending:'Aguardando liberação de reservas', capacity:'Disponibilidade temporariamente indisponível', unknown:'Atualizando disponibilidade…', ended:'Este evento já terminou.', choose:'Disponibilidade atualizada. Revise o ingresso e o lote.', refresh:'Atualizar disponibilidade', unlimited:'Sem limite de lote', available:'acesso(s) disponível(is)' },
    'en-US': { retryOriginal:'Retrying the original attempt with the same details and key.', recover:'Recover started order', recoverHelp:'Use Recover started order to check the previous attempt with the same details.', current:'Current lot', closed:'Closed', paused:'Paused', soon:'Coming soon', early:'Opened early', pending:'Waiting for reservations to expire', capacity:'Availability temporarily unavailable', unknown:'Updating availability…', ended:'This event has ended.', choose:'Availability updated. Review your ticket and lot.', refresh:'Refresh availability', unlimited:'No lot limit', available:'admission(s) available' },
    es: { retryOriginal:'Repitiendo el intento original con los mismos datos y la misma clave.', recover:'Recuperar pedido iniciado', recoverHelp:'Usa Recuperar pedido iniciado para consultar el intento anterior con los mismos datos.', current:'Lote actual', closed:'Cerrado', paused:'Pausado', soon:'Próximamente', early:'Apertura anticipada', pending:'Esperando la liberación de reservas', capacity:'Disponibilidad temporalmente no disponible', unknown:'Actualizando disponibilidad…', ended:'Este evento ya terminó.', choose:'Disponibilidad actualizada. Revisa la entrada y el lote.', refresh:'Actualizar disponibilidad', unlimited:'Sin límite de lote', available:'acceso(s) disponible(s)' },
    'zh-Hans': { retryOriginal:'正在使用相同信息和标识重试原来的请求。', recover:'找回已发起的订单', recoverHelp:'请选择找回已发起的订单，使用相同信息查询上次尝试。', current:'当前批次', closed:'已结束', paused:'已暂停', soon:'即将开放', early:'提前开放', pending:'等待预留名额释放', capacity:'暂时无法确认可售名额', unknown:'正在更新可售名额…', ended:'此活动已结束。', choose:'可售名额已更新，请重新确认门票和批次。', refresh:'刷新可售名额', unlimited:'此批次不限量', available:'个可用入场名额' }
  };
  function locale() {
    var lang=root.document&&root.document.documentElement.lang||'pt-BR';
    return labels[lang]?lang:/^en/.test(lang)?'en-US':/^es/.test(lang)?'es':/^zh/.test(lang)?'zh-Hans':'pt-BR';
  }
  function text(key) { return labels[locale()][key] || key; }
  function invalid() { return {legacy:false, valid:false, purchasable:false, types:[]}; }
  function present(response, clock) {
    response=response||{};
    var projection=response.lotesVenda;
    var legacy=!Object.prototype.hasOwnProperty.call(response,'lotesVenda');
    var temporal=response.temporalVersion!==undefined || (response.evento&&response.evento.temporal&&response.evento.temporal.state==='TEMPORAL_V1');
    var end=root.CTPublicCatalogClock?root.CTPublicCatalogClock.eventEnd(response.evento):null;
    var fresh=(!temporal||!!clock&&!clock.legacy) && (end===null||Number.isFinite(end)) && (!clock || (clock.valid===true&&!clock.expired()&&!clock.isEnded(response.evento)));
    if(legacy) return {legacy:true,valid:fresh,purchasable:fresh&&Array.isArray(response.tipos)&&response.tipos.some(function(t){return Array.isArray(t.lotes)&&t.lotes.length>0;}),types:[]};
    if(!projection||projection.versao!==1||!Array.isArray(projection.tipos)||!clock||clock.legacy||!fresh||!isFinite(Date.parse(projection.avaliadoEm)))return invalid();
    var types=[],seenTypes={},seenLots={},purchasable=false;
    var publicTypes=Array.isArray(response.tipos)?response.tipos:[];
    for(var i=0;i<projection.tipos.length;i++){
      var type=projection.tipos[i];
      if(!type||typeof type.tipoId!=='string'||!type.tipoId||seenTypes[type.tipoId]||!Array.isArray(type.lotes))return invalid();
      seenTypes[type.tipoId]=true;
      var current=null, lots=[];
      for(var j=0;j<type.lotes.length;j++){
        var lot=type.lotes[j];
        if(!lot||typeof lot.id!=='string'||!lot.id||seenLots[lot.id]||['ATUAL','ENCERRADO','PAUSADO','EM_BREVE'].indexOf(lot.statusVenda)<0||typeof lot.disponivelParaCompra!=='boolean'||typeof lot.quantidadeLimitada!=='boolean')return invalid();
        seenLots[lot.id]=true;
        if(lot.quantidadeLimitada ? (!Number.isSafeInteger(lot.disponiveis)||lot.disponiveis<0) : lot.disponiveis!==null)return invalid();
        if(lot.statusVenda==='ATUAL'){if(current)return invalid();current=lot.id;}
        if(lot.disponivelParaCompra&&(lot.statusVenda!=='ATUAL'||lot.motivoIndisponibilidade))return invalid();
        if(lot.disponivelParaCompra){
          var source=publicTypes.find(function(t){return t.id===type.tipoId;});
          if(!source||!Array.isArray(source.lotes)||!source.lotes.some(function(l){return l.id===lot.id;}))return invalid();
          purchasable=true;
        }
        lots.push(lot);
      }
      if((type.loteAtualId||null)!==current)return invalid();
      types.push({id:type.tipoId,name:type.tipoNome||'',lots:lots});
    }
    // A purchasable catalog entry must agree with the authoritative projection.
    for(var k=0;k<publicTypes.length;k++){
      var publicType=publicTypes[k], projected=types.find(function(t){return t.id===publicType.id;});
      if(!projected||!Array.isArray(publicType.lotes))return invalid();
      for(var n=0;n<publicType.lotes.length;n++)if(!projected.lots.some(function(l){return l.id===publicType.lotes[n].id&&l.statusVenda==='ATUAL'&&l.disponivelParaCompra===true;}))return invalid();
    }
    return {legacy:false,valid:true,purchasable:purchasable,types:types};
  }
  function allows(response,typeId,lotId,clock){
    var view=present(response,clock);
    if(!view.valid)return false;
    if(view.legacy)return (response.tipos||[]).some(function(t){return t.id===typeId&&(t.lotes||[]).some(function(l){return l.id===lotId;});});
    return view.types.some(function(t){return t.id===typeId&&t.lots.some(function(l){return l.id===lotId&&l.statusVenda==='ATUAL'&&l.disponivelParaCompra===true;});});
  }
  function render(container,response,clock){
    var view=present(response,clock);
    if(view.legacy)return view;
    container.replaceChildren();
    container.classList.add('ct-lot-status');
    container.setAttribute('aria-live','polite');
    function node(tag,className,value,original){
      var el=root.document.createElement(tag);el.className=className;el.textContent=value;
      el.lang=original?'pt-BR':locale();el.setAttribute('translate','no');return el;
    }
    if(!view.valid){container.appendChild(node('p','ct-lot-notice',text(clock&&clock.isEnded(response.evento)?'ended':'unknown')));return view;}
    view.types.forEach(function(type){
      var section=node('section','ct-lot-type','');section.appendChild(node('h3','',type.name,true));
      type.lots.forEach(function(lot){
        var row=node('div','ct-lot-row','');row.dataset.lotId=lot.id;row.dataset.lotState=lot.statusVenda;
        row.appendChild(node('span','ct-lot-name',lot.nome||lot.id,true));
        var key={ATUAL:'current',ENCERRADO:'closed',PAUSADO:'paused',EM_BREVE:'soon'}[lot.statusVenda];
        var status=text(key);
        if(lot.statusVenda==='ATUAL'&&!lot.disponivelParaCompra)status+=' · '+text(lot.motivoIndisponibilidade==='RESERVAS_PENDENTES'?'pending':'capacity');
        if(lot.antecipado===true)status+=' · '+text('early');
        row.appendChild(node('span','ct-lot-badge',status));
        if(lot.preco)row.appendChild(node('span','ct-lot-price',lot.preco,true));
        if(lot.statusVenda==='ATUAL'&&lot.disponivelParaCompra)row.appendChild(node('span','ct-lot-count',lot.quantidadeLimitada?lot.disponiveis+' '+text('available'):text('unlimited')));
        section.appendChild(row);
      });container.appendChild(section);
    });return view;
  }
  root.CTPublicLotStatus=Object.freeze({present:present,allows:allows,render:render,text:text});
}(typeof window==='undefined'?globalThis:window));
