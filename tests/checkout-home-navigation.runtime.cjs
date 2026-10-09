'use strict';
// Dependency-free lifecycle test. No network, storage, order or provider APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/checkout-home-navigation.js'), 'utf8');
function fixture() {
 const handlers = new Map(), timers = new Set(); let navigationCount = 0, active = null;
 function node(id) {
  const events = new Map(); const element = { id, open: false, textContent: '', disabled: false, href: 'https://cariocaticket.com.br/',
   addEventListener(type, fn) { events.set(type, fn); },
   dispatch(type, extra = {}) { let prevented = false; const ev = { button: 0, defaultPrevented: false, preventDefault() { prevented = true; this.defaultPrevented = true; }, ...extra }; events.get(type)?.(ev); return prevented; },
   focus() { active = id; }, showModal() { element.open = true; }, close() { element.open = false; events.get('close')?.(); }
  }; return element;
 }
 const ids = ['checkoutHome', 'checkoutLeaveDialog', 'checkoutLeaveMessage', 'checkoutStay', 'checkoutLeave'];
 const nodes = Object.fromEntries(ids.map(id => [id, node(id)]));
 const state = { busy: false, orderPending: false, complete: false };
 const win = { addEventListener(type, fn) { handlers.set(type, fn); }, top: { location: { set href(_) { navigationCount++; } } } };
 const document = { getElementById: id => nodes[id], addEventListener() {}, querySelectorAll: () => [] };
 const context = vm.createContext({ window: win, document, setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); } });
 vm.runInContext(source, context); assert(win.CTCheckoutHome.init(() => state));
 return { nodes, state, timers, lifecycle(type) { handlers.get(type)?.({ persisted: true }); }, navigationCount: () => navigationCount, active: () => active };
}
const f = fixture();
f.nodes.checkoutHome.dispatch('click'); assert.equal(f.navigationCount(), 1);
f.nodes.checkoutHome.dispatch('click'); assert.equal(f.navigationCount(), 1, 'double click stays idempotent');
f.lifecycle('pagehide'); f.lifecycle('pageshow');
f.nodes.checkoutHome.dispatch('click'); assert.equal(f.navigationCount(), 2, 'BFCache restore permits navigation again');
f.lifecycle('pageshow'); f.state.busy = true;
f.nodes.checkoutHome.dispatch('click'); assert(f.nodes.checkoutLeaveDialog.open); assert(f.nodes.checkoutLeave.disabled); assert.equal(f.active(), 'checkoutStay');
f.nodes.checkoutLeave.dispatch('click'); assert.equal(f.navigationCount(), 2, 'decision-time creation check blocks exit');
f.state.busy = false; f.state.orderPending = true; for (const tick of f.timers) tick();
assert(!f.nodes.checkoutLeave.disabled); assert.match(f.nodes.checkoutLeaveMessage.textContent, /não cancela/);
f.nodes.checkoutStay.dispatch('click'); assert.equal(f.active(), 'checkoutHome'); assert.equal(f.timers.size, 0);
f.nodes.checkoutHome.dispatch('click'); f.nodes.checkoutLeave.dispatch('click'); assert.equal(f.navigationCount(), 3); assert(!f.nodes.checkoutLeaveDialog.open);
f.lifecycle('pageshow'); f.state.orderPending = false; f.state.complete = true;
f.nodes.checkoutHome.dispatch('click'); assert.equal(f.navigationCount(), 4, 'complete order has no dirty-form warning');
for (const name of ['checkout', 'checkout-v2']) {
 const html = fs.readFileSync(path.join(__dirname, '../' + name + '/index.html'), 'utf8');
 const expression = html.match(/busy:(state\.busy&&[^\n]+),\n\s+recovering:/)[1];
 for (const status of ['AGUARDANDO_PAGAMENTO', 'PAGO', 'PROCESSANDO', 'CONCLUIDO']) assert.equal(vm.runInNewContext(expression, { state: { busy: true, order: {} }, status }), false, 'existing order reconciliation must not block exit');
 for (const status of ['EXPIRADO', 'CANCELADO', 'FALHA']) assert.equal(vm.runInNewContext(expression, { state: { busy: true, order: {} }, status }), true, 'new creation after terminal order blocks exit');
 assert.equal(vm.runInNewContext(expression, { state: { busy: true, order: null }, status: '' }), true);
}
assert(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|google\.script/.test(source), 'guard has no storage/transaction/network APIs');
console.log('PASS checkout home lifecycle: BFCache, repeated clicks, focus, creation, reconciliation, terminal-order retry, no persistence/network.');
