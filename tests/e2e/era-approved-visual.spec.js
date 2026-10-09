import { test, expect, mockRoute, mockFailure, fixtureError } from './helpers/branch-isolated.cjs';

// Only these actions/methods belong to this fixture; all other RPCs fall through to denial.
const MOCK_CONTRACT = {
  "rpc": {
    "portalRpc": [
      "ctEventosOperacionalListarSeguraPROD",
      "ctEventosOperacionalVisualEraSeguraPROD"
    ]
  }
};
import fs from 'node:fs';
const EVENT='EVT-23112026-ERA-BEAUTY-EAC4B673';
const URL='https://cariocaticket.com.br/assets/eventos/era-beauty-capa-oficial-20261008.jpg';
const PHOTO=fs.readFileSync('assets/eventos/era-beauty-capa-oficial-20261008.jpg');
const PATCH={capaUrl:URL,posterUrl:URL,destaque:'Beleza • Negócios • Mulheres',descricaoCurta:'Encontro de mulheres empreendedoras da área da beleza.',descricaoCompleta:'Encontro de mulheres empreendedoras da área da beleza. Confira as informações do evento, escolha seu ingresso e finalize sua compra com segurança pela Carioca Ticket.'};
PATCH.categoria='Beleza & Neg\u00f3cios';
const CORRUPT_CATEGORY='Beleza & Neg\u00c3\u00b3cios';

test.describe('Operacao visual especifica do ERA',()=>{
  test.skip(process.env.CT_BRANCH_MODE!=='1'||!/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.CT_BASE_URL||''),'Somente local com mocks.');
  async function setup(page,state={}) {
    Object.assign(state,{calls:[],saves:0,applied:false});
    await mockRoute(page, { resources: [URL] },route=>{
      const url=new globalThis.URL(route.request().url());
      if(['127.0.0.1','localhost'].includes(url.hostname))return route.fallback();
      if(route.request().url()===URL)return state.imageError?route.abort():route.fulfill({contentType:'image/jpeg',body:PHOTO});
      return route.abort();
    });
    await mockRoute(page, MOCK_CONTRACT,async route=>{
      const p=new URLSearchParams(route.request().postData()||''),id=p.get('ctMinhaCariocaRequestId'),method=p.get('metodo');
      const args=JSON.parse(p.get('argsJson')||'[]');let result,error='';
      try {
        expect(args[0]).toBe('SYNTHETIC_ERA_SESSION');
        if(method==='ctEventosOperacionalListarSeguraPROD') result={sucesso:true,autenticado:true,autorizado:true,eventos:[{id:state.noEra?'OUTRO':EVENT,nome:'ERA BEAUTY',status:'ATIVO',publicacao:{publicado:true}},{id:'OUTRO2',nome:'Outro evento',status:'ATIVO'}]};
        else if(method==='ctEventosOperacionalVisualEraSeguraPROD') {
          expect(args).toHaveLength(2);state.calls.push(args[1]);
          expect(Object.keys(args[1]).sort()).toEqual(args[1].acao==='PREVIA'?['acao']:['acao','revisao']);
          if(state.denied)throw fixtureError('ERA VISUAL: Sessão, papel ou vínculo não autorizado. Entre novamente.');
          if(args[1].acao==='PREVIA') {
            if(state.previewHold)await state.previewHold;
            const current=state.applied?(state.corruptCategoryReadback?{...PATCH,categoria:CORRUPT_CATEGORY}:PATCH):(state.categoryOnly?{...PATCH,categoria:CORRUPT_CATEGORY}:{});
            result={sucesso:true,eventoId:state.wrongEvent?'OUTRO':EVENT,revisao:'a'.repeat(64),atual:current,proposto:{...PATCH},jaAplicado:state.applied};
            if(state.badUrl)result.proposto.capaUrl='https://evil.example/x.jpg';
            if(state.missingCategory)delete result.proposto.categoria;
            if(state.corruptCategory)result.proposto.categoria=CORRUPT_CATEGORY;
          } else {
            expect(args[1].acao).toBe('CONFIRMAR');expect(args[1].revisao).toBe('a'.repeat(64));state.saves++;
            if(state.hold)await state.hold;
            if(state.fail)throw fixtureError('ERA VISUAL: A autorização foi revogada.');
            state.applied=true;
            if(state.lost)throw fixtureError('Tempo excedido.');
            result={sucesso:true,eventoId:EVENT,textosExatos:true,visual:{...PATCH}};
            if(state.badReadback)result.visual.destaque='incorreto';
            if(state.corruptCategoryReadback)result.visual.categoria=CORRUPT_CATEGORY;
          }
        } else throw Error('Metodo nao autorizado pelo mock: '+method);
      } catch(err){ mockFailure(route, err);error=err.message;}
      const body=JSON.stringify({ctMinhaCariocaPost:true,id,ok:!error,resultado:error?null:result,erro:error}).replace(/</g,'\\u003c');
      await route.fulfill({contentType:'text/html; charset=utf-8',body:`<script>window.top.postMessage(${body},'*');</script>`});
    });
    if(!state.noSession)await page.addInitScript(()=>sessionStorage.setItem('CT_PORTAL_PRODUTOR_PROD_SESSION_V1',JSON.stringify({token:'SYNTHETIC_ERA_SESSION',expiraEm:'2099-01-01T00:00:00Z'})));
    await page.goto('/eventos-v2/');return state;
  }
  async function open(page){await page.getByRole('button',{name:'Aplicar visual aprovado do ERA',exact:true}).click();}
  test('acao so aparece no ERA retornado pela listagem autorizada; sem uploader',async({page})=>{
    const s=await setup(page);await expect(page.getByRole('button',{name:'Aplicar visual aprovado do ERA',exact:true})).toHaveCount(1);
    await expect(page.locator('input[type=file]')).toHaveCount(0);expect(s.saves).toBe(0);
  });
  test('sem sessao ou sem ERA nao oferece acao',async({page})=>{
    await setup(page,{noSession:true});await expect(page.getByText('Acesso restrito.',{exact:false})).toBeVisible();await expect(page.locator('[data-era-approved-visual]')).toHaveCount(0);
  });
  test('outro evento nao recebe botao',async({page})=>{await setup(page,{noEra:true});await expect(page.getByText('Outro evento',{exact:true})).toBeVisible();await expect(page.locator('[data-era-approved-visual]')).toHaveCount(0);});
  test('previa exata e completa; cancelar nunca grava',async({page},info)=>{
    const s=await setup(page);await open(page);await expect(page.locator('#eraVisualConfirm')).toBeEnabled();
    await expect(page.locator('#eraVisualHighlight')).toHaveText(PATCH.destaque);await expect(page.locator('#eraVisualShort')).toHaveText(PATCH.descricaoCurta);await expect(page.locator('#eraVisualFull')).toHaveText(PATCH.descricaoCompleta);
    await expect(page.locator('#eraVisualCategory')).toHaveText('Beleza & Neg\u00f3cios');
    await expect(page.locator('#eraVisualImage')).toHaveCSS('object-fit','contain');await page.screenshot({path:info.outputPath('era-approved-preview.png'),fullPage:true});
    await page.locator('#eraVisualClose').click();expect(s.saves).toBe(0);expect(s.calls).toEqual([{acao:'PREVIA'}]);
  });
  test('confirma uma vez, bloqueia duplo envio e confere readback',async({page})=>{
    let release;const s=await setup(page,{hold:new Promise(r=>release=r)});await open(page);await expect(page.locator('#eraVisualConfirm')).toBeEnabled();await page.locator('#eraVisualConfirm').click();
    await expect.poll(()=>s.saves).toBe(1);await expect(page.locator('#eraVisualConfirm')).toBeDisabled();await expect(page.locator('#eraVisualClose')).toBeDisabled();release();await expect(page.locator('#eraVisualStatus')).toContainText('aplicados e conferidos com sucesso');expect(s.saves).toBe(1);
  });
  test('acesso negado falha fechado sem confirmar',async({page})=>{const s=await setup(page,{denied:true});await open(page);await expect(page.locator('#eraVisualStatus')).toContainText('não autorizado');await expect(page.locator('#eraVisualConfirm')).toBeDisabled();expect(s.saves).toBe(0);});
  for(const flag of ['wrongEvent','badUrl','imageError','missingCategory','corruptCategory'])test(flag+' bloqueia confirmacao',async({page})=>{const s=await setup(page,{[flag]:true});await open(page);await expect(page.locator('#eraVisualStatus')).toHaveAttribute('data-error','true');await expect(page.locator('#eraVisualConfirm')).toBeDisabled();expect(s.saves).toBe(0);});
  test('categoria residual aparece em UTF-8 e confirma mesmo com os cinco campos anteriores aplicados',async({page})=>{
    const s=await setup(page,{categoryOnly:true});await open(page);
    await expect(page.locator('#eraVisualCategory')).toHaveText('Beleza & Neg\u00f3cios');
    expect(Buffer.from(await page.locator('#eraVisualCategory').textContent(),'utf8').toString('hex')).toBe('42656c657a612026204e6567c3b363696f73');
    await expect(page.locator('#eraVisualConfirm')).toBeEnabled();await page.locator('#eraVisualConfirm').click();
    await expect(page.locator('#eraVisualStatus')).toContainText('aplicados e conferidos com sucesso');
    expect(s.saves).toBe(1);expect(s.calls).toEqual([{acao:'PREVIA'},{acao:'CONFIRMAR',revisao:'a'.repeat(64)}]);
  });
  test('readback com categoria corrompida exige consulta e nunca repete a gravacao',async({page})=>{
    const s=await setup(page,{corruptCategoryReadback:true});await open(page);
    await expect(page.locator('#eraVisualConfirm')).toBeEnabled();await page.locator('#eraVisualConfirm').click();
    await expect(page.locator('#eraVisualStatus')).toContainText('resultado ainda n\u00e3o foi confirmado');
    await expect(page.locator('#eraVisualConfirm')).toBeDisabled();expect(s.saves).toBe(1);
    expect(s.calls.map(c=>c.acao)).toEqual(['PREVIA','CONFIRMAR','PREVIA']);
  });
  test('resposta perdida consulta readback sem repetir mutacao',async({page})=>{const s=await setup(page,{lost:true});await open(page);await expect(page.locator('#eraVisualConfirm')).toBeEnabled();await page.locator('#eraVisualConfirm').click();await expect(page.locator('#eraVisualStatus')).toContainText('já estão aplicados');expect(s.saves).toBe(1);expect(s.calls.map(c=>c.acao)).toEqual(['PREVIA','CONFIRMAR','PREVIA']);});
  test('falha mantem erro e exige consulta, sem retry automatico',async({page})=>{const s=await setup(page,{fail:true});await open(page);await expect(page.locator('#eraVisualConfirm')).toBeEnabled();await page.locator('#eraVisualConfirm').click();await expect(page.locator('#eraVisualStatus')).toContainText('revogada');await expect(page.locator('#eraVisualCheck')).toBeVisible();await expect(page.locator('#eraVisualConfirm')).toBeDisabled();expect(s.saves).toBe(1);});
  test('cancelar previa pendente ignora resposta tardia',async({page})=>{let release;const s=await setup(page,{previewHold:new Promise(r=>release=r)});await open(page);await page.locator('#eraVisualClose').click();release();await expect(page.locator('.era-visual-dialog')).not.toBeVisible();expect(s.saves).toBe(0);});
});
