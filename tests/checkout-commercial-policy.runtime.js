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

console.log('PASS checkout-commercial-policy.runtime');
