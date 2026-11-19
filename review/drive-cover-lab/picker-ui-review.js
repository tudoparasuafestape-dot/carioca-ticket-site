/* REVIEW COPY ONLY, not loaded by production. Approved assets only. Session token is injected by the existing authenticated bridge. */
(() => {
  'use strict';
  const HOST = 'https://cariocaticket.com.br';
  const dialog = document.createElement('dialog');
  dialog.className = 'ct-cover-picker';
  dialog.setAttribute('aria-labelledby', 'ctCoverTitle');
  dialog.innerHTML = `<h2 id="ctCoverTitle">Escolher capa</h2>
    <p id="ctCoverEvent"></p><p>Escolha uma arte aprovada. Salvar a capa não publica o evento nem abre as vendas.</p>
    <div id="ctCoverAssets" class="ct-cover-assets"></div>
    <label for="ctCoverReason">Motivo da alteração</label><textarea id="ctCoverReason" maxlength="240" rows="2"></textarea>
    <p id="ctCoverStatus" role="status" aria-live="polite"></p>
    <div class="ct-cover-actions"><button id="ctCoverSave" type="button" disabled>Salvar capa</button>
    <button id="ctCoverRefresh" type="button">Consultar novamente</button>
    <button id="ctCoverClose" type="button">Cancelar</button></div>`;
  document.body.appendChild(dialog);
  const el = name => document.getElementById('ctCover' + name);
  const unresolved = new Map();
  let eventId = '', generation = 0, current = null, selected = '', ready = new Set(), busy = false, saving = false, opener;
  function message(text) { el('Status').textContent = text; }
  function controls() {
    el('Save').disabled = busy || unresolved.has(eventId) || !current || !selected || !ready.has(selected) || selected === current.currentAssetId || el('Reason').value.trim().length < 5;
    el('Refresh').disabled = busy;
    el('Close').disabled = saving;
    el('Reason').disabled = busy;
    for (const input of el('Assets').querySelectorAll('input')) input.disabled = busy || unresolved.has(eventId);
    dialog.setAttribute('aria-busy', String(busy));
  }
  function call(method, payload) {
    return new Promise((resolve, reject) => {
      if (!window.google?.script?.run) return reject(new Error('Entre pelo Portal do Produtor para continuar.'));
      window.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[method](payload);
    });
  }
  function validAsset(asset) {
    if (!asset || typeof asset.assetId !== 'string' || !asset.assetId || typeof asset.name !== 'string' || !asset.name || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) return false;
    try {
      const url = new URL(asset.url);
      const drive = url.origin === 'https://drive.usercontent.google.com' &&
        ['/download','/uc'].includes(url.pathname) && /^[A-Za-z0-9_-]{10,200}$/.test(url.searchParams.get('id') || '') &&
        url.searchParams.get('export') === 'download' && [...url.searchParams.keys()].length === 2 && !url.hash && !url.username && !url.password;
      if (drive) return true;
      return url.origin === HOST && /^\/assets\/eventos\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password;
    } catch (_) { return false; }
  }
  function render(data) {
    if (data?.ok !== true || data.eventId !== eventId || typeof data.version !== 'string' || !data.version || !Array.isArray(data.assets) || data.assets.length > 102 || !data.assets.every(validAsset) || new Set(data.assets.map(a => a.assetId)).size !== data.assets.length) throw new Error('Não foi possível validar a biblioteca autorizada.');
    current = data; selected = data.currentAssetId || ''; ready = new Set(); el('Assets').replaceChildren();
    el('Event').textContent = data.eventName || 'Capa do evento selecionado';
    const mine = generation;
    for (const asset of data.assets) {
      const label = document.createElement('label'); label.className = 'ct-cover-option';
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'ct-approved-cover'; input.value = asset.assetId; input.checked = selected === asset.assetId;
      input.addEventListener('change', () => { selected = asset.assetId; controls(); });
      const img = document.createElement('img'); img.alt = asset.name; img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => { if (mine === generation) { ready.add(asset.assetId); controls(); } });
      img.addEventListener('error', () => { if (mine === generation) { ready.delete(asset.assetId); message('A miniatura não carregou. Consulte novamente antes de salvar.'); controls(); } });
      img.src = asset.url;
      const name = document.createElement('span'); name.textContent = asset.name;
      label.append(input, img, name); el('Assets').appendChild(label);
    }
  }
  function consultationError(error) {
    // Never display raw RPC messages, which can contain internal or user data.
    const raw = typeof error?.message === 'string' ? error.message : '';
    const code = raw.match(/\bCT_CAPA_([A-Z_]+)\b/)?.[1] || '';
    if (code === 'ASSET_NAO_AUTORIZADO') return 'Não há arte aprovada disponível na biblioteca para este evento. A capa precisa ser cadastrada antes da seleção.';
    if (code === 'ACESSO_NEGADO') return 'Não foi possível autorizar a consulta. Entre novamente pelo Portal do Produtor e confira seu acesso ao evento.';
    return 'Não foi possível consultar a biblioteca agora. Tente novamente; se o problema continuar, contate o suporte.';
  }
  async function load() {
    const mine = ++generation; busy = true; current = null; selected = ''; ready = new Set(); el('Assets').replaceChildren(); controls(); message('Consultando as artes autorizadas…');
    try {
      const data = await call('ctEventoCapaBibliotecaListarSeguraPROD', eventId);
      if (mine !== generation) return;
      render(data);
      const pending = unresolved.get(eventId);
      if (pending && data.currentAssetId === pending.assetId && data.version !== pending.version) {
        unresolved.delete(eventId); message('Capa confirmada. As vendas não foram alteradas.');
      } else if (pending) message('O envio anterior ainda não foi confirmado. Consulte novamente; não repetiremos a gravação automaticamente.');
      else message(data.assets.length ? 'Confira a arte completa, selecione e informe o motivo.' : 'Nenhuma arte aprovada disponível para este evento.');
    } catch (error) { if (mine === generation) { current = null; message(consultationError(error)); } }
    finally { if (mine === generation) { busy = false; controls(); } }
  }
  function open(id, source) {
    if (dialog.open || saving || !id) return;
    eventId = id; opener = source; generation++; current = null; selected = ''; ready = new Set(); el('Assets').replaceChildren(); el('Event').textContent = ''; el('Reason').value = ''; busy = false;
    dialog.showModal(); load();
  }
  el('Save').addEventListener('click', async () => {
    if (el('Save').disabled) return;
    const mine = generation, target = eventId, assetId = selected, version = current.version;
    unresolved.set(target, {assetId, version}); busy = true; saving = true; controls(); message('Salvando somente a capa…');
    try {
      const result = await call('ctEventoCapaBibliotecaSalvarSeguraPROD', {eventId: target, assetId, expectedVersion: version, motivo: el('Reason').value.trim()});
      if (mine !== generation) return;
      if (result?.ok !== true || result.eventId !== target || result.assetId !== assetId || typeof result.version !== 'string' || !result.version || result.version === version) throw new Error('Resposta inconclusiva');
      unresolved.delete(target); current.currentAssetId = assetId; current.version = result.version;
      message('Capa salva. O status do evento e as vendas não foram alterados.');
    } catch (error) {
      if (mine === generation) {
        const code = (typeof error?.message === 'string' ? error.message : '').match(/\bCT_CAPA_([A-Z_]+)\b/)?.[1] || '';
        // These explicit backend failures occur before any visual write. Unknown
        // errors remain unresolved: never assume a timeout means no commit.
        if (['CONFLITO', 'ACESSO_NEGADO', 'ARGUMENTOS_INVALIDOS', 'ASSET_NAO_AUTORIZADO', 'EVENTO_INVALIDO'].includes(code)) {
          unresolved.delete(target); current = null; selected = ''; ready = new Set(); el('Assets').replaceChildren();
          message('A alteração foi recusada e não foi salva. Consulte novamente antes de escolher a capa.');
        } else message('Não foi possível confirmar o envio. Consulte novamente antes de qualquer outra alteração.');
      }
    }
    finally { if (mine === generation) { busy = false; saving = false; controls(); } }
  });
  el('Reason').addEventListener('input', controls);
  el('Refresh').addEventListener('click', () => { if (!busy) load(); });
  el('Close').addEventListener('click', () => { if (!saving) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => { generation++; current = null; busy = false; opener?.focus(); });
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-approved-event-cover]');
    if (action) open(action.dataset.approvedEventCover, action);
  });
})();

