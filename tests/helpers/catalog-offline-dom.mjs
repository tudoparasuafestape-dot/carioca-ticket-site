// Dependency-free, deliberately minimal DOM for the catalog's real scripts.
// No sockets or network implementations exist. This verifies DOM/state/event
// logic, not CSS, native rendering, native iframe transport or browser fidelity.
import vm from 'node:vm';

class Event {
  constructor(type, init = {}) { Object.assign(this, { type, bubbles: false, cancelable: false, defaultPrevented: false }, init); }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopImmediatePropagation() { this.stopped = this.immediate = true; }
  stopPropagation() { this.stopped = true; }
}
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn, options = false) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push({ fn, capture: options === true || options.capture === true, once: options.once === true });
  }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(x => x.fn !== fn)); }
  dispatchEvent(event) {
    event.target ||= this;
    const path = [this]; let p = this.parentNode;
    while (p) { path.push(p); p = p.parentNode; }
    const invoke = (target, capture) => {
      event.currentTarget = target;
      for (const item of [...(target.listeners.get(event.type) || [])]) {
        if (item.capture !== capture) continue;
        item.fn.call(target, event);
        if (item.once) target.removeEventListener(event.type, item.fn);
        if (event.immediate) break;
      }
    };
    for (const target of path.slice().reverse()) { invoke(target, true); if (event.stopped) return !event.defaultPrevented; }
    for (const target of (event.bubbles ? path : [this])) { invoke(target, false); if (event.stopped) break; }
    return !event.defaultPrevented;
  }
}
const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function simpleMatch(el, selector) {
  const attrs = [...selector.matchAll(/\[([\w-]+)(\^?=)?(?:"([^"]*)"|'([^']*)'|([^\]]*))?\]/g)];
  const bare = selector.replace(/\[[^\]]*\]/g, '');
  const tag = /^([\w-]+)/.exec(bare)?.[1];
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  for (const m of bare.matchAll(/([.#])([\w-]+)/g)) {
    if (m[1] === '#' && el.id !== m[2]) return false;
    if (m[1] === '.' && !el.classList.contains(m[2])) return false;
  }
  return attrs.every(m => { const actual = el.getAttribute(m[1]), expected = m[3] ?? m[4] ?? m[5]; return m[2] === '=' ? actual === expected : m[2] === '^=' ? actual?.startsWith(expected) : actual !== null; });
}
function matches(el, selector) {
  const parts = selector.trim().split(/\s+/);
  if (!simpleMatch(el, parts.pop())) return false;
  let parent = el.parentNode;
  while (parts.length) {
    const part = parts.pop();
    while (parent && !(parent instanceof Element && simpleMatch(parent, part))) parent = parent.parentNode;
    if (!parent) return false;
    parent = parent.parentNode;
  }
  return true;
}
class Element extends Target {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentNode = null;
    this.attributes = {}; this.dataset = {}; this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
    this.className = ''; this.hidden = false; this.value = ''; this._text = ''; this.observers = new Set();
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter(x => x && !values.includes(x)).join(' '); },
      toggle: (value, force) => { const add = force === undefined ? !this.classList.contains(value) : !!force; this.classList[add ? 'add' : 'remove'](value); return add; }
    };
  }
  get textContent() { return this._text + this.children.map(x => x.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
    else if (name === 'class') this.className = String(value);
    else if (!name.startsWith('aria-')) this[name] = String(value);
  }
  getAttribute(name) {
    if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
    if (name === 'class') return this.className || null;
    return this.attributes[name] ?? (typeof this[name] === 'string' ? this[name] : null);
  }
  removeAttribute(name) { delete this.attributes[name]; if (name.startsWith('data-')) delete this.dataset[dataKey(name)]; }
  mutation() { for (const obs of this.observers) { if (!obs.pending) { obs.pending = true; queueMicrotask(() => { obs.pending = false; obs.fn(); }); } } }
  appendChild(child) {
    if (child.tagName === '#FRAGMENT') { for (const item of [...child.children]) this.appendChild(item); return child; }
    child.remove(); child.parentNode = this; this.children.push(child); this.mutation(); return child;
  }
  append(...children) { children.forEach(x => this.appendChild(x)); }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; this.append(...children); this.mutation(); }
  remove() { if (this.parentNode?.children) { this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode.mutation(); } this.parentNode = null; }
  querySelectorAll(selector) {
    const result = [];
    const walk = el => { for (const child of el.children) { if (matches(child, selector)) result.push(child); walk(child); } };
    walk(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { let current = this; while (current instanceof Element) { if (matches(current, selector)) return current; current = current.parentNode; } return null; }
  contains(other) { for (let cur = other; cur; cur = cur.parentNode) if (cur === this) return true; return false; }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { width: 300, height: 400 }; }
  hasPointerCapture() { return false; }
  releasePointerCapture() {}
  setPointerCapture() {}
}
class Form extends Element { set method(value) { this._method = String(value).toLowerCase(); } get method() { return this._method || 'get'; } submit() { throw new Error('NETWORK_NOT_ALLOWED: form POST must be intercepted'); } }
class Document extends Target {
  constructor(root) {
    super(); this.parentNode = root; this.documentElement = new Element('html', this); this.documentElement.parentNode = this;
    this.body = new Element('body', this); this.documentElement.append(this.body); this.activeElement = this.body;
  }
  createElement(tag) { return tag.toLowerCase() === 'form' ? new Form(tag, this) : new Element(tag, this); }
  createDocumentFragment() { return new Element('#fragment', this); }
  getElementById(id) { return this.documentElement.querySelector('#' + id); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function parse(body, html) {
  const stack = [body], voids = new Set(['INPUT', 'META', 'LINK', 'BR', 'IMG']);
  for (const token of html.matchAll(/<\/?([\w-]+)([^>]*)>/g)) {
    const name = token[1].toUpperCase(); if (['HTML', 'BODY'].includes(name)) continue;
    if (token[0].startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    const el = body.ownerDocument.createElement(name);
    for (const attr of token[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.setAttribute(attr[1], attr[2] || '');
    stack.at(-1).append(el); if (!voids.has(name)) stack.push(el);
  }
}
export const offlineBrowser = {
  async newContext() {
    const root = new Target(), document = new Document(root);
    const sandbox = { window: root, document, location: { origin: 'https://offline.invalid' }, URL,
      performance: {}, Event, MouseEvent: Event, KeyboardEvent: Event, MessageEvent: Event, PageTransitionEvent: Event,
      HTMLFormElement: Form, crypto: { randomUUID: () => 'offline-' + Math.random().toString(36).slice(2) },
      MutationObserver: class { constructor(fn) { this.fn = fn; } observe(el) { el.observers.add(this); } },
      console, queueMicrotask };
    // Make window and the global scope identical, as in a browser.
    Object.assign(root, sandbox); root.window = root;
    const ctx = vm.createContext(root);
    const run = code => vm.runInContext(code, ctx, { timeout: 1000 });
    const page = {
      on() {}, async setContent(html) { parse(document.body, html); },
      async addScriptTag({ content }) { run(content); },
      async evaluate(fn, arg) { root.__arg = arg; const result = await run('(' + fn.toString() + ')(__arg)'); await Promise.resolve(); return structuredClone(result); },
      locator(selector) {
        const all = () => document.querySelectorAll(selector);
        const first = () => { const el = all()[0]; if (!el) throw new Error('Missing element: ' + selector); return el; };
        return { async evaluateAll(fn) { return structuredClone(fn(all())); }, async textContent() { return first().textContent; }, async isHidden() { return first().hidden; }, async count() { return all().length; }, async inputValue() { return first().value; }, async fill(value) { first().value = value; }, async getAttribute(name) { return first().getAttribute(name); }, async dispatchEvent(name) { first().dispatchEvent(new Event(name, { bubbles: true, cancelable: true })); await Promise.resolve(); await Promise.resolve(); } };
      }
    };
    return { async route() {}, async newPage() { return page; }, async close() {} };
  }
};
