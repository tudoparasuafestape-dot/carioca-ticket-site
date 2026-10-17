(function (root) {
  'use strict';

  // Server instants are compared only with elapsed monotonic time. A changed
  // device clock must neither extend catalog authority nor reopen an event.
  var fields = ['temporalVersion', 'temporalEvaluatedAt', 'serverNow', 'nextTransitionAt', 'validUntil'];
  var own = Object.prototype.hasOwnProperty;
  function sample() {
    return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : NaN;
  }
  function parseInstant(value) {
    if (typeof value !== 'string') return NaN;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +m[4] > 23 || +m[5] > 59 || +m[6] > 59 || +m[10] > 23 || +m[11] > 59) return NaN;
    var instant = Date.parse(value);
    if (!Number.isFinite(instant)) return NaN;
    var offset = m[8] === 'Z' ? 0 : (+m[10] * 60 + +m[11]) * (m[9] === '-' ? -1 : 1);
    var local = new Date(instant + offset * 60000);
    return local.getUTCFullYear() === +m[1] && local.getUTCMonth() + 1 === +m[2] && local.getUTCDate() === +m[3] ? instant : NaN;
  }
  function hasEnvelope(value) {
    return !!value && fields.some(function (key) { return own.call(value, key); });
  }
  function eventEnd(event) {
    var t = event && event.temporal;
    // A missing temporal block is an old public response, not an invented end.
    if (t === undefined || t === null) return null;
    if (!t || typeof t !== 'object') return NaN;
    if (t.state === 'LEGADO_SEM_FIM') {
      return ['inicioEm', 'fimEm', 'fusoHorario', 'temporalVersion'].every(function (key) { return t[key] === null; }) ? null : NaN;
    }
    if (t.state !== 'TEMPORAL_V1' || t.temporalVersion !== 1 || typeof t.fusoHorario !== 'string' || !t.fusoHorario.trim()) return NaN;
    var start = parseInstant(t.inicioEm), end = parseInstant(t.fimEm);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return NaN;
    try { new Intl.DateTimeFormat('en', { timeZone: t.fusoHorario }); } catch (_) { return NaN; }
    return end;
  }
  function create(envelope, options) {
    options = options || {};
    var monotonic = typeof options.monotonicNow === 'function' ? options.monotonicNow : sample;
    var valid = false, legacy = false, receipt = NaN, last = NaN, server = NaN, limit = NaN, legacyLimit = Infinity;
    function tick() {
      var value;
      try { value = monotonic(); } catch (_) { value = NaN; }
      if (!Number.isFinite(value) || value < 0 || (Number.isFinite(last) && value < last)) {
        valid = false; return NaN;
      }
      last = value;
      return value;
    }
    function invalidate() { valid = false; }
    function now() {
      var current = tick();
      return valid && !legacy ? server + current - receipt : NaN;
    }
    function remaining() {
      var current = tick();
      if (!valid) return 0;
      return Math.max(0, legacy ? legacyLimit - current : limit - (server + current - receipt));
    }
    function expired() { return !valid || remaining() <= 0; }
    function accept(value, timing) {
      invalidate(); legacy = false; server = limit = NaN; legacyLimit = Infinity;
      timing = typeof timing === 'number' ? { requestedAt: timing } : (timing || options);
      var current = tick();
      receipt = timing.receivedAt === undefined ? current : timing.receivedAt;
      var requested = timing.requestedAt === undefined ? receipt : timing.requestedAt;
      if (!Number.isFinite(current) || !Number.isFinite(receipt) || !Number.isFinite(requested) || requested < 0 || requested > receipt || receipt > current || !value || typeof value !== 'object') return false;
      if (!hasEnvelope(value)) {
        legacy = true;
        if (options.legacyMaxAgeMs !== undefined) {
          if (!Number.isFinite(options.legacyMaxAgeMs) || options.legacyMaxAgeMs <= 0) return false;
          legacyLimit = requested + options.legacyMaxAgeMs;
        }
        valid = true;
        if (expired()) { invalidate(); return false; }
        return true;
      }
      if (!fields.every(function (key) { return own.call(value, key); }) || value.temporalVersion !== 1) return false;
      var evaluated = parseInstant(value.temporalEvaluatedAt), serverNow = parseInstant(value.serverNow);
      var until = parseInstant(value.validUntil), transition = value.nextTransitionAt === null ? null : parseInstant(value.nextTransitionAt);
      var maxAge = options.maxAgeMs === undefined ? 300000 : options.maxAgeMs;
      if (!Number.isFinite(evaluated) || !Number.isFinite(serverNow) || !Number.isFinite(until) || evaluated > serverNow || until <= serverNow || !Number.isFinite(maxAge) || maxAge <= 0 || (transition !== null && (!Number.isFinite(transition) || transition <= serverNow || until > transition))) return false;
      // Full request duration is a conservative transport-age bound. Anchoring
      // at receipt without it would grant extra authority to a delayed reply.
      server = serverNow + receipt - requested;
      limit = Math.min(until, serverNow + maxAge, transition === null ? Infinity : transition);
      valid = true;
      if (expired()) { invalidate(); return false; }
      return true;
    }
    var clock = {
      now: now, expired: expired, stale: expired, remaining: remaining,
      deadline: function () { return valid && !legacy ? limit : NaN; },
      invalidate: invalidate, accept: accept,
      isEnded: function (event) {
        var end = eventEnd(event), current = now();
        return Number.isFinite(end) && Number.isFinite(current) && current >= end;
      }
    };
    Object.defineProperties(clock, {
      valid: { enumerable: true, get: function () { return valid; } },
      legacy: { enumerable: true, get: function () { return legacy; } }
    });
    if (arguments.length) accept(envelope, options);
    return Object.freeze(clock);
  }
  root.CTPublicCatalogClock = Object.freeze({ create: create, sample: sample, parseInstant: parseInstant, eventEnd: eventEnd, hasEnvelope: hasEnvelope });
}(window));
