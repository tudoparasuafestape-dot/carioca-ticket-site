(function () {
  'use strict';
  var H = window.CTHome;
  if (!H) return;
  // Fill only after approved bytes have been materialized and visually checked.
  // TPSSF destination: https://www.instagram.com/tudoparasuafestape/
  // Priscila destination: https://wa.me/5581996200696
  // Missing artwork must not produce an empty/fictitious public campaign.
  var campaigns = { primary: [], secondary: [] };
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
    stage.appendChild(own);
    items.forEach(function (item) {
      var slide = document.createElement('a'); slide.className = 'ad-slide ad-campaign'; slide.href = item.href;
      slide.target = '_blank'; slide.rel = 'noopener noreferrer'; slide.hidden = true;
      var image = document.createElement('img'); image.src = item.src; image.alt = item.alt; image.width = item.width; image.height = item.height; image.loading = 'lazy';
      slide.appendChild(image); stage.appendChild(slide);
    });
    var controls = document.createElement('div'); controls.className = 'ad-controls';
    var previous = document.createElement('button'), pause = document.createElement('button'), next = document.createElement('button');
    [previous, pause, next].forEach(function (button) { button.type = 'button'; controls.appendChild(button); });
    previous.textContent = '←'; next.textContent = '→';
    var status = document.createElement('span'); status.className = 'sr-only'; status.setAttribute('role', 'status');
    slot.replaceChildren(stage, label, controls, status); slot.classList.add('ad-rotation'); slot.hidden = false;
    slot.removeAttribute('aria-labelledby'); slot.setAttribute('aria-label', H.t('adLabel'));
    var slides = Array.from(stage.children), index = 0, paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var pointer = false, timer, visible = false;
    function labels() { previous.setAttribute('aria-label', H.t('adPrevious')); next.setAttribute('aria-label', H.t('adNext')); pause.textContent = H.t(paused ? 'adPlay' : 'adPause'); }
    function show(value, manual) {
      index = (value + slides.length) % slides.length;
      slides.forEach(function (slide, number) { slide.hidden = number !== index; slide.inert = number !== index; });
      if (manual) { paused = true; status.textContent = H.t('adPosition', { n: index + 1, total: slides.length }); labels(); }
    }
    function schedule() {
      clearTimeout(timer);
      if (paused || pointer || !visible || document.hidden || slot.contains(document.activeElement)) return;
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
    labels();
  }
  H.mountAdvertisements = mount;
  mount(house, campaigns.primary);
  mount(document.getElementById('advertising-secondary'), campaigns.secondary);
}());
