import fs from 'node:fs';

function read(path){
  if(!fs.existsSync(path)) throw new Error('arquivo ausente: '+path);
  return fs.readFileSync(path,'utf8');
}
function ok(cond,msg){if(!cond)throw new Error(msg)}

const convite=read('convite/index.html');
const checkout=read('checkout-v2/index.html');
const produtor=read('produtor/convidados/index.html');
const eventos=read('eventos-v2/index.html');
const produtorPortal=read('produtor-v2/index.html');
const master=read('backoffice/modalidades/index.html');
const commercial=read('backoffice/politicas-comerciais/index.html');
const backoffice=read('backoffice/index.html');

ok(/<meta name="robots" content="noindex,nofollow,noarchive">/.test(convite),'convite deve ser noindex');
ok(convite.includes("add('ctMinhaCariocaAction','publicRpc')"),'convite deve usar publicRpc');
ok(convite.includes('ctEventoConviteCarregarPublicoPROD'),'convite sem carregamento seguro');
ok(convite.includes('ctEventoConviteValidarPublicoPROD'),'convite sem validacao');
ok(convite.includes("sessionStorage.setItem('CT_PRIVATE_GRANT_'"),'grant nao salvo em sessionStorage');
ok(!/checkout-v2\/\?evento=.*accessGrant/.test(convite),'grant nao deve ser colocado diretamente na URL pelo frontend');
ok(convite.includes('Convite privado'),'pagina comercial do convite ausente');
ok(convite.includes('Acessos disponíveis'),'quota do convite ausente');

ok(checkout.includes('CT_PRIVATE_GRANT_'),'checkout nao recupera grant privado');
ok(checkout.includes('.ctCheckoutPublicoCarregarEventoPROD('),'checkout nao carrega catalogo pelo backend');
ok(checkout.includes('state.accessGrant'),'checkout nao envia grant');
ok(checkout.includes('ctTaxasEventoPublicoSimularPROD'),'checkout sem preview autoritativo de taxa');
ok(checkout.includes('Taxa Carioca Ticket · paga pelo evento'),'checkout sem comunicacao da taxa absorvida');
ok(checkout.includes('Nenhum acréscimo desta taxa será cobrado de você.'),'checkout sem explicacao ao comprador');

for(const token of [
  'campoModoAcesso',
  'PUBLICO',
  'NAO_LISTADO',
  'PRIVADO_CONVITE',
  'campoCapacidade',
  'validacaoConvite',
  'mensagemConviteTitulo'
]){
  ok(eventos.includes(token),'cadastro generico de evento sem '+token);
}
ok(eventos.includes('/produtor/convidados/?evento='),'eventos sem acesso a modalidade/convidados');

for(const metodo of [
  'ctEventoAcessoProdutorObterPROD',
  'ctEventoAcessoProdutorSalvarPROD',
  'ctEventoConvidadosListarPROD',
  'ctEventoConvidadosSalvarPROD',
  'ctEventoImportacaoModeloCsvPROD',
  'ctEventoImportacaoValidarCsvPROD',
  'ctEventoImportacaoConfirmarCsvPROD',
  'ctEventoConvidadosGerarConvitePROD',
  'ctEventoConvidadosGerarConvitesLotePROD'
]){
  ok(produtor.includes(metodo),'portal de convidados sem '+metodo);
}
ok(produtor.includes('accessMode'),'produtor sem configuracao da modalidade');
ok(produtor.includes('A taxa da Carioca Ticket não é alterada por esta tela.'),'produtor precisa ver separacao entre modalidade e taxa');
ok(produtor.includes('duplicatePolicy'),'importacao sem politica de duplicidade');
ok(produtor.includes('data-copy-link'),'produtor sem copia do link ativo');
ok(produtor.includes('IGNORAR')&&produtor.includes('ATUALIZAR'),'politicas de duplicidade incompletas');
ok(produtorPortal.includes('/produtor/convidados/?evento='),'portal produtor sem acesso a convidados');

for(const metodo of [
  'ctEventoAcessoMasterListarPROD',
  'ctEventoAcessoMasterObterPROD',
  'ctEventoAcessoMasterSalvarPROD',
  'ctEventoAcessoMasterConfigurarAtivacaoPROD'
]){
  ok(master.includes(metodo),'backoffice de modalidades sem '+metodo);
}
ok(master.includes('PUBLICO')&&master.includes('NAO_LISTADO')&&master.includes('PRIVADO_CONVITE'),'3 modalidades nao aparecem no Master');
ok(master.includes('Kill switches globais'),'kill switches globais nao expostos');
ok(!master.includes('ctTaxasEventoMasterSalvarPROD'),'modalidades nao pode manter segundo editor financeiro');
ok(master.includes('/backoffice/politicas-comerciais/'),'modalidades sem acesso ao motor comercial canonico');
for(const token of ['10% é o padrão da plataforma','COMPRADOR','PRODUTOR','DIVIDIDA','ctPoliticaComercialMasterSalvarPROD']){
  ok(commercial.includes(token),'politica comercial canonica incompleta: '+token);
}
ok(backoffice.includes('/backoffice/eventos/'),'Backoffice principal sem governanca de eventos');
ok(backoffice.includes('/backoffice/modalidades/'),'Backoffice principal sem modalidades e convites');
ok(backoffice.includes('/backoffice/politicas-comerciais/'),'Backoffice principal sem politicas comerciais');

for(const [nome,html] of [['convite',convite],['checkout',checkout],['eventos',eventos],['produtor',produtor],['produtorPortal',produtorPortal],['master',master]]){
  ok(html.includes('APP_DEV'),'tela '+nome+' sem resolucao DEV explicita');
  ok(html.includes('cariocaticket.com.br'),'tela '+nome+' sem gate de dominio oficial para PROD');
}

console.log('OK frontend eventos privados V1: contratos estruturais protegidos');
