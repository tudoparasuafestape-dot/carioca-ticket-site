(function(){
'use strict';

var host=String(location.hostname||'').toLowerCase();
if(host!=='cariocaticket.com.br'&&host!=='www.cariocaticket.com.br')return;
if(navigator.webdriver===true)return;

var APP='https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
var STORAGE='CT_ANALYTICS_SESSION_V1';

function id(){
  try{
    var atual=sessionStorage.getItem(STORAGE);
    if(atual&&atual.length>=8)return atual;
    var novo='AS-'+(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2));
    sessionStorage.setItem(STORAGE,novo);
    return novo;
  }catch(_){
    return 'AS-'+String(Date.now())+'-'+Math.random().toString(36).slice(2);
  }
}

function clean(v,max){
  var s=String(v==null?'':v).trim();
  return max&&s.length>max?s.slice(0,max):s;
}

function page(){
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

function send(payload){
  var rid='CTBI-'+(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random());
  var name='ctbi_'+rid.replace(/[^A-Za-z0-9_]/g,'');
  var frame=document.createElement('iframe');
  var form=document.createElement('form');
  frame.name=name;frame.style.display='none';
  form.method='POST';form.action=APP;form.target=name;form.style.display='none';
  function add(k,v){
    var input=document.createElement('input');
    input.type='hidden';input.name=k;input.value=String(v==null?'':v);form.appendChild(input);
  }
  add('ctMinhaCariocaAction','publicRpc');
  add('ctMinhaCariocaRequestId',rid);
  add('metodo','ctBackofficeMasterRegistrarAcessoPublicoPROD');
  add('argsJson',JSON.stringify([payload]));
  document.body.appendChild(frame);document.body.appendChild(form);
  try{form.submit()}catch(_){}
  setTimeout(function(){try{form.remove();frame.remove()}catch(_){}},12000);
}

function init(){
  var pg=page();if(!pg)return;
  var params=new URLSearchParams(location.search);
  var origem=source(params);
  if(origem==='CANARIO')return;
  send({
    pagina:pg,
    eventoId:clean(params.get('evento')||'',220),
    sessaoId:id(),
    origem:origem,
    referrerHost:clean(refHost(),180),
    dispositivo:device()
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
}());
