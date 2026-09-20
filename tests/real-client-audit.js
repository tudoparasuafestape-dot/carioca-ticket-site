const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://cariocaticket.com.br';
const EMAIL = process.env.CT_CLIENT_EMAIL || '';
const phase = process.argv[2] || '';

function safePath(url) {
  try { return new URL(url).pathname; } catch { return ''; }
}

async function assertOfficial(page, expectedPath) {
  const u = new URL(page.url());
  if (u.hostname !== 'cariocaticket.com.br') {
    throw new Error('HOST_FORA_DO_DOMINIO_OFICIAL:' + u.hostname);
  }
  if (expectedPath && u.pathname !== expectedPath) {
    throw new Error('ROTA_INESPERADA:' + u.pathname);
  }
}

async function noForbiddenVisibleLinks(page) {
  const bad = await page.locator('a[href]').evaluateAll(els =>
    els.map(el => el.href).filter(h => /script\.google\.com|googleusercontent\.com|github\.io/i.test(h))
  );
  if (bad.length) throw new Error('LINK_TECNICO_VISIVEL');
}

async function phase1() {
  if (!EMAIL) throw new Error('CT_CLIENT_EMAIL ausente');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e.message || e)));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await assertOfficial(page, '/');
  await noForbiddenVisibleLinks(page);

  const minha = page.getByRole('link', { name: /Minha Carioca/i }).first();
  await minha.click();
  await page.waitForLoadState('domcontentloaded');
  await assertOfficial(page, '/minha-carioca/conta/');

  const input = page.getByPlaceholder(/Seu e-mail ou WhatsApp cadastrado/i);
  await input.fill(EMAIL);
  await page.getByRole('button', { name: /Continuar/i }).click();

  await page.getByRole('heading', { name: /Digite o código/i }).waitFor({ state: 'visible', timeout: 30000 });
  const requestId = await page.evaluate(() => sessionStorage.getItem('ct_mc_req_v6') || '');
  if (!/^MCOTP-[A-Za-z0-9]+$/.test(requestId)) throw new Error('REQUEST_ID_OTP_AUSENTE');

  fs.writeFileSync('/tmp/ct-client-request-id.txt', requestId, { mode: 0o600 });
  fs.writeFileSync('/tmp/ct-client-phase1.json', JSON.stringify({
    sucesso: true,
    rotaInicial: '/',
    rotaLogin: '/minha-carioca/conta/',
    otpSolicitado: true,
    requestIdPresente: true,
    errosJavascript: pageErrors.length
  }, null, 2));

  await browser.close();
}

async function phase2() {
  const requestId = fs.readFileSync('/tmp/ct-client-request-id.txt', 'utf8').trim();
  const otp = fs.readFileSync('/tmp/ct-client-otp.txt', 'utf8').trim();
  if (!/^\d{6}$/.test(otp)) throw new Error('OTP_INVALIDO_LOCAL');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  const serverErrors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('response', r => { if (r.status() >= 500) serverErrors.push(r.status() + ' ' + safePath(r.url())); });

  await page.goto(BASE + '/minha-carioca/conta/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(req => sessionStorage.setItem('ct_mc_req_v6', req), requestId);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('heading', { name: /Digite o código/i }).waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input.code').fill(otp);
  await page.getByRole('button', { name: /Confirmar código/i }).click();

  await page.getByText(/Meus ingressos/i).first().waitFor({ state: 'visible', timeout: 30000 });
  await assertOfficial(page, '/minha-carioca/conta/');
  await noForbiddenVisibleLinks(page);

  const grupos = await page.locator('article.item').count();
  const botoesAbrir = await page.locator('a.open').count();
  const eventos = await page.locator('article.item h3').allTextContents();

  const grupoAudits = [];
  const ticketAudits = [];

  for (let g = 0; g < botoesAbrir; g++) {
    await page.goto(BASE + '/minha-carioca/conta/', { waitUntil: 'domcontentloaded' });
    await page.getByText(/Meus ingressos/i).first().waitFor({ state: 'visible', timeout: 30000 });

    const href = await page.locator('a.open').nth(g).getAttribute('href');
    if (!href || !href.startsWith('/minha-carioca/ingressos/')) throw new Error('LINK_COMPRA_FORA_FIRST_PARTY');

    await page.goto(BASE + href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Seus ingressos/i }).waitFor({ state: 'visible', timeout: 30000 });
    await assertOfficial(page, '/minha-carioca/ingressos/');
    await noForbiddenVisibleLinks(page);

    const tickets = await page.locator('a.ticket').count();
    grupoAudits.push({ grupo: g + 1, rota: '/minha-carioca/ingressos/', ingressos: tickets });

    const ticketHrefs = await page.locator('a.ticket').evaluateAll(els => els.map(a => a.getAttribute('href') || ''));
    for (let t = 0; t < ticketHrefs.length; t++) {
      const thref = ticketHrefs[t];
      if (!thref.startsWith('/ingresso/')) throw new Error('LINK_INGRESSO_FORA_FIRST_PARTY');
      const tp = await context.newPage();
      await tp.goto(BASE + thref, { waitUntil: 'domcontentloaded' });
      await tp.locator('#ticket-view.show').waitFor({ state: 'visible', timeout: 30000 });
      await assertOfficial(tp, '/ingresso/');
      await noForbiddenVisibleLinks(tp);

      const qrPresent = await tp.locator('img.qr').count() > 0;
      const statusPresent = await tp.locator('.status').count() > 0;
      const participantPresent = (await tp.locator('.info').innerText()).includes('Participante');
      const backMinha = await tp.getByRole('link', { name: /Voltar para Minha Carioca/i }).count() > 0;
      const share = await tp.getByRole('button', { name: /Compartilhar ingresso/i }).count() > 0;
      const pdf = await tp.getByRole('button', { name: /Salvar em PDF/i }).count() > 0;

      ticketAudits.push({
        grupo: g + 1,
        ingresso: t + 1,
        rota: '/ingresso/',
        qrPresente: qrPresent,
        statusPresente: statusPresent,
        participantePresente: participantPresent,
        voltarMinhaCarioca: backMinha,
        compartilharDisponivel: share,
        pdfDisponivel: pdf
      });
      await tp.close();
    }
  }

  await page.goto(BASE + '/minha-carioca/conta/', { waitUntil: 'domcontentloaded' });
  await page.getByText(/Meus ingressos/i).first().waitFor({ state: 'visible', timeout: 30000 });
  const logout = page.getByRole('button', { name: /^Sair$/i });
  await logout.click();
  await page.getByRole('heading', { name: /Minha Carioca/i }).waitFor({ state: 'visible', timeout: 10000 });
  const loginInputVisible = await page.getByPlaceholder(/Seu e-mail ou WhatsApp cadastrado/i).isVisible();

  const result = {
    sucesso: true,
    contaReal: true,
    dominioOficial: true,
    gruposCompra: grupos,
    botoesAbrirCompras: botoesAbrir,
    eventos: eventos.map(x => String(x).trim()).filter(Boolean),
    grupos: grupoAudits,
    ingressosAuditados: ticketAudits.length,
    ingressos: ticketAudits,
    logoutOk: loginInputVisible,
    errosJavascript: errors,
    respostas5xx: serverErrors
  };
  fs.writeFileSync('/tmp/ct-client-result.json', JSON.stringify(result, null, 2), { mode: 0o600 });
  await browser.close();

  if (errors.length || serverErrors.length || !loginInputVisible || !ticketAudits.length) {
    throw new Error('AUDITORIA_CLIENTE_REAL_INCOMPLETA');
  }
}

(async () => {
  if (phase === 'phase1') return phase1();
  if (phase === 'phase2') return phase2();
  throw new Error('fase invalida');
})().catch(err => {
  console.error(String(err && err.message || err));
  process.exit(1);
});
