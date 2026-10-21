(function(){
'use strict';
var ENDPOINT='https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
var token=location.hash.slice(1), pending={}, busy=false, data=null, job=null, storage='', receipts=[], rendered={};
var $=function(id){return document.getElementById(id)};
function message(text,error){$('message').textContent=text;$('message').className='notice'+(error?' error':'')}
function key(){var bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes,function(x){return x.toString(16).padStart(2,'0')}).join('')}
function storageWrite(){sessionStorage.setItem(storage+':pending',JSON.stringify(job))}
function readReceipts(){var prefix=storage+':receipt:',found=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(prefix)===0&&/^[a-f0-9]{64}$/.test(k.slice(prefix.length)))found.push(k.slice(prefix.length))}return found.slice(0,20)}
function cleanup(id){var p=pending[id];if(!p)return;delete pending[id];clearTimeout(p.timer);p.frame.remove();p.form.remove();return p}
function rpc(method,args){return new Promise(function(resolve,reject){
  var id='CTCI-'+key(), frame=document.createElement('iframe'), form=document.createElement('form');
  frame.name=id;frame.hidden=true;frame.setAttribute('aria-hidden','true');form.hidden=true;form.method='POST';form.action=ENDPOINT;form.target=id;
  var fields={ctMinhaCariocaAction:'publicRpc',ctMinhaCariocaRequestId:id,metodo:method,argsJson:JSON.stringify(args)};
  Object.keys(fields).forEach(function(k){var input=document.createElement('input');input.type='hidden';input.name=k;input.value=fields[k];form.appendChild(input)});
  document.body.append(frame,form);pending[id]={frame:frame,form:form,resolve:resolve,reject:reject,timer:setTimeout(function(){var p=cleanup(id);if(p)p.reject(new Error('A confirmação demorou. Tente novamente com os mesmos dados.'))},90000)};form.submit();
})}
window.addEventListener('message',function(ev){
  if(ev.origin!=='https://script.google.com'&&!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(ev.origin||''))return;
  var x=ev.data;if(!x||x.ctMinhaCariocaPost!==true||!pending[x.id])return;
  var p=cleanup(x.id);x.ok===true?p.resolve(x.resultado):p.reject(new Error(String(x.erro||'Não foi possível concluir.')));
});
function friendly(e){var s=String(e.message||e);var map={
  SEM_VAGAS:'Todas as vagas já foram preenchidas. Atualize para conferir.',ENCERRADO:'Este convite expirou ou foi revogado. Ingressos já emitidos continuam disponíveis.',
  PESSOA_JA_CADASTRADA:'Já existe um cadastro com esses dados neste convite. Confira os ingressos no navegador em que você cadastrou.',
  WHATSAPP_INVALIDO:'Confira o WhatsApp, incluindo DDD e código do país quando necessário.',NOME_SOBRENOME_INVALIDO:'Informe nome e sobrenome válidos, com até 80 caracteres cada.',
  AUTORIZACAO_INDISPONIVEL:'O responsável pelo convite não possui mais autorização para emitir. Entre em contato com ele.',
  RECONCILIACAO_NECESSARIA:'Esta tentativa precisa ser conferida pelo produtor. A vaga permanece protegida; não faça outro cadastro para a mesma pessoa.',
  CADASTRO_NAO_CONFIRMADO:'O cadastro ainda não foi confirmado. Use a mesma tentativa para continuar.',INGRESSO_CANCELADO:'Este ingresso foi cancelado pelo produtor.',
  REPETICAO_DIVERGENTE:'Esta tentativa já está vinculada a outros dados. Reabra o convite na aba original.',
  EVENTO_EXIGE_CONVIDADO_AUTORIZADO:'Este evento exige autorização individual. Fale com o produtor.',
  EVENTO_ENCERRADO:'O evento já foi encerrado.',EVENTO_INDISPONIVEL:'O evento está indisponível para novos ingressos.',
  INDISPONIVEL:'Convite não encontrado. Confira o link completo recebido.'};
  return map[s.replace('CT_CONVITE_','')]||'Não foi possível confirmar agora. Tente novamente com os mesmos dados ou contate o produtor.';
}
function controls(){
  $('refresh').disabled=busy;$('submit').disabled=busy;
  ['firstName','lastName','phone'].forEach(function(id){$(id).disabled=busy||!!job});
  $('submit').textContent=job?'Tentar confirmar o mesmo cadastro':'Confirmar cadastro e gerar ingresso';
  $('retryNote').hidden=!job;
  $('registration').hidden=!data||(!job&&(data.convite.status!=='ATIVO'||data.convite.disponiveis<1));
}
function render(r){
  if(!r||r.sucesso!==true||!r.convite)throw new Error('Resposta inválida');
  data=r;$('summary').hidden=false;
  if(r.evento)$('eventName').textContent=r.evento.nome;
  $('available').textContent=r.convite.disponiveis;$('issued').textContent=r.convite.emitidas;
  $('validity').textContent='Validade: '+new Date(r.convite.expiraEm).toLocaleString('pt-BR')+' · '+({ATIVO:'Disponível',ESGOTADO:'Todas as vagas preenchidas',EXPIRADO:'Expirado',REVOGADO:'Revogado'}[r.convite.status]||r.convite.status);
  controls();
}
function safeTicket(raw){try{var u=new URL(raw);if(u.origin==='https://cariocaticket.com.br'&&u.pathname==='/ingresso/'&&/^[A-Z0-9][A-Z0-9-]{5,79}$/.test(u.searchParams.get('codigo')||'')&&/^[A-Za-z0-9_-]{16,128}$/.test(u.searchParams.get('sig')||'')&&u.searchParams.getAll('codigo').length===1&&u.searchParams.getAll('sig').length===1&&!u.username&&!u.password)return u.href}catch(_){}return ''}
function ticket(r){
  if(!r||r.sucesso!==true||!r.ingresso)throw new Error('Ingresso indisponível');
  var t=r.ingresso,url=safeTicket(t.link);if(!url)throw new Error('Link indisponível');
  if(rendered[t.codigo])return;rendered[t.codigo]=true;
  var block=document.createElement('div');block.className='ticket';
  var name=document.createElement('b');name.textContent=t.nome||'Cortesia individual';
  var label=document.createElement('small');label.textContent='Cortesia · 1 entrada por ingresso · Código '+t.codigo;
  var actions=document.createElement('div');actions.className='actions';
  var open=document.createElement('a');open.className='btn';open.href=url;open.target='_blank';open.rel='noopener noreferrer';open.textContent='Abrir ingresso / QR Code';
  var share=document.createElement('a');share.className='btn';share.href='https://wa.me/?text='+encodeURIComponent('Seu ingresso de cortesia Carioca Ticket: '+url);share.target='_blank';share.rel='noopener noreferrer';share.textContent='Compartilhar ingresso no WhatsApp';
  actions.append(open,share);block.append(name,label,actions);$('ticketList').appendChild(block);$('tickets').hidden=false;
}
async function refresh(){
  if(busy)return;busy=true;controls();
  try{render(await rpc('ctCortesiaConviteCarregarPublicoPROD',[token]));message(data.convite.disponiveis>0?'Preencha os dados de uma pessoa para continuar.':'Não há novas vagas disponíveis.')}
  catch(e){message(friendly(e),true)}finally{busy=false;controls()}
}
$('form').addEventListener('submit',async function(ev){
  ev.preventDefault();if(busy)return;
  if(!job){
    job={nome:$('firstName').value.trim(),sobrenome:$('lastName').value.trim(),whatsapp:$('phone').value.trim(),chaveIdempotencia:key()};
    try{storageWrite()}catch(_){job=null;message('Permita o armazenamento deste navegador para proteger sua tentativa antes de emitir.',true);return}
  }
  busy=true;controls();message('Confirmando cadastro…');
  try{
    var r=await rpc('ctCortesiaConviteCadastrarPublicoPROD',[token,job]);ticket(r);render(r);
    // One immutable key per receipt prevents tabs overwriting one another.
    // Persist it before clearing the pending attempt, including storage failures.
    localStorage.setItem(storage+':receipt:'+job.chaveIdempotencia,'1');
    receipts=readReceipts();sessionStorage.removeItem(storage+':pending');
    job=null;$('form').reset();message('Ingresso confirmado. Abra ou compartilhe abaixo. Você pode cadastrar a próxima pessoa.');
  }catch(e){
    // Only explicit pre-issuance validation failures permit editing this attempt.
    if(/^CT_CONVITE_(NOME_SOBRENOME_INVALIDO|WHATSAPP_INVALIDO|PESSOA_JA_CADASTRADA)$/.test(String(e.message))){job=null;storageWrite()}
    message(friendly(e),true);
  }finally{busy=false;controls()}
});
$('refresh').addEventListener('click',refresh);
window.addEventListener('storage',function(ev){if(ev.key&&ev.key.indexOf(storage+':receipt:')===0){receipts=readReceipts();if(!busy)refresh()}});
(async function(){
  if(!/^[A-Za-z0-9_-]{64}$/.test(token)){message('Este link está incompleto. Abra o convite completo enviado pelo produtor.',true);return}
  try{
    var digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    storage='CTCI:'+Array.from(new Uint8Array(digest),function(x){return x.toString(16).padStart(2,'0')}).join('');
    receipts=readReceipts();
    job=JSON.parse(sessionStorage.getItem(storage+':pending')||'null');
    if(job){$('firstName').value=job.nome;$('lastName').value=job.sobrenome;$('phone').value=job.whatsapp}
    storageWrite();await refresh();
    for(var i=0;i<receipts.length;i++){try{ticket(await rpc('ctCortesiaConviteRecuperarPublicoPROD',[token,receipts[i]]))}catch(_){/* A cancelled ticket is never restored as active. */}}
  }catch(_){message('Não foi possível preparar este navegador. Permita o armazenamento local e abra novamente o convite.',true)}
})();
})();
