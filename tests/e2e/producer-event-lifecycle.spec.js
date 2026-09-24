import { test, expect } from '@playwright/test';

const BRANCH_MODE = String(process.env.CT_BRANCH_MODE || '') === '1';
const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';
const TOKEN = 'CT-EVENT-E2E-TOKEN';
const PRODUCER_ID = 'PROD-EVENT-E2E';
const EVENT_ID = 'EVT-E2E-RASCUNHO';

function listFixture(state) {
  const eventos = state.event ? [state.event] : [];
  return {
    sucesso:true,
    autenticado:true,
    autorizado:true,
    eventoAtivo:null,
    eventos,
    total:eventos.length,
    publicados:eventos.filter(x => x.publicacao && x.publicacao.publicado===true).length
  };
}

async function installMock(page,state) {
  await page.route('https://script.google.com/**', async route => {
    const params=new URLSearchParams(route.request().postData()||'');
    const id=String(params.get('ctMinhaCariocaRequestId')||'');
    const action=String(params.get('ctMinhaCariocaAction')||'');
    const method=String(params.get('metodo')||'');
    let args=[];try{args=JSON.parse(params.get('argsJson')||'[]')}catch(_){}
    let ok=true,resultado=null,erro='';

    try{
      expect(action).toBe('portalRpc');
      expect(String(args[0]||'')).toBe(TOKEN);

      if(method==='ctEventosOperacionalListarSeguraPROD'){
        state.listCalls+=1;
        resultado=listFixture(state);
      }else if(method==='ctEventosOperacionalContextoCadastroSeguraPROD'){
        state.contextCalls+=1;
        resultado={
          sucesso:true,
          autenticado:true,
          autorizado:true,
          produtores:[{
            produtorId:PRODUCER_ID,
            nomeFantasia:'Produtor Homologação'
          }],
          origensComerciais:[
            {id:'PRODUTOR',nome:'Produtor / relacionamento existente'},
            {id:'DIRETO_CT',nome:'Direto pela Carioca Ticket'},
            {id:'COMISSIONADO',nome:'Indicação de comissionado'}
          ],
          statusInicial:'RASCUNHO',
          regras:{publicacaoSeparada:true}
        };
      }else if(method==='ctEventosOperacionalCriarSeguraPROD'){
        state.createCalls+=1;
        const d=args[1]||{};
        state.lastCreate=d;
        expect(String(d.produtorId||'')).toBe(PRODUCER_ID);
        expect(String(d.nome||'')).toBe('Evento Teste Produtor');
        expect(String(d.origemComercial||'')).toBe('PRODUTOR');
        state.event={
          id:EVENT_ID,
          nome:d.nome,
          data:'30/10/2026',
          horario:'18:00 às 23:00',
          local:d.local,
          cidade:d.cidade,
          uf:d.uf,
          capacidade:Number(d.capacidade||0),
          status:'RASCUNHO',
          ativo:false,
          atualizadoEm:'24/09/2026 16:50',
          publicacao:{
            publicado:false,
            prontoPublicar:false,
            checkoutUrl:'',
            pendencias:['INGRESSOS_LOTES','FINANCEIRO']
          }
        };
        resultado={
          sucesso:true,
          autenticado:true,
          autorizado:true,
          eventoId:EVENT_ID,
          status:'RASCUNHO',
          publicacaoAutorizada:false,
          mensagem:'Evento cadastrado como rascunho.'
        };
      }else if(method==='ctEventosOperacionalPublicarSeguraPROD'){
        state.publishCalls+=1;
        throw new Error('Cadastro de evento não pode publicar vendas automaticamente.');
      }else if(
        method==='ctEventosOperacionalFecharSeguraPROD' ||
        method==='ctEventosOperacionalAtualizarStatusSeguraPROD'
      ){
        state.otherMutationCalls+=1;
        throw new Error('Mutação não prevista neste E2E.');
      }else{
        throw new Error('Método não previsto: '+method);
      }
    }catch(e){
      ok=false;erro=e&&e.message?e.message:String(e);
    }

    const payload=JSON.stringify({
      ctMinhaCariocaPost:true,id,ok,
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

async function seed(page){
  await page.addInitScript(({key,token})=>{
    const value=JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(key,value);
    localStorage.setItem(key,value);
  },{key:STORAGE,token:TOKEN});
}

test.describe('Ciclo seguro do evento do produtor',()=>{
  test.skip(!BRANCH_MODE,'Cadastro mutável roda apenas na branch com backend simulado.');

  test('cria apenas para produtor autorizado e nasce RASCUNHO sem publicar vendas',async({page})=>{
    const state={
      event:null,
      listCalls:0,
      contextCalls:0,
      createCalls:0,
      publishCalls:0,
      otherMutationCalls:0,
      lastCreate:null
    };

    await installMock(page,state);
    await seed(page);
    await page.goto('/eventos-v2/',{waitUntil:'domcontentloaded'});

    await expect(page.getByRole('heading',{name:'Eventos'})).toBeVisible({timeout:15000});
    await expect(page.locator('#resumoLista')).toContainText('0 eventos cadastrados');

    await page.locator('#botaoNovoEvento').click();
    await expect(page.locator('#modalNovoEvento')).toBeVisible();
    await expect(page.locator('#campoProdutorId option')).toHaveCount(2);
    await expect(page.locator('#campoProdutorId')).toHaveValue(PRODUCER_ID);
    await expect(page.locator('#campoProdutorId')).not.toContainText('Outro Produtor');

    await page.locator('#campoNome').fill('Evento Teste Produtor');
    await page.locator('#campoData').fill('2026-10-30');
    await page.locator('#campoHorarioInicio').fill('18:00');
    await page.locator('#campoHorarioFim').fill('23:00');
    await page.locator('#campoLocal').fill('Espaço Homologação');
    await page.locator('#campoEndereco').fill('Rua Teste, 100');
    await page.locator('#campoCidade').fill('Jaboatão dos Guararapes');
    await page.locator('#campoUf').fill('PE');
    await page.locator('#campoCapacidade').fill('350');

    await page.locator('#botaoSalvarEvento').click();
    await expect.poll(()=>state.createCalls).toBe(1);
    expect(state.lastCreate.produtorId).toBe(PRODUCER_ID);
    expect(state.lastCreate.capacidade).toBe(350);
    expect(state.lastCreate.origemComercial).toBe('PRODUTOR');

    await expect(page.locator('#mensagemCadastro')).toContainText('rascunho');
    await expect.poll(()=>state.listCalls,{timeout:5000}).toBeGreaterThan(1);

    await expect(page.getByText('Evento Teste Produtor').first()).toBeVisible({timeout:10000});
    await expect(page.locator('.evento-card').first()).toContainText('RASCUNHO');
    await expect(page.locator('.evento-card').first()).toContainText('Verificar e publicar vendas');
    await expect(page.locator('.evento-card').first().getByRole('button',{name:'Verificar e publicar vendas'})).toHaveAttribute(
      'title',
      'Há pendências antes da publicação'
    );

    expect(state.publishCalls).toBe(0);
    expect(state.otherMutationCalls).toBe(0);
  });
});
