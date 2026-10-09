const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function speech(page, mode = 'normal') {
  await page.addInitScript(mode => {
    const calls = window.__speech = { texts: [], voices: [], cancels: 0, pauses: 0, resumes: 0, mode };
    if (mode === 'absent') { Object.defineProperty(window, 'speechSynthesis', { value: undefined }); return; }
    const local = { name: 'Português sintético local', lang: 'pt-BR', localService: true };
    const engine = new EventTarget();
    calls.available = mode === 'late' || mode === 'empty' ? [] : mode === 'remote' ? [{ ...local, localService: false }] : [local];
    engine.getVoices = () => calls.available;
    engine.speak = utterance => {
      calls.current = utterance;
      calls.texts.push(utterance.text);
      calls.voices.push(utterance.voice);
      if (mode === 'throw') throw new Error('synthetic unavailable');
      if (mode === 'silent') return;
      setTimeout(() => utterance.onstart?.(), 0);
    };
    engine.pause = () => { calls.pauses++; if (mode !== 'no-pause') calls.current?.onpause?.(); };
    engine.resume = () => { calls.resumes++; if (mode !== 'no-resume') calls.current?.onresume?.(); };
    engine.cancel = () => { calls.cancels++; calls.cancelled = calls.current; calls.current?.onerror?.({ error: 'canceled' }); };
    calls.ready = () => { calls.available = [local]; engine.dispatchEvent(new Event('voiceschanged')); };
    Object.defineProperty(window, 'speechSynthesis', { value: engine });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  }, mode);
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:42971') return route.continue();
    return route.abort('blockedbyclient');
  });
});
for (const route of ['evento', 'evento-v2']) {
  test(`${route}: controls, clean speech, pause/resume/stop, late cancellation`, async ({ page }) => {
    await speech(page);
    await page.goto(`/${route}/?evento=PREVIEW-EVENT`);
    await expect(page.locator('#app')).toBeVisible();
    const listen = page.getByRole('button', { name: 'Ouvir descrição', exact: true });
    await expect(listen).toBeEnabled();
    const description = '<p>Olá &amp; bem-vindos.</p><p>**Música** e [programação](https://invalid.example).</p><script>não ler</script><img src="https://invalid.example/leak" onerror="alert(1)"><span hidden>segredo</span>';
    await page.locator('#longDescription').evaluate((el, value) => { el.textContent = value; }, description);
    await listen.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#description-audio')).toHaveAttribute('data-state', 'playing');
    expect(await page.evaluate(() => __speech.texts)).toEqual(['Olá & bem-vindos. Música e programação.']);
    expect(await page.locator('#description-audio').evaluate(el => el.compareDocumentPosition(document.getElementById('longDescription')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continuar descrição' })).toBeEnabled();
    await page.getByRole('button', { name: 'Continuar descrição' }).click();
    await expect(page.locator('#description-audio')).toHaveAttribute('data-state', 'playing');
    await page.getByRole('button', { name: 'Parar', exact: true }).click();
    await expect(listen).toBeFocused();
    await page.evaluate(() => { __speech.cancelled.onend(); __speech.cancelled.onerror(); });
    await expect(page.locator('#description-audio-status')).toHaveText('Leitura parada.');
    expect(await page.evaluate(() => [__speech.pauses, __speech.resumes, __speech.cancels])).toEqual([1, 1, 1]);
    expect(await page.locator('#startingPrice').textContent()).toBe('R$ 35,00');
    await expect(page.locator('#buyHero')).toHaveAttribute('href', `/${route === 'evento' ? 'checkout' : 'checkout-v2'}/?evento=PREVIEW-EVENT`);
    await expect(page.locator('#coverImage')).toHaveAttribute('src', '/__fixture/music.svg');
    await page.locator('#shareHero').click();
    await expect(page.locator('#shareMenu')).toBeVisible();
    await page.locator('#shareMenuClose').click();
    await expect(page.locator('#shareMenu')).toBeHidden();
  });
}
for (const mode of ['absent', 'empty', 'remote']) {
  test(`honest fallback: ${mode}`, async ({ page }) => {
    await speech(page, mode);
    await page.goto('/evento/?evento=PREVIEW-EVENT');
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#description-listen')).toBeDisabled();
    await expect(page.locator('#description-audio-status')).toContainText(mode === 'absent' ? 'não está disponível' : 'Nenhuma voz local');
    await expect(page.locator('#longDescription')).not.toBeEmpty();
  });
}
test('voices arriving asynchronously enable the button without autoplay', async ({ page }) => {
  await speech(page, 'late');
  await page.goto('/evento/?evento=PREVIEW-EVENT');
  await expect(page.locator('#description-listen')).toBeDisabled();
  await page.evaluate(() => __speech.ready());
  await expect(page.locator('#description-listen')).toBeEnabled();
  expect(await page.evaluate(() => __speech.texts)).toEqual([]);
});
for (const mode of ['throw', 'silent', 'no-pause', 'no-resume']) {
  test(`engine failure remains honest: ${mode}`, async ({ page }) => {
    await speech(page, mode);
    await page.goto('/evento/?evento=PREVIEW-EVENT');
    await page.locator('#description-listen').click();
    if (mode.startsWith('no-')) await page.locator('#description-pause').click();
    if (mode === 'no-resume') await page.locator('#description-listen').click();
    await expect(page.locator('#description-audio')).toHaveAttribute('data-state', 'error', { timeout: 10000 });
    await expect(page.locator('#description-listen')).toBeEnabled();
    await expect(page.locator('#description-stop')).toBeDisabled();
    expect(await page.evaluate(() => __speech.cancels)).toBe(1);
  });
}
test('long descriptions are chunked and stop on pagehide, navigation and replacement', async ({ page }) => {
  await speech(page);
  await page.goto('/evento/?evento=PREVIEW-EVENT');
  const text = 'Música e cultura para todos. '.repeat(25).trim();
  await page.locator('#longDescription').evaluate((el, value) => { el.textContent = value; }, text);
  await page.locator('#description-listen').click();
  await expect(page.locator('#description-audio')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => { while (__speech.texts.join(' ').length < document.getElementById('longDescription').textContent.length) __speech.current.onend(); __speech.current.onend(); });
  expect(await page.evaluate(() => __speech.texts.join(' '))).toBe(text);
  expect(await page.evaluate(() => __speech.texts.every(text => text.length <= 220))).toBe(true);
  await expect(page.locator('#description-audio-status')).toHaveText('Leitura concluída.');
  for (const event of ['pagehide', 'popstate']) {
    await page.locator('#description-listen').click();
    await page.evaluate(name => window.dispatchEvent(new Event(name)), event);
    await expect(page.locator('#description-audio-status')).toHaveText('Leitura parada.');
  }
  await page.locator('#description-listen').click();
  await page.locator('#longDescription').evaluate(el => { el.textContent = 'Descrição nova.'; });
  await expect(page.locator('#description-audio-status')).toContainText('A descrição mudou');
  await page.locator('#description-listen').click();
  await page.evaluate(() => window.addEventListener('pagehide', () => sessionStorage.setItem('cancel-count', String(__speech.cancels))));
  await page.goto('/');
  expect(await page.evaluate(() => sessionStorage.getItem('cancel-count'))).toBe('4');
});
test('theme follows the home choice, system changes and another tab', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.locator('#home-theme').selectOption('light');
  await page.goto('/evento/?evento=PREVIEW-EVENT');
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'light');
  await expect(page.locator('#home-theme')).toHaveValue('light');
  await page.locator('#home-theme').selectOption('dark');
  await page.goto('/');
  await expect(page.locator('#home-theme')).toHaveValue('dark');
  const other = await context.newPage();
  await other.goto('/evento-v2/?evento=PREVIEW-EVENT');
  await page.locator('#home-theme').selectOption('light');
  await expect(other.locator('html')).toHaveAttribute('data-home-theme', 'light');
  await other.locator('#home-theme').selectOption('system');
  await other.emulateMedia({ colorScheme: 'dark' });
  await expect(other.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  await other.emulateMedia({ colorScheme: 'light' });
  await expect(other.locator('html')).toHaveAttribute('data-home-theme', 'light');
});
test('encoded markup, voice changes and pause at a chunk boundary remain safe', async ({ page }) => {
  await speech(page);
  await page.goto('/evento/?evento=PREVIEW-EVENT');
  await page.locator('#longDescription').evaluate(el => { el.textContent = '&lt;p&gt;Descrição &amp;amp; música.&lt;/p&gt;'; });
  await page.locator('#description-listen').click();
  await expect(page.locator('#description-audio')).toHaveAttribute('data-state', 'playing');
  expect(await page.evaluate(() => __speech.texts)).toEqual(['Descrição & música.']);
  await page.getByRole('button', { name: 'Parar', exact: true }).click();
  await page.locator('#longDescription').evaluate(el => { el.textContent = 'Uma longa descrição para ouvir. '.repeat(20); });
  await page.locator('#description-listen').click();
  await expect(page.locator('#description-audio')).toHaveAttribute('data-state', 'playing');
  await page.locator('#description-pause').click();
  await page.evaluate(() => {
    __speech.current.onend();
    __speech.available = [];
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await expect(page.locator('#description-audio')).toHaveAttribute('data-state', 'paused');
  await page.locator('#description-listen').click();
  await expect(page.locator('#description-audio')).toHaveAttribute('data-state', 'playing');
  await page.locator('#description-pause').click();
  await page.locator('#description-stop').click();
  await expect(page.locator('#description-audio-status')).toHaveText('Leitura parada.');
});
test('theme survives unavailable localStorage and controls retain contrast/reflow', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = Storage.prototype.setItem = Storage.prototype.removeItem = () => { throw new Error('storage unavailable'); }; });
  await speech(page);
  await page.goto('/evento/?evento=PREVIEW-EVENT');
  await expect(page.locator('#app')).toBeVisible();
  const out = path.resolve('docs/reviews/event-accessibility/screenshots');
  fs.mkdirSync(out, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.locator('#home-theme').selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-home-theme', theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: path.join(out, `${theme}-${width}.png`), fullPage: true });
    }
    const ratio = await page.locator('#description-listen').evaluate(el => {
      const style = getComputedStyle(el);
      function luminance(value) { const channels = value.match(/\d+/g).slice(0,3).map(Number).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; }
      const a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
test('preview refuses writes, checkout and foreign Host headers', async ({ request }) => {
  expect((await request.post('/__fixture', { data: {} })).status()).toBe(405);
  expect((await request.get('/checkout/?evento=PREVIEW-EVENT')).status()).toBe(403);
  expect((await request.get('/evento/', { headers: { Host: 'foreign.example' } })).status()).toBe(403);
});
for (const route of ['evento', 'evento-v2']) {
  test(`${route}: missing cover keeps the fallback title readable in both themes`, async ({ page }) => {
    await speech(page);
    await page.goto(`/${route}/?evento=PREVIEW-EVENT&scenario=no-cover`);
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#coverImage')).toBeHidden();
    await expect(page.locator('#coverImage')).not.toHaveAttribute('src');
    await expect(page.locator('#coverFallback')).toBeVisible();
    await expect(page.locator('#fallbackEventName')).toHaveText('Encontro de música — demonstração');
    const out = path.resolve('docs/reviews/event-accessibility/screenshots');
    fs.mkdirSync(out, { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.locator('#home-theme').selectOption(theme);
      await expect(page.locator('#fallbackEventName')).toHaveCSS('color', 'rgb(255, 255, 255)');
      // Conservative contrast: #131a22 is the lightest solid base of this fallback gradient.
      const contrast = await page.locator('#fallbackEventName').evaluate(el => {
        function luminance(rgb) {
          const c = rgb.map(value => { const x = value / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
          return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
        }
        const foreground = getComputedStyle(el).color.match(/\d+/g).slice(0,3).map(Number);
        // Include the gold radial overlay at its maximum opacity for a stricter upper bound.
        const background = [19, 26, 34].map((value, i) => Math.round(value * .8 + [255, 214, 109][i] * .2));
        return (luminance(foreground) + .05) / (luminance(background) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const bounds = await page.locator('#fallbackEventName').evaluate(el => {
          const title = el.getBoundingClientRect();
          const cover = document.querySelector('.cover').getBoundingClientRect();
          const logo = document.querySelector('.cover-brand').getBoundingClientRect();
          return { contained: title.left >= cover.left && title.right <= cover.right && title.top >= cover.top && title.bottom <= cover.bottom, logoHeight: logo.height };
        });
        expect(bounds.contained).toBe(true);
        expect(bounds.logoHeight).toBeLessThanOrEqual(90);
        await page.locator('.cover').screenshot({ path: path.join(out, `${route}-no-cover-${theme}-${width}.png`) });
      }
    }
  });
}

test('integrated current home loads its local assets and shares theme with both event routes', async ({ page }) => {
  const failures = [];
  const errors = [];
  page.on('response', response => {
    if (['script', 'stylesheet', 'image'].includes(response.request().resourceType()) && response.status() >= 400) failures.push(response.status() + ' ' + new URL(response.url()).pathname);
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.catalog-card').first()).toBeVisible();
  for (const resource of ['/assets/home-event-rail.js', '/assets/public-share.js', '/assets/public-share.css']) {
    const response = await page.request.get(resource);
    expect(response.status()).toBe(200);
  }
  for (const route of ['evento', 'evento-v2']) {
    await page.goto('/');
    await page.locator('#home-theme').selectOption('light');
    await page.goto('/' + route + '/?evento=PREVIEW-EVENT');
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'light');
    await page.locator('#home-theme').selectOption('dark');
    await page.goto('/');
    await expect(page.locator('#home-theme')).toHaveValue('dark');
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
