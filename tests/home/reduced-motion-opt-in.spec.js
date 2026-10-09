const { test, expect } = require('@playwright/test');
const { fixture, events } = require('./rail-fixture.cjs');

// This suite uses only the existing fully intercepted home fixture. It must run
// with playwright.home.config.cjs, never the production/default E2E config.
const CAROUSELS = [
  {
    name: 'events', host: '#event-feature', track: '#events-grid',
    toggle: '#event-rail-pause', note: '#event-rail-motion-note',
    previous: '#event-rail-previous', next: '#event-rail-next'
  },
  ...['primary', 'secondary'].map(slot => ({
    name: `${slot} advertisement`, host: `#advertising-${slot}`,
    track: `#advertising-${slot} .ad-stage`,
    toggle: `#advertising-${slot} .ad-controls > button:first-child`,
    note: `#advertising-${slot} .ad-motion-note`,
    previous: `#advertising-${slot} .ad-controls > button:nth-child(2)`,
    next: `#advertising-${slot} .ad-controls > button:nth-child(3)`
  }))
];
const EVENTS = CAROUSELS[0];
const MOBILE = { viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' };

async function installProbe(page) {
  await page.evaluate(carousels => {
    window.motionProbe = {};
    // Observe writes after ordinary page initialization. Carousel playback and
    // Pause/Resume must not persist or overwrite even an identical preference.
    window.motionStorageWrites = [];
    if (!window.motionStorageProbeInstalled) {
      window.motionStorageProbeInstalled = true;
      for (const method of ['setItem', 'removeItem', 'clear']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          window.motionStorageWrites.push({ method, args });
          return original.apply(this, args);
        };
      }
    }
    carousels.forEach(carousel => {
      const node = document.querySelector(carousel.track);
      const active = () => carousel.name === 'events'
        ? Number(node.dataset.activeIndex)
        : Array.from(node.children).findIndex(child => !child.hidden);
      const probe = window.motionProbe[carousel.name] = { changes: [], animations: [], moving: [] };
      let last = active();
      new MutationObserver(records => {
        if (records.some(record => record.attributeName === 'data-moving')) probe.moving.push(performance.now());
        const current = active();
        if (current !== last) {
          last = current;
          probe.changes.push({ index: current, at: performance.now() });
        }
      }).observe(node, { subtree: true, attributes: true, attributeFilter: ['data-active-index', 'hidden', 'data-moving'] });
      ['transitionrun', 'animationstart'].forEach(type => node.addEventListener(type, () => probe.animations.push(type)));
    });
  }, CAROUSELS);
}

async function setup(page, reducedMotion = 'reduce', options = {}) {
  await page.emulateMedia({ reducedMotion });
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.addInitScript(options => {
    // Preserve a real, pre-application media query to catch a global override.
    window.originalMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    if (options.standalone) {
      const nativeMatchMedia = window.matchMedia;
      window.matchMedia = function (query) {
        const result = nativeMatchMedia.call(window, query);
        // Only the display mode is stubbed. Reduced motion remains the browser's
        // genuine emulated preference; this is not an installed-PWA test.
        if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true });
        return result;
      };
    }
    if (options.missingEventNote) {
      const getElementById = document.getElementById.bind(document);
      document.getElementById = id => id === 'event-rail-motion-note' ? null : getElementById(id);
    }
    window.originalMatchMedia = window.matchMedia;
  }, { standalone: !!options.standalone, missingEventNote: !!options.missingEventNote });
  const state = await fixture(page, { missingAds: !!options.missingAds, ...(options.singleEvent ? { result: { sucesso: true, eventos: [events[0]] } } : {}) });
  await expect(page.locator('.catalog-card')).toHaveCount(options.singleEvent ? 1 : 2);
  for (const carousel of CAROUSELS.slice(1)) await expect(page.locator(`${carousel.track} > .ad-slide`)).toHaveCount(2);
  // Freeze only after the fixture has loaded. All subsequent 4,999/5,000 ms
  // boundaries are deterministic and cannot elapse during a locator assertion.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await installProbe(page);
  return state;
}

async function geometry(page, selector) {
  return page.locator(selector).evaluate(node => new Promise(resolve => {
    const observer = new IntersectionObserver(entries => {
      observer.disconnect();
      resolve({ visible: entries[0].isIntersecting, ratio: entries[0].intersectionRatio });
    });
    observer.observe(node);
  }));
}

async function reveal(page, carousel) {
  await page.locator(carousel.track).scrollIntoViewIfNeeded();
  expect((await geometry(page, carousel.track)).visible).toBe(true);
}

async function active(page, carousel) {
  return page.locator(carousel.track).evaluate((node, name) => name === 'events'
    ? Number(node.dataset.activeIndex)
    : Array.from(node.children).findIndex(child => !child.hidden), carousel.name);
}

async function changes(page, carousel) {
  return page.evaluate(name => window.motionProbe[name].changes, carousel.name);
}

async function resetChanges(page, carousel) {
  await page.evaluate(name => { window.motionProbe[name].changes = []; }, carousel.name);
}

async function expectPaused(page, carousel) {
  await expect(page.locator(carousel.toggle)).toHaveText(carousel.name === 'events' ? /Iniciar|Retomar/ : 'Reproduzir');
}

async function expectPlaying(page, carousel) {
  await expect(page.locator(carousel.toggle)).toHaveText(carousel.name === 'events' ? 'Pausar rotação' : 'Pausar');
}

async function pause(page, carousel, input = 'mouse') {
  await expectPlaying(page, carousel);
  const toggle = page.locator(carousel.toggle);
  // Real pointer activation preserves the intent captured before focusin pauses.
  // Merely focusing and pressing Enter would deliberately resume instead.
  if (input === 'touch') await toggle.tap();
  else { await toggle.click(); await page.mouse.move(0, 0); }
  await expectPaused(page, carousel);
  await page.clock.runFor(0);
}

async function resume(page, carousel, input = 'keyboard') {
  const toggle = page.locator(carousel.toggle);
  await expectPaused(page, carousel);
  await expect(toggle).toBeEnabled();
  await toggle.scrollIntoViewIfNeeded();
  if (input !== 'touch') await toggle.focus();
  expect((await geometry(page, carousel.track)).visible).toBe(true);
  if (input === 'touch') await toggle.tap();
  else await toggle.press('Enter');
  await expectPlaying(page, carousel);
  // Flush focusout's zero-delay scheduling without advancing the five-second
  // interval, including when returning from a manual/share control.
  await page.clock.runFor(0);
}

async function expectReduced(page) {
  expect(await page.evaluate(() => ({
    original: window.originalMotionQuery.matches,
    current: matchMedia('(prefers-reduced-motion: reduce)').matches,
    unchanged: window.matchMedia === window.originalMatchMedia
  }))).toEqual({ original: true, current: true, unchanged: true });
}

async function expectNoAnimation(page, carousel) {
  const result = await page.locator(carousel.track).evaluate(node => ({
    moving: node.hasAttribute('data-moving'),
    dragging: node.classList.contains('is-dragging'),
    running: node.getAnimations({ subtree: true }).filter(animation => animation.playState !== 'finished').length,
    styles: Array.from(node.children).map(child => {
      const style = getComputedStyle(child);
      return { transition: style.transitionDuration, animation: style.animationName };
    })
  }));
  expect(result.moving).toBe(false);
  expect(result.dragging).toBe(false);
  expect(result.running).toBe(0);
  for (const style of result.styles) {
    expect(style.transition.split(',').every(value => parseFloat(value) === 0)).toBe(true);
    expect(style.animation.split(',').every(value => value.trim() === 'none')).toBe(true);
  }
  const probe = await page.evaluate(name => window.motionProbe[name], carousel.name);
  expect(probe.animations).toEqual([]);
  expect(probe.moving).toEqual([]);
}

async function assertIsolated(state) {
  expect(state.errors).toEqual([]);
  expect(state.blocked).toEqual([]);
  expect(state.methods).toEqual(['ctEventosPublicosListarPROD']);
}

async function hidden(page, value) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}

async function storageSnapshot(page) {
  return page.evaluate(() => ({
    local: Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)]),
    cookie: document.cookie
  }));
}

for (const reducedMotion of ['reduce', 'no-preference']) {
  for (const standalone of [false, true]) {
    test(`fresh ${standalone ? 'emulated standalone' : 'browser'} entry / ${reducedMotion}: all carousels start automatically with visible Pause`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 4000 });
      const state = await setup(page, reducedMotion, { standalone });
      const before = await storageSnapshot(page);
      const started = await page.evaluate(() => performance.now());
      if (standalone) expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
      for (const carousel of CAROUSELS) {
        expect((await geometry(page, carousel.track)).visible).toBe(true);
        await expectPlaying(page, carousel);
        await expect(page.locator(carousel.toggle)).toBeVisible();
        await expect(page.locator(carousel.toggle)).toBeEnabled();
        if (reducedMotion === 'reduce') {
          await expect(page.locator(carousel.note)).toBeVisible();
          await expect(page.locator(carousel.note)).not.toHaveText(/^\s*$/);
        } else await expect(page.locator(carousel.note)).toBeHidden();
        expect(await active(page, carousel)).toBe(0);
      }
      // No carousel interaction, explicit Start, focus change or visibility
      // reset precedes these 0/5/10-second fresh-entry observations.
      for (const elapsed of [5, 10]) {
        await page.clock.runFor(5000);
        for (const carousel of CAROUSELS) {
          expect(await active(page, carousel)).toBe(elapsed === 5 ? 1 : 0);
          await expectPlaying(page, carousel);
          if (reducedMotion === 'reduce') await expectNoAnimation(page, carousel);
        }
      }
      for (const carousel of CAROUSELS) {
        const swaps = await changes(page, carousel);
        expect(swaps.map(change => change.index)).toEqual([1, 0]);
        expect(swaps[0].at - started).toBeGreaterThan(0);
        expect(swaps[0].at - started).toBeLessThanOrEqual(5000);
        if (reducedMotion === 'reduce' || carousel !== EVENTS) expect(swaps[1].at - swaps[0].at).toBe(5000);
        else {
          expect(swaps[1].at - swaps[0].at).toBeGreaterThanOrEqual(4900);
          expect(swaps[1].at - swaps[0].at).toBeLessThanOrEqual(5100);
        }
      }
      if (standalone && reducedMotion === 'reduce') {
        // Preserve explicit per-carousel controls coverage in emulated standalone
        // after proving the untouched startup default above.
        for (const carousel of CAROUSELS) {
          await pause(page, carousel);
          await resetChanges(page, carousel);
          await page.clock.runFor(5000);
          expect(await changes(page, carousel)).toEqual([]);
          await resume(page, carousel);
          await page.clock.runFor(4999);
          expect(await changes(page, carousel)).toEqual([]);
          await page.clock.runFor(1);
          expect((await changes(page, carousel)).length).toBe(1);
          await expectNoAnimation(page, carousel);
        }
      }
      expect(await storageSnapshot(page)).toEqual(before);
      expect(await page.evaluate(() => window.motionStorageWrites)).toEqual([]);
      expect(await page.evaluate(() => ({ original: window.originalMotionQuery.matches,
        current: matchMedia('(prefers-reduced-motion: reduce)').matches,
        unchanged: window.matchMedia === window.originalMatchMedia })))
        .toEqual({ original: reducedMotion === 'reduce', current: reducedMotion === 'reduce', unchanged: true });
      expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
      await assertIsolated(state);
    });
  }
}


test('mobile 390×664 fresh reduced-motion entry auto-loops without scroll, focus or control interaction', async ({ browser }, testInfo) => {
  const context = await browser.newContext(MOBILE);
  try {
    const page = await context.newPage(), state = await setup(page);
    const before = await page.evaluate(() => ({ y: scrollY, focus: document.activeElement.tagName }));
    const storage = await storageSnapshot(page);
    const visible = await geometry(page, EVENTS.track);
    expect(visible.visible).toBe(true);
    expect(visible.ratio).toBeGreaterThan(0);
    expect(visible.ratio).toBeLessThan(0.25);
    await expectPlaying(page, EVENTS);
    expect(await active(page, EVENTS)).toBe(0);
    // Ordinary viewport frames preserve the genuinely small initial intersection.
    // No reveal(), scrolling, pointer/focus action or explicit Resume is used.
    await page.screenshot({ path: testInfo.outputPath('fresh-mobile-reduced-auto-00s.png') });
    for (const elapsed of [5, 10]) {
      await page.clock.runFor(5000);
      expect(await active(page, EVENTS)).toBe(elapsed === 5 ? 1 : 0);
      await expectPlaying(page, EVENTS);
      await expectNoAnimation(page, EVENTS);
      expect(await page.evaluate(() => ({ y: scrollY, focus: document.activeElement.tagName }))).toEqual(before);
      await page.screenshot({ path: testInfo.outputPath(`fresh-mobile-reduced-auto-${String(elapsed).padStart(2, '0')}s.png`) });
    }
    const swaps = await changes(page, EVENTS);
    expect(swaps.map(change => change.index)).toEqual([1, 0]);
    expect(swaps[1].at - swaps[0].at).toBe(5000);
    expect(await storageSnapshot(page)).toEqual(storage);
    expect(await page.evaluate(() => window.motionStorageWrites)).toEqual([]);
    await expectReduced(page);
    await assertIsolated(state);
  } finally { await context.close(); }
});

for (const carousel of CAROUSELS) {
  for (const input of ['keyboard', 'touch']) {
    test(`${carousel.name}: ${input} Resume restarts at exact five-second intervals without animation; Pause persists`, async ({ browser }) => {
      const context = await browser.newContext(input === 'touch' ? MOBILE : { viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
      try {
        const page = await context.newPage(), state = await setup(page);
        await reveal(page, carousel);
        const initial = await active(page, carousel);
        await pause(page, carousel, input === 'touch' ? 'touch' : 'mouse');
        await resume(page, carousel, input);
        const started = await page.evaluate(() => performance.now());
        for (let interval = 1; interval <= 3; interval++) {
          await page.clock.runFor(4999);
          expect((await changes(page, carousel)).length).toBe(interval - 1);
          await page.clock.runFor(1);
          expect(await active(page, carousel)).toBe((initial + interval) % 2);
          expect((await changes(page, carousel)).map(change => change.at - started))
            .toEqual(Array.from({ length: interval }, (_, number) => (number + 1) * 5000));
          await expectNoAnimation(page, carousel);
          await expectReduced(page);
        }
        await expect(page.locator(carousel.note)).toBeVisible();
        // Space exercises a different keyboard activation than Resume's Enter.
        if (input === 'touch') await page.locator(carousel.toggle).tap();
        else await page.locator(carousel.toggle).press('Space');
        await expectPaused(page, carousel);
        await resetChanges(page, carousel);
        await page.clock.runFor(15000);
        expect(await changes(page, carousel)).toEqual([]);
        await assertIsolated(state);
      } finally { await context.close(); }
    });
  }

  test(`${carousel.name}: Pause and Resume are independent of the other visible carousels`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 4000 });
    const state = await setup(page);
    for (const item of CAROUSELS) {
      expect((await geometry(page, item.track)).visible).toBe(true);
      await expectPlaying(page, item);
    }
    await pause(page, carousel);
    await page.clock.runFor(11000);
    expect(await changes(page, carousel)).toEqual([]);
    for (const other of CAROUSELS.filter(item => item !== carousel)) {
      expect((await changes(page, other)).map(change => change.index)).toEqual([1, 0]);
      await expectPlaying(page, other);
      await pause(page, other);
      await resetChanges(page, other);
    }
    await resume(page, carousel);
    await page.clock.runFor(10000);
    expect((await changes(page, carousel)).map(change => change.index)).toEqual([1, 0]);
    for (const other of CAROUSELS.filter(item => item !== carousel)) {
      await expectPaused(page, other);
      expect(await changes(page, other)).toEqual([]);
    }
    await expectReduced(page);
    await assertIsolated(state);
  });

  test(`${carousel.name}: preference changes stop playback and never silently resume or reuse an old opt-in`, async ({ page }) => {
    const state = await setup(page, 'no-preference');
    await reveal(page, carousel);
    await expectPlaying(page, carousel);
    await expect(page.locator(carousel.note)).toBeHidden();
    await page.clock.runFor(5500);
    expect((await changes(page, carousel)).length).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectPaused(page, carousel);
    await expect(page.locator(carousel.toggle)).toBeEnabled();
    await expect(page.locator(carousel.note)).toBeVisible();
    await resetChanges(page, carousel);
    await page.clock.runFor(11000);
    expect(await changes(page, carousel)).toEqual([]);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator(carousel.note)).toBeHidden();
    await expectPaused(page, carousel);
    await page.clock.runFor(11000);
    expect(await changes(page, carousel)).toEqual([]);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await resume(page, carousel);
    await page.clock.runFor(5000);
    expect((await changes(page, carousel)).length).toBe(1);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectPaused(page, carousel);
    await resetChanges(page, carousel);
    await page.clock.runFor(11000);
    expect(await changes(page, carousel)).toEqual([]);
    await expectReduced(page);
    await assertIsolated(state);
  });

  test(`${carousel.name}: manual previous/next and link focus retain their deliberate pause`, async ({ page }) => {
    const state = await setup(page);
    await reveal(page, carousel);
    await pause(page, carousel);
    for (const control of [carousel.next, carousel.previous]) {
      await resume(page, carousel);
      const before = await active(page, carousel);
      await page.locator(control).focus();
      await page.locator(control).press('Enter');
      expect(await active(page, carousel)).toBe((before + 1) % 2);
      await expectPaused(page, carousel);
      await resetChanges(page, carousel);
      await page.clock.runFor(11000);
      expect(await changes(page, carousel)).toEqual([]);
      await expectNoAnimation(page, carousel);
    }
    await resume(page, carousel);
    await page.locator(carousel.track).evaluate((node, name) => {
      const current = name === 'events' ? node.querySelector('.catalog-card:not([inert])') : node.querySelector('.ad-slide:not([hidden])');
      const link = current.matches('a') ? current : current.querySelector('a');
      link.focus({ preventScroll: true });
    }, carousel.name);
    await expectPaused(page, carousel);
    await page.locator('#event-search-input').evaluate(node => node.focus({ preventScroll: true }));
    await resetChanges(page, carousel);
    await page.clock.runFor(11000);
    expect(await changes(page, carousel)).toEqual([]);
    await assertIsolated(state);
  });

  test(`${carousel.name}: hidden and offscreen timers preserve per-instance Pause and Resume`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    const state = await setup(page);
    await reveal(page, carousel);
    await pause(page, carousel);
    // Neither returning from the background nor re-entering the viewport resumes a manual pause.
    await hidden(page, true);
    await page.clock.runFor(11000);
    await hidden(page, false);
    await page.locator('footer').scrollIntoViewIfNeeded();
    expect((await geometry(page, carousel.track)).visible).toBe(false);
    await page.clock.runFor(11000);
    await reveal(page, carousel);
    await page.clock.runFor(11000);
    await expectPaused(page, carousel);
    expect(await changes(page, carousel)).toEqual([]);

    await resume(page, carousel);
    await page.clock.runFor(2000);
    await hidden(page, true);
    await page.clock.runFor(11000);
    expect(await changes(page, carousel)).toEqual([]);
    await hidden(page, false);
    await page.clock.runFor(4999);
    expect(await changes(page, carousel)).toEqual([]);
    await page.clock.runFor(1);
    expect((await changes(page, carousel)).length).toBe(1);

    await page.locator('footer').scrollIntoViewIfNeeded();
    expect((await geometry(page, carousel.track)).visible).toBe(false);
    await resetChanges(page, carousel);
    await page.clock.runFor(11000);
    expect(await changes(page, carousel)).toEqual([]);
    await reveal(page, carousel);
    await page.clock.runFor(4999);
    expect(await changes(page, carousel)).toEqual([]);
    await page.clock.runFor(1);
    expect((await changes(page, carousel)).length).toBe(1);
    await expectReduced(page);
    await assertIsolated(state);
  });
}

test('all three manual pauses are memory-only and reload restores fresh reduced-motion autoplay', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 4000 });
  const state = await setup(page), before = await storageSnapshot(page);
  for (const carousel of CAROUSELS) await pause(page, carousel);
  await page.clock.runFor(11000);
  for (const carousel of CAROUSELS) expect(await changes(page, carousel)).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(before);
  expect(await page.evaluate(() => window.motionStorageWrites)).toEqual([]);
  await expectReduced(page);

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  await installProbe(page);
  for (const carousel of CAROUSELS) {
    expect((await geometry(page, carousel.track)).visible).toBe(true);
    await expectPlaying(page, carousel);
    await expect(page.locator(carousel.toggle)).toBeEnabled();
    await expect(page.locator(carousel.note)).toBeVisible();
  }
  await page.clock.runFor(10000);
  for (const carousel of CAROUSELS) {
    expect((await changes(page, carousel)).map(change => change.index)).toEqual([1, 0]);
    await expectNoAnimation(page, carousel);
  }
  expect(await storageSnapshot(page)).toEqual(before);
  expect(await page.evaluate(() => window.motionStorageWrites)).toEqual([]);
  await expectReduced(page);
  expect(state.errors).toEqual([]);
  expect(state.blocked).toEqual([]);
  expect(state.methods).toEqual(['ctEventosPublicosListarPROD', 'ctEventosPublicosListarPROD']);
});

for (const reducedMotion of ['reduce', 'no-preference']) test(`a single event / ${reducedMotion} never rotates or exposes playback controls`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 4000 });
  const state = await setup(page, reducedMotion, { singleEvent: true });
  await expect(page.locator('#event-rail-controls')).toBeHidden();
  await expect(page.locator(EVENTS.note)).toBeHidden();
  await expect(page.locator('#events-grid')).toHaveAttribute('tabindex', '-1');
  await page.clock.runFor(16000);
  expect(await active(page, EVENTS)).toBe(0);
  expect(await changes(page, EVENTS)).toEqual([]);
  await expect(page.locator('#events-grid')).not.toHaveAttribute('data-moving', 'true');
  await assertIsolated(state);
});

test('a missing optional event-note lookup does not break reduced-motion Resume', async ({ page }) => {
  const state = await setup(page, 'reduce', { missingEventNote: true });
  expect(await page.evaluate(() => document.getElementById('event-rail-motion-note'))).toBeNull();
  await reveal(page, EVENTS);
  await pause(page, EVENTS);
  await resume(page, EVENTS);
  await page.clock.runFor(4999);
  expect(await changes(page, EVENTS)).toEqual([]);
  await page.clock.runFor(1);
  expect((await changes(page, EVENTS)).length).toBe(1);
  await expectReduced(page);
  await expectNoAnimation(page, EVENTS);
  await assertIsolated(state);
});

test('failed ad artwork keeps its unavailable playback controls and motion note hidden after language refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 4000 });
  const state = await setup(page, 'reduce', { missingAds: true });
  for (const carousel of CAROUSELS.slice(1)) {
    await page.locator(`${carousel.track} img`).evaluate(image => new Promise(resolve => {
      if (image.complete) return resolve();
      image.addEventListener('error', resolve, { once: true });
    }));
    await expect(page.locator(`${carousel.host} .ad-controls`)).toBeHidden();
    await expect(page.locator(carousel.note)).toBeHidden();
    await resetChanges(page, carousel);
  }
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('ct:language')));
  for (const carousel of CAROUSELS.slice(1)) {
    await expect(page.locator(`${carousel.host} .ad-controls`)).toBeHidden();
    await expect(page.locator(carousel.note)).toBeHidden();
  }
  await page.clock.runFor(11000);
  for (const carousel of CAROUSELS.slice(1)) expect(await changes(page, carousel)).toEqual([]);
  await expectReduced(page);
  await assertIsolated(state);
});

test('reduced-motion explanations and enabled Pause controls at 320px with 150% text', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const state = await setup(page);
  async function expectAdFooterSeparation(scale) {
    for (const carousel of CAROUSELS.slice(1)) {
      const parts = [
        ['advertising label', '.eyebrow'],
        ['playback status', '.ad-playback-state'],
        ['playback controls', '.ad-controls']
      ];
      const boxes = [];
      for (const [name, selector] of parts) {
        const element = page.locator(`${carousel.host} ${selector}`);
        await expect(element).toBeVisible();
        const box = await element.boundingBox();
        expect(box, `${carousel.name}: ${name} at ${scale}% text`).not.toBeNull();
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(321);
        boxes.push({ name, ...box });
      }
      for (let first = 0; first < boxes.length; first++) {
        for (let second = first + 1; second < boxes.length; second++) {
          const a = boxes[first], b = boxes[second];
          const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          expect(overlapX > 0.5 && overlapY > 0.5,
            `${carousel.name}: ${a.name} overlaps ${b.name} at 320px/${scale}% text`).toBe(false);
        }
      }
    }
  }
  await expectAdFooterSeparation(100);
  await page.locator('#accessibility-toggle').click();
  for (let step = 0; step < 5; step++) await page.locator('#font-up').click();
  await expect(page.locator('#font-reset')).toHaveText('150%');
  await page.locator('#accessibility-toggle').click();
  await expectAdFooterSeparation(150);
  for (const carousel of [EVENTS, CAROUSELS[1]]) {
    await reveal(page, carousel);
    await expectPlaying(page, carousel);
    await expect(page.locator(carousel.toggle)).toBeEnabled();
    await expect(page.locator(carousel.note)).toBeVisible();
    const note = await page.locator(carousel.note).boundingBox();
    expect(note.x).toBeGreaterThanOrEqual(0);
    expect(note.x + note.width).toBeLessThanOrEqual(321);
    // Keep the real sticky header and page geometry. Centering the actual
    // control gives truthful viewport evidence without hiding or restyling it.
    await page.locator(carousel.toggle).evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
    const unobscured = await page.locator(carousel.toggle).evaluate(node => {
      const rect = node.getBoundingClientRect(), header = document.querySelector('.topbar').getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return rect.top >= header.bottom && rect.bottom <= innerHeight && node.contains(hit);
    });
    expect(unobscured, `${carousel.name}: Pause must be visible below the sticky header`).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${carousel.name === 'events' ? 'events-pause' : 'primary-ad-controls'}-reduced-motion-320px-text150.png`)
    });
  }
  // The full page from its true top also records the event explanation, which
  // is below the tall event card and cannot share the Pause button's viewport.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('home-reduced-motion-320px-text150-full-page.png'), fullPage: true });
  await expectReduced(page);
  // The footer layout is shared by both media preferences. Recheck the same
  // narrow geometry without reduced motion, without adding another test matrix.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const carousel of CAROUSELS.slice(1)) await expect(page.locator(carousel.note)).toBeHidden();
  expect(await page.evaluate(() => window.originalMotionQuery.matches)).toBe(false);
  await expectAdFooterSeparation(150);
  await page.locator('#accessibility-toggle').click();
  await page.locator('#font-reset').click();
  await expect(page.locator('#font-reset')).toHaveText('100%');
  await page.locator('#accessibility-toggle').click();
  await expectAdFooterSeparation(100);
  await assertIsolated(state);
});

async function verticalTouch(page, selector) {
  const before = await page.evaluate(() => scrollY), box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  const x = box.x + box.width / 2;
  const y = Math.min(page.viewportSize().height - 40, Math.max(180, box.y + Math.min(box.height / 2, 120)));
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let number = 1; number <= 8; number++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - number * 12 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  } finally { await cdp.detach(); }
}

for (const carousel of CAROUSELS) test(`${carousel.name}: real vertical touch scrolling preserves manual Pause and explicit Resume`, async ({ browser }) => {
  const context = await browser.newContext(MOBILE);
  try {
    const page = await context.newPage(), state = await setup(page);
    const touchTarget = carousel.name === 'events' ? '.catalog-card:not([inert]) .catalog-photo' : carousel.track;
    await reveal(page, carousel);
    await pause(page, carousel, 'touch');
    await reveal(page, carousel);
    await verticalTouch(page, touchTarget);
    await expectPaused(page, carousel);
    await page.clock.runFor(11000);
    expect(await changes(page, carousel)).toEqual([]);

    await reveal(page, carousel);
    await resume(page, carousel, 'touch');
    await verticalTouch(page, touchTarget);
    await expectPlaying(page, carousel);
    expect((await geometry(page, carousel.track)).visible).toBe(true);
    await resetChanges(page, carousel);
    await page.clock.runFor(11000);
    expect((await changes(page, carousel)).length).toBeGreaterThanOrEqual(2);
    await expectReduced(page);
    await expectNoAnimation(page, carousel);
    await assertIsolated(state);
  } finally { await context.close(); }
});

test('canceling the native share stub keeps automatic events paused until explicit Resume', async ({ browser }) => {
  const context = await browser.newContext(MOBILE);
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.motionShareCalls = [];
      window.motionClipboardCalls = 0;
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: payload => {
        window.motionShareCalls.push(payload);
        return new Promise((resolve, reject) => { window.cancelMotionShare = () => reject(new DOMException('Fixture cancellation', 'AbortError')); });
      } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { window.motionClipboardCalls++; } } });
    });
    const state = await setup(page);
    await reveal(page, EVENTS);
    await expectPlaying(page, EVENTS);
    const share = page.locator('.catalog-card:not([inert]) [data-public-share="event"]');
    const button = share.getByRole('button');
    await button.tap();
    expect(await page.evaluate(() => window.motionShareCalls.length)).toBe(1);
    await expect(button).toBeDisabled();
    await expect(page.locator(EVENTS.toggle)).toBeDisabled();
    await expect(page.locator(EVENTS.previous)).toBeDisabled();
    await expect(page.locator(EVENTS.next)).toBeDisabled();
    await page.clock.runFor(11000);
    expect(await changes(page, EVENTS)).toEqual([]);

    await page.evaluate(() => window.cancelMotionShare());
    await expect(button).toBeEnabled();
    await expect(page.locator(EVENTS.toggle)).toBeEnabled();
    await expectPaused(page, EVENTS);
    await expect(share.locator('[role="status"]')).toHaveText('');
    expect(await page.evaluate(() => window.motionClipboardCalls)).toBe(0);
    await page.clock.runFor(11000);
    expect(await changes(page, EVENTS)).toEqual([]);
    await resume(page, EVENTS, 'touch');
    await page.clock.runFor(4999);
    expect(await changes(page, EVENTS)).toEqual([]);
    await page.clock.runFor(1);
    expect((await changes(page, EVENTS)).length).toBe(1);
    await expectReduced(page);
    await expectNoAnimation(page, EVENTS);
    await assertIsolated(state);
  } finally { await context.close(); }
});
