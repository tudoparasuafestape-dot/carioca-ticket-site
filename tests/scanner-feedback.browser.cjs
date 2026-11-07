// Actual check-in HTML/CSS, synthetic camera and deferred API. No production requests.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = 'https://scanner.test';
const eventName = 'Evento sintético · Noite de samba';
const token = 'SYNTHETIC_TEST_CREDENTIAL_0000000000000000';
const A = 'CT-20261107-900001';
const B = 'CT-20261107-900002';
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 667 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
  { width: 1366, height: 768 }
];

(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    args: ['--disable-background-networking', '--disable-quic',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']
  });
  const report = [];
  const unexpected = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport, isMobile: viewport.width < 900, hasTouch: viewport.width < 900,
        serviceWorkers: 'block', offline: true
      });
      const errors = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        const files = {
          '/checkin/': ['checkin/index.html', 'text/html'],
          '/checkin/checkin.js': ['checkin/checkin.js', 'text/javascript'],
          '/checkin/checkin.css': ['checkin/checkin.css', 'text/css'],
          '/assets/carioca-ticket-logo.png': ['assets/carioca-ticket-logo.png', 'image/png'],
          '/assets/carioca-ticket-icon-192.png': ['assets/carioca-ticket-icon-192.png', 'image/png']
        };
        if (url.origin === root && files[url.pathname]) {
          const [file, contentType] = files[url.pathname];
          return route.fulfill({ body: fs.readFileSync(file), contentType });
        }
        if ((url.origin === root && url.pathname === '/pwa-register.js') ||
            url.href === 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js') {
          return route.fulfill({ body: '', contentType: 'text/javascript' });
        }
        if (url.origin === root && url.pathname === '/manifest-checkin.webmanifest') {
          return route.fulfill({ body: '{}', contentType: 'application/manifest+json' });
        }
        unexpected.push(url.origin + url.pathname);
        return route.abort();
      });
      await context.addInitScript(() => {
        window.Html5Qrcode = class {
          static async getCameras() { return [{ id: 'synthetic', label: 'Traseira sintética' }]; }
          async start() { document.getElementById('reader').innerHTML = '<video aria-label="Câmera sintética"></video>'; }
          pause() { window.syntheticPaused = true; }
          resume() { window.syntheticPaused = false; }
          async stop() {}
          clear() {}
        };
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(root + '/checkin/?evento=EVT-SYNTHETIC&eventoNome=' +
        encodeURIComponent(eventName) + '#ct_checkin=' + token);
      await page.evaluate(() => {
        window.calls = [];
        window.pending = [];
        vibrar = () => {};
        tocarSom = () => {};
        chamarApiJsonp = (_url, params) => new Promise((resolve, reject) => {
          window.calls.push(params);
          window.pending.push({ resolve, reject });
        });
      });
      await page.locator('#btnIniciar').click();
      await page.waitForFunction(() => cameraAtiva);
      await page.locator('#codigoManual').fill(A);
      await page.locator('#btnValidar').click(); // Deliberately scrolls to manual input first.

      const waitVisible = async () => {
        await page.locator('#telaValidacao.ativa').waitFor();
        const geometry = await page.evaluate(() => {
          const screen = document.getElementById('telaValidacao');
          const box = screen.getBoundingClientRect();
          const content = screen.firstElementChild.getBoundingClientRect();
          const status = screen.querySelector('[role="status"]');
          const logo = screen.querySelector('img');
          return { x: box.x, y: box.y, width: box.width, height: box.height,
            contentTop: content.top, contentBottom: content.bottom,
            scrollHeight: screen.scrollHeight, clientHeight: screen.clientHeight,
            inert: document.querySelector('.app').inert,
            live: status.getAttribute('aria-live'), atomic: status.getAttribute('aria-atomic'),
            logo: logo.complete && logo.naturalWidth === 600,
            title: document.getElementById('validacaoTitulo').textContent,
            event: document.getElementById('validacaoEvento').textContent };
        });
        assert.equal(geometry.x, 0);
        assert.equal(geometry.y, 0);
        assert.equal(geometry.width, viewport.width);
        assert.equal(geometry.height, viewport.height);
        assert(geometry.contentTop >= 0 && geometry.contentBottom <= viewport.height,
          'Waiting content requires scroll: ' + JSON.stringify({ viewport, geometry }));
        assert.equal(geometry.scrollHeight, geometry.clientHeight);
        assert.equal(geometry.inert, true);
        assert.equal(geometry.live, 'polite');
        assert.equal(geometry.atomic, 'true');
        assert.equal(geometry.logo, true);
        assert.equal(geometry.title, 'Aguardando validação');
        assert.equal(geometry.event, eventName);
        return geometry;
      };
      const geometry = await waitVisible();
      await page.evaluate(code => {
        window.feedbackMutations = 0;
        new MutationObserver(records => { window.feedbackMutations += records.length; })
          .observe(document.querySelector('#telaValidacao [role="status"]'),
            { subtree: true, childList: true, characterData: true });
        for (let i = 0; i < 40; i++) { aoLerQrCode(code); validarCodigoManual(); }
        fecharTelaResultado();
      }, A);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => calls.length), 1);
      assert.equal(await page.evaluate(() => feedbackMutations), 0);
      await page.screenshot({ path: `test-results/scanner-waiting-${viewport.width}x${viewport.height}.png` });

      // A valid preview exposes the existing confirmation. The wait must not cover Cancel.
      await page.evaluate(code => pending.shift().resolve({ sucesso: true,
        podeConfirmarEntrada: true, codigo: code, nome: 'Participante sintético',
        tipoIngresso: 'Individual' }), A);
      await page.locator('#ctConfirmacaoEntrada.ativa').waitFor();
      assert(!await page.locator('#telaValidacao').isVisible());
      await page.locator('#ctConfirmacaoCancelar').click();
      await page.waitForFunction(() => document.getElementById('telaResultadoTitulo').textContent === 'ENTRADA NÃO REGISTRADA');
      await page.locator('#botaoFecharResultado').click();
      assert.equal(await page.evaluate(() => syntheticPaused), false);

      // Explicit confirmation, slow commit, success and a fresh already-used response.
      await page.evaluate(code => aoLerQrCode(code), B);
      await waitVisible();
      await page.evaluate(code => pending.shift().resolve({ sucesso: true,
        podeConfirmarEntrada: true, codigo: code }), B);
      await page.locator('#ctConfirmacaoConfirmar').click();
      await waitVisible();
      assert.equal(await page.evaluate(() => calls.filter(c => !c.codigo.startsWith(CONFIG.PREFIXO_VALIDACAO_SEM_ENTRADA)).length), 1);
      await page.evaluate(code => pending.shift().resolve({ sucesso: true, tipo: 'sucesso',
        titulo: 'ENTRADA LIBERADA', codigo: code }), B);
      await page.waitForFunction(() => document.getElementById('telaResultadoTitulo').textContent === 'ENTRADA LIBERADA');
      assert(!await page.locator('#telaValidacao').isVisible());
      await page.locator('#botaoFecharResultado').click();
      await page.locator('#codigoManual').fill(B);
      await page.locator('#btnValidar').click();
      await waitVisible();
      await page.evaluate(code => pending.shift().resolve({ sucesso: false, tipo: 'aviso',
        titulo: 'JÁ UTILIZADO', codigo: code }), B);
      await page.waitForFunction(() => document.getElementById('telaResultadoTitulo').textContent === 'JÁ UTILIZADO');
      assert(!await page.locator('#telaValidacao').isVisible());
      await page.waitForFunction(() => {
        const screen = document.getElementById('telaResultadoProfissional');
        return screen.classList.contains('ativa') && getComputedStyle(screen).opacity === '1';
      });
      await page.screenshot({ path: `test-results/scanner-waiting-used-${viewport.width}x${viewport.height}.png` });
      await page.locator('#botaoFecharResultado').click();

      // Error replaces the waiting screen; close rearms the reader and restores interaction.
      await page.evaluate(code => aoLerQrCode(code), A);
      await waitVisible();
      await page.evaluate(() => pending.shift().reject(new Error('Tempo esgotado na conexão.')));
      await page.waitForFunction(() => document.getElementById('telaResultadoTitulo').textContent === 'Falha na comunicação');
      assert(!await page.locator('#telaValidacao').isVisible());
      assert.equal(await page.evaluate(() => document.querySelector('.app').inert), false);
      await page.locator('#botaoFecharResultado').click();
      assert.equal(await page.evaluate(() => syntheticPaused), false);
      await page.locator('#btnParar').click();

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('#codigoManual').fill(A);
      await page.locator('#btnValidar').click();
      await waitVisible();
      assert.equal(await page.locator('.tela-validacao-indicador').evaluate(e => getComputedStyle(e).animationName), 'none');
      assert.deepEqual(errors, []);
      report.push({ viewport, geometry, slow: 'passed', cancel: 'passed',
        success: 'passed', used: 'passed', error: 'passed', next: 'passed',
        repeatedAnnouncements: 0, reducedMotion: 'passed' });
      await context.close();
    }
    assert.deepEqual(unexpected, []);
    fs.writeFileSync('test-results/scanner-feedback-browser.json', JSON.stringify({
      syntheticOnly: true, realRequests: 0, report
    }, null, 2));
    console.log(JSON.stringify({ syntheticOnly: true, realRequests: 0, report }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
