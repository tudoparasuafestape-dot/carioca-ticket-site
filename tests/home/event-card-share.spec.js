const { test, expect } = require('@playwright/test');
const { fixture, events } = require('./rail-fixture.cjs');
const ORIGIN = 'http://127.0.0.1:4174';
const PUBLIC = 'https://cariocaticket.com.br/evento/?evento=';
function expected(event, cta='Confira este evento na Carioca Ticket.') {
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const date = [clean(event.data), clean(event.horario)].filter(Boolean).join(' · ');
  const venue = [clean(event.local), clean(event.cidade), clean(event.uf)].filter(Boolean).join(' · ');
  return { title:event.nome, text:[event.nome, date, venue, cta].filter(Boolean).join(' · '), url:PUBLIC + encodeURIComponent(event.id) };
}
function copied(event) { const payload = expected(event); return payload.text + ' ' + payload.url; }
function rows(count) {
  return Array.from({ length:count }, (_, i) => ({ ...events[i % 2], id:'SHARE-EVENT-' + (i + 1), nome:events[i % 2].nome + ' ' + (i + 1) }));
}
async function prepare(page, count, mode='native', customRows) {
  await page.addInitScript(mode => {
    window.shareCalls = []; window.copies = [];
    Object.defineProperty(navigator, 'share', { configurable:true, value:['absent', 'copy-fails', 'copy-pending'].includes(mode) ? undefined : async payload => {
      window.shareCalls.push(payload);
      if (mode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
      if (mode === 'share-fails') throw new Error('Native share unavailable');
      if (mode === 'pending') await new Promise(resolve => { window.releaseShare = resolve; });
    } });
    Object.defineProperty(navigator, 'canShare', { configurable:true, value:() => {
      if (mode === 'can-share-throws') throw new Error('Unsupported payload');
      return mode !== 'unsupported';
    } });
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:async value => {
      if (mode === 'copy-fails') throw new Error('Clipboard blocked');
      if (mode === 'copy-pending') await new Promise(resolve => { window.releaseShare = resolve; });
      window.copies.push(value);
    } } });
    sessionStorage.setItem('share-session-fixture', 'unchanged');
  }, mode);
  const data = customRows || rows(count);
  const state = await fixture(page, { result:{ sucesso:true, eventos:data } });
  await page.goto(ORIGIN + '/?ref=PRIVATE-FIXTURE&token=DO-NOT-SHARE#filters');
  await expect(page.locator('[data-public-share="event"]')).toHaveCount(count);
  return { state, data };
}
function current(page) { return page.locator('.catalog-card:not([inert]) [data-public-share="event"]'); }
async function settled(page, index) { await expect(page.locator('#events-grid')).toHaveAttribute('data-active-index', String(index)); }

for (const count of [1, 2, 15]) for (const width of [320, 412, 1440]) {
  test(`every card shares its own public event: ${count} events / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height:1000 });
    await page.emulateMedia({ reducedMotion:'reduce' });
    const { state, data } = await prepare(page, count);
    const before = page.url();
    expect(await page.evaluate(() => shareCalls.length + copies.length)).toBe(0);
    for (let i=0; i<count; i++) {
      const host = current(page), button = host.locator('button');
      await expect(button).toHaveAccessibleName('Compartilhar evento: ' + data[i].nome);
      await expect(button).toBeVisible();
      const size = await button.boundingBox();
      expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(node => !!node.closest('a'))).toBe(false);
      await button.click();
      expect(await page.evaluate(() => shareCalls.at(-1))).toEqual(expected(data[i]));
      expect(page.url()).toBe(before);
      await expect(page.locator('.catalog-card:not([inert]) .btn-primary')).toHaveAttribute('href', '/checkout/?evento=' + data[i].id);
      if (count > 1) { await page.locator('#event-rail-next').click(); await settled(page, (i+1) % count); }
    }
    if (count > 1) {
      await current(page).locator('button').click();
      expect(await page.evaluate(() => shareCalls.at(-1))).toEqual(expected(data[0]));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => sessionStorage.getItem('share-session-fixture'))).toBe('unchanged');
    expect(state.blocked).toEqual([]); expect(state.errors).toEqual([]);
    if (count === 15 && width === 412) {
      await page.locator('#event-feature').scrollIntoViewIfNeeded();
      await page.screenshot({ path:testInfo.outputPath('event-card-share-mobile.png') });
    }
  });
}

for (const mode of ['absent', 'unsupported', 'can-share-throws', 'share-fails', 'copy-fails', 'cancel']) {
  test(`event sharing ${mode}: safe copy or selectable fallback and quiet cancellation`, async ({ page }) => {
    await page.setViewportSize({ width:320, height:915 });
    const { data } = await prepare(page, 2, mode);
    const host = current(page), before = page.url();
    await host.locator('button').click();
    await expect(host.locator('button')).toBeEnabled();
    if (mode === 'cancel') {
      await expect(host.locator('[role="status"]')).toBeEmpty();
      await expect(host.locator('input')).toBeHidden();
      expect(await page.evaluate(() => copies)).toEqual([]);
    } else if (mode === 'copy-fails') {
      await expect(host.locator('input')).toHaveValue(copied(data[0]));
      await expect(host.locator('input')).toBeVisible();
      await host.locator('input').click();
      expect(await host.locator('input').evaluate(node => node.selectionStart === 0 && node.selectionEnd === node.value.length)).toBe(true);
      await expect(host.locator('[role="status"]')).toContainText('Não foi possível copiar.');
    } else {
      expect(await page.evaluate(() => copies)).toEqual([copied(data[0])]);
      await expect(host.locator('[role="status"]')).toHaveText('Mensagem copiada.');
    }
    if (['absent', 'unsupported', 'can-share-throws', 'copy-fails'].includes(mode)) expect(await page.evaluate(() => shareCalls)).toEqual([]);
    await expect(page.locator('#event-rail-pause')).toHaveText('Retomar rotação');
    expect(page.url()).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const mode of ['pending', 'copy-pending']) {
  test(`${mode}: pause through unresolved promise, repeated clicks and explicit resume`, async ({ page }) => {
    await page.clock.install();
    await prepare(page, 2, mode);
    const button = current(page).locator('button');
    await button.click();
    await expect(button).toBeDisabled(); await expect(button).toHaveAttribute('aria-busy', 'true');
    await button.dispatchEvent('click');
    await page.locator('#event-search-input').focus(); await page.mouse.move(0, 0);
    await page.clock.runFor(16000); await settled(page, 0);
    await expect(page.locator('#event-rail-pause')).toBeDisabled();
    await expect(page.locator('#event-rail-next')).toBeDisabled();
    await page.locator('#event-rail-next').dispatchEvent('click'); await settled(page, 0);
    if (mode === 'pending') expect(await page.evaluate(() => shareCalls.length)).toBe(1);
    await page.evaluate(() => releaseShare());
    await expect(button).toBeEnabled(); await expect(page.locator('#event-rail-pause')).toBeEnabled();
    await page.clock.runFor(11000); await settled(page, 0);
    await expect(page.locator('#event-rail-pause')).toHaveText('Retomar rotação');
    await page.locator('#event-rail-pause').click();
    await page.locator('#event-search-input').focus(); await page.mouse.move(0, 0);
    await page.locator('#events-grid').scrollIntoViewIfNeeded();
    await page.clock.runFor(5500); await settled(page, 1);
  });
}

test('pending share survives catalog re-render without blocking later navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await prepare(page, 15, 'pending');
  await current(page).locator('button').click();
  await page.locator('#event-search-input').fill('criativo');
  await page.locator('#event-search-form button').click();
  await expect(page.locator('.catalog-card')).toHaveCount(7);
  await current(page).locator('button').click();
  expect(await page.evaluate(() => shareCalls.length)).toBe(1);
  await expect(page.locator('#event-rail-next')).toBeDisabled();
  await page.evaluate(() => releaseShare());
  await expect(page.locator('#event-rail-next')).toBeEnabled();
  await page.locator('#event-rail-next').click(); await settled(page, 1);
});

test('automatic last-to-first loop shares the first original, inactive cards cannot share', async ({ page }) => {
  await page.clock.install();
  const { data } = await prepare(page, 2);
  await page.locator('#events-grid').scrollIntoViewIfNeeded();
  await page.locator('#events-grid').evaluate(node => new Promise(resolve => {
    const observer = new IntersectionObserver(entries => { if (entries[0].intersectionRatio >= .25) { observer.disconnect(); resolve(); } }, { threshold:.25 }); observer.observe(node);
  }));
  for (let i=0; i<55; i++) await page.clock.runFor(100);
  await settled(page, 1);
  for (let i=0; i<50; i++) await page.clock.runFor(100);
  await settled(page, 0);
  expect(await page.getByRole('button', { name:/^Compartilhar evento:/ }).count()).toBe(1);
  await page.locator('.catalog-card[inert] [data-public-share="event"] button').dispatchEvent('click');
  expect(await page.evaluate(() => shareCalls)).toEqual([]);
  await current(page).locator('button').click();
  expect(await page.evaluate(() => shareCalls)).toEqual([expected(data[0])]);
});

test('touch share is separate from swiping and buy, with original title and safely encoded ID', async ({ browser }) => {
  const context = await browser.newContext({ viewport:{ width:412, height:915 }, hasTouch:true, isMobile:true, serviceWorkers:'block' });
  const page = await context.newPage();
  const data = [{ ...events[0], id:'PUBLIC /?&=# evento', nome:'Festa <especial> & amigos' }, ...rows(1)];
  const { state } = await prepare(page, 2, 'native', data);
  await current(page).locator('button').tap();
  expect(await page.evaluate(() => shareCalls)).toEqual([expected(data[0])]);
  await settled(page, 0); expect(page.url()).toBe(ORIGIN + '/?ref=PRIVATE-FIXTURE&token=DO-NOT-SHARE#filters');
  await page.locator('.catalog-card:not([inert]) .catalog-photo').scrollIntoViewIfNeeded();
  const target = await page.locator('.catalog-card:not([inert]) .catalog-photo').boundingBox();
  const cdp = await context.newCDPSession(page), x=target.x+target.width*.8, y=target.y+target.height*.5;
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x,y }] });
  for (let i=1; i<=8; i++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:x-i*24,y }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await settled(page, 1);
  expect(await page.evaluate(() => shareCalls.length)).toBe(1);
  expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  await context.close();
});

test('language changes retain the event source name and no duplicate controls after filters', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  const { data } = await prepare(page, 2);
  await page.locator('#home-language').selectOption('en-US', { force:true });
  await expect(current(page).locator('button')).toHaveAccessibleName('Share event: ' + data[0].nome);
  await expect(current(page).locator('[data-share-event-title]')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('[data-public-share="event"]')).toHaveCount(2);
  await current(page).locator('button').click();
  expect(await page.evaluate(() => shareCalls)).toEqual([expected(data[0], 'Check out this event on Carioca Ticket.')]);
});

for (const [locale, cta, label, feedback] of [
  ['pt-BR', 'Confira este evento na Carioca Ticket.', 'Mensagem do evento para compartilhar', 'Mensagem copiada.'],
  ['en-US', 'Check out this event on Carioca Ticket.', 'Event message to share', 'Message copied.'],
  ['es', 'Descubre este evento en Carioca Ticket.', 'Mensaje del evento para compartir', 'Mensaje copiado.'],
  ['zh-Hans', '在 Carioca Ticket 查看此活动。', '用于分享的活动消息', '消息已复制。']
]) {
  test(`rich event message is localized and copied intact / ${locale}`, async ({ page }) => {
    const { data, state } = await prepare(page, 1, 'absent');
    await page.locator('#home-language').selectOption(locale, { force:true });
    const host = current(page);
    await host.locator('button').click();
    const payload = expected(data[0], cta);
    expect(await page.evaluate(() => copies)).toEqual([payload.text + ' ' + payload.url]);
    await expect(host.locator('input')).toHaveAttribute('aria-label', label);
    await expect(host.locator('[role="status"]')).toHaveText(feedback);
    expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  });
}

test('missing facts stay absent and unrelated private fields never enter the message', async ({ page }, testInfo) => {
  await page.setViewportSize({ width:320, height:915 });
  const data = [{ id:'PUBLIC-safe', nome:'Festa <img src=x onerror=alert(1)> & amigos', data:'', horario:null, local:undefined, cidade:'', uf:'', token:'SECRET', convite:'PRIVATE-INVITE', links:{ evento:'https://invalid.example/?token=SECRET' } }];
  const { state } = await prepare(page, 1, 'copy-fails', data);
  const host = current(page);
  await host.locator('button').click();
  await expect(host.locator('input')).toHaveValue(copied(data[0]));
  await expect(host.locator('input')).toBeVisible();
  expect(await host.locator('input').inputValue()).not.toMatch(/SECRET|PRIVATE|não informado|undefined|null/);
  expect(await page.locator('.catalog-title img').count()).toBe(0);
  await host.locator('input').click();
  expect(await host.locator('input').evaluate(node => node.selectionStart === 0 && node.selectionEnd === node.value.length)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  await page.locator('#event-feature').scrollIntoViewIfNeeded();
  await page.screenshot({ path:testInfo.outputPath('rich-share-fallback-320.png') });
});
