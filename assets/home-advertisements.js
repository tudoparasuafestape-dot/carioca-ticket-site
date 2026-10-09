(function () {
  'use strict';
  var H = window.CTHome;
  if (!H) return;
  // Approved local PNGs: original bytes preserved; provenance in the review report.
  var campaigns = {
    primary: [{ src: '/assets/home-ad-tpssf.png', width: 2172, height: 724,
      href: 'https://www.instagram.com/tudoparasuafestape/', title: 'Tudo Para Sua Festa',
      description: 'Locação de materiais para eventos', cta: 'Conheça a Tudo Para Sua Festa' }],
    secondary: [{ src: '/assets/home-ad-priscila.png', width: 2170, height: 725,
      href: 'https://wa.me/5581996200696', title: 'Priscila Ferreira',
      description: 'Nail Designer', cta: 'Clique aqui e faça seu agendamento' }]
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
      slide.target = '_blank'; slide.rel = 'noopener noreferrer'; slide.lang = 'pt-BR'; slide.setAttribute('translate', 'no');
      var image = document.createElement('img'); image.src = item.src; image.alt = ''; image.width = item.width; image.height = item.height; image.loading = 'lazy';
      // A readable transcription preserves the approved artwork's words on narrow screens.
      var caption = document.createElement('span'); caption.className = 'ad-caption';
      var title = document.createElement('strong'); title.textContent = item.title;
      var description = document.createElement('span'); description.textContent = item.description;
      var cta = document.createElement('span'); cta.className = 'ad-campaign-cta'; cta.textContent = item.cta;
      caption.append(title, description, cta); slide.append(image, caption); stage.appendChild(slide);
      image.addEventListener('error', function () {
        failed = true; clearTimeout(timer); show(slides.indexOf(own), false);
        controls.hidden = true; status.textContent = '';
      });
    });
    stage.appendChild(own);
    var controls = document.createElement('div'); controls.className = 'ad-controls';
    var previous = document.createElement('button'), pause = document.createElement('button'), next = document.createElement('button');
    [previous, pause, next].forEach(function (button) { button.type = 'button'; controls.appendChild(button); });
    previous.textContent = '←'; next.textContent = '→';
    var status = document.createElement('span'); status.className = 'sr-only'; status.setAttribute('role', 'status');
    slot.replaceChildren(stage, label, controls, status); slot.classList.add('ad-rotation'); slot.hidden = false;
    slot.removeAttribute('aria-labelledby'); slot.dataset.i18nAriaLabel = 'adLabel';
    var slides = Array.from(stage.children), index = 0, paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var pointer = false, timer, visible = false;
    function labels() {
      H.applyTranslations(slot);
      slot.setAttribute('aria-label', H.t('adLabel'));
      if (status.textContent) status.textContent = H.t('adPosition', { n: index + 1, total: slides.length });
      previous.dataset.i18nAriaLabel = 'adPrevious'; next.dataset.i18nAriaLabel = 'adNext'; pause.dataset.i18n = paused ? 'adPlay' : 'adPause';
      H.applyTranslations(controls); }
    function show(value, manual) {
      index = (value + slides.length) % slides.length;
      slides.forEach(function (slide, number) { slide.hidden = number !== index; slide.inert = number !== index; });
      if (manual) { paused = true; status.textContent = H.t('adPosition', { n: index + 1, total: slides.length }); labels(); }
    }
    function schedule() {
      clearTimeout(timer);
      if (failed || paused || pointer || !visible || document.hidden || slot.contains(document.activeElement)) return;
      timer = setTimeout(function () { show(index + 1, false); schedule(); }, 5000);
    }
    previous.addEventListener('click', function () { show(index - 1, true); schedule(); });
    next.addEventListener('click', function () { show(index + 1, true); schedule(); });
    pause.addEventListener('click', function () { paused = !paused; labels(); schedule(); });
    slot.addEventListener('mouseenter', function () { pointer = true; schedule(); });
    slot.addEventListener('mouseleave', function () { pointer = false; schedule(); });
    slot.addEventListener('focusin', schedule);
    slot.addEventListener('focusout', function () { setTimeout(schedule, 0); });
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('ct:language', labels);
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.addEventListener('change', function () { if (reduced.matches) { paused = true; labels(); schedule(); } });
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; schedule(); }).observe(slot);
    show(0, false); labels();
  }
  H.mountAdvertisements = mount;
  mount(house, campaigns.primary);
  mount(document.getElementById('advertising-secondary'), campaigns.secondary);
}());
