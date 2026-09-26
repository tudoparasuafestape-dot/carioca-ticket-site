import fs from 'node:fs';

const failures=[];

function read(path){
  try{return fs.readFileSync(path,'utf8')}
  catch(_){failures.push(path+': arquivo ausente');return ''}
}

function need(path,src,values){
  for(const value of values){
    if(!src.includes(value)){
      failures.push(path+': contrato ausente -> '+value);
    }
  }
}

const producer=read('produtor/campanhas/index.html');
const publicPage=read('campanha/index.html');
const portal=read('produtor/index.html');

need('produtor/campanhas/index.html',producer,[
  'Campanhas com recompensa',
  'AUTO_CLAIM',
  'MANUAL',
  'ctCampanhasRecompensasListarPROD',
  'ctCampanhasRecompensasSalvarPROD',
  'ctCampanhasRecompensasAlterarStatusPROD',
  'ctCampanhasRecompensasParticipacoesPROD',
  'ctCampanhasRecompensasValidarPROD',
  'ctCampanhasRecompensasReprocessarPROD',
  'ctCuponsCampanhasRegistrarCompartilhamentoPROD',
  'data-copy=',
  'data-wa=',
  'Cliques no link',
  'Conversão prêmio/clique',
  'Valor nominal',
  'Evento privado continua usando o fluxo de Convidados + Cortesias'
]);

need('campanha/index.html',publicPage,[
  "'ctMinhaCariocaAction','publicRpc'",
  'ctCampanhasRecompensasPublicoCarregarPROD',
  'ctCampanhasRecompensasPublicoParticiparPROD',
  'trafficSession()',
  'trafficOrigin()',
  'chaveIdempotencia:key()',
  'provaObrigatoria',
  'participou===false',
  'AGUARDANDO_VALIDACAO',
  'EMISSAO_PENDENTE',
  'PREMIADA',
  'carioca-ticket-preview-oficial-v9.jpg',
  'Uma participação não representa compra e não gera cobrança.'
]);

need('produtor/index.html',portal,[
  'id="campaignsLink"',
  'href="/produtor/campanhas/"',
  'el.campaignsLink.classList.toggle'
]);

for(const [path,src] of [
  ['produtor/campanhas/index.html',producer],
  ['campanha/index.html',publicPage],
]){
  for(const forbidden of [
    'ctCheckoutPixPublico',
    'ctCheckoutPublico',
    'ctAsaas',
    'criarCobranca',
    '/checkout/'
  ]){
    if(src.includes(forbidden)){
      failures.push(path+': recompensa não pode depender de compra/pagamento -> '+forbidden);
    }
  }
}

if(!/max-width:620px/.test(producer)){
  failures.push('produtor/campanhas/index.html: proteção mobile ausente');
}
if(!/max-width:540px/.test(publicPage)){
  failures.push('campanha/index.html: proteção mobile pública ausente');
}
if(!producer.includes('tablewrap{width:100%;max-width:100%;min-width:0;overflow-x:auto')){
  failures.push('produtor/campanhas/index.html: tabela pode voltar a estourar largura mobile');
}

if(failures.length){
  console.error('\n❌ CAMPANHAS RECOMPENSAS CONTRACT FALHOU\n');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}

console.log('CT_CAMPANHAS_RECOMPENSAS_SITE_CONTRACT_OK');
