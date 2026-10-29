import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render,generate} from '../scripts/generate-event-social-previews.mjs';

const H='EVT-FICTICIO-07';
const publicEvent={
  fonte:'CT_PUBLIC_APPROVAL_V1',
  eventoId:H,
  titulo:'Festa & Música "Especial"',
  descricao:'Uma apresentação pública <de teste>',
  imagemSocialHttps:'https://cariocaticket.com.br/assets/eventos/capa-fixture.jpg',
  destinoPublicoHttps:'https://cariocaticket.com.br/evento-v2/?evento='+H,
  publicado:true,modoAcesso:'PUBLICO',elegivel:true,gateVendasAtivo:true
};
const valid=render(publicEvent);
assert.equal(valid.id,H);
assert.match(valid.html,/<meta property="og:title" content="Festa &amp; Música &quot;Especial&quot;">/);
assert.match(valid.html,/<meta property="og:description" content="Uma apresentação pública &lt;de teste&gt;">/);
assert.match(valid.html,/<meta property="og:image" content="https:\/\/cariocaticket.com.br\/assets\/eventos\/capa-fixture.jpg">/);
assert.match(valid.html,/<meta property="og:url" content="https:\/\/cariocaticket.com.br\/compartilhar\/EVT-FICTICIO-07\/">/);
assert.match(valid.html,/<meta name="twitter:card" content="summary_large_image">/);
assert.match(valid.html,/<script>window.location.replace\(/);
assert(!valid.html.includes('ctCheckoutPixPublicoIniciarPROD'));
assert(!valid.html.includes('CPF'));

const bad=[
  {publicado:false}, {modoAcesso:'PRIVADO'}, {modoAcesso:'RESTRITO'},
  {elegivel:false}, {gateVendasAtivo:false}, {fonte:'ADMIN_EVENTOS'},
  {eventoId:'../private'}, {eventoId:'?'},{titulo:'<script>x</script>\n'},
  {imagemSocialHttps:'javascript:alert(1)'},{imagemSocialHttps:'http://cariocaticket.com.br/assets/eventos/capa.jpg'},
  {imagemSocialHttps:'https://evil.example.com/assets/eventos/capa.jpg'},
  {imagemSocialHttps:'https://cariocaticket.com.br/assets/eventos/../../config.json'},
  {imagemSocialHttps:'https://cariocaticket.com.br/assets/eventos/capa.svg'},
  {imagemSocialHttps:'https://cariocaticket.com.br/assets/eventos/capa.jpg?token=privado'},
  {destinoPublicoHttps:'https://evil.example.com/evento-v2/?evento='+H},
  {destinoPublicoHttps:'https://cariocaticket.com.br/checkout-v2/?evento='+H},
  {destinoPublicoHttps:'https://cariocaticket.com.br/evento-v2/?evento=OUTRO'},
  {destinoPublicoHttps:'https://cariocaticket.com.br/evento-v2/?evento='+H+'&token=secret'}
];
for(const variant of bad){
  assert.throws(()=>render({...publicEvent,...variant}),/SOCIAL_PREVIEW_DENIED/);
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ct-og-lab-'));
try{
  const manifest=path.join(dir,'approved.json'),out=path.join(dir,'out');
  fs.writeFileSync(manifest,JSON.stringify([publicEvent]));
  const result=generate(manifest,out);
  assert.equal(result.length,1);
  const page=fs.readFileSync(path.join(out,H,'index.html'),'utf8');
  assert.equal(page,valid.html);
  assert.throws(()=>generate(manifest,out),/recusa substituir/);
  const reject=path.join(dir,'reject');
  fs.writeFileSync(manifest,JSON.stringify([publicEvent,{...publicEvent,eventoId:'EVT-PRIVADO',modoAcesso:'PRIVADO'}]));
  assert.throws(()=>generate(manifest,reject),/evento nao autorizado/);
  assert.equal(fs.existsSync(reject),false,'nenhuma escrita se um evento falha na prevalidacao');
  fs.writeFileSync(manifest,JSON.stringify([publicEvent,publicEvent]));
  assert.throws(()=>generate(manifest,reject),/evento duplicado/);
  assert.equal(fs.existsSync(reject),false);
  fs.writeFileSync(manifest,JSON.stringify([publicEvent]));
  assert.throws(()=>generate(manifest,path.join(process.cwd(),'compartilhar')),/saidas no repositorio estao bloqueadas/);
}finally{fs.rmSync(dir,{force:true,recursive:true});}
console.log('SOCIAL_PREVIEW_LAB_OFFLINE_OK');
