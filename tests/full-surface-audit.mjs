import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const warnings=[];

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    if(entry.name==='.git'||entry.name==='node_modules'||entry.name==='playwright-report'||entry.name==='test-results')return[];
    return entry.isDirectory()?walk(full):[full];
  });
}
function rel(file){return path.relative(root,file).replace(/\\/g,'/')}
function read(file){return fs.readFileSync(path.join(root,file),'utf8')}
function routeFor(file){
  if(file==='index.html')return'/';
  return '/'+file.replace(/index\.html$/,'');
}
function normalizeInternal(href){
  if(!href)return null;
  let h=href.trim();
  if(/^https:\/\/cariocaticket\.com\.br\//i.test(h))h=h.replace(/^https:\/\/cariocaticket\.com\.br/i,'');
  if(!h.startsWith('/')||h.startsWith('//'))return null;
  const pathname=h.split(/[?#]/)[0]||'/';
  if(/\.[A-Za-z0-9]{1,8}$/.test(pathname))return null;
  return pathname.endsWith('/')?pathname:pathname+'/';
}
function attrs(html,tag,attr){
  const re=new RegExp('<'+tag+'\\b[^>]*\\b'+attr+'=["\\\']([^"\\\']+)["\\\'][^>]*>','gi');
  return [...html.matchAll(re)].map(m=>m[1]);
}
function requireText(file,...parts){
  const html=read(file);
  for(const p of parts)if(!html.includes(p))failures.push(file+': ausente -> '+p);
}

const htmlFiles=walk(root).map(rel).filter(f=>f.endsWith('index.html'));
const routeMap=new Map(htmlFiles.map(f=>[routeFor(f),f]));

for(const file of htmlFiles){
  const html=read(file);
  for(const href of attrs(html,'a','href')){
    if(/script\.google\.com|googleusercontent\.com|github\.io/i.test(href)){
      failures.push(file+': link visível aponta para host técnico -> '+href);
    }
    const route=normalizeInternal(href);
    if(route && route!=='/' && !routeMap.has(route)){
      warnings.push(file+': destino interno sem index.html conhecido -> '+route);
    }
  }
  for(const src of attrs(html,'iframe','src')){
    if(/script\.google\.com|googleusercontent\.com|github\.io/i.test(src)){
      failures.push(file+': iframe técnico exposto na superfície -> '+src);
    }
  }
}

const operational=[
  'vendas/index.html','bar/index.html','eventos-v2/index.html','fornecedores/index.html',
  'crm/index.html','financeiro/index.html','relatorios/index.html','comissionado/index.html',
  'comissoes/index.html','consulta/index.html','checkin/index.html','saude-vendas/index.html',
  'reembolsos/index.html'
];
for(const file of operational){
  if(!fs.existsSync(path.join(root,file))){failures.push(file+': superfície operacional ausente');continue}
  const html=read(file);
  if(!/href=["']\/central\//.test(html))failures.push(file+': módulo sem retorno explícito à Central Mobile');
}

requireText('central/index.html','href="/produtor/"','id="logout"','id="mCheckin"','id="mAcessos"');
if(read('central/index.html').includes('.top-actions .ghost{display:none}')){
  failures.push('central/index.html: Portal do Produtor volta a ser ocultado no mobile');
}

requireText('acessos/index.html','href="/central/"','href="/produtor/"','id="logoutButton"','logoutUsuarioCT2');
requireText('produtor/index.html','id="logoutButton"','id="partnerPortalLink"','id="partnerAdminLink"');
requireText('produtor/solicitar/index.html','id="logoutButton"');
requireText('produtor/solicitacoes/index.html','id="logoutAdminButton"','href="/produtor/"','href="/parceiro/"');
requireText('parceiro/index.html','id="logoutButton"','href="/parceiro/programa/"');
requireText('parceiro/admin/index.html','id="logoutAdminButton"','href="/parceiro/"','href="/produtor/"');
requireText('fornecedor/index.html','id="logoutButton"','href="/ajuda/"','href="/"');

const checkin=read('checkin/index.html');
if(/<iframe\b/i.test(checkin))failures.push('checkin/index.html: Check-in não pode voltar a ser wrapper por iframe');
if(/github\.io/i.test(checkin))failures.push('checkin/index.html: referência github.io não permitida no Check-in oficial');
requireText('checkin/index.html','/checkin/checkin.js','/checkin/checkin.css','id="backCentral"','href="/central/"');
requireText('checkin/checkin.js','ct_checkin','credencial: credencialCheckin','CT_CHECKIN_OPERACIONAL_CREDENCIAL_V1');
if(!read('checkin/checkin.js').includes("STORAGE_CREDENCIAL_SESSION: 'ct_checkin_operacional_credencial_v1'")){
  failures.push('checkin/checkin.js: armazenamento de credencial operacional não protegido pelo contrato');
}

requireText('index.html','href="/fornecedor/"');
requireText('ajuda/index.html','id="helpSupplierPortal"','href="/fornecedor/"');

if(warnings.length){
  console.log('\n⚠️ Avisos de superfície (não bloqueadores):');
  [...new Set(warnings)].forEach(w=>console.log('- '+w));
}
if(failures.length){
  console.error('\n❌ VARREDURA DE SUPERFÍCIE FALHOU');
  [...new Set(failures)].forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('✅ Varredura de superfície: '+htmlFiles.length+' páginas verificadas; navegação crítica, retornos e hosts técnicos protegidos.');
