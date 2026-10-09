const fs = require('fs');
const policy = require('../assets/checkout-commercial-policy.js');

function assert(cond,msg){if(!cond)throw new Error(msg)}

let p=policy.present({pagadorTaxa:'COMPRADOR',taxaCtPercentual:10,taxaCtTotal:10,taxaComprador:10,taxaProdutor:0});
assert(p.label.includes('10%'),'buyer percentage');
assert(p.note.includes('incluída'),'buyer note');

p=policy.present({pagadorTaxa:'PRODUTOR',taxaCtPercentual:8,taxaCtTotal:8,taxaComprador:0,taxaProdutor:8});
assert(p.label.includes('8%'),'producer percentage');
assert(p.label.includes('produtor'),'producer label');
assert(p.note.includes('R$ 8,00')||p.note.includes('R$ 8,00'),'producer amount');

p=policy.present({pagadorTaxa:'DIVIDIDA',taxaCtPercentual:10,taxaCtTotal:10,taxaComprador:4,taxaProdutor:6});
assert(p.label.includes('10%'),'split percentage');
assert(p.note.includes('4,00'),'split buyer amount');
assert(p.note.includes('6,00'),'split producer amount');
assert(p.infoText.length>40,'info explanation');

p=policy.present({pagadorTaxa:'COMPRADOR',taxaCtPercentual:0,taxaCtTotal:0,taxaComprador:0,taxaProdutor:0});
assert(p.label.includes('0%'),'zero percentage');
assert(p.note.includes('Sem taxa adicional'),'zero fee note');

// Contrato do checkout oficial: a tela apresenta a taxa, mas a fonte de verdade financeira continua no backend.
const checkout = fs.readFileSync('checkout/index.html','utf8');
assert(checkout.includes('CT_P0_COMMERCIAL_POLICY_OFFICIAL_CHECKOUT_V1'),'official checkout marker');
assert(checkout.includes('/assets/checkout-commercial-policy.js'),'official checkout helper');
assert(checkout.includes('id="feeSummary"'),'official fee summary');
assert(checkout.includes('id="feeInfo"'),'clickable fee information');
assert(checkout.includes('ctPoliticaComercialPreviewPublicoPROD'),'backend fee preview');
assert(checkout.includes('payload.politicaRevisaoVista=state.feeRevision'),'quote revision sent to backend');
assert(checkout.includes("state.feeReady!==true"),'payment blocks without confirmed quote');
assert(checkout.includes("(Date.now()-state.feeQuotedAt)>30000"),'stale quote guard');
assert(checkout.includes("if(state.politicaComercialAtiva)updateSummary();\n            else {renderPromotion();displayLegacyFee(res.calculo&&res.calculo.valorFinalTotal);}"),'ERA coupon requotes; non-ERA retains existing behavior');

const payloadStart=checkout.indexOf('var payload={');
const payloadEnd=checkout.indexOf('};',payloadStart);
const payload=payloadStart>=0&&payloadEnd>payloadStart?checkout.slice(payloadStart,payloadEnd):'';
assert(payload.length>0,'checkout payment payload found');
['produtorId:','taxaCtPercentual:','pagadorTaxa:','valorTotal:','totalComprador:'].forEach((field)=>{
  assert(!payload.includes(field),'browser cannot control financial field '+field);
});

const valid={sucesso:true,degradado:false,rolloutAtivo:true,revisao:'POL-ERA-REV1',resumo:{pagadorTaxa:'COMPRADOR',subtotalIngressos:87,taxaCtPercentual:10,taxaCtTotal:8.7,taxaComprador:8.7,taxaProdutor:0,adicionaisComprador:0,totalComprador:95.7}};
assert(policy.validQuote(valid,87),'valid 87 + 8.70 quote');
const clone=()=>JSON.parse(JSON.stringify(valid));
for(const mutate of [r=>r.degradado=true,r=>delete r.degradado,r=>r.resumo.pagadorTaxa='PRODUTOR',r=>r.resumo.taxaCtPercentual=5,r=>r.rolloutAtivo=false,r=>delete r.rolloutAtivo,r=>r.revisao='',r=>r.revisao='  ',r=>delete r.revisao,r=>r.resumo=null,r=>delete r.resumo.taxaComprador,r=>r.resumo.totalComprador=87,r=>r.resumo.taxaComprador=-1,r=>r.resumo.taxaComprador='8.7',r=>r.resumo.taxaComprador=NaN,r=>r.resumo.taxaComprador=Infinity,r=>r.resumo.taxaProdutor=1]){
  const r=clone();mutate(r);assert(!policy.validQuote(r,87),'unsafe quote rejected');
}
assert(!policy.validQuote(valid,120),'mismatched subtotal rejected');
let zero=clone();Object.assign(zero.resumo,{taxaCtPercentual:0,taxaCtTotal:0,taxaComprador:0,totalComprador:87});
assert(!policy.validQuote(zero,87),'paid zero-fee quote rejected');
Object.assign(zero.resumo,{subtotalIngressos:0,totalComprador:0});
assert(policy.validQuote(zero,0),'authoritative genuinely free quote allowed');
console.log('PASS checkout-commercial-policy.runtime');

