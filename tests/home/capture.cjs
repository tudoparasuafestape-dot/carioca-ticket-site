const fs = require('node:fs');
const path = require('node:path');

async function settlePaint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function capture(page, filename, fullPage = false) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  await settlePaint(page);
  if (fullPage) {
    // Visit the rendered document at the original viewport size. This also loads
    // lazy images without changing the layout or editing screenshot pixels.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += page.viewportSize().height * 0.8) {
      await page.evaluate(top => window.scrollTo(0, top), y);
      await settlePaint(page);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await settlePaint(page);
  }
  return page.screenshot({ path: filename, fullPage, animations: 'disabled' });
}

module.exports = { capture, settlePaint };
