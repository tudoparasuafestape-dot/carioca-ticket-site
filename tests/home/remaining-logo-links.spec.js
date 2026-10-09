const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:4174';
const pages = ['produtor-v2', 'ajuda', 'sobre', 'termos', 'privacidade', 'cancelamento-reembolso'];
for (const name of pages) for (const width of [320, 390, 1440]) {
  test(`${name}: remaining logo navigation at ${width}px and 150% text`, async ({ page }, testInfo) => {
    // Exact markup/CSS, with scripts removed: no authentication, RPC or external navigation.
    const html = fs.readFileSync(path.join(ROOT, name, 'index.html'), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>/gi, '');
    const blocked = [];
    await page.context().route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === ORIGIN && route.request().method() === 'GET') {
        if (url.pathname === `/${name}/`) return route.fulfill({ contentType: 'text/html', body: html });
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<title>Home fixture</title><h1>Home fixture</h1>' });
        if (['/styles.css', '/assets/public-logo-links.css', '/assets/institutional-language.css', '/assets/carioca-ticket-logo.png', '/assets/carioca-ticket-icon-192.png', '/assets/carioca-ticket-simbolo.png'].includes(url.pathname)) {
          return route.fulfill({ body: fs.readFileSync(path.join(ROOT, url.pathname)), contentType: url.pathname.endsWith('.css') ? 'text/css' : 'image/png' });
        }
      }
      blocked.push(route.request().method() + ' ' + url.origin + url.pathname);
      return route.abort('blockedbyclient');
    });
    await page.setViewportSize({ width, height: 1000 });
    for (const view of name === 'produtor-v2' ? ['unloaded', 'loaded'] : ['footer']) {
      await page.goto(ORIGIN + `/${name}/`);
      if (name === 'produtor-v2') {
        await expect(page.locator('#portalView')).toBeHidden();
        await expect(page.locator('#brandLogoDesktop')).not.toHaveAttribute('src', /.+/);
        if (view === 'loaded') {
          // Existing production loader expects a DESKTOP data URI from RPC.
          // Use exact repository image bytes as a synthetic response, never call that RPC.
          const dataUri = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets/carioca-ticket-logo.png')).toString('base64');
          await page.evaluate(uri => {
            const img = document.getElementById('brandLogoDesktop');
            img.src = uri; img.classList.remove('hidden');
          }, dataUri);
        }
      }
      await page.evaluate(() => {
        sessionStorage.setItem('remaining-logo-sentinel', 'unchanged');
        for (const el of document.querySelectorAll('body *')) {
          if (!el.children.length && el.textContent.trim()) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * 1.5) + 'px';
        }
      });
      const logo = page.locator(name === 'produtor-v2' ? '#brandLogoBox' : '.footer-home-logo');
      await expect(logo).toHaveAttribute('href', '/');
      await expect(logo).toHaveAccessibleName('Carioca Ticket — página inicial');
      if (view !== 'unloaded') {
        await expect(logo.locator('img')).toBeVisible();
        await expect.poll(() => logo.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      } else await expect(logo.locator('img')).toBeHidden();
      await logo.scrollIntoViewIfNeeded();
      if (name === 'produtor-v2') {
        for (let step = 0; step < 20; step++) {
          await page.keyboard.press('Tab');
          if (await logo.evaluate(el => el === document.activeElement)) break;
        }
      } else await logo.focus();
      await expect(logo).toBeFocused(); await expect(logo).toHaveCSS('outline-style', 'solid');
      const box = await logo.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${view}-${width}-text150.png`) });
      if (width === 390) await logo.click(); else await logo.press('Enter');
      await expect(page).toHaveURL(ORIGIN + '/');
      expect(await page.evaluate(() => sessionStorage.getItem('remaining-logo-sentinel'))).toBe('unchanged');
      await page.goBack(); await expect(page).toHaveURL(ORIGIN + `/${name}/`);
    }
    expect(blocked).toEqual([]);
  });
}
