(function () {
  'use strict';
  // Reuse the public site's locale preference without loading home-only controllers.
  var dictionaries = {
  "pt-BR": {
    "title": "Anuncie na Carioca Ticket | Publicidade",
    "skip": "Pular para o conteúdo",
    "home": "Página inicial",
    "language": "Idioma",
    "theme": "Tema",
    "mode": "Automático",
    "light": "Claro",
    "dark": "Escuro",
    "eyebrow": "Sua marca na agenda",
    "heading": "Anuncie na Carioca Ticket",
    "intro": "Apresente sua empresa nos espaços de publicidade do nosso site. Converse com a equipe comercial e encontre um período de divulgação para o seu negócio.",
    "contact": "Falar com o comercial",
    "seePlans": "Conhecer os planos",
    "visualLabel": "Espaço publicitário ilustrativo",
    "visualTitle": "O próximo destaque pode ser a sua marca.",
    "visualCopy": "Publicidade na página inicial da Carioca Ticket.",
    "placements": "Onde sua marca pode aparecer",
    "placementsIntro": "Dois espaços na página inicial, integrados à navegação de quem explora a Carioca Ticket.",
    "primary": "Publicidade 1",
    "primaryCopy": "Depois da seção de eventos, antes da área para produtores.",
    "secondary": "Publicidade 2",
    "secondaryCopy": "Depois da seção de segurança, antes das perguntas frequentes.",
    "placementNote": "Os espaços usam carrossel e podem alternar anúncios. A posição, a disponibilidade e o formato da campanha serão confirmados na proposta.",
    "plans": "Escolha o tempo da sua campanha",
    "plansIntro": "Quatro períodos para sua campanha. Escolha um plano para ver os detalhes e conversar com o comercial.",
    "monthly": "Mensal",
    "monthlyDuration": "1 mês",
    "monthlyCopy": "Para uma ação com período mais curto.",
    "quarterly": "Trimestral",
    "quarterlyDuration": "3 meses",
    "quarterlyCopy": "Para planejar a divulgação ao longo de três meses.",
    "halfYear": "Semestral",
    "halfYearDuration": "6 meses",
    "halfYearCopy": "Para planejar a divulgação ao longo do semestre.",
    "annual": "Anual",
    "annualDuration": "12 meses",
    "annualCopy": "Para organizar a presença da sua marca ao longo do ano.",
    "proposal": "Solicitar proposta",
    "planNote": "A proposta define espaço, período, formato e valor. Solicitar uma proposta não reserva espaço nem contrata um plano.",
    "process": "Da conversa à campanha",
    "step1": "Conte sobre sua empresa",
    "step1Copy": "Informe o que deseja divulgar e o período de interesse.",
    "step2": "Receba uma proposta",
    "step2Copy": "Nossa equipe apresenta disponibilidade, formatos e condições para avaliação.",
    "step3": "Combine a publicação",
    "step3Copy": "Após a aprovação da proposta e dos materiais, a publicação é alinhada com a equipe.",
    "finalTitle": "Vamos conversar sobre a sua marca?",
    "finalCopy": "Fale com o comercial para consultar disponibilidade e receber uma proposta.",
    "whatsappNote": "O WhatsApp abre em uma nova aba. Nenhuma mensagem é enviada automaticamente.",
    "footer": "Publicidade para empresas",
    "rights": "© 2026 Carioca Ticket. Todos os direitos reservados.",
    "message": "Olá! Quero solicitar uma proposta de publicidade na Carioca Ticket.",
    "annualPrice": "R$ 149 por mês",
    "annualBilling": "Cobrança mensal com compromisso de 12 meses. Total do período: R$ 1.788.",
    "planTerms": "Condições de cancelamento e renovação a definir na proposta.",
    "monthlyPrice": "R$ 249 por mês",
    "monthlyBilling": "Cobrança mensal com compromisso de 1 mês. Total do período: R$ 249.",
    "quarterlyPrice": "R$ 219 por mês",
    "quarterlyBilling": "Cobrança mensal com compromisso de 3 meses. Total do período: R$ 657.",
    "halfYearPrice": "R$ 179 por mês",
    "halfYearBilling": "Cobrança mensal com compromisso de 6 meses. Total do período: R$ 1.074."
  },
  "en-US": {
    "title": "Advertise on Carioca Ticket | Advertising",
    "skip": "Skip to content",
    "home": "Home",
    "language": "Language",
    "theme": "Theme",
    "mode": "Automatic",
    "light": "Light",
    "dark": "Dark",
    "eyebrow": "Your brand on the agenda",
    "heading": "Advertise on Carioca Ticket",
    "intro": "Showcase your business in the advertising spaces on our website. Talk to our sales team and find a campaign period that fits your business.",
    "contact": "Talk to sales",
    "seePlans": "Explore the plans",
    "visualLabel": "Illustrative advertising space",
    "visualTitle": "Your brand could be the next highlight.",
    "visualCopy": "Advertising on the Carioca Ticket home page.",
    "placements": "Where your brand can appear",
    "placementsIntro": "Two spaces on the home page, alongside the experience of exploring Carioca Ticket.",
    "primary": "Advertising 1",
    "primaryCopy": "After the events section, before the section for event organizers.",
    "secondary": "Advertising 2",
    "secondaryCopy": "After the security section, before frequently asked questions.",
    "placementNote": "These spaces use a carousel and may rotate ads. Placement, availability and campaign format will be confirmed in the proposal.",
    "plans": "Choose your campaign period",
    "plansIntro": "Four campaign periods. Select a plan to see the details and talk to sales.",
    "monthly": "Monthly",
    "monthlyDuration": "1 month",
    "monthlyCopy": "For a shorter campaign.",
    "quarterly": "Quarterly",
    "quarterlyDuration": "3 months",
    "quarterlyCopy": "Plan your advertising over three months.",
    "halfYear": "Six months",
    "halfYearDuration": "6 months",
    "halfYearCopy": "Plan your advertising over six months.",
    "annual": "Annual",
    "annualDuration": "12 months",
    "annualCopy": "Plan your brand’s presence throughout the year.",
    "proposal": "Request a proposal",
    "planNote": "The proposal specifies placement, period, format and price. Requesting a proposal does not reserve space or purchase a plan.",
    "process": "From conversation to campaign",
    "step1": "Tell us about your business",
    "step1Copy": "Share what you want to promote and your preferred period.",
    "step2": "Receive a proposal",
    "step2Copy": "Our team presents availability, formats and terms for your review.",
    "step3": "Arrange publication",
    "step3Copy": "Once the proposal and materials are approved, publication is arranged with the team.",
    "finalTitle": "Let’s talk about your brand",
    "finalCopy": "Contact sales to check availability and request a proposal.",
    "whatsappNote": "WhatsApp opens in a new tab. No message is sent automatically.",
    "footer": "Advertising for businesses",
    "rights": "© 2026 Carioca Ticket. All rights reserved.",
    "message": "Hello! I would like to request an advertising proposal for Carioca Ticket.",
    "annualPrice": "R$ 149 per month",
    "annualBilling": "Monthly billing with a 12-month commitment. Total for the period: R$ 1,788.",
    "planTerms": "Cancellation and renewal terms will be defined in the proposal.",
    "monthlyPrice": "R$ 249 per month",
    "monthlyBilling": "Monthly billing with a 1-month commitment. Total for the period: R$ 249.",
    "quarterlyPrice": "R$ 219 per month",
    "quarterlyBilling": "Monthly billing with a 3-month commitment. Total for the period: R$ 657.",
    "halfYearPrice": "R$ 179 per month",
    "halfYearBilling": "Monthly billing with a 6-month commitment. Total for the period: R$ 1,074."
  },
  "es": {
    "title": "Anuncia en Carioca Ticket | Publicidad",
    "skip": "Saltar al contenido",
    "home": "Inicio",
    "language": "Idioma",
    "theme": "Tema",
    "mode": "Automático",
    "light": "Claro",
    "dark": "Oscuro",
    "eyebrow": "Tu marca en la agenda",
    "heading": "Anuncia en Carioca Ticket",
    "intro": "Presenta tu empresa en los espacios publicitarios de nuestro sitio. Habla con el equipo comercial y encuentra un período de difusión para tu negocio.",
    "contact": "Hablar con el equipo comercial",
    "seePlans": "Conocer los planes",
    "visualLabel": "Espacio publicitario ilustrativo",
    "visualTitle": "Tu marca puede ser la próxima protagonista.",
    "visualCopy": "Publicidad en la página de inicio de Carioca Ticket.",
    "placements": "Dónde puede aparecer tu marca",
    "placementsIntro": "Dos espacios en la página de inicio, integrados en la navegación de quienes exploran Carioca Ticket.",
    "primary": "Publicidad 1",
    "primaryCopy": "Después de los eventos, antes del área para organizadores.",
    "secondary": "Publicidad 2",
    "secondaryCopy": "Después de la sección de seguridad, antes de las preguntas frecuentes.",
    "placementNote": "Los espacios usan un carrusel y pueden alternar anuncios. La posición, la disponibilidad y el formato se confirmarán en la propuesta.",
    "plans": "Elige la duración de tu campaña",
    "plansIntro": "Cuatro períodos para tu campaña. Elige un plan para ver los detalles y hablar con el equipo comercial.",
    "monthly": "Mensual",
    "monthlyDuration": "1 mes",
    "monthlyCopy": "Para una campaña de menor duración.",
    "quarterly": "Trimestral",
    "quarterlyDuration": "3 meses",
    "quarterlyCopy": "Para planificar la publicidad durante tres meses.",
    "halfYear": "Semestral",
    "halfYearDuration": "6 meses",
    "halfYearCopy": "Para planificar la publicidad durante el semestre.",
    "annual": "Anual",
    "annualDuration": "12 meses",
    "annualCopy": "Para organizar la presencia de tu marca a lo largo del año.",
    "proposal": "Solicitar propuesta",
    "planNote": "La propuesta define espacio, período, formato y precio. Solicitar una propuesta no reserva espacio ni contrata un plan.",
    "process": "De la conversación a la campaña",
    "step1": "Cuéntanos sobre tu empresa",
    "step1Copy": "Indica qué deseas promocionar y el período de interés.",
    "step2": "Recibe una propuesta",
    "step2Copy": "Nuestro equipo presenta disponibilidad, formatos y condiciones para tu evaluación.",
    "step3": "Coordina la publicación",
    "step3Copy": "Tras aprobar la propuesta y los materiales, se coordina la publicación con el equipo.",
    "finalTitle": "¿Hablamos de tu marca?",
    "finalCopy": "Contacta al equipo comercial para consultar disponibilidad y recibir una propuesta.",
    "whatsappNote": "WhatsApp se abre en una pestaña nueva. No se envía ningún mensaje automáticamente.",
    "footer": "Publicidad para empresas",
    "rights": "© 2026 Carioca Ticket. Todos los derechos reservados.",
    "message": "¡Hola! Quiero solicitar una propuesta de publicidad en Carioca Ticket.",
    "annualPrice": "R$ 149 al mes",
    "annualBilling": "Facturación mensual con un compromiso de 12 meses. Total del período: R$ 1.788.",
    "planTerms": "Las condiciones de cancelación y renovación se definirán en la propuesta.",
    "monthlyPrice": "R$ 249 al mes",
    "monthlyBilling": "Facturación mensual con un compromiso de 1 mes. Total del período: R$ 249.",
    "quarterlyPrice": "R$ 219 al mes",
    "quarterlyBilling": "Facturación mensual con un compromiso de 3 meses. Total del período: R$ 657.",
    "halfYearPrice": "R$ 179 al mes",
    "halfYearBilling": "Facturación mensual con un compromiso de 6 meses. Total del período: R$ 1.074."
  },
  "zh-Hans": {
    "title": "在 Carioca Ticket 投放广告 | 广告服务",
    "skip": "跳转到正文",
    "home": "首页",
    "language": "语言",
    "theme": "主题",
    "mode": "自动",
    "light": "浅色",
    "dark": "深色",
    "eyebrow": "让品牌亮相活动平台",
    "heading": "在 Carioca Ticket 投放广告",
    "intro": "在我们网站的广告位展示您的企业。与商务团队沟通，为您的企业选择合适的推广周期。",
    "contact": "联系商务团队",
    "seePlans": "了解方案",
    "visualLabel": "广告位示意",
    "visualTitle": "下一个亮点，可以是您的品牌。",
    "visualCopy": "Carioca Ticket 首页广告。",
    "placements": "您的品牌可以展示在哪里",
    "placementsIntro": "首页设有两个广告位，融入用户浏览 Carioca Ticket 的体验。",
    "primary": "广告位 1",
    "primaryCopy": "位于活动板块之后、主办方板块之前。",
    "secondary": "广告位 2",
    "secondaryCopy": "位于安全板块之后、常见问题之前。",
    "placementNote": "广告位采用轮播形式，可能交替展示不同广告。具体位置、可用情况和广告形式将在方案中确认。",
    "plans": "选择广告周期",
    "plansIntro": "四种广告周期。选择方案查看详情，并与商务团队沟通。",
    "monthly": "月度",
    "monthlyDuration": "1 个月",
    "monthlyCopy": "适合较短周期的推广。",
    "quarterly": "季度",
    "quarterlyDuration": "3 个月",
    "quarterlyCopy": "规划三个月的广告推广。",
    "halfYear": "半年",
    "halfYearDuration": "6 个月",
    "halfYearCopy": "规划半年的广告推广。",
    "annual": "年度",
    "annualDuration": "12 个月",
    "annualCopy": "规划品牌全年的展示。",
    "proposal": "申请方案",
    "planNote": "方案将明确广告位、周期、形式和价格。申请方案不代表预订广告位或购买服务。",
    "process": "从沟通到投放",
    "step1": "介绍您的企业",
    "step1Copy": "说明您希望推广的内容及意向周期。",
    "step2": "获取方案",
    "step2Copy": "团队将提供可用广告位、广告形式及相关条件供您评估。",
    "step3": "安排发布",
    "step3Copy": "方案和素材获批后，与团队协调发布安排。",
    "finalTitle": "聊聊您的品牌吧",
    "finalCopy": "联系商务团队，咨询可用情况并获取方案。",
    "whatsappNote": "WhatsApp 将在新标签页打开。系统不会自动发送消息。",
    "footer": "面向企业的广告服务",
    "rights": "© 2026 Carioca Ticket。保留所有权利。",
    "message": "您好！我想咨询在 Carioca Ticket 投放广告的方案。",
    "annualPrice": "每月 R$ 149",
    "annualBilling": "按月收费，承诺期限为 12 个月。整个期限的总额为 R$ 1,788。",
    "planTerms": "取消及续约条件将在方案中确定。",
    "monthlyPrice": "每月 R$ 249",
    "monthlyBilling": "按月收费，承诺期限为 1 个月。整个期限的总额为 R$ 249。",
    "quarterlyPrice": "每月 R$ 219",
    "quarterlyBilling": "按月收费，承诺期限为 3 个月。整个期限的总额为 R$ 657。",
    "halfYearPrice": "每月 R$ 179",
    "halfYearBilling": "按月收费，承诺期限为 6 个月。整个期限的总额为 R$ 1,074。"
  }
};
  var select = document.getElementById('advertise-language');
  function valid(value) { return Object.prototype.hasOwnProperty.call(dictionaries, value); }
  function apply(locale) {
    if (!valid(locale)) locale = 'pt-BR';
    var copy = dictionaries[locale];
    document.documentElement.lang = locale;
    document.title = copy.title;
    var tablist = document.querySelector('.ad-tabs');
    if (tablist) tablist.setAttribute('aria-label', copy.plans);
    select.value = locale;
    document.querySelectorAll('[data-ad-text]').forEach(function (node) {
      node.textContent = copy[node.dataset.adText];
      node.lang = locale;
    });
    document.querySelectorAll('[data-proposal]').forEach(function (link) {
      var plan = link.dataset.proposal;
      var message = copy.message + (plan ? ' ' + copy[plan] + ' (' + copy[plan + 'Duration'] + ').' : '');
      link.href = 'https://wa.me/5581999311509?text=' + encodeURIComponent(message);
    });
  }
  var saved = 'pt-BR';
  try { saved = localStorage.getItem('ct-home-locale'); } catch (_) {}
  apply(saved);
  document.querySelector('.ad-preferences').hidden = false;
  select.addEventListener('change', function () {
    apply(select.value);
    try { localStorage.setItem('ct-home-locale', select.value); } catch (_) {}
  });

  // Progressive enhancement: without JavaScript all four plan details stay visible.
  var tablist = document.querySelector('.ad-tabs');
  var tabs = Array.prototype.slice.call(tablist.querySelectorAll('button'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.ad-plan'));
  function activate(index, focus) {
    tabs.forEach(function (tab, i) {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (focus) {
      tabs[index].focus({ preventScroll: true });
      tabs[index].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
  }
  tabs.forEach(function (tab, index) {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
    panels[index].tabIndex = 0;
    tab.addEventListener('click', function () { activate(index, false); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); activate(next, true); }
    });
  });
  tablist.setAttribute('role', 'tablist');
  document.querySelector('.ad-plans').classList.add('ad-plans-tabs');
  activate(0, false);
  tablist.hidden = false;

  window.addEventListener('storage', function (event) {
    if (event.key === 'ct-home-locale' || event.key === null) apply(event.newValue);
  });
}());

