/* Somente a operacao aprovada do ERA. A ponte existente injeta a sessao. */
(() => {
  'use strict';
  const EVENT = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
  const URL = 'https://cariocaticket.com.br/assets/eventos/era-beauty-capa-oficial-20261008.jpg';
  const FIELDS = ['capaUrl','posterUrl','destaque','descricaoCurta','descricaoCompleta'];
  const dialog = document.createElement('dialog');
  dialog.className = 'era-visual-dialog'; dialog.setAttribute('aria-labelledby','eraVisualTitle');
  dialog.innerHTML = `<h2 id="eraVisualTitle">Visual aprovado do ERA BEAUTY</h2>
    <p>Confira a capa e os textos abaixo. Confirme para aplicar ao evento.</p>
    <img id="eraVisualImage" class="era-visual-image" alt="Prévia integral da capa aprovada do ERA BEAUTY" referrerpolicy="no-referrer" hidden>
    <dl id="eraVisualTexts" hidden><dt>Destaque</dt><dd id="eraVisualHighlight"></dd><dt>Descrição curta</dt><dd id="eraVisualShort"></dd><dt>Descrição completa</dt><dd id="eraVisualFull"></dd></dl>
    <p id="eraVisualStatus" class="era-visual-status" role="status" aria-live="polite"></p>
    <div class="era-visual-actions"><button type="button" id="eraVisualClose">Cancelar</button><button type="button" id="eraVisualCheck" hidden>Consultar novamente</button><button type="button" id="eraVisualConfirm" class="era-visual-confirm" disabled>Aplicar capa e textos</button></div>`;
  document.body.appendChild(dialog);
  const el = suffix => dialog.querySelector('#eraVisual' + suffix);
  let generation = 0, current = null, busy = false, saving = false, imageReady = false, uncertain = false;
  const call = data => new Promise((resolve,reject) => google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).ctEventosOperacionalVisualEraSeguraPROD(data));
  function message(value, error=false) { el('Status').textContent=value;el('Status').dataset.error=String(error); }
  function controls() {
    el('Confirm').disabled=busy || uncertain || !current || !imageReady || current.jaAplicado;
    el('Check').disabled=busy;el('Close').disabled=saving;dialog.setAttribute('aria-busy',String(busy));
  }
  function previewValid(value) {
    return value?.sucesso === true && value.eventoId === EVENT && /^[a-f0-9]{64}$/.test(value.revisao || '') &&
      value.proposto?.capaUrl === URL && value.proposto?.posterUrl === URL &&
      FIELDS.every(key => typeof value.proposto[key] === 'string');
  }
  function matches(value, proposed) { return FIELDS.every(key => value?.[key] === proposed[key]); }
  function render(value) {
    current=value;el('Highlight').textContent=value.proposto.destaque;el('Short').textContent=value.proposto.descricaoCurta;el('Full').textContent=value.proposto.descricaoCompleta;
    el('Texts').hidden=false;el('Image').hidden=false;
    if (el('Image').getAttribute('src') !== URL) { imageReady=false;el('Image').src=URL; }
  }
  el('Image').addEventListener('load',()=>{imageReady=true;controls();});
  el('Image').addEventListener('error',()=>{imageReady=false;message('A prévia da imagem não carregou. Consulte novamente antes de confirmar.',true);el('Check').hidden=false;controls();});
  async function load(reconcile=false, reason='') {
    const mine=generation;busy=true;controls();
    try {
      const value=await call({acao:'PREVIA'});
      if(mine!==generation)return;
      if(!previewValid(value))throw new Error('A prévia recebida não corresponde à operação aprovada do ERA.');
      render(value);
      if(value.jaAplicado && matches(value.atual,value.proposto)) {
        uncertain=false;message('Capa e textos aprovados já estão aplicados.');el('Close').textContent='Concluir';el('Check').hidden=true;
      } else if(reconcile) {
        uncertain=true;message((reason?reason+' ':'')+'O resultado ainda não foi confirmado. Consulte novamente; nenhum envio será repetido automaticamente.',true);el('Check').hidden=false;el('Close').textContent='Fechar';
      } else { uncertain=false;message('Confira a prévia. Cancelar mantém o visual atual.'); }
    } catch(error) {
      if(mine!==generation)return;
      current=null;message(error?.message || 'Não foi possível consultar o visual. Entre no Portal do Produtor e tente novamente.',true);el('Check').hidden=false;
    } finally { if(mine===generation){busy=false;controls();} }
  }
  function open() {
    if(dialog.open)return;
    generation++;current=null;uncertain=false;imageReady=false;busy=false;saving=false;
    el('Image').removeAttribute('src');el('Image').hidden=true;el('Texts').hidden=true;el('Check').hidden=true;el('Close').textContent='Cancelar';
    message('Consultando sua autorização e a prévia do ERA…');dialog.showModal();load();
  }
  el('Confirm').addEventListener('click',async()=>{
    if(busy || uncertain || !current || !imageReady || current.jaAplicado)return;
    const mine=generation, proposed=current.proposto, revision=current.revisao;
    busy=true;saving=true;uncertain=true;controls();message('Validando a imagem e aplicando o visual aprovado. Aguarde a confirmação…');
    try {
      const result=await call({acao:'CONFIRMAR',revisao:revision});
      if(mine!==generation)return;
      if(result?.sucesso !== true || result.eventoId !== EVENT || result.textosExatos !== true || !matches(result.visual,proposed))
        throw new Error('A resposta não confirmou o visual exato.');
      uncertain=false;current.jaAplicado=true;message('Capa e textos aplicados e conferidos com sucesso.');el('Close').textContent='Concluir';el('Check').hidden=true;
    } catch(error) {
      if(mine===generation)await load(true,error?.message || 'Não foi possível confirmar a resposta do envio.');
    } finally { if(mine===generation){saving=false;busy=false;controls();} }
  });
  el('Check').addEventListener('click',()=>{
    if(!imageReady){el('Image').removeAttribute('src');}
    load(uncertain);
  });
  el('Close').addEventListener('click',()=>{if(!saving)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>{generation++;current=null;busy=false;saving=false;});
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-era-approved-visual]');
    if(action?.dataset.eraApprovedVisual === EVENT)open();
  });
})();
