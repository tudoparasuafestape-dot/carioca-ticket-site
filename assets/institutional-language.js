/* Presentation-only integration for fixed public institutional pages. */
(function () {
  'use strict';
  var I = window.CTPublicI18n;
  var copy = window.CTInstitutionalTranslations;
  var select = document.getElementById('public-language');
  if (!I || !copy || !select) return;
  copy.register(I);
  var extra = {
    'pt-BR': {publicLanguage: 'Idioma', publicNavigation: 'Principal', publicHome: 'Carioca Ticket — página inicial', publicOriginal: 'Ler o texto original em português'},
    'en-US': {publicLanguage: 'Language', publicNavigation: 'Main navigation', publicHome: 'Carioca Ticket — home', publicOriginal: 'Read the original Portuguese text'},
    es: {publicLanguage: 'Idioma', publicNavigation: 'Navegación principal', publicHome: 'Carioca Ticket — inicio', publicOriginal: 'Leer el texto original en portugués'},
    'zh-Hans': {publicLanguage: '语言', publicNavigation: '主导航', publicHome: 'Carioca Ticket — 首页', publicOriginal: '阅读葡萄牙语原文'}
  };
  Object.keys(extra).forEach(function (language) { I.register(language, extra[language]); });
  var metadata = {
    ajuda: {
      'pt-BR': ['Central de Ajuda | Carioca Ticket', 'Suporte da Carioca Ticket para compradores, produtores, parceiros e fornecedores.'],
      'en-US': ['Help Center | Carioca Ticket', 'Carioca Ticket support for buyers, organizers, partners and suppliers.'],
      es: ['Centro de ayuda | Carioca Ticket', 'Asistencia de Carioca Ticket para compradores, organizadores, socios y proveedores.'],
      'zh-Hans': ['帮助中心 | Carioca Ticket', 'Carioca Ticket 为购票用户、主办方、合作伙伴和供应商提供支持。']
    },
    sobre: {
      'pt-BR': ['Sobre a Carioca Ticket | Carioca Ticket', 'Conheça a Carioca Ticket e a proposta da plataforma para compradores e produtores.'],
      'en-US': ['About Carioca Ticket | Carioca Ticket', 'Learn about Carioca Ticket and what the platform offers buyers and organizers.'],
      es: ['Sobre Carioca Ticket | Carioca Ticket', 'Conoce Carioca Ticket y la propuesta de la plataforma para compradores y organizadores.'],
      'zh-Hans': ['关于 Carioca Ticket | Carioca Ticket', '了解 Carioca Ticket 及平台面向购票用户和主办方的服务理念。']
    },
    termos: {
      'pt-BR': ['Termos de Uso | Carioca Ticket', 'Termos gerais de uso da plataforma Carioca Ticket.'],
      'en-US': ['Terms of Use | Carioca Ticket', 'General terms of use for the Carioca Ticket platform.'],
      es: ['Términos de uso | Carioca Ticket', 'Términos generales de uso de la plataforma Carioca Ticket.'],
      'zh-Hans': ['使用条款 | Carioca Ticket', 'Carioca Ticket 平台的一般使用条款。']
    },
    privacidade: {
      'pt-BR': ['Política de Privacidade | Carioca Ticket', 'Política de Privacidade da Carioca Ticket e informações sobre tratamento de dados.'],
      'en-US': ['Privacy Policy | Carioca Ticket', 'Carioca Ticket’s Privacy Policy and information about data processing.'],
      es: ['Política de privacidad | Carioca Ticket', 'Política de privacidad de Carioca Ticket e información sobre el tratamiento de datos.'],
      'zh-Hans': ['隐私政策 | Carioca Ticket', 'Carioca Ticket 隐私政策及数据处理信息。']
    },
    'cancelamento-reembolso': {
      'pt-BR': ['Cancelamento e Reembolso | Carioca Ticket', 'Orientações gerais da Carioca Ticket para cancelamento e reembolso de ingressos.'],
      'en-US': ['Cancellation and Refunds | Carioca Ticket', 'Carioca Ticket’s general guidance on ticket cancellations and refunds.'],
      es: ['Cancelación y reembolsos | Carioca Ticket', 'Orientaciones generales de Carioca Ticket sobre cancelación y reembolso de entradas.'],
      'zh-Hans': ['取消与退款 | Carioca Ticket', 'Carioca Ticket 关于门票取消与退款的一般指引。']
    }
  };
  var page = document.body.dataset.institutionalPage;
  function render() {
    I.apply(document);
    var locale = I.getLocale();
    select.value = locale;
    var meta = metadata[page] && metadata[page][locale];
    if (meta) {
      document.title = meta[0];
      var description = document.querySelector('meta[name="description"]');
      if (description) description.content = meta[1];
    }
    var notice = document.getElementById('legal-translation-notice');
    var original = document.getElementById('legal-original');
    if (notice) notice.hidden = locale === 'pt-BR';
    if (original) {
      original.hidden = locale === 'pt-BR';
      if (locale === 'pt-BR') original.open = false;
    }
  }
  select.addEventListener('change', function () { I.setLocale(select.value); });
  document.addEventListener('ct:public-language', render);
  document.getElementById('public-language-bar').hidden = false;
  render();
}());
