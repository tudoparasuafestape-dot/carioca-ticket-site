import { test, expect } from '@playwright/test';

const BRANCH_MODE = String(process.env.CT_BRANCH_MODE || '') === '1';
const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

function requestFixture(status='ENVIADO') {
  return {
    solicitacaoId:'PRODSOL-E2E',
    nomeFantasia:'Priscila Eventos',
    razaoSocial:'Priscila Eventos LTDA',
    cpfCnpj:'52998224725',
    responsavelNome:'Priscila Ferreira',
    email:'priscila@example.invalid',
    whatsapp:'81999990000',
    cidade:'Jaboatão dos Guararapes',
    uf:'PE',
    instagram:'@priscila',
    status,
    produtorId:status==='ATIVO'?'PROD-E2E':'',
    codigoIndicacao:'VINICIUSCT',
    pendenciaPublica:'',
    criadoEm:'22/09/2026 06:00',
    atualizadoEm:'22/09/2026 06:00',
    historico:[
      {de:'INICIO',para:'ENVIADO',em:'2026-09-22T09:00:00.000Z',observacao:'Solicitação recebida com indicação VINICIUSCT.'}
    ]
  };
}

async function installRpcMock(page, state) {
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const params = new URLSearchParams(request.postData() || '');
    const requestId = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    const method = String(params.get('metodo') || '');
    let args = [];
    try { args = JSON.parse(params.get('argsJson') || '[]'); } catch (_) {}

    let resultado = null, ok = true, erro = '';

    try {
      expect(action).toBe('portalRpc');

      if (method === 'ctProdutorOnboardingConsultarPROD') {
        expect(String(args[0] || '')).toBe(state.userToken);
        resultado = {
          sucesso:true,
          autenticado:true,
          possuiProdutor:state.status==='ATIVO',
          usuario:{id:'USR-PRISCILA',nome:'Priscila Ferreira',email:'priscila@example.invalid'},
          solicitacao:state.submitted ? requestFixture(state.status) : null,
          indicacao:state.status==='ATIVO' ? null : {
            indicacaoId:'IND-E2E',
            parceiroId:'PCT-VINICIUS',
            codigoIndicacao:'VINICIUSCT'
          }
        };
      } else if (method === 'ctProdutorOnboardingEnviarPROD') {
        expect(String(args[0] || '')).toBe(state.userToken);
        const payload = args[1] || {};
        state.submitCalls += 1;
        state.lastSubmit = payload;
        state.submitted = true;
        state.status = 'ENVIADO';
        resultado = {sucesso:true,jaExistia:false,solicitacao:requestFixture('ENVIADO')};
      } else if (method === 'logoutUsuarioCT2') {
        expect(String(args[0] || '')).toBe(state.userToken);
        state.logoutCalls += 1;
        resultado = {sucesso:true};
      } else if (method === 'ctProdutorOnboardingAdminListarPROD') {
        expect(String(args[0] || '')).toBe(state.adminToken);
        const s=(state.staleListAfterDecision&&state.adminActions.length)?state.previousStatus:state.status;
        resultado = {
          sucesso:true,autorizado:true,admin:{usuarioId:'USR-ADMIN',nome:'Administrador',perfil:'ADMINISTRADOR'},
          contagem:{
            ENVIADO:s==='ENVIADO'?1:0,
            EM_ANALISE:s==='EM_ANALISE'?1:0,
            PENDENCIA:0,
            REPROVADO:0,
            APROVANDO:0,
            ATIVO:s==='ATIVO'?1:0
          },
          itens:state.submitted?[{
            solicitacaoId:'PRODSOL-E2E',
            nomeFantasia:'Priscila Eventos',
            responsavelNome:'Priscila Ferreira',
            email:'priscila@example.invalid',
            cidade:'Jaboatão dos Guararapes',
            uf:'PE',
            status:s,
            codigoIndicacao:'VINICIUSCT',
            criadoEm:'22/09/2026 06:00',
            atualizadoEm:'22/09/2026 06:00'
          }]:[],
          total:state.submitted?1:0
        };
      } else if (method === 'ctProdutorOnboardingAdminDetalharPROD') {
        expect(String(args[0] || '')).toBe(state.adminToken);
        state.detailCalls=(state.detailCalls||0)+1;
        const detalheStatus=(state.staleDetailAfterDecision&&state.status!=='ENVIADO')?'ENVIADO':state.status;
        var detalhe=requestFixture(detalheStatus);
        if(detalheStatus==='ATIVO')detalhe.financeiro={existe:true,statusOnboarding:'PENDENTE_CREDENCIAL',credencialConfigurada:false,recebimentoHabilitado:false,prontoParaVendas:false};
        resultado = {sucesso:true,autorizado:true,admin:{perfil:'ADMINISTRADOR'},solicitacao:detalhe};
      } else if (method === 'ctProdutorOnboardingAdminDecidirPROD') {
        expect(String(args[0] || '')).toBe(state.adminToken);
        const actionName=String(args[2]||'');
        state.previousStatus=state.status;
        state.adminActions.push(actionName);
        if(actionName==='INICIAR_ANALISE'){
          state.status='EM_ANALISE';
          resultado={sucesso:true,autorizado:true,solicitacao:requestFixture('EM_ANALISE')};
        }else if(actionName==='APROVAR'){
          state.status='ATIVO';
          resultado={
            sucesso:true,autorizado:true,produtorId:'PROD-E2E',
            indicacaoComercial:{sucesso:true,vinculou:true,parceiroId:'PCT-VINICIUS',produtorId:'PROD-E2E'},
            solicitacao:requestFixture('ATIVO')
          };
        }else{
          throw new Error('Ação inesperada: '+actionName);
        }
      } else {
        throw new Error('Método não previsto no E2E: ' + method);
      }
    } catch (e) {
      ok=false; erro=e&&e.message?e.message:String(e);
    }

    const payload=JSON.stringify({
      ctMinhaCariocaPost:true,id:requestId,ok,
      resultado:ok?resultado:null,
      erro:ok?'':erro
    }).replace(/</g,'\\u003c');

    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");<\/script></body></html>'
    });
  });
}

async function setSession(page, token) {
  await page.addInitScript(({storage,token}) => {
    if (!sessionStorage.getItem(storage) && !localStorage.getItem(storage)) {
      const value=JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
      sessionStorage.setItem(storage,value);
      localStorage.setItem(storage,value);
    }
  }, {storage:STORAGE,token});
}

test.describe('Onboarding do Produtor indicado', () => {
  test.skip(!BRANCH_MODE, 'Fluxo mutável roda na branch com backend simulado.');

  test('preserva VINICIUSCT no servidor e fecha solicitacao ate ATIVO', async ({ page }) => {
    const state={
      userToken:'CT-E2E-USER',
      adminToken:'CT-E2E-ADMIN',
      submitted:false,
      status:'',
      submitCalls:0,
      lastSubmit:null,
      adminActions:[],
      logoutCalls:0,
      detailCalls:0,
      staleDetailAfterDecision:true,
      staleListAfterDecision:true,
      previousStatus:''
    };

    await installRpcMock(page,state);
    await setSession(page,state.userToken);

    await page.goto('/produtor/solicitar/', {waitUntil:'domcontentloaded'});
    await expect(page.locator('#formCard')).toBeVisible({timeout:15000});
    await expect(page.locator('#refBadge')).toContainText('VINICIUSCT');

    await page.locator('#nomeFantasia').fill('Priscila Eventos');
    await page.locator('#razaoSocial').fill('Priscila Eventos LTDA');
    await page.locator('#cpfCnpj').fill('52998224725');
    await page.locator('#whatsapp').fill('81999990000');
    await page.locator('#cidade').fill('Jaboatão dos Guararapes');
    await page.locator('#uf').fill('PE');
    await page.locator('#instagram').fill('@priscila');
    await page.locator('#submitButton').click();

    await expect.poll(() => state.submitCalls).toBe(1);
    expect(state.lastSubmit).not.toHaveProperty('codigoIndicacao');
    expect(state.lastSubmit.nomeFantasia).toBe('Priscila Eventos');
    await expect(page.locator('#statusBadge')).toHaveText('ENVIADO', {timeout:15000});
    await expect(page.locator('#statusCard')).toBeVisible();

    await page.evaluate(({storage,token}) => {
      const value=JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
      sessionStorage.setItem(storage,value);
      localStorage.setItem(storage,value);
    }, {storage:STORAGE,token:state.adminToken});

    await page.goto('/produtor/solicitacoes/', {waitUntil:'domcontentloaded'});
    await expect(page.getByText('Priscila Eventos').first()).toBeVisible({timeout:15000});
    await page.getByText('Priscila Eventos').first().click();
    await expect(page.locator('#detailStatus')).toHaveText('ENVIADO');

    await page.getByRole('button',{name:'Iniciar análise'}).click();
    await page.locator('#confirmAction').click();
    await expect.poll(() => state.status).toBe('EM_ANALISE');
    await expect(page.locator('#detailStatus')).toHaveText('EM ANÁLISE', {timeout:15000});
    await expect(page.locator('#cSent')).toHaveText('0');
    await expect(page.locator('#cReview')).toHaveText('1');
    await expect(page.getByRole('button',{name:'Aprovar e ativar'})).toBeVisible();
    expect(state.detailCalls).toBe(1);

    await page.getByRole('button',{name:'Aprovar e ativar'}).click();
    await page.locator('#confirmAction').click();
    await expect.poll(() => state.status).toBe('ATIVO');
    await expect(page.locator('#detailStatus')).toHaveText('ATIVO', {timeout:15000});
    await expect(page.locator('#detail')).toContainText('PENDENTE_CREDENCIAL');
    await expect(page.locator('#detail')).toContainText('Financeiro ainda não liberado para vendas.');
    await expect(page.locator('#cReview')).toHaveText('0');
    await expect(page.locator('#cActive')).toHaveText('1');

    expect(state.adminActions).toEqual(['INICIAR_ANALISE','APROVAR']);
    expect(state.detailCalls).toBe(1);
  });

  test('permite sair do onboarding sem loopar de volta para a mesma sessao', async ({ page }) => {
    const state={
      userToken:'CT-E2E-USER',
      adminToken:'CT-E2E-ADMIN',
      submitted:true,
      status:'ENVIADO',
      submitCalls:0,
      lastSubmit:null,
      adminActions:[],
      logoutCalls:0
    };

    await installRpcMock(page,state);

    await page.goto('/', {waitUntil:'domcontentloaded'});
    await page.evaluate(({storage,token}) => {
      const value=JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
      sessionStorage.setItem(storage,value);
      localStorage.setItem(storage,value);
    }, {storage:STORAGE,token:state.userToken});

    await page.goto('/produtor/solicitar/', {waitUntil:'domcontentloaded'});
    await expect(page.locator('#logoutButton')).toBeVisible({timeout:15000});
    await page.locator('#logoutButton').click();

    await expect.poll(() => state.logoutCalls).toBe(1);
    await page.waitForURL(/\/produtor\/?(?:\?.*)?$/, {timeout:15000});

    const stored=await page.evaluate(storage => ({
      session:sessionStorage.getItem(storage),
      local:localStorage.getItem(storage)
    }), STORAGE);
    expect(stored.session).toBeNull();
    expect(stored.local).toBeNull();
  });
});
