/* Shared monotonic catalog lease. Requires the backend temporalVersion:1 contract. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CTPublicCatalogClock = api;
}(typeof window === 'object' ? window : this, function () {
  'use strict';

  function instant(value) {
    // Require an explicit UTC instant; never interpret a browser-local date.
    if (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
    var result = Date.parse(value);
    // Date.parse normalizes impossible dates (for example February 30).
    var canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, function (_, fraction) {
      return '.' + (fraction || '').padEnd(3, '0') + 'Z';
    });
    return Number.isFinite(result) && new Date(result).toISOString() === canonical ? result : NaN;
  }

  function create(options) {
    options = options || {};
    var now = options.now || function () { return performance.now(); };
    var schedule = options.schedule || function (fn, delay) { return setTimeout(fn, delay); };
    var cancel = options.cancel || function (id) { clearTimeout(id); };
    var onExpire = options.onExpire || function () {};
    var sequence = 0, pending = null, lease = null, timer = null, disposed = false;
    var serverHighWater = -Infinity, evaluatedHighWater = -Infinity;
    var monotonicHighWater = -Infinity;
    var serverAnchor = null;

    function sample() {
      var value = now();
      if (!Number.isFinite(value) || value < monotonicHighWater) return NaN;
      monotonicHighWater = value;
      return value;
    }
    function clearTimer() {
      if (timer !== null) cancel(timer);
      timer = null;
    }
    function expire(reason, notify) {
      var hadLease = !!lease;
      clearTimer();
      lease = null;
      if (notify && hadLease && !disposed) onExpire(reason);
    }
    function remaining() {
      if (disposed || !lease) return 0;
      var current = sample();
      if (!Number.isFinite(current)) { expire('clock-invalid', true); return 0; }
      var result = lease.deadline - current;
      if (result <= 0) { expire('expired', true); return 0; }
      return result;
    }
    function arm() {
      clearTimer();
      var delay = remaining();
      if (!delay) return;
      timer = schedule(function () {
        timer = null;
        // Timers may fire early or be clamped. Recompute against the lease.
        if (remaining() > 0) arm();
      }, Math.min(delay, 2147483647));
    }
    function begin() {
      if (disposed) return null;
      pending = Object.freeze({ sequence: ++sequence, startedAt: sample() });
      return pending;
    }
    function accept(envelope, ticket) {
      if (disposed || !ticket || ticket !== pending) return false;
      pending = null;
      var current = sample();
      var server = instant(envelope && envelope.serverNow);
      var evaluated = instant(envelope && envelope.temporalEvaluatedAt);
      var validUntil = instant(envelope && envelope.validUntil);
      var transition = envelope && envelope.nextTransitionAt === null
        ? Infinity : instant(envelope && envelope.nextTransitionAt);
      var valid = envelope && envelope.temporalVersion === 1 &&
        Number.isFinite(ticket.startedAt) && Number.isFinite(current) &&
        Number.isFinite(server) && Number.isFinite(evaluated) &&
        Number.isFinite(validUntil) && (Number.isFinite(transition) || transition === Infinity) &&
        evaluated <= server && server >= serverHighWater && evaluated >= evaluatedHighWater &&
        validUntil > server && transition > server;
      // Never rewind the conservative bound on a repeated/cached response. The
      // anchor survives invalidation so an old end cannot gain a new lifetime.
      var bound = valid ? Math.max(server, serverAnchor
        ? serverAnchor.server + ticket.startedAt - serverAnchor.startedAt : server) : NaN;
      // Subtract the entire request duration rather than assume zero network delay.
      var deadline = valid ? ticket.startedAt + Math.min(validUntil - bound, transition - bound) : NaN;
      if (!valid || !Number.isFinite(deadline) || deadline <= current) {
        expire('invalid-envelope', true);
        return false;
      }
      serverHighWater = server;
      evaluatedHighWater = evaluated;
      serverAnchor = { server: bound, startedAt: ticket.startedAt };
      clearTimer();
      lease = { deadline: deadline, server: bound, startedAt: ticket.startedAt };
      arm();
      return true;
    }
    function invalidate(reason) {
      if (disposed) return;
      pending = null;
      ++sequence;
      expire(reason || 'invalidated', true);
    }
    function dispose() {
      disposed = true;
      pending = null;
      expire('disposed', false);
    }
    function remainingUntil(value) {
      var duration = remaining();
      if (!duration || !lease) return 0;
      var end = instant(value);
      if (!Number.isFinite(end)) return 0;
      // Conservative server-clock bound; the entire request/mount duration is
      // counted. Client wall time is never an authority for catalog eligibility.
      return Math.max(0, Math.min(duration, end - lease.server - (monotonicHighWater - lease.startedAt)));
    }
    return Object.freeze({
      begin: begin,
      accept: accept,
      remaining: remaining,
      remainingUntil: remainingUntil,
      isFresh: function () { return remaining() > 0; },
      invalidate: invalidate,
      dispose: dispose
    });
  }
  return Object.freeze({ create: create, instant: instant });
}));
