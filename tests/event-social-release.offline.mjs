import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildRelease} from '../scripts/build-event-social-release-lab.mjs';

const H='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
const NOW='2026-10-29T16:14:20.000Z';
const event={
  id:H,nome:'TBT do Astro — Aniversário de Herminho',modoAcesso:'PUBLICO',status:'ATIVO',data:'07/11/2026',horario:'20h',
  local:'Clube 10 de Novembro',cidade:'Recife',uf:'PE',
  visual:{capaUrl:'https://cariocaticket.com.br/assets/eventos/herminho-tbt-20261107-a2f84c198ed5b283.jpg'},
  temporal:{state:'TEMPORAL_V1',temporalVersion:1,fusoHorario:'America/Recife',
    inicioEm:'2026-10-01T12:00:00.000Z',fimEm:'2026-11-08T06:00:00.000Z'}
};
const snapshot={
  sucesso:true,temporalVersion:1,eligibilityContract:'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1',
  serverNow:'2026-10-29T16:14:00.000Z',
  temporalEvaluatedAt:'2026-10-29T16:13:59.000Z',
  validUntil:'2026-10-29T16:16:00.000Z',nextTransitionAt:null,cacheStale:false,
  eventos:[event]
};
const base=fs.mkdtempSync(path.join(os.tmpdir(),'ct-social-release-'));
try{
  const one=path.join(base,'release-1');
  const r1=buildRelease(snapshot,one,{now:Date.parse(NOW)});
  assert.equal(r1.count,1);
  assert.deepEqual(r1.eventIds,[H]);
  const html=fs.readFileSync(path.join(one,'compartilhar',H,'index.html'),'utf8');
  assert.match(html,/og:image/);assert.match(html,/herminho-tbt/);
  assert.match(html,/TBT do Astro/);assert.match(html,/window.location.replace/);
  assert(!html.includes('ctCheckoutPixPublicoIniciarPROD'));

  // A fresh complete empty catalog represents revocation. No stale preview
  // can leak into the next release.
  const two=path.join(base,'release-2');
  const r2=buildRelease({...snapshot,eventos:[]},two,{now:Date.parse(NOW)});
  assert.equal(r2.count,0);
  assert.deepEqual(r2.eventIds,[]);
  assert.deepEqual(fs.readdirSync(path.join(two,'compartilhar')),[]);
  assert(fs.existsSync(path.join(one,'compartilhar',H,'index.html')),'previous release unchanged for rollback; not in new snapshot');

  const invalids=[
    {...snapshot,sucesso:false},
    {...snapshot,cacheStale:true},
    {...snapshot,validUntil:'2026-10-29T16:14:01.000Z'},
    {...snapshot,eventos:[{...event,visual:{capaUrl:'https://cariocaticket.com.br/assets/eventos/missing.jpg'}}]},
    {...snapshot,eventos:[{...event,visual:{capaUrl:'https://evil.invalid/assets/eventos/ok.jpg'}}]},
    {...snapshot,eventos:[{...event,temporal:null}]},
    {...snapshot,eventos:[event,event]}
  ];
  for(let i=0;i<invalids.length;i++){
    const out=path.join(base,'invalid-'+i);
    assert.throws(()=>buildRelease(invalids[i],out,{now:Date.parse(NOW)}),/SOCIAL_(RELEASE_DENIED|CATALOG_REJECTED)/);
    assert.equal(fs.existsSync(out),false,'falha deve deixar a publicacao anterior intacta');
  }
  assert.throws(()=>buildRelease(snapshot,path.join(process.cwd(),'compartilhar'),{now:Date.parse(NOW)}),/SOCIAL_RELEASE_DENIED/);
  assert.throws(()=>buildRelease(snapshot,one,{now:Date.parse(NOW)}),/SOCIAL_RELEASE_DENIED/);
  console.log('SOCIAL_RELEASE_SNAPSHOT_OFFLINE_OK');
}finally{fs.rmSync(base,{recursive:true,force:true});}
