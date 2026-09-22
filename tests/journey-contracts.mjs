import fs from 'node:fs';

const failures=[];
function read(path){
  try{return fs.readFileSync(path,'utf8')}catch(e){failures.push(path+': arquivo ausente');return ''}
}
function requireAll(path, content, snippets){
  for(const snippet of snippets){
    if(!content.includes(snippet)) failures.push(path+': contrato de jornada ausente -> '+snippet);
  }
}
function requireLink(path, content, id, href){
  const idPos=content.indexOf('id="'+id+'"');
  if(idPos<0){failures.push(path+': link '+id+' ausente');return}
  const block=content.slice(Math.max(0,idPos-220),Math.min(content.length,idPos+520));
  if(!block.includes('href="'+href+'"')) failures.push(path+': '+id+' não aponta para '+href);
}

const home=read('index.html');
requireLink('index.html',home,'producerPortalCta','/produtor/');
requireLink('index.html',home,'partnerProgramCta','/parceiro/programa/');
requireLink('index.html',home,'partnerPortalCta','/parceiro/');
requireAll('index.html',home,[
  'Acessar Portal do Produtor',
  'Programa Parceiro CT',
  'Acessar Portal Parceiro CT'
]);

const produtor=read('produtor/index.html');
requireLink('produtor/index.html',produtor,'partnerPortalLink','/parceiro/');
requireLink('produtor/index.html',produtor,'partnerAdminLink','/parceiro/admin/');
requireAll('produtor/index.html',produtor,[
  'Portal Parceiro CT',
  'Gestão Parceiros CT',
  'id="logoutButton"'
]);

const parceiroAdmin=read('parceiro/admin/index.html');
requireLink('parceiro/admin/index.html',parceiroAdmin,'partnerPortalLink','/parceiro/');
requireLink('parceiro/admin/index.html',parceiroAdmin,'producerRequestsLink','/produtor/solicitacoes/');
requireAll('parceiro/admin/index.html',parceiroAdmin,[
  'href="/produtor/"',
  'id="logoutAdminButton"',
  'async function logoutAdmin()',
  "rpc('logoutUsuarioCT2'",
  'sessionStorage.removeItem(STORAGE)',
  'localStorage.removeItem(STORAGE)'
]);

const produtorSolicitacoes=read('produtor/solicitacoes/index.html');
requireAll('produtor/solicitacoes/index.html',produtorSolicitacoes,[
  'href="/parceiro/"',
  'Portal Parceiro CT',
  'href="/parceiro/admin/"',
  'Gestão Parceiros CT',
  'href="/produtor/"',
  'id="logoutAdminButton"',
  'async function logoutAdmin()',
  "rpc('logoutUsuarioCT2'"
]);

const parceiro=read('parceiro/index.html');
requireLink('parceiro/index.html',parceiro,'partnerProgramLink','/parceiro/programa/');
requireAll('parceiro/index.html',parceiro,[
  'Portal Parceiro CT',
  'Programa Parceiro',
  'id="logoutButton"'
]);

const programa=read('parceiro/programa/index.html');
if(!/href=["']\/parceiro\/["']/.test(programa)){
  failures.push('parceiro/programa/index.html: programa sem caminho para o Portal Parceiro CT');
}

if(failures.length){
  console.error('\n❌ GATE DE JORNADA/NAVEGAÇÃO FALHOU\n');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('✅ Gate de jornada: acessos críticos possuem caminho, retorno e saída.');
