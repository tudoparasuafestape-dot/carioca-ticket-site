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
const modalidades=read('backoffice/modalidades/index.html');
const governanca=read('backoffice/eventos/index.html');

for(const [nome,html] of [
  ['convite',convite],
  ['convidados',produtor],
  ['modalidades',modalidades]
]){
  ok(html.includes('APP_PROD')&&html.includes('APP_DEV'),'isolamento DEV/PROD ausente em '+nome);
  ok(html.includes("cariocaticket\\.com\\.br")||html.includes('cariocaticket\.com\.br'),'selecao de ambiente ausente em '+nome);
}
const politica=read('backoffice/politicas-comerciais/index.html');
const backoffice=read('backoffice/index.html');

ok(/<meta name="robots" content="noindex,nofollow,noarchive">/.test(convite),'convite deve ser noindex');
ok(convite.includes("add('ctMinhaCariocaAction','publicRpc')"),'convite deve usar publicRpc');
ok(convite.includes('ctEventoConviteCarregarPublicoPROD'),'convite sem carregamento seguro');
ok(convite.includes('ctEventoConviteValidarPublicoPROD'),'convite sem validacao');
ok(convite.includes("sessionStorage.setItem('CT_PRIVATE_GRANT_'"),'grant nao salvo em sessionStorage');
ok(convite.includes("get('ctenv')==='dev'"),'convite nao honra ambiente DEV explicito');
ok(checkout.includes("get('ctenv')==='dev'"),'checkout nao honra ambiente DEV explicito');
ok(!/checkout-v2\/\?evento=.*accessGrant/.test(convite),'grant nao deve ir na URL');
ok(convite.includes('Convite privado'),'pagina comercial do convite ausente');

ok(checkout.includes('CT_PRIVATE_GRANT_'),'checkout nao recupera grant privado');
ok(checkout.includes('state.accessGrant'),'checkout nao envia grant');
ok(checkout.includes('ctPoliticaComercialPreviewPublicoPROD'),'checkout sem preview da politica comercial canonica');
ok(checkout.includes('feeTimer:null'),'checkout sem debounce do preview comercial');
ok(checkout.includes('setTimeout(function(){')&&checkout.includes('},180);'),'preview comercial sem debounce curto');

ok(!checkout.includes('ctTaxasEventoPublicoSimularPROD'),'checkout ainda chama motor legado de taxa');
ok(checkout.includes('Taxa Carioca Ticket · paga pelo produtor'),'checkout sem mensagem de taxa absorvida');
ok(checkout.includes('Sua parte da taxa Carioca Ticket'),'checkout sem mensagem transparente de taxa dividida');

for(const token of [
  'campoModoAcesso','PUBLICO','NAO_LISTADO','PRIVADO_CONVITE',
  'campoCapacidade','validacaoConvite','mensagemConviteTitulo'
]){
  ok(eventos.includes(token),'cadastro generico de evento sem '+token);
}
ok(eventos.includes('/produtor/convidados/?evento='),'eventos sem acesso a modalidade/convidados');

for(const metodo of [
  'ctEventoAcessoProdutorObterPROD','ctEventoAcessoProdutorSalvarPROD',
  'ctEventoConvidadosListarPROD','ctEventoConvidadosSalvarPROD',
  'ctEventoImportacaoModeloCsvPROD','ctEventoImportacaoValidarCsvPROD',
  'ctEventoImportacaoConfirmarCsvPROD','ctEventoConvidadosGerarConvitePROD',
  'ctEventoConvidadosGerarConvitesLotePROD'
]){
  ok(produtor.includes(metodo),'portal de convidados sem '+metodo);
}
ok(produtor.includes('accessMode'),'produtor sem configuracao da modalidade');
ok(produtor.includes('A taxa da Carioca Ticket não é alterada por esta tela.'),'modalidade deve ficar separada da taxa');
ok(produtor.includes('duplicatePolicy'),'importacao sem politica de duplicidade');
ok(produtor.includes('IGNORAR')&&produtor.includes('ATUALIZAR'),'politicas de duplicidade incompletas');
ok(produtorPortal.includes('/produtor/convidados/?evento='),'portal produtor sem acesso a convidados');

for(const metodo of [
  'ctEventoAcessoMasterListarPROD','ctEventoAcessoMasterObterPROD',
  'ctEventoAcessoMasterSalvarPROD','ctEventoAcessoMasterConfigurarAtivacaoPROD'
]){
  ok(modalidades.includes(metodo),'tela Master de modalidades sem '+metodo);
}
ok(modalidades.includes('PUBLICO')&&modalidades.includes('NAO_LISTADO')&&modalidades.includes('PRIVADO_CONVITE'),'3 modalidades nao aparecem no Master');
ok(modalidades.includes('/backoffice/politicas-comerciais/'),'modalidades sem acesso a politica comercial');
ok(!modalidades.includes('taxasAtivo'),'modalidades ainda envia flag legada de taxa');
ok(!modalidades.includes('habilitarEvento'),'modalidades ainda envia allowlist por evento');

ok(!modalidades.includes('ctTaxasEventoMasterSalvarPROD'),'modalidades nao pode editar motor legado de taxa');
ok(modalidades.includes('Rollback global da V1'),'rollback global de modalidades nao exposto');

ok(politica.includes('ctPoliticaComercialMasterSalvarPROD'),'politica comercial Master ausente');
ok(politica.includes('COMPRADOR')&&politica.includes('PRODUTOR')&&politica.includes('DIVIDIDA'),'pagadores canonicos incompletos');
ok(governanca.includes('ctEventoGovernancaMasterDecidirPROD'),'governanca Master foi perdida');

ok(backoffice.includes('/backoffice/eventos/'),'Backoffice sem Governanca Eventos');
ok(backoffice.includes('/backoffice/modalidades/'),'Backoffice sem Modalidades & Convites');
ok(backoffice.includes('/backoffice/politicas-comerciais/'),'Backoffice sem Politicas Comerciais');

console.log('OK frontend RC: produtor + modalidades + politica comercial canonica');
