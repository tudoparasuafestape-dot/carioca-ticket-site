/* Shared public-language infrastructure. Pages must explicitly integrate it. */
(function (window, document) {
  'use strict';
  var locales = ['pt-BR', 'en-US', 'es', 'zh-Hans'];
  var storageKey = 'ct-home-locale'; // Keep existing home preferences.
  var locale = 'pt-BR';
  var dictionaries = Object.create(null);
  var own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  var valid = function (value) { return locales.indexOf(value) !== -1; };
  var nonempty = function (value) { return typeof value === 'string' && value.trim().length > 0; };
  var notices = {
    'pt-BR': {translationUnavailable: 'Tradução indisponível. Conteúdo original abaixo.', originalContent: 'Ver original', informativeTranslation: 'Tradução informativa. Consulte também o texto original.'},
    'en-US': {translationUnavailable: 'Translation unavailable. Original content below.', originalContent: 'View original', informativeTranslation: 'Informational translation. Please also consult the original text.'},
    es: {translationUnavailable: 'Traducción no disponible. Contenido original a continuación.', originalContent: 'Ver original', informativeTranslation: 'Traducción informativa. Consulte también el texto original.'},
    'zh-Hans': {translationUnavailable: '暂无翻译。以下为原文。', originalContent: '查看原文', informativeTranslation: '译文仅供参考。请同时查阅原文。'}
  };
  locales.forEach(function (language) { dictionaries[language] = Object.assign(Object.create(null), notices[language]); });
  try { var saved = window.localStorage.getItem(storageKey); if (valid(saved)) locale = saved; } catch (_) { /* Memory-only preference remains usable. */ }

  function message(key, values, requestedLocale) {
    var language = valid(requestedLocale) ? requestedLocale : locale;
    if (!own(dictionaries[language], key) || !nonempty(dictionaries[language][key])) language = 'pt-BR';
    var found = own(dictionaries[language], key) && nonempty(dictionaries[language][key]);
    var text = found ? dictionaries[language][key] : String(key);
    // One pass: interpolation values cannot introduce replacement tokens or markup.
    text = text.replace(/\{([^{}]+)\}/g, function (token, name) {
      return values && own(values, name) ? String(values[name]) : token;
    });
    return {text: text, language: language, missing: !found};
  }

  function apply(scope) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return;
    var selector = '[data-public-i18n], [data-public-i18n-placeholder], [data-public-i18n-aria-label]';
    var nodes = Array.prototype.slice.call(scope.querySelectorAll(selector));
    if (scope.matches && scope.matches(selector)) nodes.unshift(scope);
    nodes.forEach(function (node) {
      var entries = [['data-public-i18n', null], ['data-public-i18n-placeholder', 'placeholder'], ['data-public-i18n-aria-label', 'aria-label']];
      // A node has one language for its text and accessible attributes. If any
      // known key falls back, use Portuguese consistently for this whole node.
      var language = entries.some(function (entry) {
        var key = node.getAttribute(entry[0]);
        var translated = key && message(key);
        return translated && !translated.missing && translated.language !== locale;
      }) ? 'pt-BR' : locale;
      entries.forEach(function (entry) {
        var key = node.getAttribute(entry[0]);
        if (!key) return;
        var translated = message(key, null, language);
        // Missing keys must not overwrite authored, potentially important text.
        if (translated.missing) return;
        if (entry[1]) node.setAttribute(entry[1], translated.text);
        else node.textContent = translated.text;
        node.lang = translated.language;
      });
    });
    // Do not label an untranslated legacy page as a translated document.
    if (document.documentElement.hasAttribute('data-public-i18n-root')) document.documentElement.lang = locale;
  }

  function setLocale(value, persist) {
    if (!valid(value)) return false;
    var changed = locale !== value;
    locale = value;
    if (persist !== false) {
      try { window.localStorage.setItem(storageKey, value); } catch (_) { /* Do not block navigation. */ }
    }
    apply(document);
    if (changed) document.dispatchEvent(new window.CustomEvent('ct:public-language', {detail: {locale: locale}}));
    return true;
  }

  function register(language, entries) {
    if (!valid(language) || !entries || typeof entries !== 'object') return false;
    Object.keys(entries).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
      if (nonempty(entries[key])) dictionaries[language][key] = entries[key];
    });
    return true;
  }

  // A translation is only valid for exactly this source text and language.
  // No network, backend writes, machine translation, HTML rendering, or implicit cache.
  function content(options) {
    options = options || {};
    var source = typeof options.sourceText === 'string' ? options.sourceText : '';
    var sourceLanguage = nonempty(options.sourceLanguage) ? options.sourceLanguage : 'pt-BR';
    var target = valid(options.locale) ? options.locale : locale;
    var entry = options.entry;
    var result = {text: source, language: sourceLanguage, original: source, originalLanguage: sourceLanguage,
      translated: false, status: target === sourceLanguage ? 'original' : 'missing', notice: ''};
    if (target === sourceLanguage) return result;
    if (entry && (entry.sourceText !== source || entry.sourceLanguage !== sourceLanguage)) result.status = 'stale';
    else if (entry && entry.translations && own(entry.translations, target) && nonempty(entry.translations[target])) {
      result.text = entry.translations[target];
      result.language = target;
      result.translated = true;
      result.status = 'translated';
      if (options.informative === true) result.notice = message('informativeTranslation', null, target).text;
      return result;
    }
    result.notice = message('translationUnavailable', null, target).text;
    return result;
  }

  window.CTPublicI18n = Object.freeze({
    getLocale: function () { return locale; },
    locales: Object.freeze(locales.slice()), storageKey: storageKey,
    setLocale: setLocale, register: register, message: message, apply: apply, content: content
  });
  window.addEventListener('storage', function (event) {
    // Ignore sessionStorage and unrelated origins/storage areas.
    var storage;
    try { storage = window.localStorage; } catch (_) { return; }
    if (event.storageArea !== storage || (event.key !== storageKey && event.key !== null)) return;
    var value = event.newValue === null ? 'pt-BR' : event.newValue;
    if (valid(value)) setLocale(value, false);
  });
}(window, document));
