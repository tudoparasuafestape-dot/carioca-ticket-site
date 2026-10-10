/* Explicit UI bindings. Never renders checkout data or invokes application actions. */
(function (window, document) {
  'use strict';
  var bindings = [], shareBindings = [], core = window.CTPublicI18n;
  var entries = window.CTCheckoutTranslations || {};
  var locales = ['pt-BR', 'en-US', 'es', 'zh-Hans'];
  if (core) locales.forEach(function (locale) {
    var messages = {};
    Object.keys(entries).forEach(function (source) { messages['checkout.' + source] = locale === 'pt-BR' ? source : entries[source][locale]; });
    core.register(locale, messages);
  });
  function translated(source, values) {
    var known = Object.prototype.hasOwnProperty.call(entries, source) && (!/\{\w+\}/.test(source) || values !== undefined);
    if (!core || !known) {
      var text = source;
      if (known && values) text = source.replace(/\{(\w+)\}/g, function(token,name){return Object.prototype.hasOwnProperty.call(values,name)?String(values[name]):token;});
      return {text: text, language: 'pt-BR'};
    }
    // Templates are selected only by authored key + explicit values, never by matching producer/backend text.
    return core.message('checkout.' + source, values);
  }
  function paint(binding, reconcile) {
    var current = binding.attribute ? binding.node.getAttribute(binding.attribute) : binding.node.textContent;
    if (reconcile && current !== binding.rendered) { binding.source = String(current == null ? '' : current); binding.values = undefined; }
    var result = translated(binding.source, binding.values);
    if (current !== result.text) {
      if (binding.attribute) binding.node.setAttribute(binding.attribute, result.text);
      else binding.node.textContent = result.text;
    }
    binding.node.lang = result.language;
    binding.rendered = result.text;
  }
  function bind(node, source, attribute, values) {
    var binding = bindings.find(function (item) { return item.node === node && item.attribute === attribute; });
    if (!binding) { binding = {node: node, attribute: attribute}; bindings.push(binding); }
    binding.source = String(source == null ? '' : source);
    binding.values = values ? Object.assign({},values) : undefined;
    paint(binding);
    return source;
  }
  function shareLink(node, source, url, values) {
    var binding = shareBindings.find(function(item){return item.node===node;});
    if(!binding){binding={node:node};shareBindings.push(binding);}
    binding.source=source;binding.url=url;binding.values=values;
    node.href='https://wa.me/?text='+encodeURIComponent(translated(source,values).text+'\n'+url);
  }
  function apply(scope) {
    scope = scope || document;
    ['text', 'placeholder', 'aria-label', 'alt'].forEach(function (kind) {
      var attr = 'data-checkout-' + kind;
      Array.prototype.forEach.call(scope.querySelectorAll('[' + attr + ']'), function (node) {
        var attribute = kind === 'text' ? undefined : kind;
        // Never restore stale initial markup after a business-state presentation write.
        if (!bindings.some(function (item) { return item.node === node && item.attribute === attribute; })) bind(node, node.getAttribute(attr), attribute);
      });
    });
    bindings = bindings.filter(function (binding) { return binding.node.isConnected; });
    bindings.forEach(function(binding){paint(binding,true);});
    shareBindings=shareBindings.filter(function(binding){return binding.node.isConnected;});
    shareBindings.forEach(function(binding){shareLink(binding.node,binding.source,binding.url,binding.values);});
    var control = document.getElementById('checkoutLanguageControl');
    var select = document.getElementById('checkoutLanguage');
    if (core && control && select) { control.hidden = false; select.value = core.getLocale(); }
    var notice = document.getElementById('checkoutOriginalNotice');
    if(notice)notice.hidden = !core || core.getLocale() === 'pt-BR';
  }
  window.CTCheckoutLanguage = {format:function(node,key,values){return bind(node,key,undefined,values);},snapshot:function(node){var item=bindings.find(function(b){return b.node===node&&!b.attribute;});return item?{source:item.source,values:item.values}:node.textContent;},restore:function(node,saved){return saved&&typeof saved==='object'?bind(node,saved.source,undefined,saved.values):bind(node,saved);},shareLink:shareLink, original:function(node,value){bindings=bindings.filter(function(binding){return binding.node!==node;});node.textContent=value;node.lang='pt-BR';}, source: function(node){var item=bindings.find(function(binding){return binding.node===node&&!binding.attribute;});return item?item.source:node.textContent;}, write: function (node, source) { return bind(node, source); }, apply: apply, text: function (source,values) { return translated(source,values).text; }};
  function start() {
    apply();
    var select = document.getElementById('checkoutLanguage');
    if (core && select) select.addEventListener('change', function () { core.setLocale(select.value); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  document.addEventListener('ct:public-language', function () { apply(); });
  window.addEventListener('pageshow', function () { window.setTimeout(function () { apply(); }, 0); });
}(window, document));
