// Synthetic-only editor preview: all production forms intercepted before submission.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=42981;
const prelude=`<script>
HTMLFormElement.prototype.submit=function(){
 const f=new FormData(this),method=f.get('metodo'),args=JSON.parse(f.get('argsJson')||'[]'),id=args[1];
 if(f.get('ctMinhaCariocaAction')!=='portalRpc'||!['ctEventoDestinoCarregarPROD','ctEventoDestinoSalvarPROD','ctEventoDestinoRevogarPROD'].includes(method))throw Error('Synthetic method rejected');
 window.fixtureCalls=window.fixtureCalls||[];fixtureCalls.push({method,args});
 const location={local:'Salão sintético '+id,endereco:'Rua sintética, 12 - Bairro',cidade:'Recife',uf:'PE'};
 const sig=JSON.stringify(Object.values(location).map(s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s*,\\s*/g,',')));
 const key='CT_DEST_TEST_'+id,record=JSON.parse(sessionStorage.getItem(key)||'null');let result,error;
 if(new URLSearchParams(window.location.search).get('scenario')==='denied')error='CT_DESTINO_ACESSO_NEGADO';
 else if(method==='ctEventoDestinoCarregarPROD')result={sucesso:true,evento:{id,nome:'Evento de teste',...location},locationSignature:sig,revision:record?record.revision:0,status:record&&record.confirmed?'CONFIRMADO':'PENDENTE',destinoTransporte:record&&record.confirmed?record:null};
 else if(new URLSearchParams(window.location.search).get('scenario')==='conflict')error='CT_DESTINO_REVISAO_DIVERGENTE';
 else if(method==='ctEventoDestinoSalvarPROD'){
  const d=args[2];if(d.expectedRevision!==(record?record.revision:0))error='CT_DESTINO_REVISAO_DIVERGENTE';
  else{const value={version:1,eventId:id,revision:d.expectedRevision+1,confirmed:true,latitude:d.latitude,longitude:d.longitude,location};sessionStorage.setItem(key,JSON.stringify(value));result={sucesso:true,revision:value.revision,destinoTransporte:value};}
 }else{const value={...record,confirmed:false,revision:record.revision+1};sessionStorage.setItem(key,JSON.stringify(value));result={sucesso:true,revision:value.revision,destinoTransporte:null};}
 const frame=document.querySelector('iframe[name="'+this.target+'"]');
 const payload={ctMinhaCariocaPost:true,id:f.get('ctMinhaCariocaRequestId'),ok:!error,resultado:result,erro:error};
 const query=encodeURIComponent(JSON.stringify(payload));
 const unrelated=document.createElement('iframe');unrelated.hidden=true;unrelated.src='https://fixture.googleusercontent.com/reply?payload='+encodeURIComponent(JSON.stringify({...payload,ok:false,erro:'WRONG_FRAME'}));document.body.appendChild(unrelated);setTimeout(()=>unrelated.remove(),150);
 // Real nested frames: the sandbox posts directly to top, as Apps Script does.
 frame.srcdoc='<iframe src="https://fixture.invalid/reply?payload='+query+'"></iframe><iframe src="https://fixture.googleusercontent.com/reply?payload='+query+'"></iframe>';

};
</script>`;
module.exports=http.createServer((req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`||req.method!=='GET'){res.writeHead(403);return res.end('Blocked');}
 const u=new URL(req.url,`http://127.0.0.1:${port}`);let file;
 if(u.pathname==='/produtor/destino/')file='produtor/destino/index.html';else if(/^\/assets\/event-destination-editor\.(js|css)$/.test(u.pathname))file=u.pathname.slice(1);else{res.writeHead(403);return res.end('Blocked');}
 let body=fs.readFileSync(path.join(root,file),'utf8');if(file.endsWith('.html'))body=body.replace('<head>','<head>'+prelude);
 res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; form-action 'none'; connect-src 'none'; frame-src 'self' https://fixture.invalid https://fixture.googleusercontent.com; base-uri 'none'"});res.end(body);
}).listen(port,'127.0.0.1');
