const { test, expect } = require('@playwright/test');
const { fixture, events } = require('./rail-fixture.cjs');
test.use({ offline: true, serviceWorkers: 'block' });
const data = ['Beleza & Negócios', 'Samba e Pagode', 'Música · fixture'].map((categoria, index) => ({
  ...events[index % events.length], id: 'CATEGORY-FIXTURE-' + index,
  nome: 'Nome do produtor ' + index,
  visual: { ...events[index % events.length].visual, categoria, descricaoCurta: 'Descrição original do produtor.' }
}));
const labels = {
  'pt-BR': ['Beleza & Negócios', 'Samba e Pagode'],
  'en-US': ['Beauty & Business', 'Samba & Pagode'],
  es: ['Belleza y negocios', 'Samba y Pagode'],
  'zh-Hans': ['美容与商业', 'Samba 与 Pagode']
};
for (const width of [320, 1440]) for (const theme of ['light', 'dark']) {
  test(`categories and native flag choices / ${width} / ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => { localStorage.setItem('ct-home-theme', theme); localStorage.setItem('ct-home-font', '150'); }, theme);
    const state = await fixture(page, { result: { sucesso: true, eventos: data } });
    await expect(page.locator('.catalog-card')).toHaveCount(3);
    for (const [locale, translated] of Object.entries(labels)) {
      await page.locator('#accessibility-toggle').click();
      const radio = page.locator('input[name="home-language-choice"][value="' + locale + '"]');
      await radio.check();
      await expect(radio).toBeChecked();
      await expect(page.locator('#home-language')).toHaveValue(locale);
      await expect(page.locator('.language-flag')).toHaveCount(4);
      await expect(page.locator('#home-language')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.getByRole('radio')).toHaveCount(4);
      await expect(page.locator('.language-flag').first()).toHaveAttribute('aria-hidden', 'true');
      await page.screenshot({ path: testInfo.outputPath(`language-flags-${width}-${theme}-${locale}.png`) });
      await radio.press('Escape');
      await expect(page.locator('#home-accessibility')).toBeHidden();
      await expect(page.locator('#accessibility-toggle')).toBeFocused();
      await expect(page.locator('.event-kicker')).toHaveText([...translated, 'Música · fixture']);
      await expect(page.locator('.event-kicker').first()).toHaveAttribute('lang', locale);
      await expect(page.locator('.event-kicker').last()).toHaveAttribute('lang', 'pt-BR');
      await expect(page.locator('.catalog-description')).toHaveText(Array(3).fill('Descrição original do produtor.'));
      await expect(page.locator('.catalog-title a')).toHaveText(data.map(event => event.nome));
      await page.locator('#category-choices').getByRole('button', { name: translated[0], exact: true }).click();
      await expect(page.locator('.catalog-card')).toHaveCount(1);
      await expect(page.locator('.catalog-card')).toHaveAttribute('data-event-id', data[0].id);
      expect(await page.evaluate(() => CTHome.filters.category)).toBe('Beleza & Negócios');
      await expect(page.locator('#active-filters')).toHaveText(translated[0]);
      await expect(page.locator('#active-filters span')).toHaveAttribute('lang', locale);
      await page.evaluate(() => CTHome.setLocale('en-US'));
      await expect(page.locator('#active-filters')).toHaveText('Beauty & Business');
      expect(await page.evaluate(() => CTHome.filters.category)).toBe('Beleza & Negócios');
      await expect(page.locator('.catalog-card')).toHaveCount(1);
      await page.evaluate(() => CTHome.resetFilters());
      await expect(page.locator('.catalog-card')).toHaveCount(3);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      expect(fits).toBe(true);
    }
    await page.locator('#event-search-input').fill('Beauty & Business');
    await page.locator('#event-search-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('.catalog-card')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.locator('input[value="en-US"]')).toBeChecked();
    await expect(page.locator('.catalog-card')).toHaveCount(3);
    expect(state.methods).toHaveLength(2);
    expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  });
}
test('native flag choices keyboard, dismissal, repeated selection and original category aliases', async ({ page }) => {
  const state = await fixture(page, { result: { sucesso: true, eventos: data } });
  await expect(page.locator('.catalog-card')).toHaveCount(3);
  await page.locator('#accessibility-toggle').click();
  await page.locator('input[value="pt-BR"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[value="en-US"]')).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[value="es"]')).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await expect(page.locator('input[value="en-US"]')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('#accessibility-toggle')).toBeFocused();
  await page.locator('#accessibility-toggle').click();
  await page.locator('h1').click();
  await expect(page.locator('#home-accessibility')).toBeHidden();
  await page.locator('#accessibility-toggle').click();
  await page.locator('.menu-toggle').click();
  await expect(page.locator('#home-accessibility')).toBeHidden();
  expect(await page.evaluate(() => ['Beleza e Negócios', 'Samba & pagode', 'Samba', 'Pagode', 'Beleza personalizada'].map(value => CTHome.categoryLabel(value).text))).toEqual(['Beauty & Business', 'Samba & Pagode', 'Samba', 'Pagode', 'Beleza personalizada']);
  expect(await page.evaluate(() => CTHome.categoryLabel('Beleza').text)).toBe('Beauty');
  expect(await page.evaluate(() => {
    const values = ['Beleza & Negócios', 'Beleza e Negócios'];
    return values.map(selected => {
      CTHome.filters.category = selected;
      return values.map(categoria => CTHome.matches({ visual: { categoria } }, true));
    });
  })).toEqual([[true, false], [false, true]]);
  expect(state.methods).toHaveLength(1);
  expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
});
