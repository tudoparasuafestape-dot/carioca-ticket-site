import { test, expect } from '@playwright/test';

test.use({serviceWorkers:'block'});

const BRANCH_MODE=String(process.env.CT_BRANCH_MODE||'')==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';
const CATALOG='ctPortalProdutorCarregarCatalogoEventosPROD';
const LOAD='ctCortesiasCarregarPROD';
const ISSUE='ctCortesiasEmitirPROD';
const SAVE='ctCortesiasSalvarConfigPROD';
const CANCEL='ctCortesiasCancelarPROD';
const CONSULT='ctConsultaIngressosOperacionalPROD';
const TICKET_ORIGIN='https://cariocaticket.com.br';

function ticketUrl(code,sig='ASSINADA_E2E_1234567890'){return TICKET_ORIGIN+'/ingresso/?codigo='+encodeURIComponent(code)+'&sig='+sig}
function consultation(code='CT-E2E-1',event='EVT-CORT-E2E',ticket={}){
  const phone=code.endsWith('2')?'11988880002':'81999990001';
  return {sucesso:true,autenticado:true,autorizado:true,filtroEvento:{eventoId:event},ingressos:[{codigo:code,eventoId:event,statusClasse:'VALIDO',compartilhamentoPermitido:true,telefone:phone,telefoneNormalizado:'55'+phone,ingressoCompartilhamentoUrl:ticketUrl(code),...ticket}]};
}
function historyTicket(page,code='CT-E2E-1'){return page.locator('#historyRows [data-history-code="'+code+'"]')}
async function mockClipboard(page,denied=false){
  await page.addInitScript(denied=>{
    window.copiedLinks=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(denied)throw new Error('NotAllowedError');window.copiedLinks.push(text)}}});
  },denied);
}

function fixture(overrides={}){
  return {privateEvent:false,issued:false,cancelled:false,limit:0,loadCalls:0,issueCalls:0,cancelCalls:0,methods:[],...overrides};
}
function catalog(producerId='PROD-E2E',eventos=[{id:'EVT-CORT-E2E',nome:'Evento Cortesia E2E'}]){
  return {sucesso:true,autenticado:true,autorizado:true,produtorId:producerId,eventos};
}
function calls(state,method){return state.calls.filter(call=>call.method===method)}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function eventData(id,producerId='PROD-E2E',options={}){
  return {...baseData(fixture(options)),evento:{id,nome:id},produtorId:producerId,
    tipos:[{id:'TIPO-'+id,nome:'Tipo '+id,capacidadePorVenda:1},{id:'TIPO2-'+id,nome:'Dupla '+id,capacidadePorVenda:2}],
    lotes:[{id:'LOTE-'+id,tipoId:'TIPO-'+id,nome:'Lote '+id,precoNumero:25},{id:'LOTE2-'+id,tipoId:'TIPO2-'+id,nome:'Lote dupla '+id,precoNumero:40}]};
}

async function openCourtesy(page,state,query=''){
  await installMock(page,state);
  await seed(page);
  await page.goto('/produtor/cortesias/'+query,{waitUntil:'domcontentloaded'});
}
async function ready(page){await expect(page.locator('#content')).toBeVisible();await expect(page.locator('#issueButton')).toBeEnabled()}
async function cleared(page){
  await expect(page.locator('#content')).toBeHidden();
  for(const id of ['typeSelect','lotSelect','guestSelect','historyRows','resultTickets'])await expect(page.locator('#'+id)).toBeEmpty();
  await expect(page.locator('#guestsLink')).toBeHidden();
  await expect(page.locator('#guestsLink')).not.toHaveAttribute('href');
  for(const id of ['name','whatsapp','reason'])await expect(page.locator('#'+id)).toHaveValue('');
}

function envelope(id,ok,resultado,erro=''){
  return JSON.stringify({
    ctMinhaCariocaPost:true,
    id,
    ok,
    resultado:ok?resultado:null,
    erro:ok?'':erro
  }).replace(/</g,'\\u003c');
}

async function seed(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate((storage)=>{
    const value=JSON.stringify({
      token:'CT-PROD-CORTESIA-E2E',
      expiraEm:'2099-01-01T00:00:00.000Z'
    });
    sessionStorage.setItem(storage,value);
    localStorage.setItem(storage,value);
  },STORAGE);
}

function baseData(state){
  const active=state.issued?2:0;
  return {
    sucesso:true,
    autenticado:true,
    autorizado:true,
    evento:{id:'EVT-CORT-E2E',nome:'Evento Cortesia E2E',status:'PUBLICADO'},
    produtorId:'PROD-E2E',
    tipos:[{id:'TIPO-1',nome:'Individual',status:'ATIVO',capacidadePorVenda:1,precoNumero:25}],
    lotes:[{id:'LOTE-1',eventoId:'EVT-CORT-E2E',tipoId:'TIPO-1',nome:'1º lote',status:'ATIVO',precoNumero:25}],
    config:{limiteCortesiasAcessos:state.limit||0,limitado:Number(state.limit||0)>0},
    resumo:{
      emissoesAtivas:state.issued?1:0,
      emissoesCanceladas:state.cancelled?1:0,
      acessosCortesiaAtivos:active,
      valorNominalConcedidoNumero:state.issued?50:0,
      porTipo:{},
      porOrigem:{}
    },
    operacional:{
      acessosCortesiaAtivos:active,
      acessosCortesiaCancelados:state.cancelled?2:0,
      valorCobradoCortesiaNumero:0,
      porTipo:{},
      porOrigem:{}
    },
    reconciliacao:{
      acessosLedger:active,
      acessosIngressos:active,
      consistente:true,
      valorCobradoCortesiaNumero:0
    },
    privado:state.privateEvent?{
      privado:true,
      convidados:[{
        convidadoId:'GUEST-1',
        nomeCompleto:'Convidado Privado',
        telefoneMascara:'81*****0000',
        quantidadeMaxima:2,
        quantidadeConsumida:0,
        conviteId:'INV-1',
        conviteStatus:'ATIVO',
        disponivel:2
      }]
    }:{privado:false,convidados:[]},
    recentes:state.history||(state.issued?[{
      cortesiaId:'CRT-E2E',
      tipoNome:'Individual',
      loteNome:'1º lote',
      quantidadeVendas:2,
      quantidadeAcessos:2,
      destinatarioNome:state.privateEvent?'Convidado Privado':'Pessoa Cortesia',
      whatsappMascara:'81*****0000',
      motivo:'Relacionamento',
      suborigem:state.privateEvent?'CONVIDADO_PRIVADO':'MANUAL',
      status:state.cancelled?'CANCELADA':'EMITIDA',
      valorNominalTotalNumero:50,
      codigos:['CT-E2E-1','CT-E2E-2']
    }]:[]),
    regras:{
      maxPorOperacao:20,
      consomeCapacidade:true,
      geraCobranca:false,
      geraTaxa:false,
      geraComissao:false
    }
  };
}

async function installMock(page,state){
  state.calls=[];
  // Only the local candidate and the mocked RPC transport may load. No real mutation can escape.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    state.methods.push(method);
    state.calls.push({method,args});
    let ok=true,resultado=null,erro='';
    try{
      expect(args[0]).toBe('CT-PROD-CORTESIA-E2E');
      const custom=state.onRequest?await state.onRequest({method,args}):undefined;
      if(custom!==undefined){resultado=custom}
      else if(method==='ctPortalProdutorRestaurarSessaoIsoladaPROD'){
        resultado={
          sucesso:true,
          autenticado:true,
          autorizado:true,
          usuario:{id:'USR-E2E',nome:'Produtor Teste',perfil:'PRODUTOR_TITULAR'},
          produtores:(state.producers||[{
            id:'PROD-E2E',
            nomeFantasia:'Produtor E2E',
            perfil:'PRODUTOR_TITULAR'
          }]).map(producer=>({...producer,eventos:[],catalogoEventosPendente:true}))
        };
      }else if(method===CATALOG){
        expect((state.producers||[{id:'PROD-E2E'}]).some(p=>p.id===args[1])).toBe(true);
        resultado=state.catalogs?.[args[1]]||catalog();
      }else if(method==='ctCortesiasCarregarPROD'){
        state.loadCalls++;
        expect(args[0]).toBe('CT-PROD-CORTESIA-E2E');
        expect(args[1]).toBe('EVT-CORT-E2E');
        resultado=baseData(state);
      }else if(method===CONSULT){
        expect(args[3]).toBe('');
        resultado=consultation(args[2],args[1]);
      }else if(method==='ctCortesiasSalvarConfigPROD'){
        state.limit=Number(args[2]?.limiteCortesiasAcessos||0);
        resultado={sucesso:true,eventoId:'EVT-CORT-E2E',limiteCortesiasAcessos:state.limit,limitado:state.limit>0};
      }else if(method==='ctCortesiasEmitirPROD'){
        state.issueCalls++;
        const payload=args[2]||{};
        expect(String(payload.chaveIdempotencia||'')).toMatch(/^CRTUI-/);
        expect(payload.tipoId).toBe('TIPO-1');
        expect(payload.loteId).toBe('LOTE-1');
        expect(Number(payload.quantidadeVendas)).toBe(2);
        if(state.privateEvent)expect(payload.convidadoId).toBe('GUEST-1');
        else expect(String(payload.convidadoId||'')).toBe('');
        await new Promise(r=>setTimeout(r,120));
        state.issued=true;
        resultado={
          sucesso:true,
          idempotente:false,
          cortesiaId:'CRT-E2E',
          eventoId:'EVT-CORT-E2E',
          quantidadeVendas:2,
          quantidadeAcessos:2,
          valorCobradoNumero:0,
          valorNominalUnitario:25,
          valorNominalTotal:50,
          formaPagamento:'CORTESIA',
          origem:state.privateEvent?'CORTESIA_CONVIDADO_PRIVADO':'CORTESIA_MANUAL',
          ingressos:[
            {id:'1',codigo:'CT-E2E-1',nome:state.privateEvent?'Convidado Privado':'Pessoa Cortesia',tipo:'Individual',loteNome:'1º lote',link:'https://cariocaticket.com.br/ingresso/?codigo=CT-E2E-1&sig=ASSINADA_E2E_1234567890'},
            {id:'2',codigo:'CT-E2E-2',nome:state.privateEvent?'Convidado Privado':'Pessoa Cortesia',tipo:'Individual',loteNome:'1º lote',link:'https://cariocaticket.com.br/ingresso/?codigo=CT-E2E-2&sig=ASSINADA_E2E_1234567890'}
          ],
          mensagem:'Cortesia emitida com sucesso.'
        };
      }else if(method==='ctCortesiasCancelarPROD'){
        state.cancelCalls++;
        expect(args[2]).toBe('CRT-E2E');
        state.cancelled=true;
        state.issued=false;
        resultado={sucesso:true,cortesiaId:'CRT-E2E',cancelada:true,ingressosCancelados:2,reconciliacaoPrivada:state.privateEvent};
      }else{
        throw new Error('Método inesperado: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\/script></body></html>'
    });
  });
}

test.describe('Cortesias do produtor',()=>{
  test.skip(!BRANCH_MODE,'Cortesias mutáveis rodam somente na branch local simulada.');

  test('emite sem pagamento, mostra links assinados e impede clique duplicado',async({page})=>{
    const state={privateEvent:false,issued:false,cancelled:false,limit:0,loadCalls:0,issueCalls:0,cancelCalls:0,methods:[]};
    await installMock(page,state);
    await seed(page);
    await page.goto('/produtor/cortesias/?evento=EVT-CORT-E2E',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Cortesias do evento'})).toBeVisible();
    await expect(page.getByText('não gera pagamento, taxa Carioca Ticket, comissão ou faturamento')).toBeVisible();
    await page.locator('#name').fill('Pessoa Cortesia');
    await page.locator('#whatsapp').fill('81999990000');
    await page.locator('#quantity').fill('2');
    await page.locator('#reason').fill('Relacionamento');

    const issue=page.locator('#issueButton');
    await expect(issue).toBeEnabled();
    await issue.evaluate(button=>{button.click();button.dispatchEvent(new Event('click'))});

    await expect.poll(()=>state.issueCalls).toBe(1);
    await expect(page.getByRole('link',{name:'Abrir ingresso'}).first()).toHaveAttribute('href',/sig=ASSINADA_E2E_1234567890/);
    await expect(page.locator('#chargedCourtesy')).toHaveText('R$ 0,00');
    expect(state.methods.some(x=>/Pagamento|Asaas|Venda|Checkout/i.test(x))).toBe(false);
  });

  test('evento privado exige e vincula convidado autorizado',async({page})=>{
    const state={privateEvent:true,issued:false,cancelled:false,limit:0,loadCalls:0,issueCalls:0,cancelCalls:0,methods:[]};
    await installMock(page,state);
    await seed(page);
    await page.goto('/produtor/cortesias/?evento=EVT-CORT-E2E&convidado=GUEST-1',{waitUntil:'domcontentloaded'});

    await expect(page.locator('#privateNote')).toBeVisible();
    await expect(page.locator('#guestSelect')).toHaveValue('GUEST-1');
    await expect(page.locator('#name')).toHaveValue('Convidado Privado');
    await page.locator('#whatsapp').fill('81999990000');
    await page.locator('#quantity').fill('2');
    await page.locator('#reason').fill('Convidado da família');
    await page.locator('#issueButton').click();

    await expect.poll(()=>state.issueCalls).toBe(1);
    await expect(page.locator('#activeCourtesy')).toHaveText('2');
  });

  test('salva limite e cancela cortesia somente após confirmação',async({page})=>{
    const state={privateEvent:false,issued:true,cancelled:false,limit:0,loadCalls:0,issueCalls:0,cancelCalls:0,methods:[]};
    await installMock(page,state);
    await seed(page);
    page.on('dialog',async dialog=>{
      if(dialog.type()==='prompt')await dialog.accept('Correção de lista');
      else await dialog.accept();
    });
    await page.goto('/produtor/cortesias/?evento=EVT-CORT-E2E',{waitUntil:'domcontentloaded'});

    await page.locator('#courtesyLimit').fill('100');
    await page.locator('#saveLimitButton').click();
    await expect.poll(()=>state.limit).toBe(100);

    await page.getByRole('button',{name:'Cancelar'}).click();
    await expect.poll(()=>state.cancelCalls).toBe(1);
    await expect(page.locator('#activeCourtesy')).toHaveText('0');
  });
});

test.describe('Catálogo progressivo e isolamento de Cortesias',()=>{
  test.skip(!BRANCH_MODE,'Somente branch local com RPCs simuladas.');

  test('Snapshot pendente carrega todos os eventos, inclusive sem nome, e preserva seleção ao atualizar',async({page})=>{
    const state=fixture({catalogs:{'PROD-E2E':catalog('PROD-E2E',[
      {id:'A',nome:'Evento A',status:'PUBLICADO'},{id:'B',detalhePendente:true}
    ])},onRequest:({method,args})=>method===LOAD?eventData(args[1]):undefined});
    await openCourtesy(page,state,'?evento=B');
    await ready(page);
    expect(calls(state,CATALOG).map(c=>c.args)).toEqual([['CT-PROD-CORTESIA-E2E','PROD-E2E']]);
    await expect(page.locator('#eventSelect option')).toHaveText(['Evento A','B']);
    await expect(page.locator('#eventSelect')).toHaveValue('B');
    await expect(page.locator('#typeSelect')).toHaveValue('TIPO-B');
    await expect(page.locator('#lotSelect')).toHaveValue('LOTE-B');
    await page.locator('#typeSelect').selectOption('TIPO2-B');
    await expect(page.locator('#lotSelect')).toHaveValue('LOTE2-B');
    await expect(page.locator('#accessCount')).toHaveText('2');
    await page.locator('#eventSelect').selectOption('A');
    await ready(page);
    await expect(page.locator('#typeSelect')).toHaveValue('TIPO-A');
    await expect(page.locator('#lotSelect')).toHaveValue('LOTE-A');
    await page.locator('#refreshButton').click();
    await ready(page);
    await expect(page.locator('#eventSelect')).toHaveValue('A');
    expect(calls(state,CATALOG)).toHaveLength(2);
    expect(calls(state,LOAD).map(c=>c.args[1])).toEqual(['B','A','A']);
    expect(calls(state,SAVE)).toHaveLength(0);
  });

  test('URL não autorizada nunca é enviada para carregar cortesias',async({page})=>{
    const state=fixture();
    await openCourtesy(page,state,'?evento=EVT-NAO-AUTORIZADO');
    await ready(page);
    await expect(page.locator('#eventSelect')).toHaveValue('EVT-CORT-E2E');
    expect(calls(state,LOAD).map(c=>c.args[1])).toEqual(['EVT-CORT-E2E']);
  });

  test('convidado fora da lista autorizada não é selecionado nem permite emitir',async({page})=>{
    const state=fixture({privateEvent:true});
    await openCourtesy(page,state,'?evento=EVT-CORT-E2E&convidado=OUTRO');
    await ready(page);
    await expect(page.locator('#guestSelect')).toHaveValue('');
    await page.locator('#name').fill('Pessoa Cortesia');
    await page.locator('#whatsapp').fill('81999990000');
    await page.locator('#reason').fill('Relacionamento');
    await page.locator('#issueButton').click();
    await expect(page.locator('#message')).toContainText('Selecione o convidado autorizado');
    expect(calls(state,ISSUE)).toHaveLength(0);
  });

  for(const context of ['evento','produtor']){
    test(`troca de ${context} limpa imediatamente formulário, tipos, convidados, histórico e links`,async({page})=>{
      const waiting=deferred();
      const state=fixture({privateEvent:true,issued:true,
        producers:[{id:'PROD-E2E',perfil:'PRODUTOR_TITULAR'},{id:'PROD-B',perfil:'ADMINISTRADOR'}],
        catalogs:{'PROD-E2E':catalog('PROD-E2E',[{id:'EVT-CORT-E2E'},{id:'B'}])},
        onRequest:({method,args})=>{
          if(context==='produtor'&&method===CATALOG&&args[1]==='PROD-B')return waiting.promise;
          if(method===LOAD&&args[1]==='B')return context==='evento'?waiting.promise:eventData('B','PROD-B');
        }});
      await openCourtesy(page,state,'?evento=EVT-CORT-E2E&convidado=GUEST-1');
      await ready(page);
      await page.locator('#whatsapp').fill('81999990000');
      await page.locator('#quantity').fill('2');
      await page.locator('#reason').fill('Relacionamento');
      await page.locator('#issueButton').click();
      await expect(page.locator('#resultTickets a').first()).toBeVisible();
      await ready(page);
      await expect(page.locator('#historyRows')).toContainText('CT-E2E-1');
      await page.locator(context==='evento'?'#eventSelect':'#producerSelect').selectOption(context==='evento'?'B':'PROD-B');
      await cleared(page);
      await expect(page.locator('#activeCourtesy')).toHaveText('0');
      waiting.resolve(context==='evento'?eventData('B'):catalog('PROD-B',[{id:'B'}]));
      await ready(page);
      await expect(page.locator('#typeSelect')).toHaveValue('TIPO-B');
      await expect(page.locator('#lotSelect')).toHaveValue('LOTE-B');
      await expect(page.locator('#privateNote')).toBeHidden();
      await expect(page.locator('#historyRows')).not.toContainText('CT-E2E-1');
      await expect(page.locator('#resultTickets')).toBeEmpty();
      if(context==='produtor')expect(calls(state,CATALOG).map(c=>c.args[1])).toEqual(['PROD-E2E','PROD-B']);
    });
  }

  test('catálogo vazio bloqueia emissão e permite atualizar após novos vínculos',async({page})=>{
    const state=fixture({catalogs:{'PROD-E2E':catalog('PROD-E2E',[])}});
    await openCourtesy(page,state);
    await expect(page.locator('#message')).toContainText('Nenhum evento autorizado');
    await cleared(page);
    await expect(page.locator('#eventSelect')).toBeDisabled();
    await expect(page.locator('#loadButton')).toBeDisabled();
    await expect(page.locator('#issueButton')).toBeDisabled();
    expect(calls(state,LOAD)).toHaveLength(0);
    state.catalogs['PROD-E2E']=catalog();
    await page.locator('#refreshButton').click();
    await ready(page);
  });

  const badCatalogs=[
    ['não autenticado',()=>({...catalog(),autenticado:false})],
    ['negado',()=>({...catalog(),autorizado:false})],
    ['sem sucesso',()=>({...catalog(),sucesso:false})],
    ['outro produtor',()=>catalog('PROD-OUTRO')],
    ['sem identidade',()=>({...catalog(),produtorId:undefined})],
    ['eventos malformados',()=>({...catalog(),eventos:{id:'A'}})],
    ['evento inválido',()=>catalog('PROD-E2E',[{id:'A'},{}])],
    ['erro de transporte',()=>{throw new Error('Falha simulada do catálogo')}]
  ];
  for(const [label,response] of badCatalogs){
    test(`catálogo ${label} falha fechado e permite tentar novamente`,async({page})=>{
      let failing=true;
      const state=fixture({onRequest:({method})=>method===CATALOG&&failing?response():undefined});
      await openCourtesy(page,state);
      await expect(page.locator('#message')).toHaveClass(/error/);
      await cleared(page);
      await expect(page.locator('#eventSelect')).toBeDisabled();
      await expect(page.locator('#issueButton')).toBeDisabled();
      expect(calls(state,LOAD)).toHaveLength(0);
      failing=false;
      await page.getByRole('button',{name:'Tentar novamente'}).click();
      await ready(page);
      expect(calls(state,CATALOG)).toHaveLength(2);
      expect(calls(state,LOAD)).toHaveLength(1);
    });
  }

  for(const staleError of [false,true]){
    test(`catálogo A→B→A ignora ${staleError?'erro':'sucesso'} antigo e seu finally durante carregamento novo`,async({page})=>{
      const oldA=deferred(),oldB=deferred(),newA=deferred();
      let countA=0;
      const state=fixture({producers:[{id:'PROD-E2E',perfil:'PRODUTOR_TITULAR'},{id:'PROD-B',perfil:'ADMINISTRADOR'}],
        onRequest:({method,args})=>{
          if(method===CATALOG)return args[1]==='PROD-B'?oldB.promise:++countA===1?oldA.promise:newA.promise;
          if(method===LOAD)return eventData(args[1]);
        }});
      await openCourtesy(page,state);
      await expect.poll(()=>calls(state,CATALOG).length).toBe(1);
      await page.locator('#producerSelect').selectOption('PROD-B');
      await expect.poll(()=>calls(state,CATALOG).length).toBe(2);
      await page.locator('#producerSelect').selectOption('PROD-E2E');
      await expect.poll(()=>calls(state,CATALOG).length).toBe(3);
      if(staleError)oldA.reject(new Error('Erro antigo A'));else oldA.resolve(catalog('PROD-E2E',[{id:'ANTIGO'}]));
      await expect(page.locator(`input[name="metodo"][value="${CATALOG}"]`)).toHaveCount(2);
      await expect(page.locator('#loadButton')).toHaveText('Carregando eventos...');
      await expect(page.locator('#loadButton')).toBeDisabled();
      await expect(page.locator('#refreshButton')).toBeDisabled();
      await expect(page.locator('#message')).toContainText('Carregando eventos autorizados');
      expect(calls(state,LOAD)).toHaveLength(0);
      newA.resolve(catalog('PROD-E2E',[{id:'ATUAL'}]));
      await ready(page);
      if(staleError)oldB.resolve(catalog('PROD-B',[{id:'ERRADO'}]));else oldB.reject(new Error('Erro antigo B'));
      await expect(page.locator(`input[name="metodo"][value="${CATALOG}"]`)).toHaveCount(0);
      await expect(page.locator('#eventSelect')).toHaveValue('ATUAL');
      await expect(page.locator('#typeSelect')).toHaveValue('TIPO-ATUAL');
      await expect(page.locator('#message')).toHaveClass(/ok/);
      expect(calls(state,LOAD).map(c=>c.args[1])).toEqual(['ATUAL']);
    });

    test(`dados A→B→A ignoram ${staleError?'erro':'sucesso'} antigo e preservam carregamento atual`,async({page})=>{
      const oldA=deferred(),oldB=deferred(),newA=deferred();
      let countA=0;
      const state=fixture({catalogs:{'PROD-E2E':catalog('PROD-E2E',[{id:'A'},{id:'B'}])},
        onRequest:({method,args})=>method===LOAD?(args[1]==='B'?oldB.promise:++countA===1?oldA.promise:newA.promise):undefined});
      await openCourtesy(page,state);
      await expect.poll(()=>calls(state,LOAD).length).toBe(1);
      await page.locator('#eventSelect').selectOption('B');
      await expect.poll(()=>calls(state,LOAD).length).toBe(2);
      await page.locator('#eventSelect').selectOption('A');
      await expect.poll(()=>calls(state,LOAD).length).toBe(3);
      if(staleError)oldA.reject(new Error('Erro antigo A'));else oldA.resolve(eventData('ANTIGO'));
      await expect(page.locator(`input[name="metodo"][value="${LOAD}"]`)).toHaveCount(2);
      await cleared(page);
      await expect(page.locator('#loadButton')).toHaveText('Carregando evento...');
      await expect(page.locator('#refreshButton')).toBeDisabled();
      newA.resolve(eventData('A'));
      await ready(page);
      if(staleError)oldB.resolve(eventData('B'));else oldB.reject(new Error('Erro antigo B'));
      await expect(page.locator(`input[name="metodo"][value="${LOAD}"]`)).toHaveCount(0);
      await expect(page.locator('#eventSelect')).toHaveValue('A');
      await expect(page.locator('#typeSelect')).toHaveValue('TIPO-A');
      await expect(page.locator('#message')).toHaveClass(/ok/);
      await expect(page.locator('#loadButton')).toBeEnabled();
    });
  }

  for(const denied of [false,true]){
    test(`carregamento de cortesias ${denied?'negado':'com erro'} permite retry sem dados anteriores`,async({page})=>{
      let failing=true;
      const state=fixture({onRequest:({method})=>{
        if(method===LOAD&&failing){if(denied)return {...baseData(fixture()),autorizado:false};throw new Error('Falha simulada de carregamento')}
      }});
      await openCourtesy(page,state);
      await expect(page.locator('#message')).toHaveClass(/error/);
      await cleared(page);
      await expect(page.locator('#loadButton')).toBeEnabled();
      failing=false;
      await page.locator('#loadButton').click();
      await ready(page);
      expect(calls(state,LOAD)).toHaveLength(2);
    });
  }

  test('cliques repetidos não duplicam catálogo nem carregamento',async({page})=>{
    const cat=deferred(),data=deferred();
    let hold=false;
    const state=fixture({onRequest:({method})=>hold?(method===CATALOG?cat.promise:method===LOAD?data.promise:undefined):undefined});
    await openCourtesy(page,state);
    await ready(page);
    hold=true;
    await page.evaluate(()=>{for(let i=0;i<4;i++)document.querySelector('#refreshButton').dispatchEvent(new Event('click'))});
    await expect.poll(()=>calls(state,CATALOG).length).toBe(2);
    cat.resolve(catalog());
    await expect.poll(()=>calls(state,LOAD).length).toBe(2);
    await page.evaluate(()=>{for(let i=0;i<4;i++)for(const id of ['loadButton','refreshButton'])document.getElementById(id).dispatchEvent(new Event('click'))});
    data.resolve(baseData(state));
    await ready(page);
    expect(calls(state,CATALOG)).toHaveLength(2);
    expect(calls(state,LOAD)).toHaveLength(2);
  });

  for(const method of [ISSUE,SAVE,CANCEL]){
    test(`${method} bloqueia troca de contexto e mutações concorrentes até recarregar`,async({page})=>{
      const mutation=deferred(),reload=deferred();
      let mutating=false;
      const state=fixture({issued:true,producers:[{id:'PROD-E2E',perfil:'PRODUTOR_TITULAR'},{id:'PROD-B',perfil:'ADMINISTRADOR'}],
        catalogs:{'PROD-E2E':catalog('PROD-E2E',[{id:'EVT-CORT-E2E'},{id:'B'}])},
        onRequest:({method:requested})=>{
          if(requested===method){mutating=true;return mutation.promise}
          if(requested===LOAD&&mutating)return reload.promise;
        }});
      await openCourtesy(page,state);
      await ready(page);
      await page.locator('#name').fill('Pessoa Cortesia');
      await page.locator('#whatsapp').fill('81999990000');
      await page.locator('#reason').fill('Relacionamento');
      page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'Correção simulada':undefined));
      await page.locator(method===ISSUE?'#issueButton':method===SAVE?'#saveLimitButton':'[data-cancel]').click();
      await expect.poll(()=>calls(state,method).length).toBe(1);
      for(const id of ['producerSelect','eventSelect','refreshButton','loadButton','issueButton','saveLimitButton'])await expect(page.locator('#'+id)).toBeDisabled();
      await page.evaluate(()=>{
        for(const [id,value] of [['producerSelect','PROD-B'],['eventSelect','B']]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change'))}
        for(let i=0;i<3;i++)for(const sel of ['#issueButton','#saveLimitButton','[data-cancel]','#refreshButton','#loadButton'])document.querySelector(sel).dispatchEvent(new Event('click'));
      });
      await expect(page.locator('#producerSelect')).toHaveValue('PROD-E2E');
      await expect(page.locator('#eventSelect')).toHaveValue('EVT-CORT-E2E');
      expect(state.calls.filter(c=>[ISSUE,SAVE,CANCEL].includes(c.method))).toHaveLength(1);
      expect(calls(state,CATALOG)).toHaveLength(1);
      mutation.resolve({sucesso:true});
      await expect.poll(()=>calls(state,LOAD).length).toBe(2);
      await expect(page.locator('#producerSelect')).toBeDisabled();
      await expect(page.locator('#eventSelect')).toBeDisabled();
      reload.resolve(baseData(state));
      await ready(page);
      await expect(page.locator('#producerSelect')).toBeEnabled();
      await expect(page.locator('#eventSelect')).toBeEnabled();
      expect(calls(state,method)[0].args[1]).toBe('EVT-CORT-E2E');
    });
  }

  test('retry de emissão preserva payload e chave de idempotência após erro e atualização',async({page})=>{
    let attempts=0;
    const state=fixture({onRequest:({method})=>{
      if(method===ISSUE){if(++attempts===1)throw new Error('Resposta de emissão indisponível');return {sucesso:true}}
    }});
    await openCourtesy(page,state);
    await ready(page);
    await page.locator('#name').fill('Pessoa Cortesia');
    await page.locator('#whatsapp').fill('(81) 99999-0000');
    await page.locator('#quantity').fill('2');
    await page.locator('#reason').fill('Relacionamento');
    await page.locator('#issueButton').click();
    await expect(page.locator('#message')).toContainText('Resposta de emissão indisponível');
    await page.locator('#refreshButton').click();
    await ready(page);
    await page.locator('#issueButton').click();
    await expect.poll(()=>calls(state,ISSUE).length).toBe(2);
    const [first,retry]=calls(state,ISSUE);
    expect(retry.args).toEqual(first.args);
    expect(first.args[2]).toEqual({chaveIdempotencia:expect.stringMatching(/^CRTUI-/),nome:'Pessoa Cortesia',whatsapp:'81999990000',tipoId:'TIPO-1',loteId:'LOTE-1',quantidadeVendas:2,motivo:'Relacionamento',suborigem:'MANUAL',convidadoId:''});
    await ready(page);
  });

  for(const retryButton of ['loadButton','refreshButton']){
    test(`emissão confirmada preserva links após falha transitória e retry por ${retryButton}`,async({page})=>{
      let failReload=true;
      let failCatalog=retryButton==='refreshButton';
      const retry=deferred();
      const state=fixture({catalogs:{'PROD-E2E':catalog('PROD-E2E',[{id:'EVT-CORT-E2E'},{id:'OUTRO'}])},onRequest:({method,args})=>{
        if(method===CATALOG&&state.issued&&failCatalog)throw new Error('Falha transitória do catálogo após emissão');
        if(method===LOAD&&args[1]==='OUTRO')return eventData('OUTRO');
        if(method===LOAD&&state.issued){
          if(failReload)throw new Error('Falha transitória após emissão confirmada');
          return retry.promise;
        }
      }});
      await openCourtesy(page,state);
      await ready(page);
      await page.locator('#name').fill('Pessoa Cortesia');
      await page.locator('#whatsapp').fill('81999990000');
      await page.locator('#quantity').fill('2');
      await page.locator('#reason').fill('Relacionamento');
      await page.locator('#issueButton').click();
      await expect(page.locator('#message')).toContainText('Falha transitória após emissão confirmada');
      await expect(page.locator('#message')).toContainText('A cortesia já foi emitida');
      await expect(page.locator('#content')).toBeHidden();
      await expect(page.locator('#issueButton')).toBeDisabled();
      // Retained for this context, but hidden until a fresh response revalidates access.
      const links=page.locator('#resultTickets a').filter({hasText:'Abrir ingresso'});
      await expect(links).toHaveCount(2,{timeout:2000});
      await expect(links.first()).toBeHidden();
      const confirmedLinks=await links.evaluateAll(items=>items.map(item=>item.getAttribute('href')));
      failReload=false;
      await page.locator('#'+retryButton).click();
      if(failCatalog){
        await expect(page.locator('#message')).toContainText('Falha transitória do catálogo após emissão');
        await expect(links).toHaveCount(2);
        await expect(links.first()).toBeHidden();
        failCatalog=false;
        await page.getByRole('button',{name:'Tentar novamente'}).click();
      }
      await expect.poll(()=>calls(state,LOAD).length).toBe(3);
      await expect(links.first()).toBeHidden();
      await page.evaluate(()=>document.querySelector('#issueButton').dispatchEvent(new Event('click')));
      expect(calls(state,ISSUE)).toHaveLength(1);
      retry.resolve(baseData(state));
      await ready(page);
      await expect(links.first()).toBeVisible();
      expect(await links.evaluateAll(items=>items.map(item=>item.getAttribute('href')))).toEqual(confirmedLinks);
      expect(confirmedLinks).toEqual([ticketUrl('CT-E2E-1'),ticketUrl('CT-E2E-2')]);
      expect(calls(state,ISSUE)).toHaveLength(1);
      await expect(page.locator('#activeCourtesy')).toHaveText('2');
      await page.locator('#eventSelect').selectOption('OUTRO');
      await ready(page);
      await expect(page.locator('#resultTickets')).toBeEmpty();
      await page.locator('#eventSelect').selectOption('EVT-CORT-E2E');
      await ready(page);
      await expect(page.locator('#resultTickets')).toBeEmpty();
      expect(calls(state,ISSUE)).toHaveLength(1);
    });
  }

  for(const deniedField of ['autenticado','autorizado'])for(const deniedMethod of [LOAD,CATALOG]){
    test(`emissão confirmada descarta links se ${deniedMethod} nega ${deniedField}`,async({page})=>{
      let denied=true;
      const state=fixture({onRequest:({method})=>{
        if(method===deniedMethod&&state.issued&&denied)return {...(method===CATALOG?catalog():baseData(state)),[deniedField]:false};
      }});
      await openCourtesy(page,state);
      await ready(page);
      await page.locator('#name').fill('Pessoa Cortesia');
      await page.locator('#whatsapp').fill('81999990000');
      await page.locator('#quantity').fill('2');
      await page.locator('#reason').fill('Relacionamento');
      await page.locator('#issueButton').click();
      if(deniedMethod===CATALOG){
        await expect.poll(()=>calls(state,ISSUE).length).toBe(1);
        await ready(page);
        await expect(page.locator('#resultTickets a').first()).toBeVisible();
        await page.locator('#refreshButton').click();
      }
      await expect(page.locator('#message')).toHaveClass(/error/);
      await expect(page.locator('#resultTickets')).toBeEmpty();
      for(const id of ['name','whatsapp','reason'])await expect(page.locator('#'+id)).toHaveValue('');
      await expect(page.locator('#content')).toBeHidden();
      await expect(page.locator('#issueButton')).toBeDisabled();
      denied=false;
      await page.locator('#loadButton').click();
      await ready(page);
      await expect(page.locator('#resultTickets')).toBeEmpty();
      expect(calls(state,ISSUE)).toHaveLength(1);
    });
  }

  test('atualização remove seleção revogada e usa apenas o catálogo atual',async({page})=>{
    const state=fixture({onRequest:({method,args})=>method===LOAD?eventData(args[1]):undefined});
    await openCourtesy(page,state);
    await ready(page);
    state.catalogs={'PROD-E2E':catalog('PROD-E2E',[{id:'NOVO'}])};
    await page.locator('#refreshButton').click();
    await ready(page);
    await expect(page.locator('#eventSelect option')).toHaveCount(1);
    await expect(page.locator('#eventSelect')).toHaveValue('NOVO');
    await expect(page.locator('#typeSelect')).toHaveValue('TIPO-NOVO');
    expect(calls(state,LOAD).map(c=>c.args[1])).toEqual(['EVT-CORT-E2E','NOVO']);
  });
});

test.describe('Links das cortesias já emitidas no histórico',()=>{
  test.skip(!BRANCH_MODE,'Somente fixtures locais; nenhuma emissão ou mensagem real.');

  test('gera A e B sem envio automático, recupera A e reabre o histórico com os mesmos ingressos',async({page})=>{
    await mockClipboard(page);
    const state=fixture({history:[],onRequest:({method,args})=>{
      if(method===CONSULT){const phone=args[2].startsWith('CT-A-')?'81999990001':'11988880002';return consultation(args[2],args[1],{telefone:phone,telefoneNormalizado:'55'+phone})}
      if(method!==ISSUE)return;
      const name=calls(state,ISSUE).length===1?'A':'B';
      const codes=[1,2].map(n=>'CT-'+name+'-'+n);
      state.issued=true;
      state.history.unshift({...baseData(fixture({issued:true})).recentes[0],cortesiaId:'CRT-'+name,destinatarioNome:name,codigos:codes});
      return {sucesso:true,ingressos:codes.map(codigo=>({codigo,nome:name,link:ticketUrl(codigo)}))};
    }});
    await openCourtesy(page,state);await ready(page);
    await page.locator('#name').fill('Pessoa');await page.locator('#whatsapp').fill('81999990000');
    await page.locator('#quantity').fill('2');await page.locator('#reason').fill('Relacionamento');
    for(const name of ['A','B']){
      await page.locator('#issueButton').click();
      await expect(page.locator('#resultTickets')).toContainText('CT-'+name+'-1');await ready(page);
    }
    expect(calls(state,CONSULT)).toHaveLength(0);
    await expect(page.locator('#historyRows [data-history-code]')).toHaveCount(4);
    expect(page.context().pages()).toHaveLength(1);
    await expect(page.locator('#resultTickets [data-copy]').first()).toHaveAttribute('data-copy',ticketUrl('CT-B-1'));
    const a=historyTicket(page,'CT-A-1');
    await page.locator('#whatsapp').fill('21977770003');
    await a.getByRole('button',{name:'Copiar link',exact:true}).click();
    await expect(a.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl('CT-A-1'));
    await expect.poll(()=>page.evaluate(()=>window.copiedLinks)).toEqual([ticketUrl('CT-A-1')]);
    expect(calls(state,CONSULT)[0].args).toEqual(['CT-PROD-CORTESIA-E2E','EVT-CORT-E2E','CT-A-1','']);
    await expect(a.getByRole('link',{name:'Compartilhar',exact:true})).toHaveAttribute('href',/^https:\/\/wa\.me\/5581999990001\?text=/);
    const b=historyTicket(page,'CT-B-1');await b.getByRole('button',{name:'Compartilhar',exact:true}).click();
    await expect(b.getByRole('link',{name:'Compartilhar',exact:true})).toHaveAttribute('href',/^https:\/\/wa\.me\/5511988880002\?text=/);
    await page.reload();await ready(page);
    await expect(page.locator('#resultTickets')).toBeEmpty();
    await historyTicket(page,'CT-A-2').getByRole('button',{name:'Copiar link',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.copiedLinks)).toEqual([ticketUrl('CT-A-2')]);
    await expect(historyTicket(page,'CT-A-2').getByRole('link',{name:'Compartilhar',exact:true})).toHaveAttribute('href',/^https:\/\/wa\.me\/5581999990001\?text=/);
    expect(calls(state,ISSUE)).toHaveLength(2);
    expect(calls(state,CANCEL)).toHaveLength(0);
    expect(state.methods.some(x=>/Pagamento|Asaas|Checkout|Enviar|Whatsapp/i.test(x))).toBe(false);
    expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('sig=');
  });

  test('abrir e compartilhar preparam links inline e só navegam no segundo clique explícito, inclusive mobile',async({page,context})=>{
    const state=fixture({issued:true});await openCourtesy(page,state);await ready(page);
    const first=historyTicket(page),second=historyTicket(page,'CT-E2E-2');
    await first.getByRole('button',{name:'Abrir ingresso',exact:true}).click();
    await expect(first.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl('CT-E2E-1'));
    expect(context.pages()).toHaveLength(1);
    await second.getByRole('button',{name:'Compartilhar',exact:true}).click();
    const share=second.getByRole('link',{name:'Compartilhar',exact:true});
    await expect(share).toHaveAttribute('href',/^https:\/\/wa\.me\/5511988880002\?text=/);
    const shareUrl=new URL(await share.getAttribute('href'));
    expect(shareUrl.searchParams.get('text')).toContain(ticketUrl('CT-E2E-2'));
    expect(shareUrl.searchParams.get('text')).not.toContain('CT-E2E-1');
    expect(context.pages()).toHaveLength(1);
    await context.route('**/*',route=>route.fulfill({status:200,body:'<!doctype html><title>Destino simulado</title>'}));
    for(const link of [first.getByRole('link',{name:'Abrir ingresso'}),share]){
      const popupEvent=page.waitForEvent('popup');await link.click();const popup=await popupEvent;
      await popup.waitForLoadState();expect(popup.url()).toBe(await link.getAttribute('href'));await popup.close();
    }
    expect((await share.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(calls(state,CONSULT)).toHaveLength(2);expect(calls(state,ISSUE)).toHaveLength(0);
  });

  test('clipboard negado oferece URL absoluta selecionada para cópia manual',async({page})=>{
    await mockClipboard(page,true);const state=fixture({issued:true});await openCourtesy(page,state);await ready(page);
    const row=historyTicket(page);await row.getByRole('button',{name:'Copiar link',exact:true}).click();
    const input=row.getByRole('textbox',{name:'Link do ingresso CT-E2E-1'});
    await expect(input).toHaveValue(ticketUrl('CT-E2E-1'));await expect(input).toHaveAttribute('readonly','');
    expect(await input.evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length)).toBe(true);
    await expect(row).toContainText('copie o link abaixo');
  });

  const rejected=[
    ['sem autenticação',r=>({...r,autenticado:false}),'autorizar'],
    ['sem permissão de consulta',r=>({...r,autorizado:false}),'autorizar'],
    ['resposta sem sucesso',r=>({...r,sucesso:false}),'autorizar'],
    ['filtro de outro evento',r=>({...r,filtroEvento:{eventoId:'OUTRO'}}),'evento selecionado'],
    ['colisão por substring',r=>({...r,ingressos:[{...r.ingressos[0],codigo:'CT-E2E-10'}]}),'único ingresso'],
    ['ingresso de outro evento',r=>({...r,ingressos:[{...r.ingressos[0],eventoId:'OUTRO'}]}),'único ingresso'],
    ['resultado exato duplicado',r=>({...r,ingressos:[...r.ingressos,...r.ingressos]}),'único ingresso'],
    ['permissão false',r=>({...r,ingressos:[{...r.ingressos[0],compartilhamentoPermitido:false}]}),'não autorizado'],
    ['permissão string true',r=>({...r,ingressos:[{...r.ingressos[0],compartilhamentoPermitido:'true'}]}),'não autorizado'],
    ...['CANCELADO','PENDENTE','UTILIZADO'].map(status=>[status,r=>({...r,ingressos:[{...r.ingressos[0],statusClasse:status}]}),status==='UTILIZADO'?'já utilizado':status.toLowerCase()]),
    ...[
      'https://outro.example/ingresso/?codigo=CT-E2E-1&sig=ASSINADA_E2E_1234567890',
      'http://cariocaticket.com.br/ingresso/?codigo=CT-E2E-1&sig=ASSINADA_E2E_1234567890',
      TICKET_ORIGIN+'/ingresso/?codigo=CT-E2E-1',
      ticketUrl('CT-E2E-10'),
      ticketUrl('CT-E2E-1','CURTA'),
      ticketUrl('CT-E2E-1','assinatura.invalida.123456'),
      ticketUrl('CT-E2E-1')+'&codigo=CT-E2E-2'
    ].map((url,index)=>['URL insegura '+index,r=>({...r,ingressos:[{...r.ingressos[0],ingressoCompartilhamentoUrl:url}]}),'Link seguro indisponível'])
  ];
  for(const [name,change,text] of rejected)test('nega '+name,async({page})=>{
    await mockClipboard(page);
    const state=fixture({issued:true,onRequest:({method,args})=>method===CONSULT?change(consultation(args[2],args[1])):undefined});
    await openCourtesy(page,state);await ready(page);
    const before=state.methods.length;
    await historyTicket(page).getByRole('button',{name:'Copiar link',exact:true}).click();
    await expect(page.locator('body')).toContainText(text);
    await expect(page.locator('#historyRows a')).toHaveCount(0);
    expect(await page.evaluate(()=>window.copiedLinks)).toEqual([]);
    expect(state.methods.slice(before)).toEqual([CONSULT]);
  });

  test('aceita só a correspondência exata entre resultados e o fallback ingressoUrl',async({page})=>{
    const state=fixture({issued:true,onRequest:({method,args})=>{
      if(method!==CONSULT)return;
      const r=consultation(args[2],args[1],{ingressoCompartilhamentoUrl:'',ingressoUrl:ticketUrl(args[2])});
      return {...r,ingressos:[{...r.ingressos[0],codigo:args[2]+'0'},...r.ingressos]};
    }});
    await openCourtesy(page,state);await ready(page);
    await historyTicket(page).getByRole('button',{name:'Abrir ingresso',exact:true}).click();
    await expect(historyTicket(page).getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl('CT-E2E-1'));
  });

  test('cortesia cancelada no histórico não oferece ações de link',async({page})=>{
    const state=fixture({issued:true,cancelled:true});await openCourtesy(page,state);await ready(page);
    await expect(historyTicket(page)).toContainText('indisponível');await expect(historyTicket(page).locator('button,a')).toHaveCount(0);
    expect(calls(state,CONSULT)).toHaveLength(0);
  });

  for(const when of ['antes','durante','depois'])test('sessão expirada ou trocada '+when+' da consulta descarta links',async({page})=>{
    const delayed=deferred();const state=fixture({issued:true,onRequest:({method})=>method===CONSULT&&when==='durante'?delayed.promise:undefined});
    await openCourtesy(page,state);await ready(page);
    if(when!=='antes'){
      await historyTicket(page).getByRole('button',{name:'Abrir ingresso',exact:true}).click();
      await expect.poll(()=>calls(state,CONSULT).length).toBe(1);
      if(when==='depois')await expect(historyTicket(page).getByRole('link',{name:'Abrir ingresso'})).toBeVisible();
    }
    await page.evaluate(({key,when})=>{const data=JSON.parse(sessionStorage.getItem(key));if(when==='durante')data.token='OUTRA-SESSAO';else data.expiraEm='2000-01-01T00:00:00Z';sessionStorage.setItem(key,JSON.stringify(data));},{key:STORAGE,when});
    if(when==='durante')delayed.resolve(consultation());
    else await historyTicket(page).getByRole(when==='depois'?'link':'button',{name:'Abrir ingresso',exact:true}).click();
    await expect(page.locator('#message')).toContainText('sessão mudou ou expirou');
    await expect(page.locator('#historyRows a')).toHaveCount(0);expect(page.context().pages()).toHaveLength(1);
    expect(calls(state,CONSULT)).toHaveLength(when==='antes'?0:1);
  });

  for(const staleError of [false,true])test('resposta antiga A→B→A não altera links novos'+(staleError?' (erro)':''),async({page})=>{
    const delayed=deferred();let queries=0;
    const state=fixture({issued:true,catalogs:{'PROD-E2E':catalog('PROD-E2E',[{id:'A'},{id:'B'}])},onRequest:({method,args})=>{
      if(method===LOAD)return {...eventData(args[1]),recentes:baseData(fixture({issued:true})).recentes};
      if(method===CONSULT)return ++queries===1?delayed.promise:consultation(args[2],args[1],{ingressoCompartilhamentoUrl:ticketUrl(args[2],'NOVA_E2E_1234567890')});
    }});
    await openCourtesy(page,state);await ready(page);
    await historyTicket(page).getByRole('button',{name:'Abrir ingresso',exact:true}).click();
    await expect.poll(()=>queries).toBe(1);
    // Even synthetic repeated clicks cannot duplicate the pending lookup.
    await historyTicket(page).locator('button').evaluateAll(buttons=>buttons.forEach(b=>b.dispatchEvent(new Event('click'))));
    expect(queries).toBe(1);
    for(const event of ['B','A']){await page.locator('#eventSelect').selectOption(event);await ready(page)}
    await historyTicket(page).getByRole('button',{name:'Abrir ingresso',exact:true}).click();
    const link=historyTicket(page).getByRole('link',{name:'Abrir ingresso'});
    await expect(link).toHaveAttribute('href',ticketUrl('CT-E2E-1','NOVA_E2E_1234567890'));
    if(staleError)delayed.reject(new Error('ERRO ANTIGO'));else delayed.resolve(consultation('CT-E2E-1','A'));
    await page.waitForTimeout(150);
    await expect(link).toHaveAttribute('href',ticketUrl('CT-E2E-1','NOVA_E2E_1234567890'));await expect(page.locator('body')).not.toContainText('ERRO ANTIGO');
    await expect(historyTicket(page).getByRole('button',{name:'Copiar link',exact:true})).toBeEnabled();
  });

  for(const reset of ['reload','cancel','producer'])test('invalida consulta pendente em '+reset,async({page})=>{
    const delayed=deferred();
    const state=fixture({issued:true,producers:[{id:'PROD-E2E',perfil:'PRODUTOR_TITULAR'},{id:'PROD-2',perfil:'PRODUTOR_TITULAR'}],catalogs:{'PROD-2':catalog('PROD-2',[{id:'OUTRO'}])},onRequest:({method,args})=>{
      if(method===CONSULT)return delayed.promise;
      if(method===LOAD&&args[1]==='OUTRO')return eventData('OUTRO','PROD-2');
    }});
    await openCourtesy(page,state);await ready(page);
    await historyTicket(page).getByRole('button',{name:'Compartilhar',exact:true}).click();await expect.poll(()=>calls(state,CONSULT).length).toBe(1);
    if(reset==='cancel'){
      page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Teste simulado'):dialog.accept());
      await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect.poll(()=>state.cancelCalls).toBe(1);
    }else if(reset==='producer')await page.locator('#producerSelect').selectOption('PROD-2');
    else await page.locator('#loadButton').click();
    await ready(page);delayed.resolve(consultation());await page.waitForTimeout(150);
    await expect(page.locator('#historyRows a')).toHaveCount(0);expect(page.context().pages()).toHaveLength(1);
  });

  test('falha de transporte permite nova tentativa sem reemitir',async({page})=>{
    let failed=false;const state=fixture({issued:true,onRequest:({method})=>{if(method===CONSULT&&!failed){failed=true;throw new Error('Falha de consulta simulada')}}});
    await openCourtesy(page,state);await ready(page);
    const row=historyTicket(page);await row.getByRole('button',{name:'Abrir ingresso',exact:true}).click();
    await expect(row).toContainText('Falha de consulta simulada');
    await row.getByRole('button',{name:'Abrir ingresso',exact:true}).click();
    await expect(row.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl('CT-E2E-1'));
    expect(calls(state,CONSULT)).toHaveLength(2);expect(calls(state,ISSUE)).toHaveLength(0);
  });
});

test.describe('WhatsApp do destinatário da cortesia',()=>{
  test.skip(!BRANCH_MODE,'Somente mocks; não abre conversas nem envia mensagens reais.');

  async function issueFixture(page,state){
    await openCourtesy(page,state);await ready(page);
    await page.locator('#name').fill('Pessoa Cortesia');await page.locator('#whatsapp').fill('21977770003');
    await page.locator('#quantity').fill('2');await page.locator('#reason').fill('Teste simulado');
    await page.locator('#issueButton').click();await expect(page.locator('#resultTickets [data-issued-code]')).toHaveCount(2);await ready(page);
  }
  function issuedTicket(page,code='CT-E2E-1'){return page.locator('#resultTickets [data-issued-code="'+code+'"]')}
  async function expectRecipient(block,code,phone){
    const link=block.getByRole('link',{name:phone?'Compartilhar':'Escolher destinatário no WhatsApp',exact:true});
    await expect(link).toHaveAttribute('href',new RegExp('^https://wa\\.me/'+phone+'\\?text='));
    const url=new URL(await link.getAttribute('href'));
    expect(url.pathname).toBe('/'+phone);expect(url.searchParams.get('text')).toBe('Cortesia Carioca Ticket\n\nAbrir ingresso: '+ticketUrl(code));
  }

  test('normaliza BR de 10/11 dígitos, DDD 55, DDI explícito e número normalizado sem trocar destinatário',async({page})=>{
    const cases=[
      [{telefone:'(81) 99999-0001'},'5581999990001'],
      [{telefone:'(11) 3456-7890'},'551134567890'],
      [{telefone:'5581999990001'},'5581999990001'],
      [{telefone:'+55 (81) 99999-0001'},'5581999990001'],
      [{telefone:'55 11 3456-7890'},'551134567890'],
      [{telefone:'(55) 99999-0001'},'5555999990001'],
      [{telefone:'(55) 3456-7890'},'555534567890'],
      [{telefone:'81*****0001',telefoneNormalizado:'5581999990001'},'5581999990001'],
      [{telefone:'+1 (202) 555-0123',telefoneNormalizado:'12025550123'},'12025550123']
    ];
    let fields={};const state=fixture({issued:true,onRequest:({method,args})=>method===CONSULT?consultation(args[2],args[1],{telefoneNormalizado:'',...fields,whatsappUrl:'https://wa.me/5511988880002?text=OUTRO-INGRESSO'}):undefined});
    await openCourtesy(page,state);await ready(page);
    for(const [phone,expected] of cases)await test.step(JSON.stringify(phone),async()=>{
      fields=phone;await page.locator('#loadButton').click();await ready(page);
      const row=historyTicket(page);await row.getByRole('button',{name:'Compartilhar',exact:true}).click();
      await expectRecipient(row,'CT-E2E-1',expected);
      await expect(row).not.toContainText(expected);
    });
    expect(calls(state,ISSUE)).toHaveLength(0);expect(page.context().pages()).toHaveLength(1);
  });

  test('ausência, máscara e números inválidos oferecem escolha explícita sem usar formulário ou máscara do histórico',async({page})=>{
    await mockClipboard(page);
    const invalid=['','819999','81*****0001','5581*****999999999','00000000000','+55 81 9999990001','81999990001 ramal 2','551198888000222'];
    let phone='';const state=fixture({issued:true,onRequest:({method,args})=>method===CONSULT?consultation(args[2],args[1],{telefone:phone,telefoneNormalizado:phone,whatsappUrl:'https://wa.me/5511988880002?text=NAO-USAR'}):undefined});
    await openCourtesy(page,state);await ready(page);await page.locator('#whatsapp').fill('21977770003');
    for(const value of invalid)await test.step(value||'ausente',async()=>{
      phone=value;await page.locator('#loadButton').click();await ready(page);
      const row=historyTicket(page);await row.getByRole('button',{name:'Compartilhar',exact:true}).click();
      await expectRecipient(row,'CT-E2E-1','');await expect(row).toContainText('Telefone cadastrado ausente ou inválido');
      await expect(row.getByRole('link',{name:'Compartilhar',exact:true})).toHaveCount(0);
      await expect(row.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl('CT-E2E-1'));
      await row.getByRole('button',{name:'Copiar link',exact:true}).click();
      await expect(row).toContainText('Link do ingresso copiado');
    });
    expect(await page.evaluate(()=>window.copiedLinks)).toEqual(invalid.map(()=>ticketUrl('CT-E2E-1')));
    expect(page.context().pages()).toHaveLength(1);
  });

  for(const surface of ['histórico','recém-emitido'])test('DDI explícito inválido não usa normalizado como DDD local no '+surface,async({page})=>{
    await mockClipboard(page);
    const cases=[
      {telefone:'+55 99999-0001',telefoneNormalizado:'55999990001'},
      {telefone:'+55 3456-7890',telefoneNormalizado:'5534567890'},
      {telefone:'+55 (81) 99999-0001 ramal 2',telefoneNormalizado:'5581999990001'},
      {telefone:'+1 123',telefoneNormalizado:'11988880002'},
      {telefone:'0055 99999-0001',telefoneNormalizado:'55999990001'},
      {telefone:'00 55 (81) 99999-0001',telefoneNormalizado:'5581999990001'}
    ];
    let fields=cases[0];
    const state=fixture({issued:surface==='histórico',onRequest:({method,args})=>method===CONSULT?consultation(args[2],args[1],fields):undefined});
    if(surface==='histórico'){await openCourtesy(page,state);await ready(page)}else await issueFixture(page,state);
    for(const phone of cases)await test.step(JSON.stringify(phone),async()=>{
      fields=phone;await page.locator('#loadButton').click();await ready(page);
      const row=surface==='histórico'?historyTicket(page):issuedTicket(page),before=state.methods.length;
      await row.getByRole('button',{name:'Compartilhar',exact:true}).click();
      await expectRecipient(row,'CT-E2E-1','');
      await expect(row).toContainText('Telefone cadastrado ausente ou inválido');
      await expect(row.getByRole('link',{name:'Compartilhar',exact:true})).toHaveCount(0);
      await expect(row.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl('CT-E2E-1'));
      await row.getByRole('button',{name:'Copiar link',exact:true}).click();
      expect(state.methods.slice(before)).toEqual([CONSULT]);
    });
    await expect.poll(()=>page.evaluate(()=>window.copiedLinks)).toEqual(cases.map(()=>ticketUrl('CT-E2E-1')));
    expect(calls(state,ISSUE)).toHaveLength(surface==='histórico'?0:1);expect(page.context().pages()).toHaveLength(1);
  });

  for(const idempotent of [false,true])test('resultado recém-emitido consulta o destinatário de cada ingresso'+(idempotent?' no retorno idempotente':''),async({page})=>{
    const state=fixture({onRequest:({method})=>{
      if(method===ISSUE&&idempotent){state.issued=true;return {sucesso:true,idempotente:true,ingressos:['CT-E2E-1','CT-E2E-2'].map(codigo=>({codigo,link:ticketUrl(codigo)}))}}
    }});
    await issueFixture(page,state);expect(calls(state,CONSULT)).toHaveLength(0);
    await page.locator('#whatsapp').fill('31966660004');
    for(const [code,phone] of [['CT-E2E-1','5581999990001'],['CT-E2E-2','5511988880002']]){
      const row=issuedTicket(page,code);await expect(row.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl(code));
      await row.getByRole('button',{name:'Compartilhar',exact:true}).click();await expectRecipient(row,code,phone);
      await expect(row.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl(code));
      await expect(row.locator('[data-copy]')).toHaveAttribute('data-copy',ticketUrl(code));
      await expect(row).not.toContainText(phone);
    }
    expect(calls(state,CONSULT).map(c=>c.args)).toEqual(['CT-E2E-1','CT-E2E-2'].map(code=>['CT-PROD-CORTESIA-E2E','EVT-CORT-E2E',code,'']));
    expect(calls(state,ISSUE)).toHaveLength(1);expect(page.context().pages()).toHaveLength(1);
    expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toMatch(/5581999990001|5511988880002|wa\.me/);
    await page.locator('#loadButton').click();await ready(page);
    await expect(page.locator('#resultTickets a[href*="wa.me"]')).toHaveCount(0);
    await expect(issuedTicket(page).getByRole('button',{name:'Compartilhar',exact:true})).toBeEnabled();
  });

  test('telefone ausente no recém-emitido mantém Abrir/Copiar e não promete conversa direcionada',async({page})=>{
    await mockClipboard(page);
    const state=fixture({onRequest:({method,args})=>method===CONSULT?consultation(args[2],args[1],{telefone:'',telefoneNormalizado:''}):undefined});
    await issueFixture(page,state);const row=issuedTicket(page);
    await row.getByRole('button',{name:'Compartilhar',exact:true}).click();await expectRecipient(row,'CT-E2E-1','');
    await expect(row).toContainText('Telefone cadastrado ausente ou inválido');
    await expect(row.getByRole('link',{name:'Abrir ingresso'})).toHaveAttribute('href',ticketUrl('CT-E2E-1'));
    await row.getByRole('button',{name:'Copiar link',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.copiedLinks)).toEqual([ticketUrl('CT-E2E-1')]);
    expect(calls(state,ISSUE)).toHaveLength(1);expect(page.context().pages()).toHaveLength(1);
  });

  for(const reset of ['reload','event','session'])test('descarta destinatário atrasado no resultado recém-emitido após '+reset,async({page})=>{
    const delayed=deferred();const state=fixture({catalogs:{'PROD-E2E':catalog('PROD-E2E',[{id:'EVT-CORT-E2E'},{id:'OUTRO'}])},onRequest:({method,args})=>{
      if(method===CONSULT)return delayed.promise;
      if(method===LOAD&&args[1]==='OUTRO')return eventData('OUTRO');
    }});
    await issueFixture(page,state);const row=issuedTicket(page);
    await row.getByRole('button',{name:'Compartilhar',exact:true}).click();await expect.poll(()=>calls(state,CONSULT).length).toBe(1);
    await row.getByRole('button',{name:'Compartilhar',exact:true}).evaluate(b=>b.dispatchEvent(new Event('click')));
    expect(calls(state,CONSULT)).toHaveLength(1);
    if(reset==='reload'){await page.locator('#loadButton').click();await ready(page)}
    else if(reset==='event'){await page.locator('#eventSelect').selectOption('OUTRO');await ready(page)}
    else await page.evaluate(key=>{const s=JSON.parse(sessionStorage.getItem(key));s.token='OUTRA-SESSAO';sessionStorage.setItem(key,JSON.stringify(s))},STORAGE);
    delayed.resolve(consultation());await page.waitForTimeout(150);
    await expect(page.locator('#resultTickets a[href*="wa.me"]')).toHaveCount(0);
    if(reset==='event')await expect(page.locator('#resultTickets')).toBeEmpty();
    if(reset==='session')await expect(page.locator('#message')).toContainText('sessão mudou ou expirou');
    expect(calls(state,ISSUE)).toHaveLength(1);expect(page.context().pages()).toHaveLength(1);
  });

  test('consulta negada no recém-emitido não expõe destino WhatsApp',async({page})=>{
    const state=fixture({onRequest:({method,args})=>method===CONSULT?{...consultation(args[2],args[1]),autorizado:false}:undefined});
    await issueFixture(page,state);await issuedTicket(page).getByRole('button',{name:'Compartilhar',exact:true}).click();
    await expect(page.locator('#message')).toContainText('Não foi possível autorizar a consulta');
    await expect(page.locator('#resultTickets a[href*="wa.me"]')).toHaveCount(0);expect(calls(state,ISSUE)).toHaveLength(1);
  });
});
