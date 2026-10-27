'use strict';
// Pure Node tests: no browser, HTTP client, production RPC or payment calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../assets/public-catalog-clock.js');
const BASE = Date.parse('2026-10-12T21:00:00.000Z');
const iso = ms => new Date(BASE + ms).toISOString();
function envelope(overrides = {}) {
  return { temporalVersion: 1, eligibilityContract: 'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1', temporalEvaluatedAt: iso(0), serverNow: iso(0),
    nextTransitionAt: iso(1000), validUntil: iso(1000), ...overrides };
}
function fixture(options = {}) {
  let clock = 0, next = 0;
  const timers = new Map(), expired = [];
  const lease = create({
    ...options,
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
test('exclusive backend transition expires at the exact end instant', () => {
  const f = fixture();
  f.lease.accept(envelope({ validUntil: iso(1000), nextTransitionAt: iso(1000) }), f.lease.begin());
  f.set(999); assert.equal(f.lease.isFresh(), true);
  f.set(1000); assert.equal(f.lease.isFresh(), false);
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
test('valid lease cannot extend beyond its transition', () => {
  for (const patch of [
    { nextTransitionAt: iso(2000), validUntil: iso(1000) },
    { nextTransitionAt: iso(1000), validUntil: iso(1000) }
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


// Home event deadlines add a strict >= end rule independent of lot transitions.
test('per-event exact boundary does not depend on nextTransitionAt', () => {
  const f = fixture();
  f.lease.accept(envelope({ validUntil: iso(60000), nextTransitionAt: null }), f.lease.begin());
  f.set(999); assert.equal(f.lease.remainingUntil(iso(1000)), 1);
  f.set(1000); assert.equal(f.lease.remainingUntil(iso(1000)), 0);
  assert.equal(f.lease.isFresh(), true);
});
test('per-event deadline subtracts network and deferred mount time', () => {
  const f = fixture(), ticket = f.lease.begin();
  f.set(700);
  assert.equal(f.lease.accept(envelope({ validUntil: iso(60000), nextTransitionAt: null }), ticket), true);
  assert.equal(f.lease.remainingUntil(iso(1000)), 300);
});
test('replayed server timestamp cannot renew a lease or event deadline', () => {
  const f = fixture();
  const e = envelope({ validUntil: iso(60000), nextTransitionAt: null });
  f.lease.accept(e, f.lease.begin());
  f.set(1200); assert.equal(f.lease.remainingUntil(iso(1000)), 0);
  f.lease.invalidate('resume');
  assert.equal(f.lease.accept(e, f.lease.begin()), true);
  assert.equal(f.lease.remainingUntil(iso(1000)), 0);
  assert.equal(f.lease.remaining(), 58800);
  f.set(60000);
  assert.equal(f.lease.accept(e, f.lease.begin()), false);
});
test('non-regressive but lagging server samples cannot rewind the bound', () => {
  const f = fixture();
  f.lease.accept(envelope({ validUntil: iso(60000), nextTransitionAt: null }), f.lease.begin());
  f.set(1200);
  assert.equal(f.lease.accept(envelope({ serverNow: iso(500), validUntil: iso(60000), nextTransitionAt: null }), f.lease.begin()), true);
  assert.equal(f.lease.remainingUntil(iso(1000)), 0);
});
test('strict UTC rejects calendar overflow and timezone-less values', () => {
  const { instant } = require('../assets/public-catalog-clock.js');
  for (const value of ['2026-02-30T12:00:00Z', '2026-13-01T00:00:00Z', '2026-10-12T24:00:00Z',
    '2026-10-12T21:00:00+00:00', '2026-10-12T21:00:00', '', null, 0]) assert.equal(Number.isNaN(instant(value)), true);
  for (const value of ['2026-10-12T21:00:00Z', '2026-10-12T21:00:00.0Z', '2026-10-12T21:00:00.00Z', '2026-10-12T21:00:00.000Z']) assert.equal(instant(value), BASE);
});
test('invalid event endpoint is never granted a duration', () => {
  const f = fixture();
  f.lease.accept(envelope(), f.lease.begin());
  assert.equal(f.lease.remainingUntil('not a date'), 0);
  assert.equal(f.lease.remainingUntil(null), 0);
  assert.equal(f.lease.remainingUntil(iso(-1)), 0);
});

for (const [label, contract] of [['missing', undefined], ['null', null], ['old', 'CT_PUBLIC_ELIGIBILITY_INCLUSIVE_V1'], ['unknown', 'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V2'], ['number', 1], ['object', {}], ['whitespace', 'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1 ']]) {
  test('strict eligibility contract rejects ' + label + ' without version coercion', () => {
    const f = fixture();
    assert.equal(f.lease.accept(envelope(), f.lease.begin()), true);
    assert.equal(f.lease.accept(envelope({ eligibilityContract: contract }), f.lease.begin()), false);
    assert.equal(f.lease.isFresh(), false);
    assert.equal(f.timers.size, 0);
  });
}
test('schema version is independent from eligibility contract identity', () => {
  const f = fixture();
  assert.equal(f.lease.accept(envelope({ temporalVersion: 2 }), f.lease.begin()), false);
  assert.equal(f.lease.accept(envelope(), f.lease.begin()), true);
  assert.equal(require('../assets/public-catalog-clock.js').eligibilityContract, 'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1');
});

for (const patch of [
  { nextTransitionAt: null, validUntil: iso(86400000) },
  { nextTransitionAt: null, validUntil: iso(600001) },
  { nextTransitionAt: iso(1000), validUntil: iso(1001) },
  { serverNow: iso(599999), temporalEvaluatedAt: iso(0), nextTransitionAt: null, validUntil: iso(600001) }
]) test('rejects overlong or inconsistent envelope ' + JSON.stringify(patch), () => {
  const f = fixture(); assert.equal(f.lease.accept(envelope(patch), f.lease.begin()), false);
  assert.equal(f.lease.isFresh(), false); assert.equal(f.timers.size, 0);
});
for (const maxAgeMs of [120000, 300000, 600000]) test('profile maxAgeMs ' + maxAgeMs + ' is inclusive only as a lease length', () => {
  const f = fixture({ maxAgeMs });
  assert.equal(f.lease.accept(envelope({nextTransitionAt:null, validUntil:iso(maxAgeMs)}), f.lease.begin()), true);
  f.set(maxAgeMs); assert.equal(f.lease.isFresh(), false);
  const g = fixture({ maxAgeMs });
  assert.equal(g.lease.accept(envelope({nextTransitionAt:null, validUntil:iso(maxAgeMs+1)}), g.lease.begin()), false);
});
for (const maxAgeMs of [0, -1, 600001, '120000', null, NaN, Infinity, 1.5]) test('invalid max age configuration fails closed: ' + String(maxAgeMs), () => {
  const f = fixture({ maxAgeMs }); assert.equal(f.lease.accept(envelope(), f.lease.begin()), false);
});
test('checkout stale lease requires exact cacheStale true and is bounded from evaluation', () => {
  for (const cacheStale of [undefined, false, 'true', 1, null]) {
    const f=fixture({maxAgeMs:120000,staleMaxAgeMs:600000});
    assert.equal(f.lease.accept(envelope({cacheStale,nextTransitionAt:null,validUntil:iso(600000)}),f.lease.begin()),false);
  }
  const f=fixture({maxAgeMs:120000,staleMaxAgeMs:600000});
  assert.equal(f.lease.accept(envelope({cacheStale:true,nextTransitionAt:null,validUntil:iso(600000)}),f.lease.begin()),true);
  const g=fixture({maxAgeMs:120000,staleMaxAgeMs:600000});
  assert.equal(g.lease.accept(envelope({cacheStale:true,serverNow:iso(500000),nextTransitionAt:null,validUntil:iso(600001)}),g.lease.begin()),false);
});
