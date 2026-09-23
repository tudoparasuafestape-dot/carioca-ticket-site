/*
====================================================================================================
CARIOCA TICKET
ANALYTICS MASTER — CLIENTE PUBLICO BEST-EFFORT
Versao: 1.0.0

REGRAS:
- Nunca bloqueia renderizacao, navegacao, checkout ou venda.
- Dispara somente depois do load e em janela ociosa/atrasada.
- Sem await, fetch sincronizado, XHR, ScriptLock ou dependencia de resposta.
- Sem PII: nao envia nome, telefone, e-mail, CPF ou dados do comprador.
====================================================================================================
*/
(function(){
  'use strict';

  var APP='https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
  var SESSION_KEY='CT_ANALYTICS_SESSION_V1';

  function safe(fn,fallback){
    try{return fn()}catch(_){return fallback}
  }

  function randomId(){
    return safe(function(){
      if(window.crypto&&typeof window.crypto.randomUUID==='function'){
        return 'S-'+window.crypto.randomUUID().replace(/-/g,'');
      }
      var a=new Uint32Array(4);
      window.crypto.getRandomValues(a);
      return 'S-'+Array.from(a).map(function(x){return x.toString(16)}).join('');
    },'S-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  }

  function sessionId(){
    var atual=safe(function(){return sessionStorage.getItem(SESSION_KEY)},'');
    if(atual&&atual.length>=8)return atual;
    var novo=randomId().replace(/[^A-Za-z0-9._:-]/g,'').slice(0,120);
    safe(function(){sessionStorage.setItem(SESSION_KEY,novo)},null);
    return novo;
  }

  function pageType(){
    var p=String(location.pathname||'/').toLowerCase().replace(/\/+$/,'')||'/';
    if(p==='/'||p==='/index.html')return 'HOME';
    if(p==='/eventos'||p==='/eventos-v2')return 'EVENTOS';
    if(p==='/evento'||p==='/evento-v2')return 'EVENTO';
    if(p==='/checkout'||p==='/checkout-v2')return 'CHECKOUT';
    return '';
  }

  function cleanId(v,max){
    return String(v||'').trim().replace(/[^A-Za-z0-9._:-]+/g,'').slice(0,max||220);
  }

  function source(){
    var qs=new URLSearchParams(location.search||'');
    var declarada=String(qs.get('src')||qs.get('utm_source')||'').trim();
    if(declarada)return declarada.toUpperCase().replace(/[^A-Z0-9._:-]+/g,'_').slice(0,80);

    var host=safe(function(){return new URL(document.referrer).hostname.toLowerCase()},'');
    if(!host||host===location.hostname.toLowerCase())return 'DIRETO';
    return ('REF_'+host).toUpperCase().replace(/[^A-Z0-9._:-]+/g,'_').slice(0,80);
  }

  function referrerHost(){
    return safe(function(){
      return new URL(document.referrer).hostname.toLowerCase().replace(/[^a-z0-9.:-]+/g,'').slice(0,180);
    },'');
  }

  function device(){
    var w=Math.max(
      Number(window.innerWidth||0),
      Number(document.documentElement&&document.documentElement.clientWidth||0)
    );
    if(w>0&&w<=767)return 'MOBILE';
    if(w>767&&w<=1024)return 'TABLET';
    return 'DESKTOP';
  }

  function cleanup(frame,form){
    try{form.remove()}catch(_){}
    try{frame.remove()}catch(_){}
  }

  function send(){
    var pagina=pageType();
    if(!pagina)return;

    var qs=new URLSearchParams(location.search||'');
    var eventoId=cleanId(qs.get('evento')||'',220);
    var sessao=sessionId();

    if(!sessao||sessao.length<8)return;

    var evento={
      pagina:pagina,
      sessaoId:sessao,
      eventoId:eventoId,
      origem:source(),
      referrerHost:referrerHost(),
      dispositivo:device()
    };

    /*
     * Fire-and-forget via iframe/form:
     * - nao aguarda resposta;
     * - nao interfere no RPC principal da pagina;
     * - executa apos a pagina estar carregada;
     * - qualquer falha e silenciosamente descartada.
     */
    safe(function(){
      var id='CTAM-'+Date.now()+'-'+Math.random().toString(36).slice(2);
      var alvo='ctam_'+id.replace(/[^A-Za-z0-9_]/g,'');
      var frame=document.createElement('iframe');
      var form=document.createElement('form');

      frame.name=alvo;
      frame.setAttribute('aria-hidden','true');
      frame.tabIndex=-1;
      frame.style.display='none';

      form.method='POST';
      form.action=APP;
      form.target=alvo;
      form.style.display='none';

      function add(k,v){
        var input=document.createElement('input');
        input.type='hidden';
        input.name=k;
        input.value=String(v==null?'':v);
        form.appendChild(input);
      }

      add('ctMinhaCariocaAction','publicRpc');
      add('ctMinhaCariocaRequestId',id);
      add('metodo','ctAnalyticsMasterRegistrarLotePublicoPROD');
      add('argsJson',JSON.stringify([[evento]]));

      document.body.appendChild(frame);
      document.body.appendChild(form);

      form.submit();

      window.setTimeout(function(){
        cleanup(frame,form);
      },15000);
    },null);
  }

  function schedule(){
    window.setTimeout(function(){
      if(typeof window.requestIdleCallback==='function'){
        window.requestIdleCallback(function(){send()},{timeout:2500});
      }else{
        window.setTimeout(send,250);
      }
    },2500);
  }

  if(document.readyState==='complete'){
    schedule();
  }else{
    window.addEventListener('load',schedule,{once:true});
  }
}());
