// Browser runtime tests. Every request is fulfilled/aborted locally; no real Firebase or RPC.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.CT_PLAYWRIGHT_MODULE||'@playwright/test');
const base=new URL(process.env.CT_BASE_URL||'about:blank');
if(base.protocol!=='http:'||!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Set CT_BASE_URL explicitly to a local HTTP URL');
const root=path.resolve(__dirname,'..');
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
const rpcOrigin='https://ct-rpc.example.invalid';
const source=fs.readFileSync(path.join(root,'parceiro/ativar/index.html'),'utf8');
const html=source.replace(/https:\/\/script.google.com\/macros\/s\/[^']+\/exec/g,rpcOrigin+'/rpc')
  .replace("ev.origin!=='https://script.google.com'",`ev.origin!=='${rpcOrigin}'`);
const firebaseApp=`export const getApps=()=>[]; export const initializeApp=()=>({});`;
const firebaseAuth=`
const f=window.fixture;const auth={currentUser:null};
const user=()=>({email:'partner@example.invalid',emailVerified:f.verified,session:++f.session});
export const getAuth=()=>auth;
export const browserSessionPersistence={};
export const setPersistence=async()=>{};
export const createUserWithEmailAndPassword=async()=>{if(f.existing)throw {code:'auth/email-already-in-use'};auth.currentUser=user();return {user:auth.currentUser}};
export const signInWithEmailAndPassword=async(_auth,email,password)=>{f.signins++;if(f.loginError)throw Error(f.loginError);if(password!=='synthetic-password')throw Error('auth/invalid-credential');auth.currentUser=user();return {user:auth.currentUser}};
export const sendEmailVerification=async()=>{f.emails++};
export const reload=async u=>{if(u.session<=f.invalidThrough)throw Error('auth/user-token-expired');u.emailVerified=f.verified};
export const getIdToken=async(u,force)=>{if(!force)throw Error('fresh token required');f.tokens++;return 'SYNTHETIC-ID-TOKEN'};
export const signOut=async()=>{auth.currentUser=null};`;
async function install(context,options={}){
  const log={activation:0,methods:[],blocked:[]};
  await context.addInitScript(o=>{window.fixture={verified:false,existing:false,loginError:'',session:0,invalidThrough:0,signins:0,emails:0,tokens:0,...o};},options);
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin===base.origin&&u.pathname==='/parceiro/ativar/')return route.fulfill({contentType:'text/html',body:html});
    if(u.origin===base.origin&&u.pathname==='/assets/carioca-ticket-logo.png')return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'assets/carioca-ticket-logo.png'))});
    if(u.hostname==='www.gstatic.com'&&u.pathname.endsWith('firebase-app.js'))return route.fulfill({contentType:'text/javascript',body:firebaseApp});
    if(u.hostname==='www.gstatic.com'&&u.pathname.endsWith('firebase-auth.js'))return route.fulfill({contentType:'text/javascript',body:firebaseAuth});
    if(u.origin===rpcOrigin){
      const p=new URLSearchParams(route.request().postData()||''),method=p.get('metodo'),args=JSON.parse(p.get('argsJson')||'[]');log.methods.push(method);
      let result;
      if(method==='ctParceiroOnboardingConsultarAtivacaoPROD')result={sucesso:true,valida:!options.expired,codigo:options.expired?'ATIVACAO_EXPIRADA':'',emailMascarado:'p***@example.invalid'};
      else if(method==='ctParceiroOnboardingFirebaseConfigPROD')result={sucesso:true,firebaseConfig:{projectId:'synthetic'}};
      else if(method==='ctParceiroOnboardingPrepararAtivacaoPROD')result={sucesso:true,emailConfere:args[1]==='partner@example.invalid'};
      else if(method==='ctParceiroOnboardingAtivarPROD'){
        assert.equal(args[1],'partner@example.invalid');assert.equal(args[2],'SYNTHETIC-ID-TOKEN');log.activation++;result={sucesso:true,ativado:true};
      }else throw Error('Unexpected RPC '+method);
      const payload=JSON.stringify({ctMinhaCariocaPost:true,id:p.get('ctMinhaCariocaRequestId'),ok:true,resultado:result}).replace(/</g,'\\u003c');
      return route.fulfill({contentType:'text/html',body:`<script>top.postMessage(${payload},'*')</script>`});
    }
    if(!/\.(png|ico)$/.test(u.pathname))log.blocked.push(u.href);
    return route.abort();
  });
  return log;
}
async function fields(page){await page.locator('#email').fill('partner@example.invalid');await page.locator('#password').fill('synthetic-password');await page.locator('#password2').fill('synthetic-password');}
async function ready(page){await page.goto(base.origin+'/parceiro/ativar/?token=SYNTHETIC-INVITE');await page.locator('#activate').waitFor({state:'visible'});await fields(page);}
async function created(page){await ready(page);await page.locator('#createButton').click();await page.locator('#verifyBox').waitFor({state:'visible'});}
async function done(page){await page.locator('#done').waitFor({state:'visible',timeout:5000});}
(async()=>{
  const browser=await chromium.launch({headless:true});let passed=0;
  try{
    for(const mobile of [false,true]){
      async function test(name,body,options={}){
        const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:768},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
        try{const log=await install(ctx,options),page=await ctx.newPage();page.setDefaultTimeout(8000);await body(page,log);assert.deepEqual(log.blocked,[]);console.log('PASS '+(mobile?'mobile ':'desktop ')+name);passed++;}finally{await ctx.close();}
      }
      await test('return from email after session loss reauthenticates',async(page,log)=>{
        await created(page);await page.evaluate(()=>{fixture.verified=true;fixture.invalidThrough=fixture.session;});
        await page.locator('#verifiedButton').evaluate(button=>{button.click();button.click();});await done(page);
        assert.equal(log.activation,1);assert.equal(await page.evaluate(()=>fixture.signins),1);
        assert.equal(await page.evaluate(()=>fixture.tokens),1);
        if(mobile){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'test-results/partner-activation-mobile.png'),fullPage:true});}
      });
      await test('unverified email blocks backend; retry after verification succeeds',async(page,log)=>{
        await created(page);await page.locator('#verifiedButton').click();await page.getByText('O e-mail ainda aparece como não verificado no Firebase.',{exact:false}).waitFor();
        assert.equal(log.activation,0);assert.equal(await page.locator('#verifiedButton').isEnabled(),true);
        await page.evaluate(()=>fixture.verified=true);await page.locator('#verifiedButton').click();await done(page);assert.equal(log.activation,1);
      });
      await test('full page reload recovers with existing identity',async(page,log)=>{
        await ready(page);await page.reload();await fields(page);await page.locator('#createButton').click();await page.locator('#loginButton').click();await done(page);assert.equal(log.activation,1);
      },{existing:true,verified:true});
      await test('missing password prompts reentry without activation',async(page,log)=>{
        await created(page);await page.locator('#password').fill('');await page.locator('#verifiedButton').click();await page.getByText('Informe novamente a senha',{exact:false}).waitFor();assert.equal(log.activation,0);
      });
      await test('wrong approved email blocks preflight',async(page,log)=>{
        await created(page);await page.locator('#email').fill('other@example.invalid');await page.locator('#verifiedButton').click();await page.getByText('não corresponde ao cadastro aprovado',{exact:false}).waitFor();assert.equal(log.activation,0);assert.equal(await page.evaluate(()=>fixture.signins),0);
      });
      await test('login failure allows a safe retry',async(page,log)=>{
        await created(page);await page.evaluate(()=>{fixture.verified=true;fixture.loginError='auth/network-request-failed';});await page.locator('#verifiedButton').click();await page.getByText('Verifique sua internet',{exact:false}).waitFor();assert.equal(log.activation,0);
        await page.evaluate(()=>fixture.loginError='');await page.locator('#verifiedButton').click();await done(page);assert.equal(log.activation,1);
      });
      await test('expired invitation never authenticates or activates',async(page,log)=>{
        await page.goto(base.origin+'/parceiro/ativar/?token=SYNTHETIC-EXPIRED');await page.locator('#invalid').waitFor({state:'visible'});assert.equal(log.activation,0);
      },{expired:true});
    }
    console.log(`PARTNER_ACTIVATION_OFFLINE: ${passed} passed; 0 real RPC/Firebase requests`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
