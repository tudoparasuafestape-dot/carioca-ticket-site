(function () {
  'use strict';
  var H = window.CTHome;
  if (!H) return;
  // Approved local PNGs: original bytes preserved; provenance in the review report.
  var campaigns = {
    primary: [{ src: '/assets/home-ad-tpssf.png', width: 2172, height: 724,
      href: 'https://wa.me/5581995023085?text=Ol%C3%A1%21%20Vim%20pela%20Carioca%20Ticket%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20loca%C3%A7%C3%A3o%20de%20materiais%20para%20festas.', title: 'Tudo Para Sua Festa',
      descriptionKey: 'adTpssfDescription', ctaKey: 'adTpssfCta' }],
    secondary: [{ src: '/assets/home-ad-priscila.png', width: 2170, height: 725,
      href: 'https://wa.me/5581996200696?text=Ol%C3%A1%21%20Vim%20pela%20Carioca%20Ticket%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20os%20servi%C3%A7os%20e%20hor%C3%A1rios%20dispon%C3%ADveis%20para%20agendamento.', title: 'Priscila Ferreira',
      descriptionKey: 'adPriscilaDescription', ctaKey: 'adPriscilaCta' }]
  };
  var house = document.querySelector('#advertising-primary');
  var houseCopy = house.cloneNode(true);
  houseCopy.querySelectorAll('[id]').forEach(function (node) { node.removeAttribute('id'); });
  function mount(slot, items) {
    if (!items.length) return;
    var template = slot === house ? house : houseCopy.cloneNode(true);
    var label = template.querySelector('.eyebrow');
    label.remove();
    var stage = document.createElement('div'); stage.className = 'ad-stage';
    var own = document.createElement('div'); own.className = 'ad-slide ad-house';
    Array.from(template.children).forEach(function (child) { own.appendChild(child); });
    var failed = false;
    items.forEach(function (item) {
      var slide = document.createElement('a'); slide.className = 'ad-slide ad-campaign'; slide.href = item.href;
      slide.target = '_blank'; slide.rel = 'noopener noreferrer';
      var image = document.createElement('img'); image.src = item.src; image.alt = ''; image.width = item.width; image.height = item.height; image.loading = 'lazy';
      // Keep advertiser names and artwork original; localize readable descriptions and actions.
      var caption = document.createElement('span'); caption.className = 'ad-caption';
      var title = document.createElement('strong'); title.className = 'ad-campaign-title'; title.textContent = item.title; title.lang = 'pt-BR'; title.setAttribute('translate', 'no');
      var description = document.createElement('span'); description.dataset.i18n = item.descriptionKey; description.textContent = H.t(item.descriptionKey);
      var cta = document.createElement('span'); cta.className = 'ad-campaign-cta'; cta.dataset.i18n = item.ctaKey; cta.textContent = H.t(item.ctaKey);
      caption.append(title, description, cta); slide.append(image, caption); stage.appendChild(slide);
      image.addEventListener('error', function () {
        failed = true; clearTimeout(timer); show(slides.indexOf(own), false);
        controls.hidden = true; playback.hidden = true; motionNote.hidden = true; status.textContent = '';
      });
    });
    stage.appendChild(own);
    var controls = document.createElement('div'); controls.className = 'ad-controls';
    var previous = document.createElement('button'), pause = document.createElement('button'), next = document.createElement('button');
    [pause, previous, next].forEach(function (button) { button.type = 'button'; controls.appendChild(button); });
    previous.textContent = '←'; next.textContent = '→';
    var status = document.createElement('span'); status.className = 'sr-only'; status.setAttribute('role', 'status');
    var playback = document.createElement('span'); playback.className = 'ad-playback-state';
    var motionNote = document.createElement('p'); motionNote.className = 'ad-motion-note';
    motionNote.id = slot.id + '-motion-note'; motionNote.dataset.i18n = 'motionChoice'; motionNote.hidden = true;
    // Controls precede rotating links in keyboard order while remaining below the artwork visually.
    slot.replaceChildren(controls, stage, motionNote, label, playback, status); slot.classList.add('ad-rotation'); slot.hidden = false;
    slot.removeAttribute('aria-labelledby'); slot.dataset.i18nAriaLabel = 'adLabel';
    var slides = Array.from(stage.children), index = 0, paused = false;
    // Pick once for this page visit; no identifier, storage, impression beacon or reshuffle.
    var initial = Math.floor(Math.random() * slides.length);
    var pointer = false, contact = null, timer, visible = false, toggleIntent = null;
    function labels() {
      motionNote.hidden = failed || !reduced.matches;
      if (reduced.matches) pause.setAttribute('aria-describedby', motionNote.id);
      else pause.removeAttribute('aria-describedby');
      H.applyTranslations(slot);
      slot.setAttribute('aria-label', H.t('adLabel'));
      if (status.textContent) status.textContent = H.t('adPosition', { n: index + 1, total: slides.length });
      previous.dataset.i18nAriaLabel = 'adPrevious'; next.dataset.i18nAriaLabel = 'adNext'; pause.dataset.i18n = paused ? 'adPlay' : 'adPause';
      H.applyTranslations(controls); }
    function playbackLabel() {
      playback.dataset.i18n = paused || pointer || contact !== null || !visible || document.hidden || (slot.contains(document.activeElement) && document.activeElement !== pause) ? 'adPausedState' : 'adPlayingState';
      H.applyTranslations(playback);
    }
    function show(value, manual) {
      index = (value + slides.length) % slides.length;
      slides.forEach(function (slide, number) { slide.hidden = number !== index; slide.inert = number !== index; });
      if (manual) { paused = true; status.textContent = H.t('adPosition', { n: index + 1, total: slides.length }); labels(); }
    }
    function schedule() {
      clearTimeout(timer);
      playbackLabel();
      if (failed || paused || pointer || contact !== null || !visible || document.hidden || (slot.contains(document.activeElement) && document.activeElement !== pause)) return;
      timer = setTimeout(function () { show(index + 1, false); schedule(); }, 5000);
    }
    previous.addEventListener('click', function () { show(index - 1, true); schedule(); });
    next.addEventListener('click', function () { show(index + 1, true); schedule(); });
    // Each slot starts automatically; an intentional pause lasts until Play.
    pause.addEventListener('pointerdown', function () { toggleIntent = !paused; });
    pause.addEventListener('keydown', function () { toggleIntent = null; });
    pause.addEventListener('click', function () { paused = toggleIntent === null ? !paused : toggleIntent; toggleIntent = null; labels(); schedule(); });
    slot.addEventListener('pointerenter', function (event) { if (event.pointerType === 'mouse') { pointer = true; schedule(); } });
    slot.addEventListener('pointerleave', function (event) { if (event.pointerType === 'mouse') { pointer = false; schedule(); } });
    // A touch may become ordinary page scrolling. Hold the timer only until
    // release/cancel; an actual activation still pauses deliberately.
    stage.addEventListener('pointerdown', function (event) { if (event.isPrimary && event.button === 0) { contact = event.pointerId; schedule(); } });
    function releaseContact(event) { if (contact === event.pointerId) { contact = null; schedule(); } }
    window.addEventListener('pointerup', releaseContact);
    window.addEventListener('pointercancel', releaseContact);
    stage.addEventListener('click', function () { paused = true; labels(); schedule(); });
    slot.addEventListener('focusin', function () { paused = true; labels(); schedule(); });
    slot.addEventListener('focusout', function () { setTimeout(schedule, 0); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) contact = null; schedule(); });
    document.addEventListener('ct:language', function () { labels(); playbackLabel(); });
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.addEventListener('change', function () { if (reduced.matches) paused = true; labels(); schedule(); });
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; schedule(); }, { threshold: 0 }).observe(slot);
    show(initial, false); labels();
  }
  H.mountAdvertisements = mount;
  mount(house, campaigns.primary);
  mount(document.getElementById('advertising-secondary'), campaigns.secondary);
}());


