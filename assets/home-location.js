(function () {
  'use strict';
  var H=window.CTHome,dialog=document.getElementById('location-dialog');
  if(!H || !H.location || !dialog) return;
  var words={
    'pt-BR':{use:'Usar minha localização',privacy:'Com sua permissão, o navegador informa sua posição para sugerir uma cidade. A Carioca Ticket faz a consulta neste navegador, sem enviar coordenadas a um serviço de mapas.',busy:'Identificando sua cidade…',cancel:'Cancelar busca',suggest:'Cidade sugerida: {city}. Confirme antes de filtrar os eventos.',confirm:'Usar esta cidade',other:'Escolher outra',denied:'A localização não foi permitida. Escolha a UF e a cidade abaixo.',timeout:'A localização demorou mais que o esperado. Tente novamente ou escolha sua cidade abaixo.',uncertain:'Não foi possível sugerir uma cidade com segurança. Sua posição pode estar imprecisa ou próxima de uma divisa. Escolha sua cidade abaixo.',unavailable:'Não conseguimos identificar sua cidade. Escolha a UF e a cidade abaixo.',source:'Limites aproximados: IBGE, malha 2025. A escolha manual continua disponível.'},
    'en-US':{use:'Use my location',privacy:'With your permission, your browser provides your position to suggest a city. Carioca Ticket checks it in this browser without sending coordinates to a mapping service.',busy:'Finding your city…',cancel:'Cancel search',suggest:'Suggested city: {city}. Confirm before filtering events.',confirm:'Use this city',other:'Choose another',denied:'Location permission was denied. Choose a state and city below.',timeout:'Location took longer than expected. Try again or choose your city below.',uncertain:'We could not confidently suggest a city. Your position may be imprecise or near a boundary. Choose your city below.',unavailable:'We could not identify your city. Choose a state and city below.',source:'Approximate boundaries: IBGE, 2025 dataset. Manual selection is always available.'},
    'es':{use:'Usar mi ubicación',privacy:'Con tu permiso, el navegador proporciona tu posición para sugerir una ciudad. Carioca Ticket la consulta en este navegador sin enviar coordenadas a un servicio de mapas.',busy:'Identificando tu ciudad…',cancel:'Cancelar búsqueda',suggest:'Ciudad sugerida: {city}. Confirma antes de filtrar los eventos.',confirm:'Usar esta ciudad',other:'Elegir otra',denied:'No se permitió acceder a la ubicación. Elige el estado y la ciudad abajo.',timeout:'La ubicación tardó más de lo esperado. Inténtalo de nuevo o elige tu ciudad abajo.',uncertain:'No pudimos sugerir una ciudad con suficiente certeza. Tu posición puede ser imprecisa o estar cerca de un límite. Elige tu ciudad abajo.',unavailable:'No pudimos identificar tu ciudad. Elige el estado y la ciudad abajo.',source:'Límites aproximados: IBGE, datos de 2025. La selección manual sigue disponible.'},
    'zh-Hans':{use:'使用我的位置',privacy:'经你允许，浏览器将提供你的位置以推荐城市。Carioca Ticket 在此浏览器中查询，不会将坐标发送给地图服务。',busy:'正在识别你的城市…',cancel:'取消查找',suggest:'推荐城市：{city}。请确认后再筛选活动。',confirm:'使用此城市',other:'选择其他城市',denied:'未获得位置访问权限。请在下方选择州和城市。',timeout:'获取位置所用时间超出预期。请重试或在下方选择城市。',uncertain:'无法可靠地推荐城市。你的位置可能不够准确或靠近边界。请在下方选择城市。',unavailable:'无法识别你的城市。请在下方选择州和城市。',source:'近似边界：IBGE 2025 年数据。你仍可手动选择城市。'}
  };
  var host=document.createElement('div');host.className='home-geolocation';host.id='home-geolocation';
  var use=document.createElement('button'),cancel=document.createElement('button'),confirm=document.createElement('button'),other=document.createElement('button');
  [use,cancel,confirm,other].forEach(function(b){b.type='button';b.className='btn btn-secondary';});
  use.id='location-use-device';cancel.id='location-device-cancel';confirm.id='location-device-confirm';other.id='location-device-other';
  var privacy=document.createElement('p'),status=document.createElement('p'),source=document.createElement('p'),actions=document.createElement('div');
  privacy.id='location-device-privacy';status.id='location-device-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  use.setAttribute('aria-describedby',privacy.id);actions.className='dialog-actions';actions.append(confirm,other);
  host.append(use,privacy,status,cancel,actions,source);document.getElementById('location-status').before(host);
  var css=document.createElement('link');css.rel='stylesheet';css.href='/assets/home-location.css?v=20261009-local-location1';document.head.appendChild(css);
  var revision=0,worker=null,timer=null,state='',suggestion=null;
  function t(key){return (words[H.locale]||words['pt-BR'])[key];}
  function render(){
    use.textContent=t('use');privacy.textContent=t('privacy');cancel.textContent=t('cancel');confirm.textContent=t('confirm');other.textContent=t('other');
    source.replaceChildren(document.createTextNode(t('source')+' '));var link=document.createElement('a');link.href='https://servicodados.ibge.gov.br/api/docs/malhas?versao=4';link.textContent='IBGE';link.target='_blank';link.rel='noopener noreferrer';source.append(link);
    use.disabled=state==='busy';cancel.hidden=state!=='busy';actions.hidden=state!=='suggest';status.replaceChildren();
    if(state==='suggest' && suggestion){var parts=t('suggest').split('{city}'),city=document.createElement('span');city.lang='pt-BR';city.setAttribute('translate','no');city.textContent=suggestion[2]+' / '+suggestion[1];status.append(document.createTextNode(parts[0]),city,document.createTextNode(parts[1]));}
    else status.textContent=state?t(state):'';
  }
  function stop(next){revision++;if(worker){worker.terminate();worker=null;}clearTimeout(timer);timer=null;suggestion=null;state=next||'';render();}
  function finish(next,token){if(token!==revision || !dialog.open)return;stop(next);}
  function start(){
    stop('busy');var token=revision;
    if(!window.isSecureContext || !navigator.geolocation || !window.Worker){finish('unavailable',token);return;}
    // Overall UI deadline also bounds time spent waiting for a permission prompt.
    timer=setTimeout(function(){finish('timeout',token);},25000);
    navigator.geolocation.getCurrentPosition(async function(position){
      if(token!==revision || !dialog.open)return;
      var coords=position.coords;
      if(!Number.isFinite(coords.accuracy) || coords.accuracy<0 || coords.accuracy>5000){finish('uncertain',token);return;}
      try {
        var cities=await H.location.getCities();
        if(token!==revision || !dialog.open)return;
        worker=new Worker('/assets/home-location-worker.js?v=20261009-local-location1');
        worker.onerror=function(){finish('unavailable',token);};
        worker.onmessage=function(event){
          if(token!==revision || !dialog.open)return;
          var result=event.data,row=result.status==='found' && cities.find(function(r){return r[0]===result.id && r[1]===result.uf;});
          if(!row){finish(result.status==='uncertain'?'uncertain':'unavailable',token);return;}
          stop();suggestion=row;state='suggest';render();confirm.focus();
        };
        worker.postMessage({point:[coords.longitude,coords.latitude],accuracy:coords.accuracy});
      }catch(_){finish('unavailable',token);}
    },function(error){finish(error.code===1?'denied':error.code===3?'timeout':'unavailable',token);},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
  }
  use.addEventListener('click',start);
  cancel.addEventListener('click',function(){stop();use.focus();});
  other.addEventListener('click',function(){stop();document.getElementById('location-uf').focus();});
  confirm.addEventListener('click',function(){var id=suggestion && suggestion[0];stop();if(id && !H.location.applySuggestion(id))state='unavailable';render();});
  // New manual intent wins immediately, including edits before a GPS callback.
  document.getElementById('location-form').addEventListener('input',function(e){if(!host.contains(e.target))stop();},true);
  document.getElementById('location-form').addEventListener('change',function(e){if(!host.contains(e.target))stop();},true);
  document.getElementById('location-form').addEventListener('click',function(e){if(!host.contains(e.target) && e.target.closest('button'))stop();},true);
  document.getElementById('location-form').addEventListener('submit',function(){stop();},true);
  dialog.addEventListener('cancel',function(){stop();});dialog.addEventListener('close',function(){stop();});
  document.addEventListener('ct:filters',function(){stop();});document.addEventListener('ct:language',render);
  document.addEventListener('visibilitychange',function(){if(document.hidden && state==='busy')stop();});
  window.addEventListener('pagehide',function(){stop();});
  render();
}());
