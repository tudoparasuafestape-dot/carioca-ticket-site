// Real Chromium rendering, synthetic camera/API, every network request intercepted.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const scanner=process.argv[2]||(fs.existsSync('checkin/checkin.js')?'checkin/checkin.js':'app.js');
const css=fs.readFileSync(scanner==='app.js'?'styles.css':'checkin/checkin.css','utf8');
const js=fs.readFileSync(scanner,'utf8');
const ids=['btnIniciar','btnParar','btnValidar','btnConfig','btnInstalar','btnAbrirConfig','btnSalvarConfig','btnTestarConexao','codigoManual','statusCamera','resultado','resultadoIcone','resultadoTitulo','resultadoMensagem','resultadoDados'];
const html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style>'+ids.map(id=>id==='codigoManual'?'<input id="'+id+'">':'<button id="'+id+'">'+id+'</button>').join('');
const A='CT-20261011-900001',B='CT-20261011-900002';
(async()=>{const browser=await chromium.launch({headless:true});const report=[];let realRequests=0;try{
for(const viewport of [{width:390,height:667},{width:844,height:390},{width:320,height:568},{width:1366,height:768}]){
 const context=await browser.newContext({viewport,isMobile:viewport.width<900,hasTouch:viewport.width<900,serviceWorkers:'block'});
 await context.route('**/*',route=>{if(route.request().url()==='https://scanner.test/?evento=EVT-SYNTHETIC')return route.fulfill({contentType:'text/html',body:html});realRequests++;return route.abort();});
 const page=await context.newPage();await page.goto('https://scanner.test/?evento=EVT-SYNTHETIC');await page.addScriptTag({content:js});
 await page.evaluate(()=>{window.testCalls=[];window.testWrites=[];window.testStatus={};window.testDrop=false;window.testPaused=false;credencialCheckin='SYNTHETIC_SESSION';cameraAtiva=true;leitorQr={pause(){window.testPaused=true;},resume(){window.testPaused=false;}};criarTelaResultadoProfissional();criarConfirmacaoEntradaProfissional();registrarEventos();vibrar=()=>{};tocarSom=()=>{};chamarApiJsonp=async(_url,p)=>{window.testCalls.push(p.codigo);const preview=p.codigo.startsWith(CONFIG.PREFIXO_VALIDACAO_SEM_ENTRADA),codigo=p.codigo.replace(CONFIG.PREFIXO_VALIDACAO_SEM_ENTRADA,'');if(window.testStatus[codigo])return{sucesso:false,tipo:'aviso',titulo:'JÁ UTILIZADO',codigo,horario:'SYNTHETIC'};if(preview)return{sucesso:true,podeConfirmarEntrada:true,codigo,nome:'Participante sintético com nome longo para teste',tipoIngresso:'Casadinha'};window.testStatus[codigo]=true;window.testWrites.push(codigo);if(window.testDrop)throw Error('Synthetic dropped response');return{sucesso:true,tipo:'sucesso',titulo:'ENTRADA LIBERADA',codigo,nome:'Participante sintético com nome longo para teste',tipoIngresso:'Casadinha',horario:'11/10/2026 15:57:05'};};});
 // Manual path, explicit confirmation, persistent success, then camera duplicate.
 await page.locator('#codigoManual').fill(A);await page.locator('#btnValidar').click();await page.locator('#ctConfirmacaoConfirmar').click();await page.waitForFunction(()=>document.getElementById('telaResultadoTitulo').textContent==='ENTRADA LIBERADA');
 assert(await page.evaluate(()=>window.testPaused));
 const reachable=async()=>{await page.locator('#botaoFecharResultado').scrollIntoViewIfNeeded();const box=await page.locator('#botaoFecharResultado').boundingBox();assert(box&&box.y>=-1&&box.y+box.height<=viewport.height+1,'Continue button unreachable '+JSON.stringify({viewport,box}));};
 await reachable();await page.locator('#botaoFecharResultado').click();assert.notEqual(await page.evaluate(()=>document.activeElement.id),'codigoManual');await page.evaluate(code=>aoLerQrCode(code),A);assert.equal(await page.evaluate(()=>window.testCalls.length),2);
 // Distinct QR, cancel, explicit next, manual retry.
 await page.evaluate(code=>aoLerQrCode(code),B);await page.locator('#ctConfirmacaoCancelar').click();await page.waitForFunction(()=>document.getElementById('telaResultadoTitulo').textContent==='ENTRADA NÃO REGISTRADA');await reachable();await page.locator('#botaoFecharResultado').click();await page.evaluate(()=>window.testDrop=true);await page.locator('#codigoManual').fill(B);await page.locator('#btnValidar').click();await page.locator('#ctConfirmacaoConfirmar').click();await page.waitForFunction(()=>document.getElementById('telaResultadoTitulo').textContent==='CONFIRMAÇÃO SEM RESPOSTA');await reachable();
 fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/scanner-'+viewport.width+'x'+viewport.height+'.png'});
 const before=await page.evaluate(()=>window.testCalls.length);await page.evaluate(code=>aoLerQrCode(code),B);assert.equal(await page.evaluate(()=>window.testCalls.length),before);await page.locator('#botaoFecharResultado').click();await page.evaluate(code=>aoLerQrCode(code),B);assert.equal(await page.evaluate(()=>window.testCalls.length),before);assert.deepEqual(await page.evaluate(()=>window.testWrites),[A,B]);
 report.push({viewport,success:'passed',cancel:'passed',timeout:'passed',sameQrAfterManual:'blocked',continueButton:'reachable',networkCalls:0});await context.close();
}
assert.equal(realRequests,0);fs.writeFileSync('test-results/scanner-browser.json',JSON.stringify({scanner,realRequests,report},null,2));console.log(JSON.stringify({scanner,realRequests,report},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
