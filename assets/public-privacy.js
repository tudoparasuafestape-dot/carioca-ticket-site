/* Public navigation-metrics and external-map choices. No backend, account or payment changes. */
(function () {
  'use strict';
  var key = 'ct-public-privacy-v1', state = { decided: false, analytics: false, maps: false }, memoryOnly = false;
  var dialog, banner, reopen, opener, analyticsInput, mapsInput, saveNotice;
  function parse(raw) {
    try { var x = JSON.parse(raw); return x && x.version === 1 && typeof x.analytics === 'boolean' && typeof x.maps === 'boolean' ? { decided: true, analytics: x.analytics, maps: x.maps } : null; } catch (_) { return null; }
  }
  function read() { try { return parse(localStorage.getItem(key)); } catch (_) { return null; } }
  state = read() || state;
  function allowed(category) { return state.decided && (category === 'analytics' || category === 'maps') && state[category] === true; }
  function notify() { document.dispatchEvent(new CustomEvent('ct:privacy', { detail: { analytics: allowed('analytics'), maps: allowed('maps') } })); }
  function choose(analytics, maps) {
    state = { decided: true, analytics: analytics === true, maps: maps === true };
    try { localStorage.setItem(key, JSON.stringify({ version: 1, analytics: state.analytics, maps: state.maps })); memoryOnly = false; } catch (_) { memoryOnly = true; }
    paint(); notify();
  }
  function sync() { if (!memoryOnly) state = read() || { decided: false, analytics: false, maps: false }; paint(); notify(); }
  var copy = {
    'pt-BR': {
      title: 'Privacidade na navegação', intro: 'Escolha se permite métricas de navegação e mapas do Google. A compra continua disponível sem essas opções.',
      accept: 'Permitir métricas e mapa', reject: 'Continuar sem estas opções', details: 'Ver detalhes e escolher', reopen: 'Preferências de privacidade', close: 'Fechar', save: 'Salvar escolhas',
      analytics: 'Métricas de navegação', analyticsInfo: 'Conta visitas à página inicial, evento e checkout: tipo de página, sessão aleatória, identificador do evento, origem da visita, domínio de referência e tipo de dispositivo. Envio à infraestrutura Google Apps Script da Carioca Ticket. Este envio não inclui nome, e-mail, telefone ou CPF.',
      maps: 'Mapas incorporados do Google', mapsInfo: 'Permite carregar o mapa ao chegar à seção. O Google recebe seu IP e dados do navegador e pode usar cookies. Sem esta permissão, você pode carregar um mapa uma única vez ou abrir o link externo.',
      local: 'Funcionamento e escolhas locais', localInfo: 'Pedido em andamento, prevenção de repetição de pagamento e acesso aos ingressos usam armazenamento próprio. Idioma, tema, tamanho da fonte, cidade escolhida e dispensa do convite de instalação podem ser guardados pelos controles do site. Estas escolhas não são alteradas aqui.',
      limits: 'O que estas escolhas cobrem', limitsInfo: 'Nas páginas públicas, estas opções controlam somente as métricas de navegação descritas acima e o mapa incorporado. Elas não se aplicam a painéis internos. Links externos, fontes do Google em páginas institucionais e registros de acesso ou atribuição de campanhas e cupons não são controlados aqui. A opção de receber comunicações no checkout é separada.',
      retention: 'Sua escolha fica neste navegador até você alterá-la ou limpar os dados do site. Não podemos apagar cookies do Google por este controle. Ao desativar uma opção, interrompemos novos carregamentos ou envios; dados já enviados não são desfeitos.',
      policy: 'Política de Privacidade', failed: 'Não foi possível salvar no navegador. A escolha vale apenas nesta página.'
    },
    'en-US': {
      title: 'Browsing privacy', intro: 'Choose whether to allow navigation metrics and Google maps. Buying tickets remains available without these options.',
      accept: 'Allow metrics and maps', reject: 'Continue without these options', details: 'View details and choose', reopen: 'Privacy preferences', close: 'Close', save: 'Save choices',
      analytics: 'Navigation metrics', analyticsInfo: 'Counts home, event and checkout visits: page type, random session, event identifier, traffic source, referring domain and device type. Sent to Carioca Ticket’s Google Apps Script infrastructure. This submission does not include names, email addresses, phone numbers or CPF numbers.',
      maps: 'Embedded Google maps', mapsInfo: 'Allows the map to load when you reach its section. Google receives your IP address and browser data and may use cookies. Without this permission, you can load one map once or open the external link.',
      local: 'Site operation and local choices', localInfo: 'Orders in progress, duplicate-payment prevention and ticket access use local storage. Language, theme, font size, selected city and dismissing the installation invitation may be saved by the site controls. These choices are not changed here.',
      limits: 'What these choices cover', limitsInfo: 'On public pages, these options control only the navigation metrics described above and the embedded map. They do not apply to internal dashboards. External links, Google fonts on institutional pages and campaign or coupon access and attribution records are not controlled here. The checkout communications option is separate.',
      retention: 'Your choice stays in this browser until you change it or clear site data. This control cannot delete Google cookies. Turning an option off stops new loads or submissions; it does not undo data already sent.',
      policy: 'Privacy Policy', failed: 'Could not save in this browser. Your choice applies only to this page.'
    },
    es: {
      title: 'Privacidad al navegar', intro: 'Elige si permites métricas de navegación y mapas de Google. La compra sigue disponible sin estas opciones.',
      accept: 'Permitir métricas y mapas', reject: 'Continuar sin estas opciones', details: 'Ver detalles y elegir', reopen: 'Preferencias de privacidad', close: 'Cerrar', save: 'Guardar opciones',
      analytics: 'Métricas de navegación', analyticsInfo: 'Cuenta visitas al inicio, evento y compra: tipo de página, sesión aleatoria, identificador del evento, origen de la visita, dominio de referencia y tipo de dispositivo. Se envían a la infraestructura Google Apps Script de Carioca Ticket. Este envío no incluye nombre, correo, teléfono ni CPF.',
      maps: 'Mapas de Google integrados', mapsInfo: 'Permite cargar el mapa al llegar a la sección. Google recibe tu IP y datos del navegador y puede usar cookies. Sin este permiso, puedes cargar un mapa una sola vez o abrir el enlace externo.',
      local: 'Funcionamiento y opciones locales', localInfo: 'Los pedidos en curso, la prevención de pagos repetidos y el acceso a entradas usan almacenamiento propio. Idioma, tema, tamaño de letra, ciudad elegida y descarte de la invitación de instalación pueden guardarse mediante los controles del sitio. Aquí no se cambian estas opciones.',
      limits: 'Alcance de estas opciones', limitsInfo: 'En las páginas públicas, solo se controlan las métricas de navegación descritas arriba y el mapa integrado. No se aplican a paneles internos. Aquí no se controlan enlaces externos, fuentes de Google en páginas institucionales ni registros de acceso o atribución de campañas y cupones. La opción de comunicaciones de la compra es independiente.',
      retention: 'Tu elección permanece en este navegador hasta que la cambies o borres los datos del sitio. Este control no puede borrar cookies de Google. Desactivar una opción detiene nuevas cargas o envíos; no deshace los datos ya enviados.',
      policy: 'Política de Privacidad', failed: 'No se pudo guardar en el navegador. La elección solo se aplica a esta página.'
    },
    'zh-Hans': {
      title: '浏览隐私', intro: '请选择是否允许浏览统计和 Google 地图。不启用这些选项仍可购票。',
      accept: '允许统计和地图', reject: '不启用这些选项，继续', details: '查看详情并选择', reopen: '隐私偏好设置', close: '关闭', save: '保存选择',
      analytics: '浏览统计', analyticsInfo: '统计首页、活动和结账页面的访问：页面类型、随机会话标识、活动标识、访问来源、来源域名和设备类型。发送至 Carioca Ticket 的 Google Apps Script 基础设施。此发送内容不包含姓名、电子邮箱、电话号码或 CPF。',
      maps: '嵌入式 Google 地图', mapsInfo: '允许在滚动到地图区域时加载地图。Google 会收到您的 IP 地址和浏览器数据，并可能使用 Cookie。未授权时，您仍可单次加载一张地图或打开外部链接。',
      local: '网站功能和本地选择', localInfo: '进行中的订单、防止重复付款和查看门票使用本地存储。网站控件可能会保存语言、主题、字号、所选城市以及关闭安装提示的选择。此处不会更改这些设置。',
      limits: '这些选择的范围', limitsInfo: '这些选项仅控制公共页面上的上述浏览统计和嵌入式地图，不适用于内部管理面板。外部链接、介绍页面中的 Google 字体以及营销活动和优惠券的访问或归因记录不受此处控制。结账页面中接收信息的选项是独立的。',
      retention: '您的选择将保留在此浏览器中，直到您修改选择或清除网站数据。此控件无法删除 Google 的 Cookie。关闭选项可停止新的加载或发送，但无法撤回已经发送的数据。',
      policy: '隐私政策', failed: '无法在浏览器中保存。此选择仅适用于当前页面。'
    }
  };
  function locale() { var v; try { v = window.CTPublicI18n ? window.CTPublicI18n.getLocale() : localStorage.getItem('ct-home-locale'); } catch (_) {} return Object.prototype.hasOwnProperty.call(copy, v) ? v : 'pt-BR'; }
  function text(id) { return copy[locale()][id]; }
  function node(tag, id, parent) { var el = document.createElement(tag); if (id) { el.dataset.privacyCopy = id; el.textContent = text(id); } if (parent) parent.appendChild(el); return el; }
  function button(id, parent, fn) { var el = node('button', id, parent); el.type = 'button'; el.addEventListener('click', fn); return el; }
  function paint() {
    if (!banner) return;
    document.querySelectorAll('[data-privacy-copy]').forEach(function (el) { el.textContent = text(el.dataset.privacyCopy); });
    banner.lang = dialog.lang = reopen.lang = locale(); banner.hidden = state.decided;
    if (!dialog.open) { analyticsInput.checked = allowed('analytics'); mapsInput.checked = allowed('maps'); }
    saveNotice.hidden = !memoryOnly;
  }
  function open(event) { opener = event && event.currentTarget || reopen; analyticsInput.checked = allowed('analytics'); mapsInput.checked = allowed('maps'); if (!dialog.open) dialog.showModal(); dialog.querySelector('button').focus(); }
  function focusContent(){
    var target=document.querySelector('main');
    if(!target||target.hidden||target.classList.contains('hidden'))target=reopen;
    if(target!==reopen&&!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
    target.focus(); // Scroll the new focus into view; never leave it hidden at the footer.
  }
  function init() {
    if (document.getElementById('ct-privacy-banner')) return;
    banner = node('section'); banner.id = 'ct-privacy-banner'; banner.className = 'ct-privacy-banner'; banner.setAttribute('aria-labelledby', 'ct-privacy-title');
    node('h2', 'title', banner).id = 'ct-privacy-title'; node('p', 'intro', banner);
    var actions = node('div', null, banner); actions.className = 'ct-privacy-actions';
    function finish(a, m) { var focus = banner.contains(document.activeElement); choose(a, m); if(memoryOnly){open();return;} if (focus) focusContent(); }
    button('accept', actions, function () { finish(true, true); }); button('reject', actions, function () { finish(false, false); }); button('details', actions, open);
    var reopenHost=node('div',null,document.body);reopenHost.className='ct-privacy-reopen-wrap';
    reopen = button('reopen', reopenHost, open); reopen.id = 'ct-privacy-reopen'; reopen.className = 'ct-privacy-reopen';
    dialog = node('dialog'); dialog.id = 'ct-privacy-dialog'; dialog.className = 'ct-privacy-dialog'; dialog.setAttribute('aria-labelledby', 'ct-privacy-dialog-title');
    var head = node('div', null, dialog); head.className = 'ct-privacy-heading'; node('h2', 'title', head).id = 'ct-privacy-dialog-title'; button('close', head, function () { dialog.close(); });
    [['analytics', 'analyticsInfo'], ['maps', 'mapsInfo']].forEach(function (pair) { var section = node('section', null, dialog), label = node('label', null, section), input = node('input', null, label); input.type = 'checkbox'; input.id = 'ct-privacy-' + pair[0]; node('span', pair[0], label); var desc = node('p', pair[1], section); desc.id = input.id + '-info'; input.setAttribute('aria-describedby', desc.id); if (pair[0] === 'analytics') analyticsInput = input; else mapsInput = input; });
    [['local','localInfo'],['limits','limitsInfo']].forEach(function (pair) { node('h3', pair[0], dialog); node('p', pair[1], dialog); });
    node('p', 'retention', dialog); var policy = node('a', 'policy', dialog); policy.href = '/privacidade/';
    saveNotice = node('p', 'failed', dialog); saveNotice.setAttribute('role','status');
    button('save', dialog, function () { choose(analyticsInput.checked, mapsInput.checked); if (!memoryOnly) dialog.close(); });
    dialog.addEventListener('close', function () { if (opener && opener.isConnected && !opener.closest('[hidden]')) opener.focus(); else focusContent(); });
    // In normal document flow, never an overlay over purchase controls.
    var main=document.querySelector('main');
    if(main&&main.parentNode)main.parentNode.insertBefore(banner,main);
    else document.body.insertBefore(banner,document.body.firstChild);
    document.body.appendChild(dialog); paint(); notify();
  }
  window.CTPrivacy = Object.freeze({ allowed: allowed, open: function (trigger) { if (dialog) open({currentTarget:trigger || reopen}); } });
  window.addEventListener('storage', function (event) { var storage; try { storage = localStorage; } catch (_) { return; } if (event.storageArea === storage && (event.key === key || event.key === null)) { memoryOnly = false; sync(); } else if (event.key === 'ct-home-locale') paint(); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) sync(); });
  document.addEventListener('ct:public-language', paint); document.addEventListener('ct:language', paint);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
}());
