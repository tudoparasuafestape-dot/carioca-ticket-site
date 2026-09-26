import { test, expect } from '@playwright/test';

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

function envelope(id,ok,resultado,erro=''){
  return JSON.stringify({
    ctMinhaCariocaPost:true,
    id,
    ok,
    resultado:ok?resultado:null,
    erro:ok?'':erro
  }).replace(/</g,'\\u003c');
}

async function seedProducer(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate((storage)=>{
    const value=JSON.stringify({
      token:'CT-PROD-CAMP-E2E',
      expiraEm:'2099-01-01T00:00:00.000Z'
    });
    sessionStorage.setItem(storage,value);
    localStorage.setItem(storage,value);
  },STORAGE);
}

function campaign(state,overrides={}){
  return {
    recompensaId:overrides.recompensaId||'RCP-E2E',
    campanhaId:overrides.campanhaId||'CMP-E2E',
    eventoId:'EVT-CAMP-E2E',
    nome:overrides.nome||'100 Cortesias E2E',
    descricao:overrides.descricao||'Os primeiros participantes elegíveis recebem cortesia.',
    modoValidacao:overrides.modoValidacao||state.mode||'AUTO_CLAIM',
    recompensaTipo:'CORTESIA',
    quantidadeVendas:1,
    limiteTotalPremios:100,
    limitePorPessoa:1,
    status:'ATIVA',
    statusConfigurado:'ATIVA',
    requisitos:overrides.requisitos||{},
    ctaTexto:'Quero participar',
    premiosEntregues:state.rewarded||0,
    premiosReservados:state.rewarded||0,
    disponiveis:Math.max(0,100-(state.rewarded||0)),
    tipoId:'TIPO-1',
    loteId:'LOTE-1',
    codigo:'EUVOUE2E',
    produtorId:'PROD-E2E',
    metricas:{
      participacoes:state.participations||0,
      premiadas:state.rewarded||0,
      aguardandoValidacao:state.awaiting||0,
      emissaoPendente:state.pending||0,
      reservadasPremios:(state.rewarded||0)+(state.pending||0),
      valorNominalTotal:(state.rewarded||0)*25,
      trafego:{cliques:state.clicks||12,compartilhamentos:state.shares||2}
    }
  };
}

function producerData(state){
  return {
    sucesso:true,
    autenticado:true,
    autorizado:true,
    eventoId:'EVT-CAMP-E2E',
    eventoNome:'Evento Campanha E2E',
    produtorId:'PROD-E2E',
    recompensas:state.hasCampaign?[campaign(state)]:[],
    tipos:[{id:'TIPO-1',nome:'Individual',status:'ATIVO',capacidadePorVenda:1,precoNumero:25}],
    lotes:[{id:'LOTE-1',eventoId:'EVT-CAMP-E2E',tipoId:'TIPO-1',nome:'1º lote',status:'ATIVO',precoNumero:25}]
  };
}

function publicData(state){
  const c=campaign(state,{
    requisitos:state.mode==='MANUAL'
      ? {provaRotulo:'Informe seu @ do Instagram',provaObrigatoria:true}
      : {}
  });
  return {
    sucesso:true,
    encontrada:true,
    disponivel:state.available!==false,
    recompensa:c,
    evento:{id:'EVT-CAMP-E2E',nome:'Evento Campanha E2E'}
  };
}

function participation(state,status){
  return {
    participacaoId:'PRT-E2E',
    status,
    motivo:status==='AGUARDANDO_VALIDACAO'
      ?'Aguardando validação do produtor'
      :'',
    nome:'Pessoa Campanha',
    whatsapp:'81*****0000',
    cortesiaId:status==='PREMIADA'?'CRT-CAMP-E2E':'',
    ingressos:status==='PREMIADA'
      ?[{
        id:'ING-E2E',
        codigo:'CT-CAMP-E2E',
        nome:'Pessoa Campanha',
        tipo:'Individual',
        loteNome:'1º lote',
        link:'https://cariocaticket.com.br/ingresso/?codigo=CT-CAMP-E2E&sig=ASSINADA'
      }]
      :[]
  };
}

async function installMock(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];
    try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    state.methods.push(method);

    let ok=true,resultado=null,erro='';
    try{
      if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        resultado={
          sucesso:true,
          autenticado:true,
          autorizado:true,
          usuario:{id:'USR-E2E',nome:'Produtor Teste',perfil:'PRODUTOR_TITULAR'},
          produtores:[{
            id:'PROD-E2E',
            nomeFantasia:'Produtor E2E',
            perfil:'PRODUTOR_TITULAR',
            eventos:[{id:'EVT-CAMP-E2E',nome:'Evento Campanha E2E'}]
          }]
        };
      }else if(method==='ctCampanhasRecompensasListarPROD'){
        state.listCalls++;
        expect(args[0]).toBe('CT-PROD-CAMP-E2E');
        expect(args[1]).toBe('EVT-CAMP-E2E');
        resultado=producerData(state);
      }else if(method==='ctCampanhasRecompensasSalvarPROD'){
        state.saveCalls++;
        const payload=args[2]||{};
        state.lastSave=payload;
        expect(args[0]).toBe('CT-PROD-CAMP-E2E');
        expect(args[1]).toBe('EVT-CAMP-E2E');
        expect(payload.tipoId).toBe('TIPO-1');
        expect(payload.loteId).toBe('LOTE-1');
        expect(['AUTO_CLAIM','MANUAL']).toContain(payload.modoValidacao);
        state.hasCampaign=true;
        state.mode=payload.modoValidacao;
        resultado={sucesso:true,recompensa:campaign(state)};
      }else if(method==='ctCampanhasRecompensasAlterarStatusPROD'){
        state.statusCalls++;
        resultado={sucesso:true,recompensa:campaign(state)};
      }else if(method==='ctCuponsCampanhasRegistrarCompartilhamentoPROD'){
        state.shareCalls++;
        resultado={sucesso:true};
      }else if(method==='ctCampanhasRecompensasParticipacoesPROD'){
        state.participantListCalls++;
        resultado={
          sucesso:true,
          recompensa:campaign(state),
          participacoes:[{
            participacaoId:'PRT-E2E',
            nome:'Pessoa Campanha',
            whatsapp:'81*****0000',
            email:'p***@example.com',
            status:state.approved?'PREMIADA':'AGUARDANDO_VALIDACAO',
            motivo:state.approved?'Recompensa emitida':'Aguardando validação do produtor',
            prova:{texto:'@pessoa_e2e'},
            cortesiaId:state.approved?'CRT-CAMP-E2E':'',
            ingressos:state.approved?participation(state,'PREMIADA').ingressos:[],
            valorNominalTotal:state.approved?25:0,
            tentativasEmissao:state.approved?1:0,
            ultimoErro:'',
            criadoEm:'2026-09-26T10:00:00.000Z',
            premiadoEm:state.approved?'2026-09-26T10:01:00.000Z':''
          }]
        };
      }else if(method==='ctCampanhasRecompensasValidarPROD'){
        state.validateCalls++;
        expect(args[2]).toBe('PRT-E2E');
        expect(args[3]).toBe('APROVAR');
        state.approved=true;
        state.rewarded=1;
        resultado={sucesso:true,participacao:participation(state,'PREMIADA')};
      }else if(method==='ctCampanhasRecompensasReprocessarPROD'){
        state.retryCalls++;
        resultado={sucesso:true,participacao:participation(state,'PREMIADA')};
      }else if(method==='ctCampanhasRecompensasPublicoCarregarPROD'){
        state.publicLoadCalls++;
        expect(args[0]).toBe('RCP-E2E');
        expect(String(args[1]||'')).toMatch(/^TRF-/);
        resultado=publicData(state);
      }else if(method==='ctCampanhasRecompensasPublicoParticiparPROD'){
        state.publicParticipateCalls++;
        const payload=args[1]||{};
        state.lastParticipation=payload;
        expect(String(payload.chaveIdempotencia||'')).toMatch(/^PUB-/);
        expect(payload.nome).toBe('Pessoa Campanha');
        expect(payload.whatsapp).toBe('81999990000');
        await new Promise(r=>setTimeout(r,120));
        if(state.exhausted){
          resultado={
            sucesso:true,
            participou:false,
            mensagem:'As recompensas desta campanha já se esgotaram.'
          };
        }else{
          state.participations++;
          const status=state.mode==='MANUAL'?'AGUARDANDO_VALIDACAO':'PREMIADA';
          if(status==='PREMIADA')state.rewarded++;
          resultado={
            sucesso:true,
            participou:true,
            idempotente:false,
            participacao:participation(state,status)
          };
        }
      }else{
        throw new Error('Método inesperado: '+method);
      }
    }catch(e){
      ok=false;
      erro=e&&e.message?e.message:String(e);
    }

    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\/script></body></html>'
    });
  });
}

function newState(overrides={}){
  return {
    mode:'AUTO_CLAIM',
    available:true,
    exhausted:false,
    hasCampaign:false,
    approved:false,
    rewarded:0,
    pending:0,
    awaiting:0,
    participations:0,
    clicks:12,
    shares:2,
    methods:[],
    listCalls:0,
    saveCalls:0,
    statusCalls:0,
    shareCalls:0,
    participantListCalls:0,
    validateCalls:0,
    retryCalls:0,
    publicLoadCalls:0,
    publicParticipateCalls:0,
    lastSave:null,
    lastParticipation:null,
    ...overrides
  };
}

test.describe('Campanhas com recompensa',()=>{
  test.skip(!BRANCH_MODE,'Campanhas mutáveis rodam somente na branch local simulada.');

  test('produtor cria campanha automática sem acionar checkout ou pagamento',async({page})=>{
    const state=newState();
    await installMock(page,state);
    await seedProducer(page);
    await page.goto('/produtor/campanhas/?evento=EVT-CAMP-E2E',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Campanhas com recompensa'})).toBeVisible();
    await page.locator('#newButton').click();
    await page.locator('#campaignName').fill('100 Cortesias E2E');
    await page.locator('#campaignDescription').fill('Os primeiros 100 participantes recebem cortesia.');
    await page.locator('#campaignCode').fill('EUVOUE2E');
    await page.locator('#validationMode').selectOption('AUTO_CLAIM');
    await page.locator('#totalLimit').fill('100');
    await page.locator('#personLimit').fill('1');
    await page.locator('#activateNow').check();
    await page.locator('#saveButton').click();

    await expect.poll(()=>state.saveCalls).toBe(1);
    expect(state.lastSave.modoValidacao).toBe('AUTO_CLAIM');
    expect(state.lastSave.limiteTotalPremios).toBe(100);
    await expect(page.getByText('100 Cortesias E2E').first()).toBeVisible();
    expect(state.methods.some(x=>/Checkout|Asaas|Pagamento|Venda/i.test(x))).toBe(false);
  });

  test('participação automática emite cortesia assinada e bloqueia duplo envio',async({page})=>{
    const state=newState({hasCampaign:true});
    await installMock(page,state);
    await page.goto('/campanha/?id=RCP-E2E&utm_source=instagram',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'100 Cortesias E2E'})).toBeVisible();
    await page.locator('#name').fill('Pessoa Campanha');
    await page.locator('#whatsapp').fill('81999990000');
    const submit=page.locator('#submitButton');
    await submit.click();
    await submit.click({force:true}).catch(()=>{});

    await expect.poll(()=>state.publicParticipateCalls).toBe(1);
    await expect(page.getByText('Participação aprovada! Sua cortesia já foi emitida.')).toBeVisible();
    await expect(page.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',/sig=ASSINADA/);
    expect(state.methods.some(x=>/Checkout|Asaas|Pagamento|Venda/i.test(x))).toBe(false);
  });

  test('campanha manual pede prova e produtor aprova participante mascarado',async({page})=>{
    const state=newState({
      mode:'MANUAL',
      hasCampaign:true,
      participations:1,
      awaiting:1
    });
    await installMock(page,state);

    await page.goto('/campanha/?id=RCP-E2E',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#proofField')).toBeVisible();
    await page.locator('#name').fill('Pessoa Campanha');
    await page.locator('#whatsapp').fill('81999990000');
    await page.locator('#proof').fill('@pessoa_e2e');
    await page.locator('#submitButton').click();

    await expect(page.getByText('O produtor fará a validação')).toBeVisible();
    expect(state.lastParticipation.prova.texto).toBe('@pessoa_e2e');

    await seedProducer(page);
    await page.goto('/produtor/campanhas/?evento=EVT-CAMP-E2E',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Participações'}).click();
    await expect(page.getByText('81*****0000')).toBeVisible();
    await expect(page.getByText('@pessoa_e2e')).toBeVisible();
    await page.getByRole('button',{name:'Aprovar'}).click();

    await expect.poll(()=>state.validateCalls).toBe(1);
    await expect(page.getByText('CT-CAMP-E2E')).toBeVisible();
  });

  test('campanha esgotada mostra mensagem pública segura e não repete participação',async({page})=>{
    const state=newState({hasCampaign:true,exhausted:true});
    await installMock(page,state);
    await page.goto('/campanha/?id=RCP-E2E',{waitUntil:'domcontentloaded'});
    await page.locator('#name').fill('Pessoa Campanha');
    await page.locator('#whatsapp').fill('81999990000');
    await page.locator('#submitButton').click();

    await expect(page.getByText('As recompensas desta campanha já se esgotaram.')).toBeVisible();
    await expect.poll(()=>state.publicParticipateCalls).toBe(1);
    await expect(page.locator('#submitButton')).toBeEnabled();
  });
});
