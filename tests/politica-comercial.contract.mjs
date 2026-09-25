import fs from 'node:fs';

function read(path){
  if(!fs.existsSync(path)) throw new Error('Arquivo ausente: '+path);
  return fs.readFileSync(path,'utf8');
}
function requireAll(path,items){
  const c=read(path);
  for(const item of items){
    if(!c.includes(item)) throw new Error(path+' incompleto: '+item);
  }
  if(/window\.(?:alert|confirm|prompt)\s*\(/i.test(c)){
    throw new Error(path+' usa dialogo nativo');
  }
  return c;
}

const master=requireAll('backoffice/politicas-comerciais/index.html',[
  '<title>Políticas Comerciais | Backoffice Master</title>',
  '10% é o padrão da plataforma',
  'COMPRADOR','PRODUTOR','DIVIDIDA',
  'PARCEIRO_CT','PROMOTOR','INFLUENCIADOR','AGENCIA','VENDEDOR','OUTRO',
  'MARGEM_CT','PERCENTUAL_INGRESSOS','PERCENTUAL_TAXA_CT','FIXO_POR_INGRESSO',
  'ctPoliticaComercialMasterListarPROD',
  'ctPoliticaComercialMasterSalvarPROD',
  'ctPoliticaComercialMasterDesativarPROD',
  'ctPoliticaComercialSimularPROD',
  'movimentouDinheiro===true',
  'validFrom','validUntil','Usar como base','Desativar',
  'APP_DEV',
  'AKfycbyhx6mnGJMsgpGmx-C1r6ZUXbrE66-X6Rkusp1ulVOGcDfJfIs-jgysWp1PfkqB1UC3hg'
]);

const producer=requireAll('produtor/politica-comercial/index.html',[
  '<title>Política Comercial | Portal do Produtor</title>',
  'Somente leitura',
  'ctPortalProdutorRestaurarSessaoIsoladaPROD',
  'ctPoliticaComercialProdutorResumoPROD',
  'ctPoliticaComercialSimularPROD',
  'movimentouDinheiro===true',
  'APP_DEV'
]);

const backoffice=read('backoffice/index.html');
if(!backoffice.includes('href="/backoffice/politicas-comerciais/"'))throw new Error('Backoffice sem acesso a politicas comerciais');

const portal=read('produtor/index.html');
for(const s of ['id="commercialPolicyLink"','href="/produtor/politica-comercial/"','el.commercialPolicyLink.classList.toggle']){
  if(!portal.includes(s))throw new Error('Portal produtor sem politica comercial: '+s);
}

const finance=read('produtor/financeiro/index.html');
if(!finance.includes('href="/produtor/politica-comercial/"'))throw new Error('Financeiro produtor sem acesso a politica comercial');

if(master.includes('/transfers')||producer.includes('/transfers'))throw new Error('Politica comercial nao pode transferir dinheiro');
if(master.includes('ctAsaasProvider')||producer.includes('ctAsaasProvider'))throw new Error('UI comercial nao pode acionar provider');

console.log('CT_SITE_POLITICA_COMERCIAL_CONTRACT_OK');
