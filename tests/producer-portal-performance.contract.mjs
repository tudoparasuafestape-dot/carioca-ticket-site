import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const portal = read('produtor/index.html');
const home = read('index.html');

const checks = {
  cadastroVisivelPrimeiraPintura:
    portal.includes('id="showRegisterButton"\nclass="text-button"\ntype="button"') &&
    !portal.includes('id="showRegisterButton"\nclass="text-button hidden"'),

  loginNaoBloqueadoNoHtml:
    !/id="loginButton"[\s\S]{0,140}?disabled/.test(portal),

  firebaseLazy:
    portal.includes('async function carregarFirebaseSdk(){') &&
    portal.includes("import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js')") &&
    portal.includes("import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js')") &&
    !portal.includes("} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'"),

  bootstrapUnico:
    (portal.match(/ctCentralAcessoBootstrapPROD/g) || []).length === 1 &&
    !portal.includes('ctCentralAcessoObterCapacidadesPROD') &&
    !portal.includes('ctCentralAcessoObterFirebaseConfigPROD'),

  cacheCurtoPublico:
    portal.includes('CT_PORTAL_PRODUTOR_PUBLIC_BOOTSTRAP_V1') &&
    portal.includes('BOOTSTRAP_TTL_MS') &&
    portal.includes('600000') &&
    portal.includes('sessionStorage.setItem(') &&
    portal.includes('localStorage.setItem('),

  prewarmIdle:
    portal.includes('function agendarFirebasePrewarm(){') &&
    portal.includes('requestIdleCallback') &&
    portal.includes('agendarFirebasePrewarm();'),

  acoesFailClosed:
    portal.includes('await garantirBootstrapPronto();') &&
    portal.includes('state.capacidades.loginEmailSenha.habilitado') &&
    portal.includes('state.capacidades.cadastro.habilitado') &&
    portal.includes('el.registerButton.disabled =') &&
    portal.includes('state.capacidades.recuperacaoSenha.habilitado'),

  prefetchHome:
    home.includes('<link rel="prefetch" href="/produtor/" as="document">')
};

const failures = Object.entries(checks).filter(([,ok]) => !ok).map(([name]) => name);
if (failures.length) {
  for (const name of failures) console.error('FAIL', name);
  process.exit(1);
}
console.log('CT_PRODUCER_PORTAL_PERFORMANCE_OK', Object.keys(checks).length);
