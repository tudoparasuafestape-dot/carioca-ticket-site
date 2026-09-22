const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const STORAGE = 'CT_PORTAL_FORNECEDOR_SESSION_V1';

function fornecedorPanel() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    usuario: { id: 'USR-FOR-E2E', nome: 'Fornecedor Homologacao' },
    fornecedor: {
      fornecedorId: 'FOR-E2E',
      nome: 'Fornecedor Homologacao',
      categoria: 'Seguranca',
      email: 'fornecedor@example.invalid',
      whatsapp: '81999990000',
      pix: { configurado: true, tipo: 'CPF', chaveMascarada: '***.***.***-00' }
    },
    resumo: {
      contratosAtivos: 1,
      totalContratado: 'R$ 450,00',
      totalPendente: 'R$ 450,00',
      totalPago: 'R$ 0,00'
    },
    contratos: [
      {
        vinculoId: 'FVE-E2E',
        eventoId: 'EVT-E2E',
        servico: 'Seguranca',
        valor: 'R$ 450,00',
        statusPagamento: 'PENDENTE',
        statusVinculo: 'ATIVO',
        evento: { nome: 'Evento Homologacao', data: '11/10/2026', local: 'Vevets', cidade: 'Jaboatao', uf: 'PE' },
        produtor: { nome: 'Produtor Homologacao' }
      }
    ],
    atualizadoEm: '22/09/2026 15:00:00'
  };
}

async function installFirebaseStub(page) {
  await page.route('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    body: 'export function initializeApp(c){return {config:c}};export function getApps(){return []};'
  }));
  await page.route('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    body: `
      export const browserSessionPersistence={};
      export function getAuth(){return {currentUser:null,languageCode:''}}
      export async function setPersistence(){return true}
      export async function signInWithEmailAndPassword(){throw new Error('LOGIN_NAO_USADO_NO_E2E')}
      export async function createUserWithEmailAndPassword(){throw new Error('CADASTRO_NAO_USADO_NO_E2E')}
      export async function sendEmailVerification(){return true}
      export async function updateProfile(){return true}
      export async function getIdToken(){return 'TOKEN-FIREBASE-E2E'}
      export async function deleteUser(){return true}
      export async function signOut(){return true}
    `
  }));
}

async function installBackendMock(page, state) {
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const params = new URLSearchParams(request.postData() || '');
    const id = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    const method = String(params.get('metodo') || '');
    let args = [];
    try { args = JSON.parse(params.get('argsJson') || '[]'); } catch (_) {}

    let resultado = null, ok = true, erro = '';
    try {
      if (action !== 'portalRpc') throw new Error('Acao nao prevista: ' + action);
      switch (method) {
        case 'ctCentralAcessoObterFirebaseConfigPROD':
          resultado = {
            sucesso: true,
            firebaseConfig: {
              apiKey: 'fake-api-key',
              projectId: 'fake-project',
              authDomain: 'fake-project.invalid',
              appId: 'fake-app-id'
            }
          };
          break;
        case 'ctPortalFornecedorRestaurarSessaoPROD':
          expect(String(args[0] || '')).toBe(state.token);
          resultado = {
            sucesso: true,
            autenticado: true,
            autorizado: true,
            usuario: { id: 'USR-FOR-E2E', nome: 'Fornecedor Homologacao' },
            fornecedor: fornecedorPanel().fornecedor,
            painel: null
          };
          break;
        case 'ctPortalFornecedorCarregarPainelPROD':
          expect(String(args[0] || '')).toBe(state.token);
          resultado = fornecedorPanel();
          break;
        case 'ctPortalFornecedorLogoutPROD':
          expect(String(args[0] || '')).toBe(state.token);
          state.logoutCalls += 1;
          resultado = { sucesso: true };
          break;
        default:
          throw new Error('Metodo fornecedor nao previsto: ' + method);
      }
    } catch (e) {
      ok = false;
      erro = e && e.message ? e.message : String(e);
    }

    const payload = JSON.stringify({
      ctMinhaCariocaPost: true, id, ok,
      resultado: ok ? resultado : null,
      erro: ok ? '' : erro
    }).replace(/</g, '\\u003c');

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><script>window.top.postMessage(' + payload + ', "*");</script></body></html>'
    });
  });
}

async function installMocks(page, state) {
  await installFirebaseStub(page);
  await installBackendMock(page, state);
}

test.describe('Jornada do Fornecedor', () => {
  test.skip(!BRANCH_MODE, 'Executa na branch sem credenciais reais.');

  test('fornecedor encontra o portal pela Central de Ajuda', async ({ page }) => {
    const state = { token: 'FOR-E2E-TOKEN', logoutCalls: 0 };
    await installMocks(page, state);

    await page.goto('/ajuda/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#helpSupplierPortal')).toBeVisible();
    await page.locator('#helpSupplierPortal').click();

    await expect(page).toHaveURL(/\/fornecedor\//);
    await expect(page.getByRole('heading', { name: /Suas contratações em um só lugar/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Voltar para a Carioca Ticket/i })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: /Precisa de ajuda/i })).toHaveAttribute('href', '/ajuda/');
  });

  test('sessao do fornecedor restaura painel, fica navegavel no mobile e encerra corretamente', async ({ page }) => {
    const state = { token: 'FOR-E2E-TOKEN', logoutCalls: 0 };
    await installMocks(page, state);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ key, token }) => {
      sessionStorage.setItem(key, JSON.stringify({ token, expiraEm: '2099-01-01T00:00:00.000Z' }));
    }, { key: STORAGE, token: state.token });

    await page.goto('/fornecedor/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#portalView')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#helloName')).toContainText('Fornecedor Homologacao');
    await expect(page.locator('#metricContracts')).toHaveText('1');
    await expect(page.locator('#metricTotal')).toHaveText('R$ 450,00');
    await expect(page.locator('#contractList')).toContainText('Evento Homologacao');
    await expect(page.getByRole('link', { name: 'Ajuda' })).toHaveAttribute('href', '/ajuda/');
    await expect(page.locator('#logoutButton')).toBeVisible();

    const viewport = page.viewportSize();
    for (const locator of [page.getByRole('link', { name: 'Ajuda' }), page.locator('#refreshButton'), page.locator('#logoutButton')]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      if (viewport && box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    }

    await page.locator('#logoutButton').click();
    await expect.poll(() => state.logoutCalls).toBe(1);
    await expect(page.locator('#loginView')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#portalView')).toHaveClass(/hidden/);
    const stored = await page.evaluate(key => sessionStorage.getItem(key), STORAGE);
    expect(stored).toBeNull();
  });
});
