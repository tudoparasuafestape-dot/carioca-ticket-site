const { test, expect } = require('@playwright/test');

const BRANCH_MODE=process.env.CT_BRANCH_MODE==='1';
const STORAGE='CT_PORTAL_PRODUTOR_PROD_SESSION_V1';
const EVENT='EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const TYPE_INDIVIDUAL='TIPO-EBD1F87D';
const LOT_INDIVIDUAL='LOTE-E2D1C48C';
const TYPE_CASADINHA='TIPO-45B0B69D';
const LOT_CASADINHA='LOTE-0747E092';
const CODE='30ANOSSEMRAZAO';

function catalog(){
  return {
    sucesso:true,
    evento:{id:EVENT,nome:'Roda de Samba Estilo Carioca',data:'11/10/2026',horario:'15h às 22h',local:'Vevets Recepções',cidade:'Jaboatão dos Guararapes',uf:'PE'},
    visual:{descricaoCurta:'30 anos da Banda Sem Razão.',capaUrl:''},
    tipos:[
      {id:TYPE_INDIVIDUAL,nome:'Individual',descricao:'Ingresso individual',capacidadePorVenda:1,lotes:[{id:LOT_INDIVIDUAL,nome:'Pré-venda',preco:'R$ 25,00',precoNumero:25,quantidadeLimitada:false,disponiveis:0}]},
      {id:TYPE_CASADINHA,nome:'Casadinha',descricao:'Acesso para 2 pessoas',capacidadePorVenda:2,lotes:[{id:LOT_CASADINHA,nome:'Pré-venda',preco:'R$ 40,00',precoNumero:40,quantidadeLimitada:false,disponiveis:0}]}
    ],
    identidadeCliente:{identificadorPrincipal:'WHATSAPP',whatsappObrigatorio:true,emailObrigatorio:false}
  };
}

function campaign(status='ATIVA'){
  return {
    campanhaId:'CMP-E2E-30ANOS',nome:'Lançamento Carioca Ticket — 30 anos Sem Razão',
    descricao:'Campanha de lançamento',codigo:CODE,tipoBeneficio:'PRECO_PROMOCIONAL',
    percentual:0,valorFixo:0,precoPromocional:15,status,statusConfigurado:status,
    limiteTotalUsos:50,limitePorComprador:2,limitePorPedido:2,utilizacoes:0,reservadas:0,
    descontoTotal:0,receitaGerada:0,disponiveis:50,responsavelEconomico:'PRODUTOR',
    elegibilidades:[{tipoId:TYPE_INDIVIDUAL,loteId:LOT_INDIVIDUAL}]
  };
}

function couponResult(code, state, typeId, lotId){
  const normalized=String(code||'').trim().toUpperCase().replace(/\s+/g,'');
  if(normalized!==CODE)return {sucesso:true,valido:false,mensagem:'Cupom não encontrado.'};
  if(state.paused)return {sucesso:true,valido:false,mensagem:'Esta campanha está temporariamente pausada.'};
  if(typeId!==TYPE_INDIVIDUAL||lotId!==LOT_INDIVIDUAL)return {sucesso:true,valido:false,mensagem:'Este cupom não é válido para o ingresso escolhido.'};
  return {sucesso:true,valido:true,cupom:{campanhaId:'CMP-E2E-30ANOS',codigo:CODE,nome:'Lançamento Carioca Ticket — 30 anos Sem Razão',tipoBeneficio:'PRECO_PROMOCIONAL',responsavelEconomico:'PRODUTOR'},calculo:{precoOriginalUnitario:25,precoFinalUnitario:15,descontoUnitario:10,descontoTotal:10,valorOriginalTotal:25,valorFinalTotal:15,quantidadePromocional:1}};
}

async function seed(page,token='CT-CUPOM-E2E-TOKEN'){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(({key,token})=>{
    const value=JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(key,value);localStorage.setItem(key,value);
  },{key:STORAGE,token});
}

async function mock(page,state){
  await page.route('https://script.google.com/**', async route=>{
    const req=route.request(),params=new URLSearchParams(req.postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||''),action=String(params.get('ctMinhaCariocaAction')||''),method=String(params.get('metodo')||'');
    let args=[];try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}
    let result=null,ok=true,error='';
    try{
      if(action==='centralRestaurarSessao'){
        result={sucesso:true,autenticado:true,autorizado:true,usuario:{id:'USR-E2E',nome:'Produtor E2E',perfil:'ADMINISTRADOR'},eventos:[{id:EVENT,nome:'Roda de Samba Estilo Carioca',data:'11/10/2026',horario:'15h às 22h',local:'Vevets Recepções',cidade:'Jaboatão dos Guararapes',uf:'PE',modulosPermitidos:['VENDAS','PORTAL_PRODUTOR']}],modulosPermitidosGerais:['VENDAS','PORTAL_PRODUTOR']};
      }else if(action==='portalRpc'){
        if(method==='ctCuponsCampanhasListarPROD'){
          result={sucesso:true,autenticado:true,autorizado:true,eventoId:EVENT,eventoNome:'Roda de Samba Estilo Carioca',produtorId:'PROD-E2E',campanhas:state.saved?[campaign(state.paused?'PAUSADA':'ATIVA')]:[],tipos:catalog().tipos.map(x=>({id:x.id,nome:x.nome,precoNumero:x.lotes[0].precoNumero,status:'ATIVO'})),lotes:catalog().tipos.flatMap(x=>x.lotes.map(l=>({...l,tipoId:x.id,tipoNome:x.nome,status:'ATIVO'})))};
        }else if(method==='ctCuponsCampanhasSalvarPROD'){
          const p=args[2]||{};state.saveCalls++;
          expect(String(args[1]||'')).toBe(EVENT);
          expect(String(p.codigo||'').toUpperCase()).toBe(CODE);
          expect(p.tipoBeneficio).toBe('PRECO_PROMOCIONAL');
          expect(Number(p.precoPromocional)).toBe(15);
          expect(p.tipoIds).toEqual([TYPE_INDIVIDUAL]);
          expect(p.loteIds).toEqual([LOT_INDIVIDUAL]);
          expect(p.ativar).toBe(true);
          state.saved=true;state.paused=false;
          if(Number(state.delaySaveMs||0)>0)await new Promise(r=>setTimeout(r,Number(state.delaySaveMs)));
          result={sucesso:true,campanha:campaign()};
        }else if(method==='ctCuponsCampanhasAlterarStatusPROD'){
          state.statusCalls++;state.paused=String(args[3]||'')==='PAUSAR';result={sucesso:true,campanha:campaign(state.paused?'PAUSADA':'ATIVA')};
        }else if(method==='ctCuponsCampanhasAdminListarPROD'){
          result={sucesso:true,autorizado:true,admin:{nome:'Admin',perfil:'ADMINISTRADOR'},itens:state.saved?[{...campaign(state.paused?'PAUSADA':'ATIVA'),produtorId:'PROD-E2E',eventoId:EVENT}]:[],total:state.saved?1:0};
        }else throw new Error('portalRpc não previsto: '+method);
      }else if(action==='publicRpc'){
        if(method==='ctCheckoutPublicoCarregarEventoPROD')result=catalog();
        else if(method==='ctCuponsPublicoValidarSeguroPROD'){
          state.validationCalls++;
          const p=args[0]||{};result=couponResult(p.codigo,state,String(p.tipoId||''),String(p.loteId||''));
        }else if(method==='ctCheckoutPixPublicoIniciarPROD'){
          state.checkoutCalls++;
          const p=args[0]||{};state.lastCheckout=p;
          expect(p.cupomCodigo).toBe(CODE);
          expect(Object.prototype.hasOwnProperty.call(p,'precoPromocional')).toBe(false);
          expect(Object.prototype.hasOwnProperty.call(p,'desconto')).toBe(false);
          expect(Object.prototype.hasOwnProperty.call(p,'valorTotal')).toBe(false);
          if(state.pauseBeforePay)throw new Error('CT_CUPONS_PAUSADO');
          result={sucesso:true,consultaToken:'TOKEN-E2E',pedido:{pedidoId:'PED-E2E',status:'AGUARDANDO_PAGAMENTO',expiraEm:'2099-01-01T00:00:00.000Z'},promocao:{campanhaId:'CMP-E2E-30ANOS',codigo:CODE,precoOriginalUnitario:25,precoFinalUnitario:15,descontoTotal:10,valorFinalTotal:15},pagamento:{forma:'PIX',pix:{copiaECola:'PIX-E2E-15'}}};
        }else throw new Error('publicRpc não previsto: '+method);
      }else throw new Error('ação não prevista: '+action);
    }catch(e){ok=false;error=e&&e.message?e.message:String(e)}
    const payload=JSON.stringify({ctMinhaCariocaPost:true,id,ok,resultado:ok?result:null,erro:ok?'':error}).replace(/</g,'\\u003c');
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");</script></body></html>'});
  });
}

test.describe('Cupons e Campanhas',()=>{
  test.skip(!BRANCH_MODE,'Executa na branch com backend simulado.');

  test('Produtor encontra módulo pela Central e cria 30ANOSSEMRAZAO por R$ 15',async({page})=>{
    const state={saved:false,paused:false,saveCalls:0,statusCalls:0,validationCalls:0,checkoutCalls:0,pauseBeforePay:false};
    await mock(page,state);await seed(page);
    await page.goto('/central/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#central')).toBeVisible({timeout:15000});
    await expect(page.locator('#mCupons')).toHaveAttribute('href',new RegExp('/cupons/\\?evento='+EVENT));
    await expect(page.locator('#mCupons')).toHaveAttribute('aria-disabled','false');
    await page.locator('#mCupons').click();
    await expect(page).toHaveURL(/\/cupons\/\?evento=/);
    await expect(page.getByRole('heading',{name:'Roda de Samba Estilo Carioca'})).toBeVisible({timeout:15000});
    await page.locator('#newCampaign').click();
    await page.locator('#name').fill('Lançamento Carioca Ticket — 30 anos Sem Razão');
    await page.locator('#code').fill('30anossemrazao');
    await page.locator('#benefit').selectOption('PRECO_PROMOCIONAL');
    await page.locator('#benefitValue').fill('15');
    await page.locator('#typeChecks input[value="'+TYPE_INDIVIDUAL+'"]').check();
    await page.locator('#lotChecks input[value="'+LOT_INDIVIDUAL+'"]').check();
    await page.locator('#totalLimit').fill('50');
    await page.locator('#buyerLimit').fill('2');
    await page.locator('#orderLimit').fill('2');
    await expect(page.locator('#review')).toContainText('R$ 25,00');
    await expect(page.locator('#review')).toContainText('R$ 15,00');
    await page.locator('#saveActive').click();
    await expect.poll(()=>state.saveCalls).toBe(1);
    await expect(page.locator('#campaigns')).toContainText(CODE);
    await expect(page.locator('#campaigns')).toContainText('ATIVA');
    await expect(page.locator('#campaigns')).not.toContainText('Casadinha');
  });

  test('Timeout após gravação é reconciliado como sucesso sem duplicar campanha',async({page})=>{
    const state={saved:false,paused:false,saveCalls:0,statusCalls:0,validationCalls:0,checkoutCalls:0,pauseBeforePay:false,delaySaveMs:500};
    await page.addInitScript(()=>{
      const originalSetTimeout=window.setTimeout.bind(window);
      window.setTimeout=function(fn,ms,...args){
        return originalSetTimeout(fn,Number(ms)===45000?100:ms,...args);
      };
    });
    await mock(page,state);await seed(page);
    await page.goto('/cupons/?evento='+EVENT,{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Roda de Samba Estilo Carioca'})).toBeVisible({timeout:15000});
    await page.locator('#newCampaign').click();
    await page.locator('#name').fill('Lançamento Carioca Ticket — 30 anos Sem Razão');
    await page.locator('#code').fill(CODE);
    await page.locator('#benefit').selectOption('PRECO_PROMOCIONAL');
    await page.locator('#benefitValue').fill('15');
    await page.locator('#typeChecks input[value="'+TYPE_INDIVIDUAL+'"]').check();
    await page.locator('#lotChecks input[value="'+LOT_INDIVIDUAL+'"]').check();
    await page.locator('#saveActive').click();
    await expect.poll(()=>state.saveCalls).toBe(1);
    await expect(page.locator('#editor')).toHaveClass(/hidden/,{timeout:5000});
    await expect(page.locator('#campaigns')).toContainText(CODE);
    await expect(page.locator('#campaigns')).toContainText('ATIVA');
    await expect(page.locator('#pageMsg')).toContainText('Campanha ativada com sucesso.');
    expect(state.saveCalls).toBe(1);
  });

  test('Checkout valida no servidor, mostra R$25 - R$10 = R$15 e envia só o código',async({page})=>{
    const state={saved:true,paused:false,saveCalls:0,statusCalls:0,validationCalls:0,checkoutCalls:0,pauseBeforePay:false,lastCheckout:null};
    await mock(page,state);
    await page.goto('/checkout/?evento='+EVENT,{waitUntil:'domcontentloaded'});
    await expect(page.getByText('Seus dados')).toBeVisible({timeout:15000});
    await page.locator('#typeSelect').selectOption(TYPE_INDIVIDUAL);
    await page.locator('#lotSelect').selectOption(LOT_INDIVIDUAL);
    await page.locator('#couponToggle').click();
    await page.locator('#couponCode').fill(' 30anossemrazao ');
    await page.locator('#couponApply').click();
    await expect.poll(()=>state.validationCalls).toBe(1);
    await expect(page.locator('#couponMessage')).toContainText('Cupom aplicado!');
    await expect(page.locator('#promoOriginal')).toHaveText(/25,00/);
    await expect(page.locator('#promoDiscount')).toHaveText(/10,00/);
    await expect(page.locator('#promoTotal')).toHaveText(/15,00/);
    await expect(page.locator('#summaryPrice')).toHaveText(/15,00/);
    await page.locator('#buyerName').fill('Cliente Cupom');
    await page.locator('#buyerCpf').fill('12345678909');
    await page.locator('#buyerWhatsapp').fill('81999990000');
    await page.locator('#buyerEmail').fill('cupom.homologacao@example.com');
    await page.locator('#payButton').click();
    await expect.poll(()=>state.checkoutCalls).toBe(1);
    await expect(page.locator('#pixPanel')).toBeVisible({timeout:15000});
    expect(state.lastCheckout.cupomCodigo).toBe(CODE);
  });

  test('Casadinha é não elegível, remover funciona e substituição exige confirmação',async({page})=>{
    const state={saved:true,paused:false,saveCalls:0,statusCalls:0,validationCalls:0,checkoutCalls:0,pauseBeforePay:false};
    await mock(page,state);
    await page.goto('/checkout/?evento='+EVENT,{waitUntil:'domcontentloaded'});
    await page.locator('#typeSelect').selectOption(TYPE_INDIVIDUAL);await page.locator('#lotSelect').selectOption(LOT_INDIVIDUAL);
    await page.locator('#couponToggle').click();await page.locator('#couponCode').fill(CODE);await page.locator('#couponApply').click();
    await expect(page.locator('#promoSummary')).toBeVisible();
    await page.locator('#couponCode').fill('OUTROCUPOM');await page.locator('#couponApply').click();
    await expect(page.locator('#couponReplace')).toBeVisible();
    await page.locator('#couponReplaceNo').click();await expect(page.locator('#couponCode')).toHaveValue(CODE);
    await page.locator('#couponRemove').click();await expect(page.locator('#promoSummary')).toHaveClass(/hidden/);
    await page.locator('#typeSelect').selectOption(TYPE_CASADINHA);await page.locator('#lotSelect').selectOption(LOT_CASADINHA);
    await page.locator('#couponCode').fill(CODE);await page.locator('#couponApply').click();
    await expect(page.locator('#couponMessage')).toHaveText('Este cupom não é válido para o ingresso escolhido.');
    await expect(page.locator('#summaryPrice')).toHaveText(/40,00/);
  });

  test('Campanha pausada com checkout aberto é rejeitada novamente antes da cobrança',async({page})=>{
    const state={saved:true,paused:false,saveCalls:0,statusCalls:0,validationCalls:0,checkoutCalls:0,pauseBeforePay:false};
    await mock(page,state);
    await page.goto('/checkout/?evento='+EVENT,{waitUntil:'domcontentloaded'});
    await page.locator('#typeSelect').selectOption(TYPE_INDIVIDUAL);await page.locator('#lotSelect').selectOption(LOT_INDIVIDUAL);
    await page.locator('#couponToggle').click();await page.locator('#couponCode').fill(CODE);await page.locator('#couponApply').click();
    await expect(page.locator('#promoTotal')).toHaveText(/15,00/);
    state.pauseBeforePay=true;
    await page.locator('#buyerName').fill('Cliente Pausa');await page.locator('#buyerCpf').fill('12345678909');await page.locator('#buyerWhatsapp').fill('81999990000');await page.locator('#buyerEmail').fill('pausa@example.com');
    await page.locator('#payButton').click();
    await expect.poll(()=>state.checkoutCalls).toBe(1);
    await expect(page.locator('#modalBg')).toHaveClass(/open/);
    await expect(page.locator('#modalText')).toContainText(/temporariamente pausada/i);
    await expect(page.locator('#pixPanel')).toHaveClass(/hidden/);
  });

  test('Admin encontra campanha no backoffice e possui pausa/encerramento auditáveis',async({page})=>{
    const state={saved:true,paused:false,saveCalls:0,statusCalls:0,validationCalls:0,checkoutCalls:0,pauseBeforePay:false};
    await mock(page,state);await seed(page);
    await page.goto('/cupons/admin/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#app')).toBeVisible({timeout:15000});
    await expect(page.locator('#list')).toContainText(CODE);
    await expect(page.getByRole('button',{name:'Pausar'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Encerrar'})).toBeVisible();
  });
});
