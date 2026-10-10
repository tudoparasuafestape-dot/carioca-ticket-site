'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
class Clock {
  constructor() { this.now = START; this.nextId = 1; this.jobs = new Map(); }
  timeout(fn, delay = 0, ...args) {
    const id = this.nextId++;
    this.jobs.set(id, { id, at: this.now + Math.max(0, Number(delay) || 0), fn, args });
    return id;
  }
  interval(fn, delay = 0, ...args) {
    const id = this.timeout(fn, delay, ...args);
    this.jobs.get(id).interval = Math.max(1, Number(delay) || 1);
    return id;
  }
  clear(id) { this.jobs.delete(id); }
  tick(ms = 0) {
    const end = this.now + ms;
    let remaining = 10000;
    while (true) {
      const job = [...this.jobs.values()].filter(j => j.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!job) break;
      assert(remaining-- > 0, 'Timer loop exceeded the harness safety bound');
      this.now = job.at;
      this.jobs.delete(job.id);
      if (job.interval) this.jobs.set(job.id, { ...job, at: job.at + job.interval });
      job.fn(...job.args);
    }
    this.now = end;
  }
}

class Storage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
  clear() { this.data.clear(); }
}

function decode(text) {
  return String(text).replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
function attributes(text) {
  const result = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of text.matchAll(pattern)) result[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}

class Element {
  get isConnected() { var n=this; while(n.parentNode)n=n.parentNode; return n===this.ownerDocument; }
  hasAttribute(name) { return name in this.attributes; }
  matches() { return false; }
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.parentNode = null; this.attributes = {}; this.style = {};
    this._text = ''; this._value = ''; this._className = ''; this.disabled = false;
    this.checked = false; this.listeners = new Map();
    this.classList = {
      contains: c => this.className.split(/\s+/).includes(c),
      add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter(c => c && !values.includes(c)).join(' '); },
      toggle: (value, force) => {
        const add = force === undefined ? !this.classList.contains(value) : !!force;
        this.classList[add ? 'add' : 'remove'](value); return add;
      }
    };
  }
  set className(value) { this._className = String(value); }
  get className() { return this._className; }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  set textContent(value) { this.children = []; this._text = String(value ?? ''); }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(value) {
    this.children = []; this._text = ''; parse(String(value), this, this.ownerDocument);
    if (this.tagName === 'SELECT') this.value = this.children.find(c => c.tagName === 'OPTION')?.value || '';
  }
  get innerHTML() { throw new Error('Reading innerHTML is outside this minimal DOM contract'); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = value;
    else if (name === 'value') this.value = value;
    else if (name === 'disabled' || name === 'checked') this[name] = true;
    else if (!name.startsWith('data-') && !name.startsWith('aria-')) this[name] = String(value);
  }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'class') this.className = '';
    else if (name === 'value') this.value = '';
    else if (name === 'disabled' || name === 'checked') this[name] = false;
    else if (!name.startsWith('data-') && !name.startsWith('aria-')) delete this[name];
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(c => this.appendChild(c)); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
  querySelectorAll(selector) {
    const matches = element => {
      if (selector.startsWith('#')) return element.id === selector.slice(1);
      if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
      if (/^\[[\w-]+\]$/.test(selector)) return selector.slice(1, -1) in element.attributes;
      if (/^[\w-]+$/.test(selector)) return element.tagName === selector.toUpperCase();
      throw new Error('Unsupported selector in the harness: ' + selector);
    };
    if(selector.includes(','))return [...new Set(selector.split(',').flatMap(s=>this.querySelectorAll(s.trim())))];
    const result = [];
    const visit = element => { for (const child of element.children) { if (matches(child)) result.push(child); visit(child); } };
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatchEvent(event) {
    event.target ||= this; event.preventDefault ||= () => {};
    if (typeof this['on' + event.type] === 'function') this['on' + event.type](event);
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    return true;
  }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); }
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  scrollIntoView() {}
  submit() { this.ownerDocument.forbidden('Real form submission'); }
}

function parse(html, root, document) {
  const stack = [root];
  const voids = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/([\w-]+)\s*>|<([\w-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g)) {
    if (match[1]) {
      const tag = match[1].toUpperCase();
      const index = stack.findLastIndex(element => element.tagName === tag);
      if (index > 0) stack.length = index;
    } else if (match[2]) {
      const element = new Element(match[2], document);
      for (const [key, value] of Object.entries(attributes(match[3]))) element.setAttribute(key, value);
      stack.at(-1).appendChild(element);
      if (!voids.has(element.tagName) && !/\/\s*$/.test(match[3])) stack.push(element);
    } else if (match[4]) stack.at(-1)._text += decode(match[4]);
  }
}

class Document extends Element {
  constructor(html, forbidden) {
    super('document', null); this.ownerDocument = this; this.forbidden = forbidden;
    this.visibilityState = 'visible';
    parse(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''), this, this);
    this.body = this.querySelector('body'); this.documentElement=this.querySelector('html');
    assert(this.body, 'Actual checkout body was parsed');
  }
  createElement(tag) { return new Element(tag, this); }
  getElementById(id) { return this.querySelector('#' + id); }
  execCommand() { return false; }
}


function fixture(locale='pt-BR',valid=true,core=true){
 const html=fs.readFileSync(path.join(ROOT,'ingresso/index.html'),'utf8');
 const fail=()=>{throw Error('forbidden external action')};
 const document=new Document(html,fail),events={},timers=new Map();let submissions=0,printed=0;
 const sandbox={document,console,URL,URLSearchParams,localStorage:new Storage(),
 location:{origin:'https://ticket.local.test',pathname:'/ingresso/',search:valid?'?codigo=CT-LOCAL-123&sig=abcdefghijklmnop12345678':''},
 navigator:{},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},
 setTimeout(fn){const id=timers.size+1;timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)},
 addEventListener(type,fn){(events[type]||=[]).push(fn)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},
 print(){printed++},fetch:fail,XMLHttpRequest:fail,WebSocket:fail};
 sandbox.window=sandbox;sandbox.localStorage.setItem('ct-home-locale',locale);
 const context=vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}});
 const original=document.createElement.bind(document);
 document.createElement=tag=>{const e=original(tag);if(tag==='form')e.submit=()=>{submissions++};return e};
 for(const asset of [...(core?['public-i18n.js']:[]),'checkout-translations.js','checkout-language.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'assets',asset),'utf8'),context);
 for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(script[1]))vm.runInContext(script[2],context);
 return {sandbox,document,events,timers,get submissions(){return submissions},get printed(){return printed},respond(status="VÁLIDO"){
 const form=document.querySelector('form');assert(form);
 const fields=Object.fromEntries(form.children.map(n=>[n.name,n.value]));
 assert.equal(fields.ctMinhaCariocaAction,'consultarIngressoSeguro');assert.equal(fields.codigo,'CT-LOCAL-123');assert.equal(fields.sig,'abcdefghijklmnop12345678');
 events.message.forEach(fn=>fn({data:{ctMinhaCariocaPost:true,id:fields.ctMinhaCariocaRequestId,ok:true,resultado:{sucesso:true,
 ingresso:{nome:'Participante Local',tipo:'Tipo original',lote:'Lote original',codigo:'CT-LOCAL-123',qrUrl:'https://qr.invalid/synthetic',status:status},
 evento:{nome:'Evento Original',data:'10/10/2026',horario:'20h',local:'Local Original',cidade:'Recife',uf:'PE'},
 seguranca:{autorizaEntrada:true,mensagem:'Instrução original revisada no backend.'}}}}));
 }};
}
let passed=0;
for(const locale of ['pt-BR','en-US','es','zh-Hans']){
 const f=fixture(locale);assert.equal(f.submissions,1);f.respond();
 const view=f.document.getElementById('ticket-view');assert(view.textContent.includes('Participante Local'));assert(view.textContent.includes('Instrução original revisada no backend.'));
 const qr=view.querySelector('.qr');assert.equal(qr.getAttribute('src'),'https://qr.invalid/synthetic');
 const button=f.document.getElementById('save-pdf'),original=button;
 assert.equal(button.textContent,locale==='pt-BR'?'📄 Salvar em PDF':f.sandbox.CTCheckoutTranslations['📄 Salvar em PDF'][locale]);
 const whatsapp=f.document.getElementById('share-whatsapp').href;
 for(const target of ['es','zh-Hans','pt-BR',locale])f.sandbox.CTPublicI18n.setLocale(target);
 assert.equal(f.document.getElementById('save-pdf'),original);assert.equal(f.submissions,1);assert.equal(new URL(f.document.getElementById('share-whatsapp').href).searchParams.get('text').split('\n').at(-1),new URL(whatsapp).searchParams.get('text').split('\n').at(-1));
 assert.equal(qr.getAttribute('src'),'https://qr.invalid/synthetic');button.click();assert.equal(f.printed,1);
 assert(view.textContent.includes('CT-LOCAL-123'));passed++;
}
const invalid=fixture('en-US',false);assert.equal(invalid.submissions,0);assert.equal(invalid.document.getElementById('mensagem').textContent,'Unable to open this ticket.');passed++;
const absent=fixture('en-US',true,false);absent.respond();assert.equal(absent.submissions,1);assert.equal(absent.document.getElementById('save-pdf').textContent,'📄 Salvar em PDF');passed++;
for(const locale of ['pt-BR','en-US','es','zh-Hans']){
 const f=fixture(locale);f.respond('');const status=f.document.querySelector('.status');
 for(const target of [locale,'en-US','es','zh-Hans','pt-BR']){f.sandbox.CTPublicI18n.setLocale(target);assert.equal(status.textContent,target==='pt-BR'?'● Ingresso válido':f.sandbox.CTCheckoutTranslations['● Ingresso válido'][target]);assert.equal(f.submissions,1);}
 const original=fixture(locale);original.respond('VÁLIDO ORIGINAL');for(const target of ['en-US','es','zh-Hans','pt-BR']){original.sandbox.CTPublicI18n.setLocale(target);assert.equal(original.document.querySelector('.status').textContent,'● VÁLIDO ORIGINAL');assert.equal(original.submissions,1);}passed++;
}
console.log('PASS '+passed+' ticket-language VM cases; synthetic signed links, zero network. Print invocation only; browser print layout unverified.');
