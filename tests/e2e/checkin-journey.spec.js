const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const EVENT_ID = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const CRED = 'CREDENCIAL_CHECKIN_E2E_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';

async function stubQrLibrary(page) {
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    body: 'window.Html5Qrcode=class{static async getCameras(){return []} async start(){} async stop(){} clear(){}};'
  }));
}

test.describe('Check-in first-party e credencial operacional', () => {
  test.skip(!BRANCH_MODE, 'Executa na branch local sem tocar ingressos reais.');

  test('Central entrega contexto que o Check-in oficial consome sem iframe tecnico', async ({ page }) => {
    await stubQrLibrary(page);

    await page.goto(
      '/checkin/?evento=' + encodeURIComponent(EVENT_ID) + '#ct_checkin=' + encodeURIComponent(CRED),
      { waitUntil: 'domcontentloaded' }
    );

    await expect(page.getByRole('heading', { name: 'Check-in Carioca' })).toBeVisible();
    await expect(page.locator('#backCentral')).toHaveAttribute('href', '/central/');
    await expect(page.locator('#btnIniciar')).toBeEnabled();
    await expect(page.locator('#btnValidar')).toBeEnabled();
    await expect(page.locator('iframe')).toHaveCount(0);

    const state = await page.evaluate(() => ({
      credencial: sessionStorage.getItem('ct_checkin_operacional_credencial_v1'),
      hash: location.hash,
      body: document.documentElement.innerHTML
    }));

    expect(state.credencial).toBe(CRED);
    expect(state.hash).toBe('');
    expect(state.body).not.toContain('github.io');
    expect(new URL(page.url()).pathname).toBe('/checkin/');
  });

  test('acesso direto ao Check-in sem credencial fica bloqueado', async ({ page }) => {
    await stubQrLibrary(page);

    await page.goto('/checkin/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#telaResultadoTitulo')).toHaveText('Acesso restrito');
    await expect(page.locator('#telaResultadoMensagem')).toContainText(/Central Mobile/i);
    await expect(page.locator('#btnIniciar')).toBeDisabled();
    await expect(page.locator('#btnValidar')).toBeDisabled();
    await expect(page.locator('iframe')).toHaveCount(0);
  });
});
