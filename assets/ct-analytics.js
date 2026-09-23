/*
 * CARIOCA TICKET — Analytics Master público best-effort
 *
 * Regra de disponibilidade:
 * - nunca bloqueia render/navegação/checkout;
 * - não usa iframe/form;
 * - não espera resposta;
 * - não faz retry;
 * - guarda fila apenas na sessão;
 * - envia em lote e, sob falha, descarta silenciosamente.
 */
(function(){
'use strict';

var host=String(location.hostname||'').toLowerCase();
if(host!=='cariocaticket.com.br'&&host!=='www.cariocaticket.com.br')return;
if(navigator.webdriver===true)return;

var APP='https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
var STORAGE_SESSION='CT_ANALYTICS_SESSION_V2';
var STORAGE_QUEUE='CT_ANALYTICS_QUEUE_V2';
var STORAGE_SEEN='CT_ANALYTICS_SEEN_V2';
var FLUSH_DELAY_MS=10000;
var MAX_QUEUE=8;

function safeGet(key,fallback){
  try{
    var raw=sessionStorage.getItem(key);
    return raw==null?fallback:raw;
  }catch(_){return fallback}
}
function safeSet(key,value){
  try{sessionStorage.setItem(key,value)}catch(_){}
}
function parseJson(raw,fallback){
  try{var x=JSON.parse(raw);return x==null?fallback:x}catch(_){return fallback}
}
function clean(v,max){
  var s=String(v==null?'':v).trim();
  return max&&s.length>max?s.slice(0,max):s;
}
function sessionId(){
  var atual=safeGet(STORAGE_SESSION,'');
  if(atual&&atual.length>=8)return atual;
  var novo='AS2-'+(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2));
  safeSet(STORAGE_SESSION,novo);
  return novo;
}
function pageName(){
  var p=String(location.pathname||'/').toLowerCase().replace(/\/+$/,'')||'/';
  if(p==='/')return'HOME';
  if(p==='/eventos'||p==='/eventos-v2')return'EVENTOS';
  if(p==='/evento'||p==='/evento-v2')return'EVENTO';
  if(p==='/checkout'||p==='/checkout-v2')return'CHECKOUT';
  return'';
}
function refHost(){
  try{return document.referrer?String(new URL(document.referrer).hostname||'').toLowerCase():''}catch(_){return''}
}
function source(params){
  var s=clean(params.get('utm_source')||params.get('src')||'',80).toUpperCase();
  if(s)return s.replace(/[^A-Z0-9._:-]+/g,'_');
  var r=refHost();
  if(r&&r!==host&&r!=='www.'+host)return r.toUpperCase().replace(/[^A-Z0-9._:-]+/g,'_').slice(0,80);
  return'DIRETO';
}
function device(){
  var w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
  if(w<=767)return'MOBILE';
  if(w<=1024)return'TABLET';
  return'DESKTOP';
}
function loadQueue(){
  var q=parseJson(safeGet(STORAGE_QUEUE,'[]'),[]);
  return Array.isArray(q)?q.slice(0,MAX_QUEUE):[];
}
function saveQueue(q){
  safeSet(STORAGE_QUEUE,JSON.stringify((Array.isArray(q)?q:[]).slice(-MAX_QUEUE)));
}
function seenMap(){
  var x=parseJson(safeGet(STORAGE_SEEN,'{}'),{});
  return x&&typeof x==='object'&&!Array.isArray(x)?x:{};
}
function markSeen(key){
  var x=seenMap();
  x[key]=1;
  var keys=Object.keys(x);
  if(keys.length>40){
    keys.slice(0,keys.length-40).forEach(function(k){delete x[k]});
  }
  safeSet(STORAGE_SEEN,JSON.stringify(x));
}
function isSeen(key){
  return seenMap()[key]===1;
}
function enqueue(){
  var pg=pageName();
  if(!pg)return;
  var params=new URLSearchParams(location.search);
  var origem=source(params);
  if(origem==='CANARIO')return;

  var sessao=sessionId();
  var eventoId=clean(params.get('evento')||'',220).replace(/[^A-Za-z0-9._:-]+/g,'');
  var key=[sessao,pg,eventoId].join('|');
  if(isSeen(key))return;
  markSeen(key);

  var q=loadQueue();
  q.push({
    pagina:pg,
    eventoId:eventoId,
    sessaoId:sessao,
    origem:origem,
    referrerHost:clean(refHost(),180),
    dispositivo:device()
  });
  saveQueue(q);
}
function flush(){
  var q=loadQueue();
  if(!q.length)return;

  /*
   * Remove da fila ANTES da rede.
   * Analytics é descartável: nenhuma falha pode provocar retry,
   * fila infinita ou competição com a navegação.
   */
  saveQueue([]);

  try{
    var body=new URLSearchParams();
    body.set('ctMinhaCariocaAction','publicRpc');
    body.set('ctMinhaCariocaRequestId','CTAM-'+String(Date.now())+'-'+Math.random().toString(36).slice(2));
    body.set('metodo','ctAnalyticsMasterRegistrarLotePublicoPROD');
    body.set('argsJson',JSON.stringify([q.slice(0,MAX_QUEUE)]));

    fetch(APP,{
      method:'POST',
      mode:'no-cors',
      keepalive:true,
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:body.toString()
    }).catch(function(){});
  }catch(_){}
}
function init(){
  enqueue();

  /*
   * Dá prioridade total ao carregamento/render.
   * Se o usuário navegar antes, a fila fica na sessionStorage e
   * a próxima página pode enviá-la em lote.
   */
  window.setTimeout(flush,FLUSH_DELAY_MS);
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}
}());
