const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const EVENT_ID = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const ORDER_ID = 'PED-E2E-COMPRADOR';
const QUERY_TOKEN = 'TOKEN-CONSULTA-E2E-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TICKET_CODE = 'CT-E2E-COMPRADOR-001';
const TICKET_SIG = 'abcdefghijklmnopqrstuvwx12345678';

function eventFixture() {
  return {
    sucesso: true,
    evento: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      endereco: 'Rua Arenópolis, 82',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE'
    },
    visual: {
      midiaTipo: 'IMAGEM',
      capaUrl: '',
      posterUrl: '',
      videoInternoDisponivel: false,
      videoEmbedUrl: '',
      videoUrl: '',
      descricaoCurta: '30 anos da Banda Sem Razão.',
      descricaoCompleta: 'Evento de homologação da jornada do comprador.',
      categoria: 'Samba & pagode',
      realizacao: 'Roda de Samba Estilo Carioca',
      destaque: '30 anos da Banda Sem Razão',
      observacoes: 'Apresente o QR Code na entrada.'
    },
    menorPreco: 'R$ 25,00',
    tipos: [{
      id: 'TIPO-IND',
      nome: 'Individual',
      descricao: 'Ingresso individual.',
      capacidadePorVenda: 1,
      lotes: [{
        id: 'LOTE-1',
        nome: 'Pré-venda',
        preco: 'R$ 25,00',
        precoNumero: 25,
        quantidadeLimitada: true,
        disponiveis: 50
      }]
    }],
    links: {}
  };
}

function checkoutFixture() {
  const base=eventFixture();
  return {
    sucesso: true,
    evento: base.evento,
    visual: { descricaoCurta: base.visual.descricaoCurta, capaUrl: '' },
    tipos: base.tipos,
    identidadeCliente: {
      identificadorPrincipal: 'WHATSAPP',
      whatsappObrigatorio: true,
      emailObrigatorio: false
    }
  };
}

function pendingOrder() {
  return {
    sucesso: true,
    consultaToken: QUERY_TOKEN,
    pedido: {
      pedidoId: ORDER_ID,
      status: 'AGUARDANDO_PAGAMENTO',
      expiraEm: '2099-01-01T00:00:00.000Z'
    },
    pagamento: {
      forma: 'PIX',
      pix: { copiaECola: 'PIX-E2E-NAO-REAL' }
    },
    ingressos: []
  };
}

function concludedOrder() {
  return {
    sucesso: true,
    consultaToken: QUERY_TOKEN,
    pedido: {
      pedidoId: ORDER_ID,
      status: 'CONCLUIDO',
      tipoNome: 'Individual',
      loteNome: 'Pré-venda',
      valorTotal: 25
    },
    pagamento: { forma: 'PIX' },
    ingressos: [{
      nome: 'Cliente Homologação',
      link: '/ingresso/?codigo=' + encodeURIComponent(TICKET_CODE) + '&sig=' + encodeURIComponent(TICKET_SIG)
    }]
  };
}

function securePurchase() {
  return {
    sucesso: true,
    autorizado: true,
    pedido: {
      pedidoId: ORDER_ID,
      status: 'CONCLUIDO',
      tipoNome: 'Individual',
      loteNome: 'Pré-venda',
      valorTotal: 25
    },
    evento: eventFixture().evento,
    visual: { capaUrl: '' },
    ingressos: [{
      nome: 'Cliente Homologação',
      link: '/ingresso/?codigo=' + encodeURIComponent(TICKET_CODE) + '&sig=' + encodeURIComponent(TICKET_SIG)
    }]
  };
}

function secureTicket() {
  return {
    sucesso: true,
    ingresso: {
      codigo: TICKET_CODE,
      nome: 'Cliente Homologação',
      tipo: 'Individual',
      lote: 'Pré-venda',
      status: 'VÁLIDO',
      statusClasse: 'VALIDO',
      qrUrl: ''
    },
    evento: eventFixture().evento,
    visual: { capaUrl: '' },
    seguranca: {
      autorizaEntrada: true,
      mensagem: 'Ingresso válido para uma entrada.'
    },
    links: {
      ingresso: '/ingresso/?codigo=' + encodeURIComponent(TICKET_CODE) + '&sig=' + encodeURIComponent(TICKET_SIG)
    }
  };
}

async function installMock(page, state) {
  await page.route('https://script.google.com/**', async route => {
    const req=route.request();
    const params=new URLSearchParams(req.postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||'');
    const action=String(params.get('ctMinhaCariocaAction')||'');
    const method=String(params.get('metodo')||'');
    let args=[];
    try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}

    let result=null, ok=true, error='';
    try {
      if(action==='publicRpc'){
        if(method==='ctEventoPublicoCarregarPROD'){
          expect(String(args[0]||'')).toBe(EVENT_ID);
          result=eventFixture();
        } else if(method==='ctEventoPublicoCarregarVideoDataPROD'){
          result={sucesso:false};
        } else if(method==='ctCheckoutPublicoCarregarEventoPROD'){
          expect(String(args[0]||'')).toBe(EVENT_ID);
          result=checkoutFixture();
        } else if(method==='ctCheckoutPixPublicoIniciarPROD'){
          state.initCalls+=1;
          const payload=args[0]||{};
          expect(String(payload.eventoId||'')).toBe(EVENT_ID);
          expect(String(payload.tipoId||'')).toBe('TIPO-IND');
          expect(String(payload.loteId||'')).toBe('LOTE-1');
          expect(String(payload.formaPagamento||'')).toBe('PIX');
          expect(String(payload.compradorNome||'')).toBe('Cliente Homologação');
          expect(String(payload.compradorWhatsapp||'')).toBe('81999990000');
          expect(String(payload.idempotenciaChave||'')).toMatch(/^CHK-/);
          result=pendingOrder();
        } else if(method==='ctCheckoutPixPublicoReconciliarPROD'){
          state.reconcileCalls+=1;
          expect(String(args[0]||'')).toBe(ORDER_ID);
          expect(String(args[1]||'')).toBe(QUERY_TOKEN);
          result=concludedOrder();
        } else if(method==='ctCheckoutPixPublicoConsultarPROD'){
          result=concludedOrder();
        } else {
          throw new Error('RPC público não previsto: '+method);
        }
      } else if(action==='consultarPedidoSeguro'){
        state.securePurchaseCalls+=1;
        expect(String(params.get('pedido')||'')).toBe(ORDER_ID);
        expect(String(params.get('token')||'')).toBe(QUERY_TOKEN);
        result=securePurchase();
      } else if(action==='consultarIngressoSeguro'){
        state.ticketCalls+=1;
        expect(String(params.get('codigo')||'')).toBe(TICKET_CODE);
        expect(String(params.get('sig')||'')).toBe(TICKET_SIG);
        result=secureTicket();
      } else {
        throw new Error('Ação não prevista: '+action);
      }
    } catch(e) {
      ok=false; error=e&&e.message?e.message:String(e);
    }

    const payload=JSON.stringify({
      ctMinhaCariocaPost:true,id,ok,
      resultado:ok?result:null,
      erro:ok?'':error
    }).replace(/</g,'\\u003c');

    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");</script></body></html>'
    });
  });
}

test.describe('Jornada completa do comprador sem cobrança real', () => {
  test.skip(!BRANCH_MODE, 'Executa na branch com pagamento inteiramente simulado.');

  test('Home -> Evento -> Checkout -> PIX simulado -> Minha Carioca -> Ingresso', async ({ page }) => {
    const state={initCalls:0,reconcileCalls:0,securePurchaseCalls:0,ticketCalls:0};
    await installMock(page,state);

    await page.goto('/',{waitUntil:'domcontentloaded'});
    const eventLink=page.getByRole('link',{name:/^ver evento$/i}).first();
    await expect(eventLink).toBeVisible();
    await eventLink.click();

    await expect(page).toHaveURL(/\/evento\/\?.*evento=/);
    await expect(page.getByRole('heading',{name:'Roda de Samba Estilo Carioca'})).toBeVisible({timeout:15000});
    const buy=page.getByRole('link',{name:/Comprar ingresso|Garantir meu ingresso|Comprar agora/i}).first();
    await buy.click();

    await expect(page).toHaveURL(/\/checkout\/\?.*evento=/);
    await expect(page.getByText('Seus dados')).toBeVisible({timeout:15000});

    await page.locator('#typeSelect').selectOption('TIPO-IND');
    await page.locator('#lotSelect').selectOption('LOTE-1');
    await page.locator('#buyerName').fill('Cliente Homologação');
    await page.locator('#buyerCpf').fill('12345678909');
    await page.locator('#buyerWhatsapp').fill('81999990000');
    await page.locator('#buyerEmail').fill('cliente@example.invalid');

    await expect(page.locator('#summaryPrice')).toHaveText(/R\$\s*25,00/);
    await page.locator('#payButton').click();

    await expect.poll(()=>state.initCalls).toBe(1);
    await expect(page.locator('#pixPanel')).toBeVisible({timeout:15000});
    await expect(page.locator('#pixCode')).toHaveValue('PIX-E2E-NAO-REAL');

    await page.locator('#refreshButton').click();
    await expect.poll(()=>state.reconcileCalls).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#successPanel')).toBeVisible({timeout:15000});
    await expect(page.locator('#ticketLinks')).toContainText('Abrir ingresso 1');

    const minhaHref=await page.locator('#minhaCariocaLink').getAttribute('href');
    expect(minhaHref).toContain('/minha-carioca/?pedido='+ORDER_ID);
    const minhaUrl=new URL(minhaHref);
    await page.locator('#minhaCariocaLink').evaluate((el,path)=>el.setAttribute('href',path),minhaUrl.pathname+minhaUrl.search);
    await page.locator('#minhaCariocaLink').click();

    await expect(page).toHaveURL(/\/minha-carioca\/\?pedido=/);
    await expect(page.getByRole('heading',{name:'Seus ingressos'})).toBeVisible({timeout:15000});
    await expect(page.locator('.purchase')).toContainText('Compra concluída');
    await expect.poll(()=>state.securePurchaseCalls).toBe(1);

    const ticket=page.getByRole('link',{name:/Abrir ingresso 1/i});
    await expect(ticket).toHaveAttribute('href',/\/ingresso\/\?codigo=/);
    await ticket.click();

    await expect(page).toHaveURL(/\/ingresso\/\?codigo=/);
    await expect(page.locator('#ticket-view')).toBeVisible({timeout:15000});
    await expect(page.locator('#ticket-view')).toContainText('Cliente Homologação');
    await expect(page.locator('#ticket-view')).toContainText('VÁLIDO');
    await expect(page.locator('#ticket-view')).toContainText(TICKET_CODE);
    await expect(page.getByRole('link',{name:/Voltar para Minha Carioca/i})).toBeVisible();
    await expect.poll(()=>state.ticketCalls).toBe(1);

    expect(state.initCalls).toBe(1);
  });
});
