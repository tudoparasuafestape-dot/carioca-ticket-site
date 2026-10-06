from pathlib import Path

portal_path = Path('produtor/index.html')
spec_path = Path('tests/e2e/authenticated-operational.spec.js')

portal = portal_path.read_text(encoding='utf-8')
spec = spec_path.read_text(encoding='utf-8')

timeout_anchor = "var RESTORE_UX_TIMEOUT_MS =\n9000;\n"
if portal.count(timeout_anchor) != 1:
    raise SystemExit('ANCHOR_TIMEOUT_COUNT=' + str(portal.count(timeout_anchor)))
if 'var LOGIN_RPC_TIMEOUT_MS =' not in portal:
    portal = portal.replace(
        timeout_anchor,
        timeout_anchor + "\nvar LOGIN_RPC_TIMEOUT_MS =\n12000;\n",
        1,
    )

start = portal.find('function chamarLoginFirebaseServidor(\nidToken\n){')
end = portal.find('function encerrarSessaoServidorSilencioso(', start)
if start < 0 or end < 0 or end <= start:
    raise SystemExit('LOGIN_FUNCTION_MARKERS_INVALID')

new_login = """function chamarLoginFirebaseServidor(
idToken
){

return new Promise(
function(
resolve,
reject
){

var concluido =
false;

var timer =
window.setTimeout(
function(){

if(
concluido
){
return;
}

concluido =
true;

reject(
new Error(
'CT_PORTAL_RPC_TIMEOUT'
)
);
},
LOGIN_RPC_TIMEOUT_MS
);

google.script.run
.withSuccessHandler(
function(resposta){

if(
concluido
){

if(
resposta &&
resposta.sucesso ===
true &&
resposta.autenticado ===
true &&
String(
resposta.token ||
''
).trim()
){

encerrarSessaoServidorSilencioso(
String(
resposta.token
).trim()
);
}

return;
}

concluido =
true;

window.clearTimeout(
timer
);

resolve(
resposta
);
}
)
.withFailureHandler(
function(erro){

if(
concluido
){
return;
}

concluido =
true;

window.clearTimeout(
timer
);

reject(
erro ||
new Error(
'CT_PORTAL_LOGIN_BACKEND_FALHOU'
)
);
}
)
.ctPortalProdutorLoginFirebaseHotpathP0PROD(
idToken
);
}
);
}

"""
portal = portal[:start] + new_login + portal[end:]

login_case_anchor = "          case 'ctPortalProdutorRestaurarSessaoIsoladaPROD':\n"
if spec.count(login_case_anchor) != 1:
    raise SystemExit('LOGIN_CASE_ANCHOR_COUNT=' + str(spec.count(login_case_anchor)))

login_case = """          case 'ctPortalProdutorLoginFirebaseHotpathP0PROD':
            state.loginCalls = Number(state.loginCalls || 0) + 1;
            {
              const delay = Number(state.loginDelayMs || 0);
              if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
              resultado = state.loginResponse || {
                sucesso: true,
                autenticado: true,
                autorizado: false,
                contextoPendente: true,
                token: 'CT-E2E-LOGIN-TOKEN',
                expiraEm: '2099-01-01T00:00:00.000Z',
                usuario: { id: 'USR-E2E', nome: 'Operador Homologacao' }
              };
            }
            break;

"""
if "case 'ctPortalProdutorLoginFirebaseHotpathP0PROD':" not in spec:
    spec = spec.replace(login_case_anchor, login_case + login_case_anchor, 1)

old_logout = """          case 'logoutUsuarioCT2':
            resultado = { sucesso: true };
            break;
"""
new_logout = """          case 'logoutUsuarioCT2':
            state.logoutCalls = Number(state.logoutCalls || 0) + 1;
            state.logoutTokens = Array.isArray(state.logoutTokens) ? state.logoutTokens : [];
            state.logoutTokens.push(String(args[0] || ''));
            resultado = { sucesso: true };
            break;
"""
if spec.count(old_logout) != 1:
    raise SystemExit('LOGOUT_CASE_COUNT=' + str(spec.count(old_logout)))
spec = spec.replace(old_logout, new_logout, 1)

final_marker = "\n});\n"
pos = spec.rfind(final_marker)
if pos < 0:
    raise SystemExit('DESCRIBE_END_NOT_FOUND')

tests = r'''

  test('Portal limita RPC inicial de login a 12s sem ficar preso por 30s', async ({ page }) => {
    const state = {
      token: 'CT-E2E-T1-HANG',
      loginDelayMs: 30000,
      loginResponse: {
        sucesso: true,
        autenticado: true,
        autorizado: false,
        contextoPendente: true,
        token: 'CT-E2E-LATE-HANG',
        expiraEm: '2099-01-01T00:00:00.000Z',
        usuario: { id: 'USR-E2E', nome: 'Operador Homologacao' }
      },
      transactionCalls: 0,
      barMutationCalls: 0,
      eventMutationCalls: 0,
      supplierMutationCalls: 0,
      commissionMutationCalls: 0
    };
    await installMock(page, state);
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });
    const inicio = Date.now();
    const retorno = await page.evaluate(async () => {
      try {
        await window.chamarLoginFirebaseServidor('CT-E2E-IDTOKEN');
        return { ok: true, message: '' };
      } catch (erro) {
        return { ok: false, message: String(erro && erro.message || erro || '') };
      }
    });
    const elapsed = Date.now() - inicio;
    console.log(`LOGIN_T1_TIMEOUT_ELAPSED_MS=${elapsed}`);
    expect(retorno.ok).toBe(false);
    expect(retorno.message).toContain('CT_PORTAL_RPC_TIMEOUT');
    expect(elapsed).toBeGreaterThanOrEqual(11500);
    expect(elapsed).toBeLessThan(13000);
  });

  test('Portal descarta sucesso tardio do login e encerra sessao orfa', async ({ page }) => {
    const lateToken = 'CT-E2E-LATE-SESSION-CLEANUP';
    const state = {
      token: 'CT-E2E-T1-LATE',
      loginDelayMs: 12500,
      loginResponse: {
        sucesso: true,
        autenticado: true,
        autorizado: false,
        contextoPendente: true,
        token: lateToken,
        expiraEm: '2099-01-01T00:00:00.000Z',
        usuario: { id: 'USR-E2E', nome: 'Operador Homologacao' }
      },
      transactionCalls: 0,
      barMutationCalls: 0,
      eventMutationCalls: 0,
      supplierMutationCalls: 0,
      commissionMutationCalls: 0
    };
    await installMock(page, state);
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });
    const retorno = await page.evaluate(async () => {
      try {
        await window.chamarLoginFirebaseServidor('CT-E2E-IDTOKEN-LATE');
        return { ok: true };
      } catch (erro) {
        return { ok: false, message: String(erro && erro.message || erro || '') };
      }
    });
    expect(retorno.ok).toBe(false);
    await page.waitForTimeout(1500);
    expect(state.logoutCalls).toBe(1);
    expect(state.logoutTokens).toContain(lateToken);
    await expect(page.locator('#portalView')).toHaveClass(/hidden/);
  });

  test('Portal mantém resposta rápida do login sem esperar watchdog', async ({ page }) => {
    const fastToken = 'CT-E2E-FAST-LOGIN';
    const state = {
      token: fastToken,
      loginDelayMs: 80,
      loginResponse: {
        sucesso: true,
        autenticado: true,
        autorizado: false,
        contextoPendente: true,
        token: fastToken,
        expiraEm: '2099-01-01T00:00:00.000Z',
        usuario: { id: 'USR-E2E', nome: 'Operador Homologacao' }
      },
      transactionCalls: 0,
      barMutationCalls: 0,
      eventMutationCalls: 0,
      supplierMutationCalls: 0,
      commissionMutationCalls: 0
    };
    await installMock(page, state);
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });
    const inicio = Date.now();
    const resposta = await page.evaluate(async () => {
      return await window.chamarLoginFirebaseServidor('CT-E2E-IDTOKEN-FAST');
    });
    expect(Date.now() - inicio).toBeLessThan(2500);
    expect(resposta.sucesso).toBe(true);
    expect(resposta.token).toBe(fastToken);
  });
'''
if "Portal limita RPC inicial de login a 12s" not in spec:
    spec = spec[:pos] + tests + spec[pos:]

portal_path.write_text(portal, encoding='utf-8', newline='')
spec_path.write_text(spec, encoding='utf-8', newline='')
print('CT_T1_EDIT_OK')
