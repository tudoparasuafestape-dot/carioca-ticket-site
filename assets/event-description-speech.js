(function () {
  'use strict';
  var controls = document.getElementById('description-audio');
  var description = document.getElementById('longDescription');
  if (!controls || !description) return;
  var listen = document.getElementById('description-listen');
  var pause = document.getElementById('description-pause');
  var stop = document.getElementById('description-stop');
  var status = document.getElementById('description-audio-status');
  var synth = window.speechSynthesis;
  var supported = synth && typeof window.SpeechSynthesisUtterance === 'function';
  var voice = null;
  var state = 'idle';
  var generation = 0;
  var current = null;
  var watchdog = null;
  var chunks = [];
  var index = 0;
  var statusMessage = '';

  function text(source) {
    return window.CTEventI18n && typeof window.CTEventI18n.text === 'function' ? window.CTEventI18n.text(source) : source;
  }
  function descriptionLanguage() {
    // Producer content keeps its own language when the surrounding UI changes.
    return (description.getAttribute('lang') || 'pt-BR').trim().replace(/_/g, '-') || 'pt-BR';
  }

  // A template is inert: description markup never becomes live page content.
  function cleanText(value) {
    var template = document.createElement('template');
    template.innerHTML = String(value || '');
    // Some descriptions store escaped HTML. Decode one extra inert layer.
    if (!template.content.childElementCount && /<\/?[a-z][^>]*>/i.test(template.content.textContent || '')) {
      template.innerHTML = template.content.textContent;
    }
    template.content.querySelectorAll('script,style,noscript,template,svg,iframe,object,[hidden],[aria-hidden="true"]').forEach(function (node) { node.remove(); });
    template.content.querySelectorAll('br,p,div,li,h1,h2,h3,h4,h5,h6,section,article,tr').forEach(function (node) {
      node.before(document.createTextNode(' '));
      node.after(document.createTextNode(' '));
    });
    return (template.content.textContent || '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(^|\n)\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function splitText(text) {
    var result = [];
    while (text.length > 220) {
      var split = text.lastIndexOf(' ', 220);
      if (split < 1) split = 220;
      result.push(text.slice(0, split));
      text = text.slice(split).trim();
    }
    if (text) result.push(text);
    return result;
  }
  function active() { return ['starting', 'playing', 'pausing', 'paused', 'resuming'].indexOf(state) !== -1; }
  function update(message) {
    controls.dataset.state = state;
    listen.disabled = !voice || (active() && state !== 'paused') || !cleanText(description.textContent);
    listen.textContent = text(state === 'paused' ? 'Continuar descrição' : 'Ouvir descrição');
    pause.textContent = text('Pausar');
    stop.textContent = text('Parar');
    controls.setAttribute('aria-label', text('Leitura da descrição'));
    pause.disabled = state !== 'playing';
    stop.disabled = !active();
    if (message) statusMessage = message;
    if (statusMessage) status.textContent = text(statusMessage);
  }
  function cancel(nextState, message) {
    generation += 1; // Ignore late end/error events from a cancelled utterance.
    clearTimeout(watchdog);
    var ownedSpeech = current !== null || active();
    current = null;
    chunks = [];
    index = 0;
    state = nextState;
    if (supported && ownedSpeech) {
      try { synth.cancel(); if (synth.paused) synth.resume(); } catch (_) { /* Keep text available. */ }
    }
    update(message);
  }
  function fail(message) { cancel('error', message); }
  function armTimeout(expected, message, delay) {
    clearTimeout(watchdog);
    watchdog = setTimeout(function () { if (state === expected) fail(message); }, delay);
  }
  function refreshVoices() {
    if (active()) return;
    if (!supported) {
      state = 'unavailable';
      update('A leitura em voz alta não está disponível neste navegador. A descrição continua disponível em texto abaixo.');
      return;
    }
    var voices = [];
    try { voices = synth.getVoices(); } catch (_) { /* Treat blocked engines as unavailable. */ }
    var language = descriptionLanguage().toLowerCase();
    var baseLanguage = language.split('-')[0];
    var matching = voices.filter(function (item) {
      return item.localService === true && String(item.lang || '').toLowerCase().replace(/_/g, '-').split('-')[0] === baseLanguage;
    });
    voice = matching.find(function (item) { return String(item.lang).toLowerCase().replace(/_/g, '-') === language; }) || matching[0] || null;
    state = voice ? 'idle' : 'unavailable';
    update(voice ? 'Leitura com voz local no idioma da descrição. Use Ouvir descrição para começar.' :
      'Nenhuma voz local compatível com o idioma da descrição está disponível. Verifique as vozes do dispositivo ou leia a descrição abaixo.');
  }
  function speakNext(token) {
    if (token !== generation) return;
    if (index >= chunks.length) {
      current = null;
      state = 'idle';
      update('Leitura concluída.');
      return;
    }
    var utterance = new SpeechSynthesisUtterance(chunks[index]);
    current = utterance; // Retain it while the browser speaks.
    utterance.lang = descriptionLanguage();
    utterance.voice = voice;
    utterance.rate = 1;
    function valid() { return token === generation && current === utterance; }
    utterance.onstart = function () {
      if (!valid()) return;
      clearTimeout(watchdog);
      state = 'playing';
      update('Lendo a descrição.');
    };
    utterance.onpause = function () {
      if (!valid() || state !== 'pausing') return;
      clearTimeout(watchdog);
      state = 'paused';
      update('Leitura pausada. Use Continuar descrição para retomar.');
    };
    utterance.onresume = function () {
      if (!valid() || state !== 'resuming') return;
      clearTimeout(watchdog);
      state = 'playing';
      update('Lendo a descrição.');
    };
    utterance.onend = function () {
      if (!valid()) return;
      clearTimeout(watchdog);
      index += 1;
      if (state === 'pausing' || state === 'paused') {
        current = null;
        state = 'paused';
        update('Leitura pausada. Use Continuar descrição para retomar.');
        return;
      }
      speakNext(token);
    };
    utterance.onerror = function () {
      if (valid()) fail('Não foi possível reproduzir a leitura neste navegador. Você pode tentar novamente ou ler o texto abaixo.');
    };
    state = 'starting';
    update('Preparando a leitura…');
    armTimeout('starting', 'O navegador não iniciou a leitura. Tente novamente ou leia o texto abaixo.', 8000);
    try { synth.speak(utterance); } catch (_) { fail('A leitura está indisponível neste navegador. Leia o texto abaixo.'); }
  }
  listen.addEventListener('click', function () {
    if (state === 'paused') {
      if (!current) {
        try { synth.resume(); } catch (_) { /* Starting the next chunk may still work. */ }
        speakNext(generation);
        return;
      }
      state = 'resuming';
      update('Retomando a leitura…');
      armTimeout('resuming', 'O navegador não retomou a leitura. Use Ouvir descrição para começar novamente.', 2000);
      try { synth.resume(); } catch (_) { fail('Não foi possível retomar. Use Ouvir descrição para começar novamente.'); }
      return;
    }
    if (active()) return;
    refreshVoices();
    if (!voice) return;
    chunks = splitText(cleanText(description.textContent));
    if (!chunks.length) { update('Não há descrição disponível para leitura.'); return; }
    generation += 1;
    index = 0;
    speakNext(generation);
  });
  pause.addEventListener('click', function () {
    if (state !== 'playing') return;
    state = 'pausing';
    update('Pausando a leitura…');
    armTimeout('pausing', 'Este navegador não confirmou a pausa. A leitura foi parada; você pode começar novamente.', 2000);
    try { synth.pause(); } catch (_) { fail('A pausa não está disponível. A leitura foi parada.'); }
  });
  stop.addEventListener('click', function () {
    cancel('idle', 'Leitura parada.');
    listen.focus();
  });
  function leave() { if (active()) cancel('idle', 'Leitura parada.'); }
  window.addEventListener('pagehide', leave);
  window.addEventListener('popstate', leave);
  document.addEventListener('ct:public-language', function () {
    if (active()) cancel('idle', 'Leitura parada.');
    else update();
  });
  // Re-rendering or switching event must never keep reading the old description.
  new MutationObserver(function (mutations) {
    if (active()) cancel('idle', 'A descrição mudou. Use Ouvir descrição para ouvir o texto atualizado.');
    if (mutations.some(function (mutation) { return mutation.type === 'attributes' && mutation.target === description; })) refreshVoices();
    else update();
  }).observe(description, { attributes: true, attributeFilter: ['lang'], childList: true, characterData: true, subtree: true });
  if (supported && synth.addEventListener) synth.addEventListener('voiceschanged', refreshVoices);
  refreshVoices();
}());

