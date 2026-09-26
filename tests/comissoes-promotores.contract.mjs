import fs from 'node:fs';

const failures=[];

function read(path){
  try{return fs.readFileSync(path,'utf8')}
  catch(_){failures.push(path+': arquivo ausente');return ''}
}

function need(path,src,values){
  for(const value of values){
    if(!src.includes(value)) failures.push(path+': contrato ausente -> '+value);
  }
}

const producer=read('produtor/comissoes/index.html');
const portal=read('produtor/index.html');
const event=read('evento-v2/index.html');
const checkout=read('checkout-v2/index.html');

need('produtor/comissoes/index.html',producer,[
  'Promotores, influenciadores e vendedores',
  "rpc('ctComissoesPromotoresCarregarPROD'",
  "rpc('ctGestaoAcessosAdicionarUsuarioPROD'",
  "'COMISSIONADO'",
  "rpc('ctComissoesPromotoresSalvarCanalPROD'",
  "rpc('ctComissoesEventoSalvarRegraPROD'",
  "rpc('ctComissoesPromotoresSalvarMetaPROD'",
  "rpc('ctComissoesPromotoresRegistrarPagamentoPROD'",
  'PERCENTUAL',
  'FIXO_POR_VENDA',
  'FIXO_POR_ACESSO',
  'PROMOTOR',
  'INFLUENCIADOR',
  'VENDEDOR',
  'Copiar link',
  'WhatsApp',
  'Registrar pagamento',
  'A Carioca Ticket não transfere dinheiro automaticamente nesta versão',
  'O bônus não será lançado ou pago automaticamente.'
]);

need('produtor/index.html',portal,[
  'id="commissionsLink"',
  'href="/produtor/comissoes/"',
  'el.commissionsLink.classList.toggle'
]);

need('evento-v2/index.html',event,[
  "loc.parameter&&loc.parameter.seller",
  "loc.parameter&&loc.parameter.refcode",
  "q+='&seller='",
  "q+='&refcode='",
  '/checkout-v2/?evento='
]);

need('checkout-v2/index.html',checkout,[
  "loc.parameter&&loc.parameter.seller",
  "loc.parameter&&loc.parameter.refcode",
  'vendedorToken:state.vendedorToken',
  "q+='&seller='"
]);

for(const forbidden of [
  'ctAsaasProvider',
  'criarCobranca',
  '/transfers',
  'ctParceiroCT'
]){
  if(producer.includes(forbidden)){
    failures.push('produtor/comissoes/index.html: gestão não pode movimentar dinheiro nem acoplar Parceiro CT -> '+forbidden);
  }
}

if(!producer.includes('tablewrap{width:100%;max-width:100%;min-width:0;overflow-x:auto')){
  failures.push('produtor/comissoes/index.html: tabela sem proteção de overflow mobile');
}
if(!producer.includes('@media(max-width:620px)')){
  failures.push('produtor/comissoes/index.html: proteção mobile ausente');
}

const checkoutNormalFlow=[
  "vendedorToken:''",
  'vendedorToken:state.vendedorToken'
];
for(const item of checkoutNormalFlow){
  if(!checkout.includes(item)){
    failures.push('checkout-v2/index.html: atribuição opcional não preservada -> '+item);
  }
}

if(failures.length){
  console.error('\n❌ COMISSÕES PROMOTORES SITE CONTRACT FALHOU\n');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}

console.log('CT_COMISSOES_PROMOTORES_SITE_CONTRACT_OK');
