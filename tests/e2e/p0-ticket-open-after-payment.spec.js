const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const EVENT_ID = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const PEDIDO_ID = 'PED-P0-INGRESSO-ABERTURA';
const TOKEN = 'TOKEN-P0-INGRESSO-ABERTURA';
const CODIGO = 'CT-P0-LINK-001';
const SIG = 'abcdefghijklmnopQRSTUVWX1234_-AB';

function catalogo() {
  return {
    sucesso: true,
    evento: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE'
    },
    visual: { descricaoCurta: 'Teste P0 abertura', capaUrl: '' },
    tipos: [{
      id: 'TIPO-IND',
      nome: 'Individual',
      descricao: 'Ingresso individual.',
      capacidadePorVenda: 1,
      lotes: [{
        id: 'LOTE-1',
        nome: 'Lote único',
        preco: 'R$ 25,00',
        precoNumero: 25,
        quantidadeLimitada: true,
        disponiveis: 100
      }]
    }],
    identidadeCliente: {
      identificadorPrincipal: 'WHATSAPP',
      whatsappObrigatorio: true,
      emailObrigatorio: false
    }
  };
}

function respostaPedido(status, comLink) {
  return {
    sucesso: true,
    autorizado: true,
    encontrado: true,
    pedido: {
      pedidoId: PEDIDO_ID,
      eventoId: EVENT_ID,
      status,
      statusProvedor: status === 'PROCESSANDO' ? 'RECEIVED' : 'RECEIVED',
      expiraEm: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    },
    consultaToken: TOKEN,
    pagamento: {
      forma: 'PIX',
      status: 'RECEIVED',
      pix: null,
      invoiceUrl: ''
    },
    vendaCriada: status === 'CONCLUIDO',
    ingressoEmitido: status === 'CONCLUIDO',
    ingressos: status === 'CONCLUIDO'
      ? [{
          codigo: CODIGO,
          nome: 'Cliente Teste',
          status: 'ATIVO',
          link: comLink
            ? 'https://cariocaticket.com.br/ingresso/?codigo=' +
              encodeURIComponent(CODIGO) +
              '&sig=' +
              encodeURIComponent(SIG) +
              '&v=P0'
            : ''
        }]
      : []
  };
}

async function instalarBackendFake(page, contadores) {
  let consultasLocais = 0;

  await page.route('https://cariocaticket.com.br/ingresso/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><h1>Ingresso aberto</h1><div id="qr">QR OK</div></body></html>'
    });
  });

  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const params = new URLSearchParams(request.postData() || '');
    const id = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    const metodo = String(params.get('metodo') || '');

    if (!id || action !== 'publicRpc') {
      await route.fulfill({
        status: 400,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body>RPC inválido</body></html>'
      });
      return;
    }

    contadores[metodo] = Number(contadores[metodo] || 0) + 1;

    let resultado;
    if (metodo === 'ctCheckoutPublicoCarregarEventoPROD') {
      resultado = catalogo();
    } else if (metodo === 'ctCheckoutPixPublicoIniciarPROD') {
      resultado = {
        ...respostaPedido('PROCESSANDO', false),
        consultaToken: TOKEN
      };
    } else if (metodo === 'ctCheckoutPixPublicoStatusLocalPROD') {
      consultasLocais += 1;
      resultado = consultasLocais === 1
        ? respostaPedido('CONCLUIDO', false)
        : respostaPedido('CONCLUIDO', true);
    } else if (metodo === 'ctCheckoutPixPublicoReconciliarPROD') {
      resultado = respostaPedido('CONCLUIDO', true);
    } else {
      resultado = { sucesso: true };
    }

    const payload = JSON.stringify({
      ctMinhaCariocaPost: true,
      id,
      ok: true,
      resultado,
      erro: ''
    }).replace(/</g, '\\u003c');

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        '<!doctype html><html><body><script>' +
        'window.top.postMessage(' + payload + ', "*");' +
        '<\/script></body></html>'
    });
  });
}

for (const rota of ['/checkout/', '/checkout-v2/']) {
  test('P0 não libera botão quebrado e abre ingresso seguro em ' + rota, async ({ page }) => {
    test.skip(!BRANCH_MODE, 'Teste destinado ao código candidato da branch.');

    const chamadas = {};
    await instalarBackendFake(page, chamadas);

    await page.goto(rota + '?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 10000
    });

    await page.locator('#typeSelect').selectOption('TIPO-IND');
    await page.locator('#lotSelect').selectOption('LOTE-1');
    await page.locator('#buyerName').fill('Cliente Teste');
    await page.locator('#buyerCpf').fill('12345678901');
    await page.locator('#buyerWhatsapp').fill('81999999999');

    const participantNames = page.locator('#participants [data-name]');
    const participantCount = await participantNames.count();
    for (let i = 0; i < participantCount; i++) {
      await participantNames.nth(i).fill('Participante Teste ' + (i + 1));
    }

    await page.locator('#payButton').click();

    await expect.poll(
      () => chamadas.ctCheckoutPixPublicoIniciarPROD || 0,
      { timeout: 5000 }
    ).toBe(1);

    await expect.poll(
      () => chamadas.ctCheckoutPixPublicoStatusLocalPROD || 0,
      { timeout: 5000 }
    ).toBeGreaterThanOrEqual(1);

    // Primeiro retorno: pedido CONCLUIDO, mas ainda sem link seguro.
    // A tela final não pode ser liberada nesse estado.
    await expect(page.locator('#successPanel')).toBeHidden();

    // O fast refresh local consulta novamente sem chamar o Asaas.
    await expect.poll(
      () => chamadas.ctCheckoutPixPublicoStatusLocalPROD || 0,
      { timeout: 5000 }
    ).toBeGreaterThanOrEqual(2);

    await expect(page.locator('#successPanel')).toBeVisible({ timeout: 5000 });

    const ticket = page.locator('.ticket-link').first();
    await expect(ticket).toBeVisible();
    await expect(ticket).toHaveAttribute('href', new RegExp('/ingresso/\\?codigo=' + CODIGO + '&sig='));

    await ticket.click();

    await expect.poll(() => {
      try {
        const u = new URL(page.url());
        return u.hostname + u.pathname;
      } catch (_) {
        return '';
      }
    }, { timeout: 5000 }).toBe('cariocaticket.com.br/ingresso/');

    await expect(page.getByRole('heading', { name: 'Ingresso aberto' })).toBeVisible();
    await expect(page.locator('#qr')).toHaveText('QR OK');
  });
}
