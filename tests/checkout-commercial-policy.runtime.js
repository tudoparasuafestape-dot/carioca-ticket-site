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
assert(checkout.includes('politicaRevisaoVista:state.feeRevision'),'quote revision sent to backend');
assert(checkout.includes("state.feeReady!==true"),'payment blocks without confirmed quote');
assert(checkout.includes("(Date.now()-state.feeQuotedAt)>30000"),'stale quote guard');
assert(checkout.includes("updateSummary();\n          })\n          .withFailureHandler"),'coupon recalculates commercial quote');

const payloadStart=checkout.indexOf('var payload={');
const payloadEnd=checkout.indexOf('};',payloadStart);
const payload=payloadStart>=0&&payloadEnd>payloadStart?checkout.slice(payloadStart,payloadEnd):'';
assert(payload.length>0,'checkout payment payload found');
['produtorId:','taxaCtPercentual:','pagadorTaxa:','valorTotal:','totalComprador:'].forEach((field)=>{
  assert(!payload.includes(field),'browser cannot control financial field '+field);
});

console.log('PASS checkout-commercial-policy.runtime');
