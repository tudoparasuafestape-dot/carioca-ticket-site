const { test, expect } = require('@playwright/test');

const EXPECTED_HOST = process.env.CT_EXPECTED_HOST || 'cariocaticket.com.br';
const FORBIDDEN_HOSTS = ['script.google.com', 'googleusercontent.com', 'github.io'];

async function assertOfficial(page) {
  const host = new URL(page.url()).hostname;
  expect(host).toBe(EXPECTED_HOST);
  for (const forbidden of FORBIDDEN_HOSTS) {
    expect(page.url()).not.toContain(forbidden);
  }
}

async function assertNoForbiddenVisibleLinks(page) {
  const hrefs = await page.locator('a[href]').evaluateAll(els => els.map(el => el.href));
  const bad = hrefs.filter(href => FORBIDDEN_HOSTS.some(host => href.includes(host)));
  expect(bad, `Links visiveis apontando para hosts tecnicos: ${bad.join(', ')}`).toEqual([]);
}

test.describe('Entradas operacionais sem sessao', () => {
  for (const route of ['/central/', '/produtor/', '/checkin/', '/consulta/', '/vendas/', '/bar/', '/eventos-v2/', '/fornecedores/', '/crm/', '/financeiro/', '/relatorios/', '/comissionado/']) {
    test(`${route} permanece no dominio oficial e nao quebra sem sessao`, async ({ page }) => {
      const errors = [];
      page.on('response', response => {
        if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
      });

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await assertOfficial(page);
      await expect(page.locator('body')).toContainText(/Carioca Ticket/i);
      await expect(page.locator('body')).not.toContainText('\\n');
      await assertNoForbiddenVisibleLinks(page);
      expect(errors, `Respostas 5xx em ${route}: ${errors.join(', ')}`).toEqual([]);
    });
  }
});
