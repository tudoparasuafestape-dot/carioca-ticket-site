const { test, expect } = require('@playwright/test');
const { fixture } = require('./rail-fixture.cjs');
test.use({ offline: true, serviceWorkers: 'block' });
const key = 'ct-home-install-choice-v1';
async function eligible(page, outcome = 'dismissed') {
  await page.evaluate(outcome => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.installCalls = 0;
    event.prompt = () => { window.installCalls++; return Promise.resolve(); };
    event.userChoice = new Promise((resolve, reject) => { window.finishInstall = () => outcome === 'error' ? reject(new Error('fixture failure')) : resolve({ outcome }); });
    window.dispatchEvent(event);
    window.installPrevented = event.defaultPrevented;
  }, outcome);
}
function assertSafe(state) { expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]); }

test('unsupported browser stays quiet; Instagram uses only the confirmed official destination', async ({ page }) => {
  const state = await fixture(page);
  await expect(page.locator('#home-install')).toBeHidden();
  const instagram = page.getByRole('link', { name: 'Instagram @cariocaticketbr' });
  await expect(instagram).toHaveAttribute('href', 'https://instagram.com/cariocaticketbr');
  await expect(instagram).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(instagram.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.footer-social-link')).toHaveCount(2);
  const facebook = page.getByRole('link', { name: 'Facebook', exact: true });
  await expect(facebook).toHaveAttribute('href', 'https://www.facebook.com/people/Carioca-Ticket/61594788204677/');
  await expect(facebook).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.footer-network-name')).toHaveText(['Instagram', 'Facebook']);
  await expect(facebook.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  assertSafe(state);
});
for (const width of [320, 1440]) for (const theme of ['light', 'dark']) {
  test(`eligible invitation, dismissal and layout / ${width} / ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(theme => { localStorage.setItem('ct-home-theme', theme); localStorage.setItem('ct-home-font', '150'); }, theme);
    const state = await fixture(page);
    await page.locator('.brand').focus();
    await eligible(page);
    await expect(page.locator('#home-install')).toBeVisible();
    await expect(page.locator('.brand')).toBeFocused();
    await expect(page.locator('#home-install-action')).toHaveText('Instalar');
    expect(await page.evaluate(() => [window.installCalls, window.installPrevented])).toEqual([0, true]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const position = await page.locator('#home-install').evaluate(el => getComputedStyle(el).position);
    expect(['fixed', 'absolute']).not.toContain(position);
    await page.locator('#home-install').screenshot({ path: testInfo.outputPath(`install-social-${width}-${theme}.png`) });
    await page.locator('.footer-contact').screenshot({ path: testInfo.outputPath(`install-social-footer-${width}-${theme}.png`) });
    await page.locator('#home-install-dismiss').click();
    await expect(page.locator('#home-install')).toBeHidden();
    await expect(page.locator('#conteudo')).toBeFocused();
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('dismissed');
    await eligible(page);
    await expect(page.locator('#home-install')).toBeHidden();
    await page.reload(); await eligible(page);
    await expect(page.locator('#home-install')).toBeHidden();
    assertSafe(state);
  });
}
for (const outcome of ['accepted', 'dismissed', 'error']) {
  test(`native prompt only from click and settles safely: ${outcome}`, async ({ page }) => {
    const state = await fixture(page); await eligible(page, outcome);
    await page.locator('#home-install-action').click();
    await expect(page.locator('#home-install-action')).toBeDisabled();
    await page.locator('#home-install-action').evaluate(button => button.click());
    expect(await page.evaluate(() => window.installCalls)).toBe(1);
    await page.evaluate(() => window.finishInstall());
    await expect(page.locator('#home-install')).toBeHidden();
    await eligible(page); await expect(page.locator('#home-install')).toBeHidden();
    if (outcome !== 'error') {
      await page.reload(); await eligible(page); await expect(page.locator('#home-install')).toBeHidden();
      expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(outcome);
    }
    assertSafe(state);
  });
}
test('Escape dismisses accessibly and appinstalled persists without new offers', async ({ page }) => {
  const state = await fixture(page); await eligible(page);
  await page.locator('#home-install-action').focus(); await page.keyboard.press('Escape');
  await expect(page.locator('#home-install')).toBeHidden(); await expect(page.locator('#conteudo')).toBeFocused();
  await page.evaluate(key => { localStorage.removeItem(key); sessionStorage.removeItem(key); }, key);
  await page.reload(); await eligible(page);
  await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#home-install')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('installed');
  await page.reload(); await eligible(page); await expect(page.locator('#home-install')).toBeHidden();
  assertSafe(state);
});
for (const mode of ['ios-standalone', 'display-standalone']) {
  test(`installed context never shows invitation: ${mode}`, async ({ page }) => {
    await page.addInitScript(mode => {
      if (mode === 'ios-standalone') Object.defineProperty(navigator, 'standalone', { value: true });
      else { const match = window.matchMedia.bind(window); window.matchMedia = query => query === '(display-mode: standalone)' ? { matches:true, addEventListener() {} } : match(query); }
    }, mode);
    const state = await fixture(page); await eligible(page);
    await expect(page.locator('#home-install')).toBeHidden(); assertSafe(state);
  });
}
test('Safari iPhone offers honest instructions, never a fake native install', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' }));
  const state = await fixture(page);
  await expect(page.locator('#home-install')).toBeVisible();
  await expect(page.locator('#home-install-action')).toHaveText('Como instalar');
  await page.locator('#home-install-action').click();
  await expect(page.locator('#home-install-help')).toContainText('Compartilhar');
  await expect(page.locator('#home-install-help')).toContainText('Adicionar à Tela de Início');
  await expect(page.locator('#home-install-action')).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('#home-install').screenshot({ path:testInfo.outputPath('install-social-ios-instructions.png') });
  await page.locator('#home-install-action').click(); await expect(page.locator('#home-install-help')).toBeHidden();
  await page.locator('#home-install-dismiss').click(); await page.reload();
  await expect(page.locator('#home-install')).toBeHidden(); assertSafe(state);
});
test('storage restrictions do not break the page or repeat invitation in the current page', async ({ page }) => {
  await page.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get() { throw new Error('Blocked storage fixture'); } });
  });
  const state = await fixture(page); await eligible(page);
  await page.locator('#home-install-dismiss').click(); await eligible(page);
  await expect(page.locator('#home-install')).toBeHidden(); assertSafe(state);
});
test('cross-tab choice hides the visible invitation', async ({ page }) => {
  const state = await fixture(page); await eligible(page);
  await page.evaluate(key => dispatchEvent(new StorageEvent('storage', { key, newValue:'dismissed' })), key);
  await expect(page.locator('#home-install')).toBeHidden(); assertSafe(state);
});
test('iPad desktop user agent receives manual installation instructions', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
    Object.defineProperty(navigator, 'platform', { value:'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { value:5 });
  });
  const state = await fixture(page);
  await expect(page.locator('#home-install-action')).toHaveText('Como instalar');
  await expect(page.locator('#home-install')).toBeVisible(); assertSafe(state);
});
for (const browser of ['CriOS', 'FxiOS']) {
  test(`iOS ${browser} does not receive Safari-specific instructions`, async ({ page }) => {
    await page.addInitScript(browser => Object.defineProperty(navigator, 'userAgent', { value:`Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ${browser}/130.0 Mobile/15E148 Safari/604.1` }), browser);
    const state = await fixture(page);
    await expect(page.locator('#home-install')).toBeHidden(); assertSafe(state);
  });
}
test('switching to standalone hides an already visible invitation', async ({ page }) => {
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    const display = { matches:false, addEventListener(_name, listener) { this.listener = listener; } };
    window.matchMedia = query => query === '(display-mode: standalone)' ? display : match(query);
    window.enterStandalone = () => { display.matches = true; display.listener(); };
  });
  const state = await fixture(page); await eligible(page);
  await expect(page.locator('#home-install')).toBeVisible();
  await page.evaluate(() => window.enterStandalone());
  await expect(page.locator('#home-install')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('installed'); assertSafe(state);
});
test('visible install invitation follows all home languages while social brand names stay unchanged', async ({ page }) => {
  await page.setViewportSize({ width:320, height:1000 });
  await page.addInitScript(() => localStorage.setItem('ct-home-font', '150'));
  const state = await fixture(page); await eligible(page);
  for (const [locale, install, dismiss] of [['pt-BR','Instalar','Agora não'], ['en-US','Install','Not now'], ['es','Instalar aplicación','Ahora no'], ['zh-Hans','安装','暂时不要']]) {
    await page.evaluate(locale => CTHome.setLocale(locale), locale);
    await expect(page.locator('#home-install-action')).toHaveText(install);
    await expect(page.locator('#home-install-dismiss')).toHaveText(dismiss);
    await expect(page.locator('#home-install-title')).toHaveAttribute('lang', locale);
    await expect(page.locator('.footer-network-name')).toHaveText(['Instagram','Facebook']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  assertSafe(state);
});
