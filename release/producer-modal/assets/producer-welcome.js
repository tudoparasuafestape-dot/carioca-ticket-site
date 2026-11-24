(function () {
  'use strict';
  var modal=document.getElementById('ct-producer-welcome');
  if(!modal||typeof modal.showModal!=='function'||modal.open||document.querySelector('dialog[open]'))return;
  var key='ct-producer-modal-shown-v2',close=modal.querySelector('button'),link=modal.querySelector('a');
  var eyebrow=modal.querySelector('.ct-modal-eyebrow'),title=modal.querySelector('h2'),copy=modal.querySelector('.ct-modal-copy');
  if(!close||!link||!eyebrow||!title||!copy)return;
  try{if(window.sessionStorage.getItem(key)==='1')return;}catch(_){}
  var content={
    pt:['Para produtores','Vai produzir um evento?','Venda seus ingressos online, acompanhe as vendas e organize o check-in com a Carioca Ticket.','Conheça a plataforma','Fechar anúncio'],
    en:['For producers','Planning an event?','Sell tickets online, track sales, and manage check-in with Carioca Ticket.','Explore the platform','Close announcement'],
    es:['Para organizadores','¿Vas a organizar un evento?','Vende entradas en línea, sigue tus ventas y organiza el acceso con Carioca Ticket.','Conoce la plataforma','Cerrar anuncio'],
    zh:['面向活动主办方','准备举办活动？','使用 Carioca Ticket 在线售票、跟踪销售并管理入场核验。','了解平台','关闭公告']
  };
  function localize(){
    var lang=(document.documentElement.lang||'pt').toLowerCase().split('-')[0],c=content[lang]||content.pt;
    eyebrow.textContent=c[0];title.textContent=c[1];copy.textContent=c[2];link.textContent=c[3];close.setAttribute('aria-label',c[4]);
  }
  var previous=document.activeElement,producerTarget=null;
  close.addEventListener('click',function(){if(modal.open)modal.close();});
  link.addEventListener('click',function(){
    producerTarget=document.getElementById('produtores');
    if(modal.open)modal.close();
    // Do not prevent the native same-page link from scrolling.
  });
  modal.addEventListener('close',function(){
    document.removeEventListener('ct:language',localize);
    var restore=producerTarget||(previous&&previous!==document.body&&previous.isConnected?previous:document.getElementById('conteudo'));
    if(restore&&typeof restore.focus==='function')restore.focus({preventScroll:true});
  },{once:true});
  localize();
  try{modal.showModal();}catch(_){return;}
  document.addEventListener('ct:language',localize);
  try{window.sessionStorage.setItem(key,'1');}catch(_){}
}());
