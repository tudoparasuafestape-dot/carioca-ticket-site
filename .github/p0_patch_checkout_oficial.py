from pathlib import Path
import json


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 marcador, encontrado {count}')
    return text.replace(old, new, 1)


path = Path('checkout/index.html')
html = path.read_text(encoding='utf-8')

# 1) bloco visual da taxa no checkout oficial, sem trocar o checkout inteiro.
summary_marker = '''      <div id="summary" class="ticket-summary hidden">
        <div><small>SEU PEDIDO</small><b id="summaryTitle">—</b><div id="summaryAccess" class="help"></div></div>
        <div style="text-align:right"><small>TOTAL</small><b id="summaryPrice">R$ 0,00</b></div>
      </div>
      <div id="couponBox" class="coupon-box">
'''
summary_new = '''      <div id="summary" class="ticket-summary hidden">
        <div><small>SEU PEDIDO</small><b id="summaryTitle">—</b><div id="summaryAccess" class="help"></div></div>
        <div style="text-align:right"><small>TOTAL</small><b id="summaryPrice">R$ 0,00</b></div>
      </div>
      <div id="feeSummary" class="promo-summary hidden">
        <div class="promo-line"><span>Ingressos</span><span id="feeBase">R$ 0,00</span></div>
        <div class="promo-line"><span><span id="feeLabel">Taxa Carioca Ticket</span> <button id="feeInfo" type="button" aria-label="Entenda a taxa Carioca Ticket" title="Entenda a taxa" style="min-height:auto;padding:0 3px;border:0;background:transparent;color:#7a5b0b;font-size:14px;vertical-align:baseline">ⓘ</button></span><span id="feePlatform">R$ 0,00</span></div>
        <div id="feeAdditionalRow" class="promo-line hidden"><span>Encargos comerciais adicionais</span><span id="feeAdditional">R$ 0,00</span></div>
        <div class="promo-line total"><span>Total a pagar</span><span id="feeTotal">R$ 0,00</span></div>
        <div id="feeNote" class="help" style="margin-top:8px"></div>
      </div>
      <div id="couponBox" class="coupon-box">
'''
html = replace_once(html, summary_marker, summary_new, 'bloco visual taxa')

# 2) estado isolado da cotacao comercial.
state_old = '''        promotion:null,
        couponBusy:false
      };'''
state_new = '''        promotion:null,
        couponBusy:false,
        politicaComercialAtiva:false,
        feePreview:null,
        feeBusy:false,
        feeReady:false,
        feeRevision:'',
        feeQuotedAt:0,
        feeSeq:0,
        feeTimer:null
      };'''
html = replace_once(html, state_old, state_new, 'estado taxa')

# 3) referencias DOM.
els_old = """        'typeSelect','lotSelect','quantity','summary','summaryTitle','summaryAccess','summaryPrice','participants',
        'couponBox'"""
els_new = """        'typeSelect','lotSelect','quantity','summary','summaryTitle','summaryAccess','summaryPrice','participants',
        'feeSummary','feeBase','feeLabel','feeInfo','feePlatform','feeAdditionalRow','feeAdditional','feeTotal','feeNote',
        'couponBox'"""
html = replace_once(html, els_old, els_new, 'elementos taxa')

# 4) explicacao acessivel da taxa via modal existente.
modal_old = """      el.modalOk.onclick=closeModal;
      el.modalBg.onclick=function(e){if(e.target===el.modalBg)closeModal();};
"""
modal_new = """      el.modalOk.onclick=closeModal;
      el.modalBg.onclick=function(e){if(e.target===el.modalBg)closeModal();};
      el.feeInfo.onclick=function(){
        modal(
          'Sobre a taxa Carioca Ticket',
          'A taxa cobre a tecnologia de venda, pagamento, emissão e validação do ingresso. O percentual e quem paga dependem da condição comercial deste evento. O valor exibido aqui é confirmado novamente pelo sistema antes de criar o pagamento.'
        );
      };
"""
html = replace_once(html, modal_old, modal_new, 'modal explicacao taxa')

# 5) o catalogo informa se o rollout comercial esta ativo. Desligado = fluxo legado sem RPC extra.
catalog_old = """            state.catalog=res;
            try {
"""
catalog_new = """            state.catalog=res;
            state.politicaComercialAtiva=
              !!(
                res.politicaComercial &&
                res.politicaComercial.ativa === true
              );
            try {
"""
html = replace_once(html, catalog_old, catalog_new, 'flag comercial catalogo')

# 6) cotacao visual. Backend continua autoritativo; falha de preview bloqueia somente quando rollout estiver ativo.
summary_tail_old = """        el.summaryAccess.textContent=accesses+(accesses===1?' acesso':' acessos');
        el.summary.classList.remove('hidden');
        renderPromotion();
        renderParticipants(Math.max(0,accesses-1));
      }

      function renderParticipants(count){
"""
summary_tail_new = """        el.summaryAccess.textContent=accesses+(accesses===1?' acesso':' acessos');
        el.summary.classList.remove('hidden');
        renderPromotion();
        renderParticipants(Math.max(0,accesses-1));

        var baseFinanceira=
          state.promotion&&state.promotion.calculo
            ?Number(state.promotion.calculo.valorFinalTotal||0)
            :total;

        atualizarTaxa(
          baseFinanceira,
          q>0?baseFinanceira/q:baseFinanceira,
          q
        );
      }

      function atualizarTaxa(valorIngressos,precoUnitario,quantidadeVendas){
        var seq=++state.feeSeq;

        if(state.feeTimer){
          clearTimeout(state.feeTimer);
          state.feeTimer=null;
        }

        if(!state.politicaComercialAtiva){
          state.feeBusy=false;
          state.feeReady=true;
          state.feeRevision='';
          state.feeQuotedAt=0;
          state.feePreview=null;
          el.feeSummary.classList.add('hidden');
          el.summaryPrice.textContent=money(valorIngressos||0);
          return;
        }

        state.feeBusy=true;
        state.feeReady=false;

        state.feeTimer=setTimeout(function(){
          state.feeTimer=null;

          google.script.run
            .withSuccessHandler(function(res){
              if(seq!==state.feeSeq)return;
              state.feeBusy=false;
              state.feePreview=res||null;
              state.feeRevision=String(res&&res.revisao||'');
              state.feeQuotedAt=Date.now();

              var resumo=res&&res.resumo?res.resumo:null;
              if(!res||res.sucesso!==true||!resumo){
                state.feeReady=false;
                el.feeSummary.classList.add('hidden');
                el.summaryPrice.textContent=money(valorIngressos||0);
                return;
              }

              state.feeReady=true;

              var subtotal=Number(resumo.subtotalIngressos||valorIngressos||0);
              var taxaCt=Number(resumo.taxaCtTotal||0);
              var taxaComprador=Number(resumo.taxaComprador||0);
              var adicionais=Number(resumo.adicionaisComprador||0);
              var totalFinal=Number(resumo.totalComprador||subtotal);
              var pagador=String(resumo.pagadorTaxa||'COMPRADOR').toUpperCase();
              var taxaPct=Number(resumo.taxaCtPercentual||0);
              var compradorPct=subtotal>0?(taxaComprador/subtotal*100):0;
              var fmtPct=function(v){
                return Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
              };

              el.feeBase.textContent=money(subtotal);
              el.feePlatform.textContent=money(taxaComprador);
              el.feeAdditional.textContent=money(adicionais);
              el.feeAdditionalRow.classList.toggle('hidden',adicionais<=0);
              el.feeTotal.textContent=money(totalFinal);
              el.summaryPrice.textContent=money(totalFinal);

              if(pagador==='PRODUTOR'){
                el.feeLabel.textContent='Taxa Carioca Ticket ('+fmtPct(taxaPct)+') · paga pelo produtor';
                el.feeNote.textContent=taxaCt>0
                  ?'O produtor absorve '+money(taxaCt)+'. Nenhuma parte da taxa CT foi adicionada ao seu total.'
                  :'Sem taxa adicional para o comprador.';
              }else if(pagador==='DIVIDIDA'){
                el.feeLabel.textContent='Sua parte da taxa Carioca Ticket ('+fmtPct(compradorPct)+')';
                el.feeNote.textContent='O produtor absorve '+money(Math.max(0,taxaCt-taxaComprador))+'.';
              }else{
                el.feeLabel.textContent='Taxa Carioca Ticket ('+fmtPct(compradorPct)+')';
                el.feeNote.textContent=taxaComprador>0?'A taxa está incluída no total a pagar.':'Sem taxa adicional para o comprador.';
              }

              if(adicionais>0){
                el.feeNote.textContent+=' Encargos adicionais informados separadamente acima.';
              }

              if(res.degradado===true){
                el.feeNote.textContent='Sem taxa adicional para o comprador nesta operação.';
              }

              el.feeSummary.classList.toggle('hidden',taxaCt<=0&&adicionais<=0);
            })
            .withFailureHandler(function(){
              if(seq!==state.feeSeq)return;
              state.feeBusy=false;
              state.feeReady=false;
              state.feeRevision='';
              state.feeQuotedAt=0;
              state.feePreview=null;
              el.feeSummary.classList.add('hidden');
              el.summaryPrice.textContent=money(valorIngressos||0);
            })
            .ctPoliticaComercialPreviewPublicoPROD({
              eventoId:state.eventId,
              tipoIngressoId:state.type?state.type.id:'',
              loteId:state.lot?state.lot.id:'',
              campanhaId:'',
              precoUnitario:Number(precoUnitario||0),
              quantidade:Number(quantidadeVendas||1)
            });
        },180);
      }

      function renderParticipants(count){
"""
html = replace_once(html, summary_tail_old, summary_tail_new, 'cotacao comercial')

# 7) cupom deve recalcular taxa sobre o valor final promocional.
coupon_success_old = """            el.couponMessage.textContent='Cupom aplicado! Você ganhou '+money(res.calculo&&res.calculo.descontoTotal||0)+' de desconto.'+(avisoPromo?' '+avisoPromo:'');
            renderPromotion();
"""
coupon_success_new = """            el.couponMessage.textContent='Cupom aplicado! Você ganhou '+money(res.calculo&&res.calculo.descontoTotal||0)+' de desconto.'+(avisoPromo?' '+avisoPromo:'');
            renderPromotion();
            updateSummary();
"""
html = replace_once(html, coupon_success_old, coupon_success_new, 'recalculo taxa apos cupom')

# 8) antes de criar cobranca, a UI precisa ter cotacao recente quando a politica estiver ativa.
payment_old = """      function createPayment(){
        if(state.busy)return;
        var err=validate();
"""
payment_new = """      function createPayment(){
        if(state.busy)return;

        if(
          state.feeBusy||
          state.feeReady!==true||
          (
            state.politicaComercialAtiva&&
            (
              !state.feeQuotedAt||
              (Date.now()-state.feeQuotedAt)>30000
            )
          )
        ){
          if(!state.feeBusy){
            updateSummary();
          }
          modal(
            'Confirmando o total',
            'Aguarde a atualização do valor final antes de continuar para o pagamento.'
          );
          return;
        }

        var err=validate();
"""
html = replace_once(html, payment_old, payment_new, 'gate cotacao antes pagamento')

payload_old = """          cupomCodigo:state.promotion&&state.promotion.cupom?String(state.promotion.cupom.codigo||''):'',
          idempotenciaChave:getOrCreateIdempotency()
"""
payload_new = """          cupomCodigo:state.promotion&&state.promotion.cupom?String(state.promotion.cupom.codigo||''):'',
          politicaRevisaoVista:state.feeRevision,
          idempotenciaChave:getOrCreateIdempotency()
"""
html = replace_once(html, payload_old, payload_new, 'revisao politica no payload')

path.write_text(html, encoding='utf-8')

# 9) fortalecer contrato existente para o checkout OFICIAL, nao apenas v2.
test_path = Path('tests/politica-comercial.contract.mjs')
test = test_path.read_text(encoding='utf-8')
insert_before = """const finance=read('produtor/financeiro/index.html');
"""
official_contract = """const checkoutOfficial=requireAll('checkout/index.html',[
  'feeReady:false',
  'politicaComercialAtiva:false',
  'ctPoliticaComercialPreviewPublicoPROD',
  'politicaRevisaoVista:state.feeRevision',
  'Confirmando o total',
  'feeQuotedAt',
  '(Date.now()-state.feeQuotedAt)>30000',
  'Taxa Carioca Ticket (',
  'Sua parte da taxa Carioca Ticket (',
  'Entenda a taxa Carioca Ticket',
  'Encargos comerciais adicionais',
  'ctCheckoutPixPublicoIniciarPROD(payload)',
  'getOrCreateIdempotency()',
  'cupomCodigo:'
]);

const finance=read('produtor/financeiro/index.html');
"""
test = replace_once(test, insert_before, official_contract, 'contrato checkout oficial')
test_path.write_text(test, encoding='utf-8')

# 10) incluir o contrato comercial no conjunto padrao de contratos futuros.
pkg_path = Path('package.json')
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
contracts = pkg['scripts']['test:contracts']
if 'tests/politica-comercial.contract.mjs' not in contracts:
    pkg['scripts']['test:contracts'] = contracts + ' && node tests/politica-comercial.contract.mjs'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# remove arquivos temporarios do estado final da branch.
Path('.github/workflows/temp-p0-checkout-oficial.yml').unlink()
Path('.github/p0_patch_checkout_oficial.py').unlink()
