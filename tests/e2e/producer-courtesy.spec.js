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
    recentes:state.issued?[{
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
    }]:[],
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
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
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
            eventos:[{id:'EVT-CORT-E2E',nome:'Evento Cortesia E2E'}]
          }]
        };
      }else if(method==='ctCortesiasCarregarPROD'){
        state.loadCalls++;
        expect(args[0]).toBe('CT-PROD-CORTESIA-E2E');
        expect(args[1]).toBe('EVT-CORT-E2E');
        resultado=baseData(state);
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
            {id:'1',codigo:'CT-E2E-1',nome:state.privateEvent?'Convidado Privado':'Pessoa Cortesia',tipo:'Individual',loteNome:'1º lote',link:'https://cariocaticket.com.br/ingresso/?codigo=CT-E2E-1&sig=ASSINADA'},
            {id:'2',codigo:'CT-E2E-2',nome:state.privateEvent?'Convidado Privado':'Pessoa Cortesia',tipo:'Individual',loteNome:'1º lote',link:'https://cariocaticket.com.br/ingresso/?codigo=CT-E2E-2&sig=ASSINADA'}
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
    await issue.click();
    await issue.click({force:true}).catch(()=>{});

    await expect.poll(()=>state.issueCalls).toBe(1);
    await expect(page.getByRole('link',{name:'Abrir ingresso'}).first()).toHaveAttribute('href',/sig=ASSINADA/);
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
