'use strict';
// Pure Node tests: no browser, HTTP client, production RPC or payment calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../assets/public-catalog-clock.js');
const BASE = Date.parse('2026-10-12T21:00:00.000Z');
const iso = ms => new Date(BASE + ms).toISOString();
function envelope(overrides = {}) {
  return { temporalVersion: 1, temporalEvaluatedAt: iso(0), serverNow: iso(0),
    nextTransitionAt: iso(1000), validUntil: iso(1000), ...overrides };
}
function fixture() {
  let clock = 0, next = 0;
  const timers = new Map(), expired = [];
  const lease = create({
    now: () => clock,
    schedule(fn, delay) { timers.set(++next, { fn, delay }); return next; },
    cancel(id) { timers.delete(id); },
    onExpire(reason) { expired.push(reason); }
  });
  return { lease, timers, expired, set(ms) { clock = ms; },
    fire() { const [id, item] = [...timers][0] || []; assert.ok(item); timers.delete(id); item.fn(); } };
}
test('exclusive boundary expires once and removes its timer', () => {
  const f = fixture();
  assert.equal(f.lease.accept(envelope(), f.lease.begin()), true);
  f.set(999); assert.equal(f.lease.isFresh(), true);
  f.set(1000); assert.equal(f.lease.isFresh(), false);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.expired, ['expired']);
  assert.equal(f.lease.isFresh(), false);
  assert.equal(f.expired.length, 1);
});
test('backend inclusive end is preserved: transition at end plus one millisecond', () => {
  const f = fixture();
  f.lease.accept(envelope({ validUntil: iso(1001), nextTransitionAt: iso(1001) }), f.lease.begin());
  f.set(1000); assert.equal(f.lease.isFresh(), true);
  f.set(1001); assert.equal(f.lease.isFresh(), false);
});
test('subtracts full request latency conservatively', () => {
  const f = fixture(), request = f.lease.begin();
  f.set(300);
  assert.equal(f.lease.accept(envelope(), request), true);
  assert.equal(f.lease.remaining(), 700);
});
test('does not expose a response already expired in transit', () => {
  const f = fixture(), request = f.lease.begin();
  f.set(1000);
  assert.equal(f.lease.accept(envelope(), request), false);
  assert.equal(f.lease.isFresh(), false);
  assert.equal(f.timers.size, 0);
});
test('uses whichever arrives first, transition or validity', () => {
  for (const patch of [
    { nextTransitionAt: iso(2000), validUntil: iso(1000) },
    { nextTransitionAt: iso(1000), validUntil: iso(2000) }
  ]) {
    const f = fixture(); f.lease.accept(envelope(patch), f.lease.begin());
    assert.equal(f.lease.remaining(), 1000);
  }
});
test('null transition still expires at validUntil', () => {
  const f = fixture();
  assert.equal(f.lease.accept(envelope({ nextTransitionAt: null }), f.lease.begin()), true);
  assert.equal(f.lease.remaining(), 1000);
});
test('strict envelope fails closed without an immediate retry loop', () => {
  for (const patch of [
    { temporalVersion: 0 }, { temporalVersion: undefined }, { serverNow: '12/10/2026' },
    { serverNow: '2026-10-12T21:00:00' }, { temporalEvaluatedAt: iso(1) },
    { validUntil: iso(0) }, { nextTransitionAt: undefined }, { nextTransitionAt: iso(0) }
  ]) {
    const f = fixture();
    assert.equal(f.lease.accept(envelope(patch), f.lease.begin()), false);
    assert.equal(f.timers.size, 0);
    assert.equal(f.expired.length, 0);
  }
});
test('new request invalidates older response authority', () => {
  const f = fixture(), old = f.lease.begin(), current = f.lease.begin();
  assert.equal(f.lease.accept(envelope(), old), false);
  assert.equal(f.lease.accept(envelope(), current), true);
  assert.equal(f.lease.accept(envelope(), old), false);
  assert.equal(f.lease.isFresh(), true);
});
test('one request can be accepted only once; forged tickets are rejected', () => {
  const f = fixture(), request = f.lease.begin();
  assert.equal(f.lease.accept(envelope(), { ...request }), false);
  assert.equal(f.lease.accept(envelope(), request), true);
  assert.equal(f.lease.accept(envelope(), request), false);
});
test('regressive backend clock or evaluated snapshot fails closed', () => {
  for (const patch of [{ serverNow: iso(-1) }, { temporalEvaluatedAt: iso(-1) }]) {
    const f = fixture(); f.lease.accept(envelope(), f.lease.begin());
    assert.equal(f.lease.accept(envelope(patch), f.lease.begin()), false);
    assert.equal(f.lease.isFresh(), false);
  }
});
test('cached snapshot with fresh serverNow is permitted', () => {
  const f = fixture(); f.lease.accept(envelope(), f.lease.begin());
  f.set(100);
  assert.equal(f.lease.accept(envelope({ serverNow: iso(100) }), f.lease.begin()), true);
  assert.equal(f.lease.remaining(), 900);
});
test('early timer is rearmed, delayed timer expires once', () => {
  const f = fixture(); f.lease.accept(envelope(), f.lease.begin());
  f.set(900); f.fire();
  assert.equal([...f.timers.values()][0].delay, 100);
  f.set(1500); f.fire();
  assert.deepEqual(f.expired, ['expired']);
  assert.equal(f.timers.size, 0);
});
test('resume invalidates lease and pending pre-resume response', () => {
  const f = fixture(); f.lease.accept(envelope(), f.lease.begin());
  const request = f.lease.begin();
  f.lease.invalidate('resume');
  assert.equal(f.lease.accept(envelope(), request), false);
  assert.equal(f.lease.isFresh(), false);
  assert.deepEqual(f.expired, ['resume']);
  assert.equal(f.lease.accept(envelope({ serverNow: iso(100) }), f.lease.begin()), true);
});
test('monotonic clock regression fails closed', () => {
  const f = fixture(); f.set(100);
  f.lease.accept(envelope(), f.lease.begin());
  f.set(99); assert.equal(f.lease.isFresh(), false);
  assert.deepEqual(f.expired, ['clock-invalid']);
});
test('local wall clock changes do not affect the lease', () => {
  const original = Date.now;
  const f = fixture();
  try {
    Date.now = () => BASE + 86400000;
    f.lease.accept(envelope(), f.lease.begin());
    Date.now = () => BASE - 86400000;
    f.set(500); assert.equal(f.lease.remaining(), 500);
  } finally { Date.now = original; }
});
test('disposal cancels timers and rejects further work without notification', () => {
  const f = fixture(); f.lease.accept(envelope(), f.lease.begin());
  const request = f.lease.begin(); f.lease.dispose();
  assert.equal(f.timers.size, 0);
  assert.equal(f.lease.begin(), null);
  assert.equal(f.lease.accept(envelope(), request), false);
  assert.equal(f.expired.length, 0);
});
