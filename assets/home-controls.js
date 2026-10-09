(function () {
  'use strict';
  var H = window.CTHome;
  if (!H) return;
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var dialog = $('location-dialog'), uf = $('location-uf'), search = $('city-search');
  var cityNameCounts = Object.create(null);
  var cities = null, pending = null, opener, loading, locationRevision = 0;
  H.filters = { location: null, period: 'all', category: '' };
  H.normalize = function (value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); };
  function save(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) { /* Optional preferences must never block the catalog. */ } }
  function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  var states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  states.forEach(function (value) { var option = document.createElement('option'); option.value = option.textContent = value; uf.appendChild(option); });
  function placeLabel(place) { return place ? (place.name ? place.name + ' / ' + place.uf : place.uf) : H.t('allPlaces'); }
  H.dateRange = function () {
    if (H.filters.period === 'all') return null;
    var start = new Date(), end;
    start.setHours(0, 0, 0, 0);
    var day = start.getDay();
    if (H.filters.period === 'week') start.setDate(start.getDate() - (day + 6) % 7);
    else start.setDate(start.getDate() + (day === 0 ? -1 : 6 - day));
    end = new Date(start); end.setDate(end.getDate() + (H.filters.period === 'week' ? 6 : 1));
    return { start: start, end: end };
  };
  function eventDate(value) {
    var match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || ''));
    var parts = match ? [+match[3], +match[2], +match[1]] : null;
    if (!parts) { match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '')); if (match) parts = [+match[1], +match[2], +match[3]]; }
    if (!parts) return null;
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2] ? date : null;
  }
  H.matches = function (event, includeCategory) {
    var place = H.filters.location, range = H.dateRange(), date = eventDate(event.data);
    // Legacy rows stay untouched. Only exact UF + normalized official name match.
    if (place && place.id && cities && cityNameCounts[place.uf + '|' + H.normalize(place.name)] !== 1) return false;
    if (place && (H.normalize(event.uf) !== H.normalize(place.uf) || (place.id && H.normalize(event.cidade) !== H.normalize(place.name)))) return false;
    if (range && (!date || date < range.start || date > range.end)) return false;
    return !includeCategory || !H.filters.category || String((event.visual || {}).categoria || '').trim() === H.filters.category;
  };
  function updateLabels() {
    var label = placeLabel(H.filters.location);
    document.querySelectorAll('.active-place').forEach(function (el) { el.textContent = label; el.title = label; });
    $('event-location-input').value = label;
    document.querySelector('.brand-location .location-trigger').setAttribute('aria-label', H.t('choosePlace') + ': ' + label);
    document.querySelectorAll('[data-period]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.period === H.filters.period)); });
    var range = H.dateRange(), dates = range ? new Intl.DateTimeFormat(H.locale, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
    var rangeLabel = range ? dates.format(range.start) + ' – ' + dates.format(range.end) : '';
    $('period-dates').textContent = rangeLabel;
    var active = [H.filters.location && label, rangeLabel, H.filters.category].filter(Boolean);
    $('active-filters').hidden = !active.length;
    $('active-filters').textContent = active.join(' · ');
  }
  H.changed = function () { updateLabels(); document.dispatchEvent(new CustomEvent('ct:filters')); };
  H.resetFilters = function () { locationRevision++; H.filters = { location: null, period: 'all', category: '' }; save('ct-home-location', null); H.changed(); };
  $('reset-filters').addEventListener('click', H.resetFilters);
  $('filters-toggle').addEventListener('click', function () { var open = this.getAttribute('aria-expanded') !== 'true'; this.setAttribute('aria-expanded', String(open)); $('catalog-filters').hidden = !open; });
  document.querySelectorAll('[data-period]').forEach(function (button) { button.addEventListener('click', function () { H.filters.period = button.dataset.period; H.changed(); }); });
  H.updateCategories = function (events) {
    var names = Array.from(new Set(events.filter(function (event) { return H.matches(event, false); }).map(function (event) { return String((event.visual || {}).categoria || '').trim(); }).filter(Boolean)));
    var host = $('category-choices'), hadFocus = host.contains(document.activeElement); host.replaceChildren();
    $('collections').hidden = !names.length && !H.filters.category;
    if (H.filters.category && !names.includes(H.filters.category)) names.unshift(H.filters.category);
    [''].concat(names).forEach(function (name) {
      var button = document.createElement('button'); button.type = 'button'; button.textContent = name || H.t('allCategories');
      button.setAttribute('aria-pressed', String(H.filters.category === name));
      button.addEventListener('click', function () { H.filters.category = name; H.changed(); }); host.appendChild(button);
      if (hadFocus && H.filters.category === name) button.focus({ preventScroll: true });
    });
  };
  async function getCities() {
    if (cities) return cities;
    if (loading) return loading;
    $('location-status').textContent = H.t('placesLoading');
    loading = (async function () {
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 10000);
      var response;
      try { response = await fetch('/assets/home-municipalities.json', { credentials: 'omit', signal: controller.signal }); } finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error('CITIES_UNAVAILABLE');
      var rows = await response.json();
      if (!Array.isArray(rows) || !rows.length || rows.some(function (row) { return !Array.isArray(row) || !/^\d{7}$/.test(row[0]) || !states.includes(row[1]) || typeof row[2] !== 'string'; })) throw new Error('CITIES_INVALID');
      cities = rows;
      rows.forEach(function (row) { var key = row[1] + '|' + H.normalize(row[2]); cityNameCounts[key] = (cityNameCounts[key] || 0) + 1; });
      return rows;
    }());
    try { return await loading; } finally { loading = null; }
  }
  function renderCities() {
    search.disabled = !uf.value || !cities;
    var host = $('city-options'); host.replaceChildren();
    $('location-apply').disabled = !!(search.value.trim() && !pending) || (!!uf.value && !cities);
    if (!cities) return;
    $('location-status').textContent = uf.value ? (pending ? H.t('applied') + ': ' + pending.name : H.t('chooseListed')) : H.t('chooseState');
    if (!uf.value) return;
    var query = H.normalize(search.value), rows = cities.filter(function (row) { return row[1] === uf.value && (!query || H.normalize(row[2]).includes(query)); });
    rows.slice(0, 40).forEach(function (row) {
      var button = document.createElement('button'); button.type = 'button'; button.textContent = row[2]; button.dataset.cityId = row[0];
      button.setAttribute('aria-pressed', String(!!pending && pending.id === row[0]));
      button.addEventListener('click', function () { pending = { id: row[0], uf: row[1], name: row[2] }; search.value = row[2]; renderCities(); $('location-apply').focus(); });
      host.appendChild(button);
    });
    if (!rows.length) $('location-status').textContent = H.t('noCity');
    else if (rows.length > 40) { var more = document.createElement('p'); more.textContent = H.t('listMore'); host.appendChild(more); }
  }
  async function openLocation(event) {
    opener = event.currentTarget;
    pending = H.filters.location && H.filters.location.id ? Object.assign({}, H.filters.location) : null;
    uf.value = H.filters.location ? H.filters.location.uf : ''; search.value = pending ? pending.name : '';
    $('location-retry').hidden = true;
    dialog.showModal(); renderCities(); uf.focus();
    try { await getCities(); renderCities(); } catch (_) { $('location-status').textContent = H.t('placesError'); $('location-retry').hidden = false; }
  }
  document.querySelectorAll('.location-trigger').forEach(function (button) {
    button.addEventListener('click', openLocation);
    if (button.tagName === 'INPUT') button.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLocation(event); } });
  });
  $('location-retry').addEventListener('click', async function () { this.hidden = true; try { await getCities(); renderCities(); } catch (_) { $('location-status').textContent = H.t('placesError'); this.hidden = false; } });
  uf.addEventListener('change', function () { pending = null; search.value = ''; renderCities(); });
  search.addEventListener('input', function () { pending = null; renderCities(); });
  $('location-close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('close', function () { if (opener) opener.focus(); });
  function applyPlace(place) { locationRevision++; H.filters.location = place; save('ct-home-location', place ? JSON.stringify(place) : null); H.changed(); dialog.close(); }
  $('location-reset').addEventListener('click', function () { applyPlace(null); });
  $('location-form').addEventListener('submit', function (event) { event.preventDefault(); if (!$('location-apply').disabled) applyPlace(pending || (uf.value ? { uf: uf.value } : null)); });
  // Saved municipality IDs are revalidated against the shipped official list.
  var saved;
  try { saved = JSON.parse(read('ct-home-location')); } catch (_) { saved = null; }
  if (saved && states.includes(saved.uf)) {
    var savedRevision = locationRevision;
    getCities().then(function (rows) {
      if (savedRevision !== locationRevision) return;
      var row = rows.find(function (value) { return value[0] === saved.id && value[1] === saved.uf; });
      if (row || !saved.id) { H.filters.location = row ? { id: row[0], uf: row[1], name: row[2] } : { uf: saved.uf }; H.changed(); }
    }).catch(function () { /* Start unfiltered if the optional saved location cannot be verified. */ });
  }
  var accessibility = $('home-accessibility'), toggle = $('accessibility-toggle');
  function closeAccessibility() { accessibility.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  toggle.addEventListener('click', function () { var open = accessibility.hidden; accessibility.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) document.dispatchEvent(new CustomEvent('ct:close-menu')); });
  document.addEventListener('ct:close-accessibility', closeAccessibility);
  document.addEventListener('focusin', function (event) { if (!accessibility.contains(event.target) && !toggle.contains(event.target)) closeAccessibility(); });
  document.addEventListener('click', function (event) { if (!accessibility.contains(event.target) && !toggle.contains(event.target)) closeAccessibility(); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !accessibility.hidden) { closeAccessibility(); toggle.focus(); } });
  var scale = Number(read('ct-home-font')) || 100;
  function setScale(value) { scale = Math.max(100, Math.min(150, Math.round(value / 10) * 10)); root.style.setProperty('--home-font-scale', scale / 100); $('font-reset').textContent = scale + '%'; $('font-down').disabled = scale === 100; $('font-up').disabled = scale === 150; $('font-down-desktop').disabled = scale === 100; $('font-up-desktop').disabled = scale === 150; save('ct-home-font', String(scale)); }
  $('font-down').addEventListener('click', function () { setScale(scale - 10); });
  $('font-up').addEventListener('click', function () { setScale(scale + 10); });
  $('font-down-desktop').addEventListener('click', function () { setScale(scale - 10); });
  $('font-up-desktop').addEventListener('click', function () { setScale(scale + 10); });
  $('font-reset').addEventListener('click', function () { setScale(100); });
  setScale(scale);
  document.addEventListener('ct:language', function () { updateLabels(); if (dialog.open) renderCities(); });
  function measureHeader() { root.style.setProperty('--home-header-height', document.querySelector('.topbar').offsetHeight + 'px'); }
  new ResizeObserver(measureHeader).observe(document.querySelector('.topbar'));
  document.querySelectorAll('.js-control').forEach(function (control) { control.hidden = false; });
  $('event-location-input').disabled = false;
  measureHeader(); updateLabels();
}());
