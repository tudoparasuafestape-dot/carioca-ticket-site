import {test,expect} from '@playwright/test';

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
    const value=JSON.stringify({token:'CT-PRIVATE-E2E',expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(storage,value);
    localStorage.setItem(storage,value);
  },STORAGE);
}

async function mockProducer(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    state.methods.push(method);
    let ok=true,resultado=null,erro='';
    try{
      if(method==='ctEventoAcessoProdutorObterPROD'){
        resultado={
          sucesso:true,
          autorizado:true,
          evento:{id:'EVT-PRIVATE-E2E',nome:'Evento Privado E2E'},
          configuracaoPersistida:{
            modoAcesso:state.mode,
            validacaoConvite:'TOKEN_TELEFONE',
            mensagemConviteTitulo:'Você está convidado',
            mensagemConviteTexto:'',
            ctaConviteTexto:'Continuar'
          }
        };
      }else if(method==='ctEventoAcessoProdutorSalvarPROD'){
        const payload=args[2]||{};
        state.mode=String(payload.modoAcesso||'');
        state.saveAccessCalls++;
        resultado={
          sucesso:true,
          autorizado:true,
          evento:{id:'EVT-PRIVATE-E2E',nome:'Evento Privado E2E'},
          configuracaoPersistida:payload
        };
      }else if(method==='ctEventoConvidadosListarPROD'){
        resultado={sucesso:true,eventoNome:'Evento Privado E2E',convidados:state.guests};
      }else if(method==='ctEventoConvidadosSalvarPROD'){
        const payload=args[1]||{};
        state.saveGuestCalls++;
        state.guests=[{
          convidadoId:'CONV-E2E-1',
          nomeCompleto:payload.nomeCompleto,
          whatsapp:payload.whatsapp,
          unidadeApartamento:payload.unidadeApartamento,
          categoria:payload.categoria,
          quantidadeMaxima:payload.quantidadeMaxima,
          quantidadeConsumida:0,
          convite:null
        }];
        resultado={sucesso:true,convidado:state.guests[0]};
      }else{
        throw new Error('Método inesperado: '+method);
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\\/script></body></html>'
    });
  });
}

async function mockInvite(page,state){
  await page.route('https://script.google.com/**',async route=>{
    const p=new URLSearchParams(route.request().postData()||'');
    const id=String(p.get('ctMinhaCariocaRequestId')||'');
    const method=String(p.get('metodo')||'');
    let args=[];try{args=JSON.parse(p.get('argsJson')||'[]')}catch(_){}
    state.methods.push(method);
    let ok=true,resultado=null,erro='';
    try{
      if(method==='ctEventoConviteCarregarPublicoPROD'){
        resultado={
          sucesso:true,
          evento:{id:'EVT-PRIVATE-E2E',nome:'Evento Privado E2E',data:'24/10/2026',horario:'19:00',local:'Espaço E2E',cidade:'Jaboatão dos Guararapes',uf:'PE'},
          visual:{descricaoCurta:'Convite especial',descricaoCompleta:'Uma experiência privada.',observacoes:'Convite pessoal.'},
          convite:{nomeConvidado:'Convidado Teste',unidadeApartamento:'Apto 101',categoria:'VIP',disponivel:2,validacaoConvite:'TOKEN_TELEFONE'},
          experiencia:{texto:'Você recebeu um convite especial.',cta:'Continuar'}
        };
      }else if(method==='ctEventoConviteValidarPublicoPROD'){
        const payload=args[0]||{};
        expect(payload.token).toBe('TOKEN-E2E');
        expect(payload.telefone).toBe('81999991111');
        resultado={sucesso:true,autorizado:true,eventoId:'EVT-PRIVATE-E2E',accessGrant:'GRANT-E2E-ASSINADO',expiraEmEpoch:4102444800000};
      }else{
        resultado={sucesso:false,mensagem:'RPC não necessária no teste.'};
      }
    }catch(e){ok=false;erro=e&&e.message?e.message:String(e)}
    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+envelope(id,ok,resultado,erro)+', "*");<\\/script></body></html>'
    });
  });
}

test.describe('Evento privado — jornada essencial',()=>{
  test.skip(!BRANCH_MODE,'Jornada privada mutável roda somente na branch local.');

  test('produtor configura PRIVADO_CONVITE e cadastra convidado',async({page})=>{
    const state={mode:'PUBLICO',saveAccessCalls:0,saveGuestCalls:0,guests:[],methods:[]};
    await mockProducer(page,state);
    await seed(page);

    await page.goto('/produtor/convidados/?evento=EVT-PRIVATE-E2E',{waitUntil:'domcontentloaded'});
    await expect.poll(()=>state.methods.includes('ctEventoAcessoProdutorObterPROD')).toBe(true);
    await expect(page.locator('#eventName')).toHaveText('Evento Privado E2E');
    await expect(page.locator('#accessMode')).toHaveValue('PUBLICO');

    await page.locator('#accessMode').selectOption('PRIVADO_CONVITE');
    await expect(page.locator('#privateManagement')).not.toHaveClass(/hidden/);
    await page.locator('#saveAccess').click();

    await expect.poll(()=>state.saveAccessCalls).toBe(1);
    expect(state.mode).toBe('PRIVADO_CONVITE');
    await expect(page.locator('#message')).toContainText('Evento configurado como privado');

    await page.locator('#name').fill('Convidado Teste');
    await page.locator('#phone').fill('(81) 99999-1111');
    await page.locator('#limit').fill('2');
    await page.locator('#unit').fill('Apto 101');
    await page.locator('#category').fill('VIP');
    await page.locator('#saveGuest').click();

    await expect.poll(()=>state.saveGuestCalls).toBe(1);
    await expect(page.locator('#rows')).toContainText('Convidado Teste');
    await expect(page.locator('#rows')).toContainText('81999991111');
    await expect(page.locator('#sGuests')).toHaveText('1');
    await expect(page.locator('#sAllowed')).toHaveText('2');
  });

  test('convidado valida telefone, recebe grant e segue ao checkout privado',async({page})=>{
    const state={methods:[]};
    await mockInvite(page,state);

    await page.goto('/convite/?token=TOKEN-E2E',{waitUntil:'domcontentloaded'});
    await expect.poll(()=>state.methods.includes('ctEventoConviteCarregarPublicoPROD')).toBe(true);
    await expect(page.locator('#eventName')).toHaveText('Evento Privado E2E');
    await expect(page.locator('#guestName')).toHaveText('Convidado Teste');
    await expect(page.locator('#quota')).toHaveText('2');
    await expect(page.locator('#phoneField')).not.toHaveClass(/hidden/);

    await page.locator('#phone').fill('(81) 99999-1111');

    await Promise.all([
      page.waitForURL(/\/checkout-v2\/\?evento=EVT-PRIVATE-E2E&privado=1/,{timeout:15000}),
      page.locator('#continue').click()
    ]);

    const grant=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('CT_PRIVATE_GRANT_EVT-PRIVATE-E2E')||'null'));
    expect(grant).toEqual({grant:'GRANT-E2E-ASSINADO',expiraEmEpoch:4102444800000});
  });
});
