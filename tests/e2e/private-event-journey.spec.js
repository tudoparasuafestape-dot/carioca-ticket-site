import { test, expect } from '@playwright/test';

const BRANCH_MODE = String(process.env.CT_BRANCH_MODE || '') === '1';
const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

function envelope(id, ok, resultado, erro = '') {
  return JSON.stringify({
    ctMinhaCariocaPost: true,
    id,
    ok,
    resultado: ok ? resultado : null,
    erro: ok ? '' : erro
  }).replace(/</g, '\\u003c');
}

async function fulfillRpc(route, handler) {
  const params = new URLSearchParams(route.request().postData() || '');
  const id = String(params.get('ctMinhaCariocaRequestId') || '');
  const action = String(params.get('ctMinhaCariocaAction') || '');
  const method = String(params.get('metodo') || '');
  let args = [];
  try { args = JSON.parse(params.get('argsJson') || '[]'); } catch (_) {}

  let ok = true;
  let resultado = null;
  let erro = '';
  try {
    resultado = await handler({ action, method, args });
  } catch (e) {
    ok = false;
    erro = e && e.message ? e.message : String(e);
  }

  await route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html><body><script>window.top.postMessage(' +
      envelope(id, ok, resultado, erro) +
      ', "*");<\\/script></body></html>'
  });
}

async function seedSession(page, token = 'CT-PRODUTOR-PRIVADO-E2E') {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ storage, token }) => {
    const value = JSON.stringify({
      token,
      expiraEm: '2099-01-01T00:00:00.000Z'
    });
    sessionStorage.setItem(storage, value);
    localStorage.setItem(storage, value);
  }, { storage: STORAGE, token });
}

test.describe('Evento privado — jornada essencial', () => {
  test.skip(!BRANCH_MODE, 'Jornada mutável roda somente contra a branch local.');

  test('produtor configura PRIVADO_CONVITE e cadastra convidado', async ({ page }) => {
    const state = {
      mode: 'PUBLICO',
      saveAccessCalls: 0,
      saveGuestCalls: 0,
      guests: []
    };

    await seedSession(page);

    await page.route('https://script.google.com/**', async route => { await fulfillRpc(route, ({ action, method, args }) => {
      expect(action).toBe('portalRpc');

      if (method === 'ctEventoAcessoProdutorObterPROD') {
        expect(String(args[1] || '')).toBe('EVT-PRIVATE-E2E');
        return {
          sucesso: true,
          autorizado: true,
          evento: { id: 'EVT-PRIVATE-E2E', nome: 'Evento Privado E2E' },
          configuracaoPersistida: {
            modoAcesso: state.mode,
            validacaoConvite: 'TOKEN_TELEFONE',
            mensagemConviteTitulo: 'Você está convidado',
            mensagemConviteTexto: '',
            ctaConviteTexto: 'Continuar'
          }
        };
      }

      if (method === 'ctEventoAcessoProdutorSalvarPROD') {
        const payload = args[2] || {};
        state.saveAccessCalls += 1;
        state.mode = String(payload.modoAcesso || '');
        return {
          sucesso: true,
          autorizado: true,
          evento: { id: 'EVT-PRIVATE-E2E', nome: 'Evento Privado E2E' },
          configuracaoPersistida: payload
        };
      }

      if (method === 'ctEventoConvidadosListarPROD') {
        return {
          sucesso: true,
          eventoNome: 'Evento Privado E2E',
          convidados: state.guests
        };
      }

      if (method === 'ctEventoConvidadosSalvarPROD') {
        const payload = args[1] || {};
        state.saveGuestCalls += 1;
        state.guests = [{
          convidadoId: 'CONV-E2E-1',
          nomeCompleto: payload.nomeCompleto,
          whatsapp: payload.whatsapp,
          unidadeApartamento: payload.unidadeApartamento,
          categoria: payload.categoria,
          quantidadeMaxima: payload.quantidadeMaxima,
          quantidadeConsumida: 0,
          convite: null
        }];
        return { sucesso: true, convidado: state.guests[0] };
      }

      throw new Error('Método inesperado: ' + method);
    }); });

    await page.goto('/produtor/convidados/?evento=EVT-PRIVATE-E2E', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#eventName')).toHaveText('Evento Privado E2E');
    await expect(page.locator('#accessMode')).toHaveValue('PUBLICO');
    await expect(page.locator('#privateManagement')).toHaveClass(/hidden/);

    await page.locator('#accessMode').selectOption('PRIVADO_CONVITE');
    await expect(page.locator('#privateManagement')).not.toHaveClass(/hidden/);
    await page.locator('#saveAccess').click();

    await expect.poll(() => state.saveAccessCalls).toBe(1);
    expect(state.mode).toBe('PRIVADO_CONVITE');
    await expect(page.locator('#message')).toContainText('Evento configurado como privado');

    await page.locator('#name').fill('Convidado Teste');
    await page.locator('#phone').fill('(81) 99999-1111');
    await page.locator('#limit').fill('2');
    await page.locator('#unit').fill('Apto 101');
    await page.locator('#category').fill('VIP');
    await page.locator('#saveGuest').click();

    await expect.poll(() => state.saveGuestCalls).toBe(1);
    await expect(page.locator('#rows')).toContainText('Convidado Teste');
    await expect(page.locator('#rows')).toContainText('81999991111');
    await expect(page.locator('#rows')).toContainText('Apto 101');
    await expect(page.locator('#sGuests')).toHaveText('1');
    await expect(page.locator('#sAllowed')).toHaveText('2');
  });

  test('convidado valida telefone, recebe grant e segue ao checkout privado', async ({ page }) => {
    await page.route('https://script.google.com/**', async route => { await fulfillRpc(route, ({ action, method, args }) => {
      if (method === 'ctEventoConviteCarregarPublicoPROD') {
        expect(action).toBe('publicRpc');
        expect(String(args[0] || '')).toBe('TOKEN-E2E');
        return {
          sucesso: true,
          evento: {
            id: 'EVT-PRIVATE-E2E',
            nome: 'Evento Privado E2E',
            data: '24/10/2026',
            horario: '19:00',
            local: 'Espaço E2E',
            cidade: 'Jaboatão dos Guararapes',
            uf: 'PE'
          },
          visual: {
            descricaoCurta: 'Convite especial',
            descricaoCompleta: 'Uma experiência privada.',
            observacoes: 'Convite pessoal.'
          },
          convite: {
            nomeConvidado: 'Convidado Teste',
            unidadeApartamento: 'Apto 101',
            categoria: 'VIP',
            disponivel: 2,
            validacaoConvite: 'TOKEN_TELEFONE'
          },
          experiencia: {
            texto: 'Você recebeu um convite especial.',
            cta: 'Continuar'
          }
        };
      }

      if (method === 'ctEventoConviteValidarPublicoPROD') {
        expect(action).toBe('publicRpc');
        const payload = args[0] || {};
        expect(payload.token).toBe('TOKEN-E2E');
        expect(payload.telefone).toBe('81999991111');
        return {
          sucesso: true,
          autorizado: true,
          eventoId: 'EVT-PRIVATE-E2E',
          accessGrant: 'GRANT-E2E-ASSINADO',
          expiraEmEpoch: 4102444800000
        };
      }

      return { sucesso: false, mensagem: 'RPC não necessário neste teste.' };
    }); });

    await page.goto('/convite/?token=TOKEN-E2E', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#eventName')).toHaveText('Evento Privado E2E');
    await expect(page.locator('#guestName')).toHaveText('Convidado Teste');
    await expect(page.locator('#quota')).toHaveText('2');
    await expect(page.locator('#phoneField')).not.toHaveClass(/hidden/);

    await page.locator('#phone').fill('(81) 99999-1111');

    await Promise.all([
      page.waitForURL(/\/checkout-v2\/\?evento=EVT-PRIVATE-E2E&privado=1/, { timeout: 15000 }),
      page.locator('#continue').click()
    ]);

    const grant = await page.evaluate(() => {
      return JSON.parse(sessionStorage.getItem('CT_PRIVATE_GRANT_EVT-PRIVATE-E2E') || 'null');
    });

    expect(grant).toEqual({
      grant: 'GRANT-E2E-ASSINADO',
      expiraEmEpoch: 4102444800000
    });
  });
});
