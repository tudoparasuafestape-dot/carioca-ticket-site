// Pure conversion of a trusted public-catalog response into social preview inputs.
// OFFLINE ONLY. The caller MUST obtain this response through a trusted, audited
// publication channel; a user-supplied JSON file is NOT proof of authorization.
const SOURCE='CT_PUBLIC_APPROVAL_V1';
const CONTRACT='CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1';
const HOST='https://cariocaticket.com.br';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,219}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function deny(message){throw new Error('SOCIAL_CATALOG_REJECTED: '+message);}
function instant(value,name){
  if(typeof value!=='string'||!ISO.test(value))deny(name+' sem UTC canonico');
  const milliseconds=Date.parse(value);
  if(!Number.isFinite(milliseconds))deny(name+' data invalida');
  const frac=(value.match(/\.(\d{1,3})Z$/)||[])[1]||'';
  if(new Date(milliseconds).toISOString()!==value.replace(/(?:\.\d{1,3})?Z$/g,'.'+frac.padEnd(3,'0')+'Z'))
    deny(name+' data nao canonica');
  return milliseconds;
}
function text(value,max,name){
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))deny(name+' invalido');
  return value.trim();
}
function approvedImage(value){
  let url;
  try{url=new URL(value);}catch(_){deny('capa sem URL publica');}
  if(url.origin!==HOST||url.username||url.password||url.search||url.hash||
     !/^\/assets\/eventos\/[A-Za-z0-9._-]+\.(jpe?g|png)$/i.test(url.pathname))
    deny('capa deve ser imagem oficial publica em assets/eventos');
  return url.href;
}
function deriveApprovedManifest(snapshot,{now=Date.now()}={}){
  if(!Number.isFinite(now))deny('relogio de publicacao indisponivel');
  if(!snapshot||snapshot.sucesso!==true||!Array.isArray(snapshot.eventos)||
     snapshot.eventos.length>50)deny('resposta publica invalida');
  if(snapshot.temporalVersion!==1||snapshot.eligibilityContract!==CONTRACT||
     snapshot.cacheStale===true)deny('contrato temporal ausente, antigo ou stale');
  const server=instant(snapshot.serverNow,'serverNow');
  const evaluated=instant(snapshot.temporalEvaluatedAt,'temporalEvaluatedAt');
  const validUntil=instant(snapshot.validUntil,'validUntil');
  const transition=snapshot.nextTransitionAt===null?Infinity:instant(snapshot.nextTransitionAt,'nextTransitionAt');
  if(evaluated>server||server>now+60000||now-server>60000||
     validUntil<=now||validUntil<=server||validUntil>transition||
     validUntil-evaluated>300000)deny('validade temporal expirada ou incoerente');
  const ids=new Set(), manifest=[];
  for(const event of snapshot.eventos){
    if(!event||typeof event!=='object'||!ID.test(event.id)||ids.has(event.id))deny('ID de evento invalido/duplicado');
    ids.add(event.id);
    // Explicit deny-by-default even for signed catalogs: no private, restricted,
    // inactive or unpublished event may be transformed into a public preview.
    if(event.modoAcesso!=='PUBLICO'||event.status!=='ATIVO')
      deny('evento sem acesso PUBLICO e status ATIVO explicitos');
    // Require per-event verified temporal eligibility. Legacy entries without an
    // explicit end are intentionally rejected (do not leak private/ended events).
    const t=event.temporal;
    if(!t||t.state!=='TEMPORAL_V1'||t.temporalVersion!==1||
       typeof t.fusoHorario!=='string'||!t.fusoHorario||
       !(t.fusoHorario==='UTC'||/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(t.fusoHorario)))
      deny('evento sem temporal publico verificavel');
    const start=instant(t.inicioEm,'inicioEm'),end=instant(t.fimEm,'fimEm');
    if(end<=start||end<=server||end<=now)deny('evento encerrado ou temporal incoerente');
    const nome=text(event.nome,220,'nome do evento');
    const visual=event.visual||{};
    const cover=approvedImage(visual.capaUrl||visual.posterUrl);
    // Route parity with the currently approved public homepage. Other events
    // continue using their existing first-party detail page until homologated.
    const v2=event.id==='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
    const detail=HOST+(v2?'/evento-v2/?evento=':'/evento/?evento=')+encodeURIComponent(event.id);
    // Do not import anything confidential, arbitrary HTML, payment details or
    // untrusted links from administrative objects.
    const summary=[
      typeof event.data==='string'?event.data.trim():'',
      typeof event.horario==='string'?event.horario.trim():'',
      typeof event.local==='string'?event.local.trim():'',
      [event.cidade,event.uf].filter(v=>typeof v==='string'&&v.trim()).join(' / ')
    ].filter(Boolean).join(' · ');
    // Keep date/time/place visible even when editorial copy is provided.
    // A single public OG description is bounded to 350 characters.
    const editorial=typeof visual.descricaoCurta==='string'?visual.descricaoCurta.trim():'';
    const description=text(([summary,editorial].filter(Boolean).join(' · ')||
      'Compre ingressos pela Carioca Ticket.').slice(0,350),350,'descricao');
    manifest.push({
      fonte:SOURCE,eventoId:event.id,titulo:nome,descricao:description,
      imagemSocialHttps:cover,destinoPublicoHttps:detail,
      publicado:true,modoAcesso:'PUBLICO',elegivel:true,gateVendasAtivo:true
    });
  }
  // Empty, authenticated public catalogs are meaningful revocations. They must
  // produce an empty release, never reuse the previous catalog.
  return manifest;
}
export {deriveApprovedManifest};
