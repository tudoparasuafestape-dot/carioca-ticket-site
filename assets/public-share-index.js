(function (root) {
  'use strict';
  var HOME = 'https://cariocaticket.com.br/';
  function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,219}$/.test(id); }
  function detail(value, id) {
    try {
      var u = new URL(value);
      return u.origin === HOME.slice(0, -1) && !u.username && !u.password && !u.hash &&
        (u.pathname === '/evento/' || u.pathname === '/evento-v2/') &&
        u.search === '?evento=' + encodeURIComponent(id) ? u.href : null;
    } catch (_) { return null; }
  }
  function select(index, id, now) {
    if (!Number.isFinite(now) || !validId(id) || !index || index.schema !== 'CT_PUBLISHED_SHARE_INDEX_V1' ||
        !/^[a-f0-9]{64}$/.test(index.revision || '') || !Number.isFinite(Date.parse(index.generatedAt)) ||
        !Array.isArray(index.entries) || !Array.isArray(index.fallbacks)) return HOME;
    var seen = new Set(), result = HOME;
    for (var row of index.entries.concat(index.fallbacks)) {
      if (!row || !validId(row.eventId) || seen.has(row.eventId) || !detail(row.detailUrl, row.eventId)) return HOME;
      seen.add(row.eventId);
      if (index.entries.indexOf(row) !== -1) {
        if (row.sharePath !== '/compartilhar/' + encodeURIComponent(row.eventId) + '/' ||
            typeof row.endsAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(row.endsAt) ||
            !Number.isFinite(Date.parse(row.endsAt)) ||
            new Date(row.endsAt).toISOString() !== row.endsAt.replace(/Z$/, '.000Z').replace(/\.([0-9]{3})\.000Z$/, '.$1Z')) return HOME;
        if (row.eventId === id && now < Date.parse(row.endsAt)) result = HOME.slice(0, -1) + row.sharePath;
      } else {
        if (row.reason !== 'NO_VERIFIABLE_END') return HOME;
        if (row.eventId === id) result = row.detailUrl;
      }
    }
    return result;
  }
  async function resolve(id) {
    // No retained index/destination: every user action rechecks published evidence.
    if (!validId(id)) return HOME;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 5000);
    try {
      var response = await fetch('/assets/social-event-pages.json', {
        cache:'no-store', credentials:'omit', redirect:'error', signal:controller.signal
      });
      if (!response.ok) return HOME;
      var raw = await response.text();
      if (raw.length > 1000000) return HOME;
      return select(JSON.parse(raw), id, Date.now());
    } catch (_) { return HOME; }
    finally { clearTimeout(timer); }
  }
  root.CTPublishedShareIndex = { resolve:resolve };
  if (typeof module !== 'undefined' && module.exports) module.exports = { select:select, resolve:resolve, HOME:HOME };
}(typeof window !== 'undefined' ? window : globalThis));
