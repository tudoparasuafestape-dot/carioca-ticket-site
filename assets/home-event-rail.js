(function () {
  'use strict';
  var H = window.CTHome, host = document.getElementById('event-feature');
  if (!H || !host || typeof IntersectionObserver !== 'function' || typeof ResizeObserver !== 'function') return;
  var grid = document.getElementById('events-grid');
  var controls = document.getElementById('event-rail-controls');
  var pause = document.getElementById('event-rail-pause');
  var position = document.getElementById('event-rail-position');
  var help = document.getElementById('event-rail-help');
  var announcement = document.getElementById('event-rail-announcement');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var cards = [], index = 0, paused = reduced.matches, visible = false, hovered = false;
  var timer, animationTimer, frame, moving = false, drag = null, clickBlockedUntil = 0, toggleIntent = null;
  var INTERVAL = 5000, DURATION = 320;
  var sharing = new Set();
  function modulo(value) { return (value + cards.length) % cards.length; }
  function step() { return cards.length ? cards[0].getBoundingClientRect().width + 16 : 0; }
  function labels() {
    pause.disabled = reduced.matches || sharing.size > 0;
    document.getElementById('event-rail-previous').disabled = sharing.size > 0;
    document.getElementById('event-rail-next').disabled = sharing.size > 0;
    pause.dataset.i18n = paused ? 'railPlay' : 'railPause';
    H.applyTranslations(host);
    position.textContent = cards.length ? H.t('railPosition', { n: index + 1, total: cards.length }) : '';
    position.lang = H.locale;
    announcement.setAttribute('aria-live', paused ? 'polite' : 'off');
    grid.setAttribute('aria-label', H.t('eventFeature'));
    cards.forEach(function (card, number) {
      card.setAttribute('role', 'group');
      card.setAttribute('aria-roledescription', H.t('railSlide'));
      card.setAttribute('aria-label', H.t('railPosition', { n: number + 1, total: cards.length }));
    });
  }
  function clearAnimation() {
    clearTimeout(animationTimer); cancelAnimationFrame(frame); moving = false;
    grid.classList.remove('is-dragging');
    grid.removeAttribute('data-moving');
  }
  function paint() {
    var distance = step();
    cards.forEach(function (card, number) {
      var current = number === index, peek = cards.length > 1 && number === modulo(index + 1);
      card.style.transition = 'none';
      card.style.transform = 'translateX(' + (current ? 0 : distance) + 'px)';
      card.style.visibility = current || peek ? 'visible' : 'hidden';
      card.inert = !current;
      card.setAttribute('aria-hidden', String(!current));
    });
    grid.dataset.activeIndex = String(index);
  }
  function schedule(delay) {
    clearTimeout(timer);
    if (cards.length < 2 || sharing.size || paused || reduced.matches || hovered || !visible || document.hidden || moving || drag || (host.contains(document.activeElement) && document.activeElement !== pause)) return;
    timer = setTimeout(function () { go(1, false); }, typeof delay === 'number' ? delay : INTERVAL);
  }
  function stop() { paused = true; clearTimeout(timer); labels(); }
  function finish(manual) {
    clearAnimation(); paint(); labels();
    if (manual) announcement.textContent = H.t('railPosition', { n: index + 1, total: cards.length });
    schedule(manual ? INTERVAL : INTERVAL - DURATION);
  }
  // Animate only the outgoing/incoming original nodes. No cloned links, DOM
  // reordering, scrollIntoView, focus calls, storage access or backend requests.
  function go(direction, manual, targetIndex) {
    if (cards.length < 2 || sharing.size) return;
    if (manual) stop();
    clearAnimation();
    var from = index, target = targetIndex === undefined ? modulo(index + direction) : targetIndex;
    if (target === from) { paint(); schedule(); return; }
    var distance = step(), outgoing = cards[from], incoming = cards[target];
    cards.forEach(function (card) { card.style.transition = 'none'; card.style.visibility = 'hidden'; card.inert = true; card.setAttribute('aria-hidden', 'true'); });
    outgoing.style.visibility = incoming.style.visibility = 'visible';
    outgoing.style.transform = 'translateX(0px)'; incoming.style.transform = 'translateX(' + direction * distance + 'px)';
    index = target;
    if (reduced.matches) { finish(manual); return; }
    moving = true; grid.dataset.moving = 'true';
    void grid.offsetWidth;
    frame = requestAnimationFrame(function () {
      outgoing.style.transition = incoming.style.transition = 'transform ' + DURATION + 'ms ease';
      outgoing.style.transform = 'translateX(' + -direction * distance + 'px)'; incoming.style.transform = 'translateX(0px)';
      animationTimer = setTimeout(function () { finish(manual); }, DURATION);
    });
  }
  document.getElementById('event-rail-previous').addEventListener('click', function () { go(-1, true); });
  document.getElementById('event-rail-next').addEventListener('click', function () { go(1, true); });
  pause.addEventListener('pointerdown', function () { toggleIntent = !paused; });
  pause.addEventListener('keydown', function () { toggleIntent = null; });
  pause.addEventListener('click', function () {
    if (sharing.size) return;
    paused = toggleIntent === null ? !paused : toggleIntent; toggleIntent = null;
    // Reduced motion never auto-rotates, including after an explicit click.
    if (reduced.matches) paused = true;
    labels(); schedule();
  });
  host.addEventListener('focusin', function () { stop(); if (moving) finish(false); });
  host.addEventListener('ct:public-share', function (event) {
    if (event.detail.phase === 'start') sharing.add(event.detail.host);
    if (event.detail.phase === 'end') sharing.delete(event.detail.host);
    stop();
    if (moving) finish(false);
  });
  host.addEventListener('focusout', function () { setTimeout(schedule, 0); });
  host.addEventListener('pointerenter', function (event) { if (event.pointerType === 'mouse') { hovered = true; schedule(); } });
  host.addEventListener('pointerleave', function (event) { if (event.pointerType === 'mouse') { hovered = false; schedule(); } });
  grid.addEventListener('keydown', function (event) {
    if (event.target !== grid || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    go(event.key === 'ArrowLeft' || event.key === 'Home' ? -1 : 1, true,
      event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : undefined);
  });
  grid.addEventListener('dragstart', function (event) { event.preventDefault(); });
  grid.addEventListener('pointerdown', function (event) {
    if (!event.isPrimary || event.button !== 0 || cards.length < 2 || sharing.size) return;
    // Suspend while intent is unknown. Scrolling the page is not a request to
    // permanently pause the carousel, unlike a horizontal swipe or activation.
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, horizontal: false };
    clearTimeout(timer);
    if (moving) { clickBlockedUntil = performance.now() + 700; finish(false); }
  });
  grid.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.horizontal && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { drag = null; schedule(); return; }
    if (!drag.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      stop();
      drag.horizontal = true; grid.setPointerCapture(event.pointerId); grid.classList.add('is-dragging');
    }
    if (!drag.horizontal) return;
    event.preventDefault(); drag.dx = dx;
    var direction = dx < 0 ? 1 : -1, target = modulo(index + direction), distance = step();
    cards.forEach(function (card, number) {
      card.style.visibility = number === index || number === target ? 'visible' : 'hidden';
      card.style.transform = 'translateX(' + (number === index ? dx : direction * distance + dx) + 'px)';
    });
  });
  function release(event, cancelled) {
    if (!drag || event.pointerId !== drag.id) return;
    var gesture = drag; drag = null;
    if (grid.hasPointerCapture(event.pointerId)) grid.releasePointerCapture(event.pointerId);
    grid.classList.remove('is-dragging');
    if (gesture.horizontal) {
      clickBlockedUntil = performance.now() + 700;
      if (!cancelled && Math.abs(gesture.dx) > Math.min(60, step() * .18)) go(gesture.dx < 0 ? 1 : -1, true);
      else paint();
    } else if (!cancelled) stop();
    schedule();
  }
  window.addEventListener('pointerup', function (event) { release(event, false); });
  window.addEventListener('pointercancel', function (event) { release(event, true); });
  grid.addEventListener('click', function (event) {
    if (moving || performance.now() < clickBlockedUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      // App switching can interrupt a touch without delivering pointerup.
      // Discard transient contact, never the user's intentional paused state.
      if (drag && grid.hasPointerCapture(drag.id)) grid.releasePointerCapture(drag.id);
      drag = null;
      if (moving) finish(false);
      else { grid.classList.remove('is-dragging'); paint(); }
    }
    schedule();
  });
  reduced.addEventListener('change', function () {
    if (reduced.matches) { stop(); if (moving) finish(false); }
    // Re-enable the explicit resume control when the preference changes back.
    // Keep the user's paused state; never restart motion automatically.
    labels(); schedule();
  });
  // A short mobile viewport may show the cover but less than 25% of the tallest
  // card. Start when the rail enters view; fully offscreen rails still stop.
  new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; schedule(); }, { threshold: 0 }).observe(grid);
  new ResizeObserver(function () {
    // A resize commits the incoming card and its counter as one state update.
    if (moving) { finish(false); return; }
    paint(); labels(); schedule();
  }).observe(grid);
  function reset() {
    clearTimeout(timer); clearAnimation(); drag = null; index = 0;
    cards = Array.from(grid.children);
    grid.classList.toggle('is-event-rail', cards.length > 0);
    grid.classList.toggle('has-one-event', cards.length === 1);
    host.hidden = cards.length === 0;
    controls.hidden = help.hidden = cards.length < 2;
    pause.disabled = reduced.matches;
    grid.tabIndex = cards.length > 1 ? 0 : -1;
    grid.setAttribute('aria-describedby', 'event-rail-help');
    host.setAttribute('aria-roledescription', H.t('railCarousel'));
    announcement.textContent = '';
    paint(); labels(); schedule();
  }
  new MutationObserver(reset).observe(grid, { childList: true });
  document.addEventListener('ct:language', labels);
  reset();
}());


