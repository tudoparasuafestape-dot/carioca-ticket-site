import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {deriveApprovedManifest} from '../scripts/derive-event-social-manifest.mjs';
import {generate} from '../scripts/generate-event-social-previews.mjs';

const H='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
const T=Date.parse('2026-10-29T16:14:00.000Z');
const instant=n=>new Date(T+n).toISOString();
const event={
  id:H,nome:'TBT do Astro — Aniversário de Herminho',
  modoAcesso:'PUBLICO',status:'ATIVO',
  data:'07/11/2026',horario:'20h00 às 02h00',local:'Clube 10 de Novembro',cidade:'Recife',uf:'PE',
  visual:{capaUrl:'https://cariocaticket.com.br/assets/eventos/herminho-tbt-20261107-a2f84c198ed5b283.jpg'},
  temporal:{state:'TEMPORAL_V1',temporalVersion:1,fusoHorario:'America/Recife',
    inicioEm:'2026-10-01T12:00:00.000Z',fimEm:'2026-11-08T06:00:00.000Z'}
};
const snapshot={
  sucesso:true,temporalVersion:1,eligibilityContract:'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1',
  serverNow:instant(0),temporalEvaluatedAt:instant(-1000),
  validUntil:instant(120000),nextTransitionAt:null,cacheStale:false,eventos:[event]
};
const valid=deriveApprovedManifest(snapshot,{now:T+1000});
assert.equal(valid.length,1);
assert.equal(valid[0].eventoId,H);
assert.equal(valid[0].destinoPublicoHttps,'https://cariocaticket.com.br/evento-v2/?evento='+H);
assert.equal(valid[0].modoAcesso,'PUBLICO');
assert.equal(valid[0].imagemSocialHttps,event.visual.capaUrl);
// Event date, time and venue must not disappear when official short copy exists.
const annotated=deriveApprovedManifest({...snapshot,eventos:[{...event,
  visual:{...event.visual,descricaoCurta:'Uma noite especial com atrações'}}]},{now:T+1000});
for(const fragment of ['07/11/2026','20h00','Clube 10 de Novembro','Uma noite especial com atrações'])
  assert(annotated[0].descricao.includes(fragment),'prévia deve conter: '+fragment);
const other={...event,id:'EVT-PUBLICO-FICTICIO',nome:'Teste'};
const legacyRoute=deriveApprovedManifest({...snapshot,eventos:[other]},{now:T+1000});
assert.equal(legacyRoute[0].destinoPublicoHttps,'https://cariocaticket.com.br/evento/?evento=EVT-PUBLICO-FICTICIO');

const deny=[
// Top-level fail-closed.
 {sucesso:false},{eventos:'INVALID'},{temporalVersion:2},{eligibilityContract:'OTHER'},
 {cacheStale:true},{serverNow:instant(-90000)},{validUntil:instant(500)},
 {temporalEvaluatedAt:instant(5000)},{nextTransitionAt:instant(1000)},
 {validUntil:instant(350000)},
 // Individual event cannot be trusted if missing/invalid.
 {eventos:[{...event,modoAcesso:'PRIVADO_CONVITE'}]},
 {eventos:[{...event,modoAcesso:'RESTRITO'}]},
 {eventos:[{...event,modoAcesso:undefined}]},
 {eventos:[{...event,status:'INATIVO'}]},
 {eventos:[{...event,status:undefined}]},
 {eventos:[{...event,temporal:null}]},
 {eventos:[{...event,temporal:{...event.temporal,state:'LEGADO_SEM_FIM'}}]},
 {eventos:[{...event,temporal:{...event.temporal,fimEm:instant(-100)}}]},
 {eventos:[{...event,id:'../EVENTO'}]},
 {eventos:[{...event,visual:{capaUrl:'https://evil.example.org/capa.jpg'}}]},
 {eventos:[event,event]}
];
for(const change of deny){
  assert.throws(()=>deriveApprovedManifest({...snapshot,...change},{now:T+1000}),/SOCIAL_CATALOG_REJECTED/);
}
// Empty authoritative snapshot means no previews on NEXT release, never stale fallback.
assert.deepEqual(deriveApprovedManifest({...snapshot,eventos:[]},{now:T+1000}),[]);

const work=fs.mkdtempSync(path.join(os.tmpdir(),'ct-derived-social-lab-'));
try{
  const manifest=path.join(work,'verified-manifest.json'),output=path.join(work,'rendered');
  fs.writeFileSync(manifest,JSON.stringify(valid));
  const generated=generate(manifest,output);
  assert.equal(generated.length,1);
  const html=fs.readFileSync(path.join(output,H,'index.html'),'utf8');
  assert.match(html,/<meta property="og:title" content="TBT do Astro/);
  assert.match(html,/<meta property="og:image" content="https:\/\/cariocaticket.com.br\/assets\/eventos\/herminho-tbt/);
  assert.match(html,/window.location.replace\(/);
  assert(!html.includes('ctCheckoutPixPublicoIniciarPROD'));
}finally{fs.rmSync(work,{recursive:true,force:true});}
console.log('SOCIAL_PUBLIC_CATALOG_DERIVATION_OFFLINE_OK');
