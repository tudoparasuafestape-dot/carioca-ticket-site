const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const EVENT_ID = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const PEDIDO_ID = 'PED-P0-POLLING-TESTE';

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
    visual: { descricaoCurta: 'Teste P0', capaUrl: '' },
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

function pedidoPendente() {
  return {
    sucesso: true,
    autorizado: true,
    encontrado: true,
    pedido: {
      pedidoId: PEDIDO_ID,
      eventoId: EVENT_ID,
      status: 'AGUARDANDO_PAGAMENTO',
      statusProvedor: 'PENDING',
      expiraEm: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    },
    pagamento: {
      forma: 'PIX',
      status: 'PENDING',
      pix: null,
      invoiceUrl: ''
    },
    ingressos: []
  };
}

async function instalarBackendFake(page, contadores) {
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
    } else if (
      metodo === 'ctCheckoutPixPublicoConsultarPROD' ||
      metodo === 'ctCheckoutPixPublicoStatusLocalPROD' ||
      metodo === 'ctCheckoutPixPublicoReconciliarPROD'
    ) {
      resultado = pedidoPendente();
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
        '<\\/script></body></html>'
    });
  });
}

for (const rota of ['/checkout/', '/checkout-v2/']) {
  test('P0 polling local protege Asaas em ' + rota, async ({ page }) => {
    test.skip(!BRANCH_MODE, 'Teste destinado ao código candidato da branch.');

    const chamadas = {};
    await instalarBackendFake(page, chamadas);

    await page.addInitScript(({ key, pedidoId }) => {
      localStorage.setItem(key, JSON.stringify({
        pedidoId,
        token: 'TOKEN-P0-POLLING'
      }));
    }, {
      key: 'CT_CHECKOUT_RECOVERY_' + EVENT_ID,
      pedidoId: PEDIDO_ID
    });

    await page.goto(rota + '?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#pixStatus')).toContainText(/Aguardando pagamento|Aguardando confirmação do PIX/i, {
      timeout: 15000
    });

    expect(chamadas.ctCheckoutPixPublicoConsultarPROD || 0).toBe(1);

    // Dois ciclos locais (4s e 8s). A reconciliação externa periódica é 30s.
    await page.waitForTimeout(9000);

    expect(chamadas.ctCheckoutPixPublicoStatusLocalPROD || 0).toBeGreaterThanOrEqual(2);
    expect(chamadas.ctCheckoutPixPublicoReconciliarPROD || 0).toBe(0);

    // O usuário continua podendo forçar reconciliação real imediatamente.
    await page.locator('#refreshButton').click();

    await expect.poll(
      () => chamadas.ctCheckoutPixPublicoReconciliarPROD || 0,
      { timeout: 5000 }
    ).toBe(1);
  });
}
