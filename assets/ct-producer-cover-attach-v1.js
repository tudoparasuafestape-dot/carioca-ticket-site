import {createCoverUpload} from './ct-producer-cover-state-v1.js';
import {inspectPng,prepareCoverInput} from './ct-producer-cover-format-v1.js';
import {portalCoverBridge} from './ct-producer-cover-bridge-v1.js';
const idRule=/^[A-Za-z0-9][A-Za-z0-9_-]{0,219}$/;
const tickets=new Map();
let version=0, dialog=null, view=null;
function ensure(){
 if(dialog)return dialog;
 dialog=document.createElement('dialog');
 dialog.setAttribute('aria-labelledby','ctAttachTitle');
 dialog.className='ct-cover-picker';
 dialog.innerHTML='<h2 id="ctAttachTitle">Anexar capa</h2><p>Escolha uma imagem JPG ou PNG de até 4 MB. Isso não publica o evento.</p>'+
  '<label for="ctAttachFile">Imagem da capa</label> <input id="ctAttachFile" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg">'+
  '<img id="ctAttachPreview" alt="Prévia integral da capa selecionada" hidden style="width:100%;max-height:38vh;object-fit:contain">'+
  '<p id="ctAttachStatus" role="status" aria-live="polite"></p><div class="ct-cover-actions">'+
  '<button id="ctAttachSave" type="button" class="botao" disabled>Salvar capa</button>'+
  ' <button id="ctAttachVerify" type="button" class="botao botao-secundario" hidden>Verificar envio</button>'+
  ' <button id="ctAttachClose" type="button" class="botao botao-secundario">Fechar</button></div>';
 document.body.append(dialog);
 f('File').addEventListener('change',select);
 f('Save').addEventListener('click',save);
 f('Verify').addEventListener('click',verify);
 f('Close').addEventListener('click',close);
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 return dialog;
}
const f=s=>document.getElementById('ctAttach'+s);
function clearPreview(v){if(v?.url)URL.revokeObjectURL(v.url);if(v)v.url='';f('Preview').hidden=true;f('Preview').removeAttribute('src');}
function render(msg){
 if(!view)return;
 const phase=view.flow?.getState().phase||'opening', pending=tickets.has(view.eventId)||view.pending, busy=['opening','sending','checking'].includes(phase)&&!view.failed;
 f('Save').disabled=busy||pending||view.preparing||phase!=='ready';
 f('File').disabled=busy||pending||!view.flow;
 f('Verify').hidden=!tickets.has(view.eventId)||busy;
 f('Close').disabled=phase==='sending'||phase==='checking';
 f('Status').textContent=msg||{opening:'Consultando a capa deste evento…',ready:'Confira a prévia e confirme o envio.',invalid:'Não foi possível abrir a imagem. Use JPG ou PNG estático de até 4 MB.',
  inspecting:'Conferindo a imagem…',sending:'Salvando capa…',checking:'Consultando o envio…',unconfirmed:'Envio não confirmado. Use Verificar envio antes de tentar novamente.',
  rejected:'A imagem não foi salva. Escolha outro JPG ou PNG estático de até 4 MB.',saved:'Capa de rascunho salva. Vendas e capa pública não foram alteradas.'}[phase]||'';
}
async function inspect(file){
 const meta=inspectPng(await file.arrayBuffer()),src=URL.createObjectURL(file);
 try{const i=new Image();i.src=src;await i.decode();
   if(i.naturalWidth!==meta.width||i.naturalHeight!==meta.height)throw Error('DIMENSIONS');}
 finally{URL.revokeObjectURL(src);}
 return meta;
}
export async function openProducerCover(eventId, opener){
 if(!idRule.test(eventId)||ensure().open)return;
 const own=++version,bridge=portalCoverBridge(window.google?.script?.run);
 view={eventId,opener,bridge,url:'',failed:false,pending:false};
 f('File').value='';clearPreview(view);dialog.showModal();render();
 try{
  const reply=await bridge.read(eventId);
  if(version!==own)return;
  if(reply?.ok!==true||reply.eventId!==eventId||typeof reply.revision!=='string'||!reply.revision)throw Error('REPLY');
  view.pending=reply.pending===true;
  if(view.pending&&typeof reply.pendingTicket==='string'&&/^[A-Za-z0-9_-]{16,90}$/.test(reply.pendingTicket))
   tickets.set(eventId,reply.pendingTicket);
  view.flow=createCoverUpload({eventId,revision:reply.revision,inspect,upload:bridge.upload,confirm:bridge.confirm});
  render(view.pending?'Há um envio pendente; a capa pública não foi modificada.':'');
 }catch{if(version===own){view.failed=true;render('Não foi possível abrir a capa. Confira sua sessão e tente de novo.');}}
}
async function select(){
 if(!view?.flow)return;
 const v=view,source=f('File').files[0],generation=(v.selection||0)+1;
 v.selection=generation;v.preparing=true;clearPreview(v);v.flow.cancel();render('Preparando a prévia…');
 let file=null;
 try{file=await prepareCoverInput(source);}catch{}
 if(view!==v||v.selection!==generation)return;
 v.preparing=false;
 const task=v.flow.select(file);render();
 if(await task&&view===v&&v.selection===generation){
  v.url=URL.createObjectURL(file);f('Preview').src=v.url;f('Preview').hidden=false;
 }
 if(view===v&&v.selection===generation)render();
}
async function save(){
 if(!view?.flow||f('Save').disabled)return;
 const v=view,ticket=crypto.randomUUID();tickets.set(v.eventId,ticket);
 const done=v.flow.save(ticket);render();
 const success=await done, phase=v.flow.getState().phase;
 if(success||phase==='rejected')tickets.delete(v.eventId);
 if(view===v)render();
}
async function verify(){
 if(!view)return;
 const v=view,ticket=tickets.get(v.eventId);if(!ticket)return;
 try{
  if(v.flow?.getState().phase==='unconfirmed'){
   const result=v.flow.check();render();
   if(await result||v.flow.getState().phase==='rejected'){tickets.delete(v.eventId);v.pending=false;}
   if(view===v)render();return;
  }
  const r=await v.bridge.confirm({eventId:v.eventId,ticket});
  if(r?.status!=='CONFIRMED'||r.eventId!==v.eventId||r.ticket!==ticket||!r.revision)throw Error('UNCONFIRMED');
  tickets.delete(v.eventId);v.pending=false;
  v.flow=createCoverUpload({eventId:v.eventId,revision:r.revision,inspect,upload:v.bridge.upload,confirm:v.bridge.confirm});
  if(view===v)render('Capa de rascunho confirmada. Nenhum reenvio foi feito.');
 }catch{if(view===v)render('O envio segue sem confirmação. Não reenvie a imagem.');}
}
function close(){
 if(!view||f('Close').disabled)return;
 clearPreview(view);const source=view.opener;version++;view=null;dialog.close();source?.focus();
}
