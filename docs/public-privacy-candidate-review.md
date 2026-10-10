# Controles de privacidade públicos: candidato para revisão

Base auditada: main `e1a19fab8831cf2662a3be699dc6f1e230f89c5d`, confirmada via GitHub em 10/10/2026. Nenhum site ativo, RPC, compra, login ou deploy foi executado nesta tarefa. Alterações são somente candidatas locais.

## Resultado e limite de escopo

O site não contém um banner geral de cookies nos arquivos auditados. Há analytics próprio automático, preferências locais e mapa Google automático por visibilidade. O candidato oferece controles explicitamente limitados a **métricas de navegação** e **mapas Google incorporados**, com acesso posterior às escolhas. Não promete recusar todos os cookies nem conformidade jurídica. Não é ainda uma entrega completa de consentimento geral: tráfego/atribuição de campanhas e cupons exigem revisão específica da finalidade e do contrato operacional.

## Evidências na base

Links usam `https://github.com/tudoparasuafestape-dot/carioca-ticket-site/blob/e1a19fab8831cf2662a3be699dc6f1e230f89c5d/` + arquivo + âncora de linha.

- `assets/ct-analytics.js:18,35–40,84–145,177–195`: gera CT_ANALYTICS_SESSION_V1 em sessionStorage e envia um pageview automático após load + espera/idle. Campos: pagina, sessaoId, eventoId, origem (src/utm_source ou referrer), referrerHost e dispositivo (MOBILE/TABLET/DESKTOP). Formulário/iframe para infraestrutura Apps Script da Carioca Ticket, método ctAnalyticsMasterRegistrarLotePublicoPROD. Não há campos diretos de nome, e-mail, telefone ou CPF nesse payload; não presumir anonimato ou ausência de dados técnicos de rede no servidor.
- Ligação efetiva: `index.html:135`; `evento/index.html:884`; `evento-v2/index.html:913`; `checkout/index.html:1567`; `checkout-v2/index.html:1723`; `eventos-v2/index.html:3737`.
- `assets/ct-analytics.js:154–175`: recuperação de evento no mesmo arquivo, independente de métricas. Na base, evento e evento-v2 possuem retryEventLoad, que evita o fallback legado. Sua função foi preservada literalmente.
- `assets/event-map-preview.js:99–164`: iframe maps.google.com com endereço do evento público, sem coordenadas do visitante; recebe src ao entrar no viewport via IntersectionObserver, ou imediatamente sem esse recurso. Não era opt-in por clique. Aviso e política Google em 171–173 não bloqueiam o carregamento. `referrerPolicy=no-referrer` e permissões de geolocalização/câmera/microfone negadas em 110–112.
- Ligação do mapa: `evento/index.html:278,768`, `evento-v2/index.html:255,784`, versão `20261010-1`. Destino deriva do módulo de rotas validado. Links Abrir no Google Maps/Copiar endereço e Uber são ações separadas do embed, preservadas.
- `assets/home-theme.js:5,9,32`: ct-home-theme; `assets/public-i18n.js:5,18,72`: ct-home-locale; `assets/home-controls.js:12–13,58,130,143,161–169`: ct-home-location e ct-home-font; tamanho padrão também é persistido durante inicialização. `assets/home-install.js:4,12–18`: ct-home-install-choice-v1 em localStorage e sessionStorage. São preferências/decisões locais; não há transmissão de analytics implícita nesses setters.
- `assets/home-location.js:36–51`: coordenadas vão ao worker local para resolver município contra dados locais; não foram encontrados envios das coordenadas a geocodificador externo nesse fluxo.
- `checkout/index.html:509–558,982–998`: CT_CHECKOUT_RECOVERY_<evento> (pedido/token), CT_CHECKOUT_IDEMPOTENCY_<evento>_<método> e CT_MINHA_CARIOCA_COMPRAS_V1 (até 20 pedidos). Funcionalmente participam da recuperação, prevenção de repetição e acesso aos ingressos. O candidato não os lê, modifica ou apaga.
- `checkout-v2/index.html:615–657,673–679,758,1124–1138`: mesmos recursos e grants/retorno de convite. `convite/index.html:107` cria CT_PRIVATE_GRANT e CT_PRIVATE_RETURN. Preservados.
- `minha-carioca/login/index.html:127,339,363,456–479`: sessão ct_minha_carioca_session_v4. `minha-carioca/conta/index.html:81–104,131–132`: sessão com prazo local de seis horas, identificação/solicitação OTP em sessionStorage e recuperação de pedidos. Preservados.
- `checkout/index.html:334–336` e checkout-v2:328: checkbox de comunicações de marketing. Não é consentimento para métricas/mapa; não é modificado.
- `evento-v2/index.html:588–608,869–892` e `checkout-v2/index.html:521–540,666–712`: CT_CAMPANHA_SESSAO_<evento>_<cupom> e ctCuponsPublicoRegistrarAcessoSeguroPROD. Sessão/origem vão na medição de acesso; checkout-v2:1199 também passa campanhaSessaoId ao payload de pagamento. Esse uso NÃO comprova necessidade essencial. Exige revisão antes de generalizar o consentimento.
- `campanha/index.html:77–83`: CT_CAMP_RECOMP_KEY é idempotência da participação; CT_CAMP_RECOMP_TRAFFIC mede tráfego, enviado junto com origem no próprio RPC de carregar campanha. Não basta apagar uma chamada separada. Nenhuma alteração feita.
- `privacidade/index.html:10–12`, ajuda, termos, sobre e cancelamento-reembolso carregam Google Fonts/preconnect automaticamente. Não há alegação de que fontes sejam cookies analíticos, nem bloqueio delas neste candidato.
- Nos HTML e JS próprios de assets auditados, não foram encontrados document.cookie, GA/GTM, Meta Pixel, Hotjar ou Clarity. Isso não prova ausência de cookies em respostas de infraestrutura, conteúdo externo ou provedores de pagamento. Firebase está nas telas de produtor/parceiro/fornecedor para autenticação; não é um pixel do público. O service worker raiz não usa CacheStorage e não intercepta fetch.

## Implementação candidata

- `assets/public-privacy.js` e `.css`: choices versionadas locais, ambas desligadas por padrão, banner acessível em fluxo normal no início da página (sem overlay de compra e sem consentimento obrigatório), diálogo nativo, detalhes factuais, botão persistente de reabertura no fim da página, strings PT/EN/ES/ZH. Falha de storage mantém escolha em memória e informa a limitação; sincroniza alteração entre abas e retorno BFCache.
- `assets/ct-analytics.js`: gate antes de criar sessão e antes do envio; opt-in posterior agenda a coleta da página atual; no máximo um pageview por documento; recusa remove somente CT_ANALYTICS_SESSION_V1. Nenhum gate na recuperação do evento. As cinco páginas públicas de métricas declaram data-ct-public-privacy="required" no próprio script. O atributo é capturado durante a avaliação; nessas páginas, controlador ausente ou quebrado mantém as métricas desligadas. Páginas internas sem esse atributo conservam o comportamento legado e ignoram eventos deste controle público.
- `assets/event-map-preview.js` e `.css`: mapa inicia somente após escolha persistida ou botão “Carregar este mapa uma vez”; mantém lazy loading quando autorizado, aviso factual, endereço validado, links alternativos e atributos de privacidade. Revogação remove iframe e interrompe novos carregamentos. Não promete apagar cookies já definidos por Google.
- Includes nas páginas home, evento, evento-v2, checkout, checkout-v2, ajuda, anuncie, como-funciona, sobre, termos, privacidade, cancelamento-reembolso e acesso/login público. Os blocos operacionais inline e texto jurídico existentes são preservados.
- `/eventos-v2/` é gestão interna, apesar da classificação EVENTOS no analytics. Seu HTML não recebeu UI. O comportamento de métricas nessa tela foi preservado, sem atributo de escopo público, sem gate de consentimento público e sem modificação do HTML interno. Não adicionar banner interno sob o escopo de design público.

## Validação realizada

Passaram:
- `node --check` nos scripts novos/alterados e testes.
- `node tests/public-privacy.runtime.cjs`: 14 grupos de verificações em VM isolada: ausência de envio sem escolha, recusa, opt-in, payload, limpeza seletiva, deduplicação, revogação durante atraso, fallback de evento, controlador ausente, storage inválido/bloqueado, sincronização/BFCache e estados do mapa, escopo público capturado antes dos callbacks, falha do controlador e preservação do comportamento interno.
- `CT_PRIVACY_BASE=../public-privacy-base node tests/public-privacy.contract.cjs`: includes e versões apenas nos HTML, texto original e lógica de compra sem alteração, função de fallback preservada, nenhuma rede nova ou limpeza geral de storage.
- `node tests/event-map-contract.cjs`: contrato de mapa legado adaptado à autorização explícita; URL/privacidade, carregamento por visibilidade, timeout, erro, idioma, invalidação e teardown.
- `node tests/public-i18n.runtime.cjs`: 28 testes existentes.
- `node tests/safety/public-request-policy.test.cjs`: 16 testes existentes.

Não executados até conclusão:
- Browser/UI, screenshots, navegação real em fixture e regressão de compra: Chromium falhou antes de abrir página por `socket() Operation not permitted`. A execução escalada falhou antes do teste por erro de montagem bwrap. Nenhuma nova tentativa após o bloqueio confirmado.
- `tests/public-privacy.browser.cjs` está preparado para fixtures interceptadas, proxy morto, contexto offline e sem service workers; inclui home/evento/checkout, CTA móvel acessível sem escolher consentimento, edição do checkout sem consentimento, ausência de overlay do banner, mapa pontual/revogação, foco/Escape, 320/1440px, quatro idiomas, temas claro/escuro e fonte 100/150%, storage bloqueado. Ainda precisa de revisão e execução em CI isolada. Os mapas são HTML sintético; imagens publicitárias grandes usam fixture explícita de imagem. Não testa o provedor Google real.
- Testes de mapa/telemetria existentes foram adaptados para armazenar autorização de fixture antes da avaliação de comportamento autorizado. Nenhuma execução de produção.

## Antes de aprovar publicação

1. Revisar o escopo público explícito e os contratos novos que preservam a telemetria interna legada.
2. Resolver se o pedido de cookies precisa cobrir campanhas/cupons e fontes agora. Revisar finalidade/necessidade da atribuição, contratos de carregamento e separação de medição versus transação; não classificá-los como essenciais por conveniência.
3. Rever textos, acessibilidade e traduções em screenshots reais da CI isolada.
4. Executar fluxos de checkout/recovery, mapa, reabertura, cancelamento/Escape, back/forward, outra aba e storage indisponível no navegador isolado. Não considerar testes VM prova de renderização ou compra.
5. Revisão do candidato antes de branch/PR, merge ou deploy. PR de rascunho e CI isolada foram autorizados após revisão; nenhuma publicação em produção está autorizada por essa etapa.

## Revisão incremental 1

- Removido o efeito colateral sobre métricas internas: gate somente no script explicitamente marcado pelas páginas públicas. O marcador é capturado antes de qualquer callback, sem consultar currentScript posteriormente.
- Controlador ausente ou que lança erro permanece fail-closed nas páginas públicas marcadas; teste de regressão específico.
- Banner em fluxo normal antes do conteúdo, sem posição fixa e sem backdrop; só o diálogo de detalhes voluntariamente aberto é modal. Nenhuma trava, atributo inert ou desativação de compra depende da decisão.
- Cobertura pública e exclusão dos painéis internos agora constam nos detalhes, nas quatro línguas. Campanhas/cupons e fontes continuam explicitamente fora do controle, sem reclassificação como essenciais.
- Contratos e 14 grupos VM passaram novamente. O teste de navegador foi ampliado, mas permanece não executado devido ao bloqueio já registrado.

## Preparação para CI

Workflow public-privacy-isolated.yml com contents:read, sem segredos, sem deploy ou comandos de produção. Matriz de screenshots: 320/1440px × PT/EN/ES/ZH × claro/escuro × fonte 100/150%. Após escolher no banner, o foco segue para o conteúdo principal e é trazido para a área visível; fechamento de detalhes restaura o acionador visível.

PRs concorrentes 207 (ERA/Uber) e 208 (WhatsApp) permaneciam abertos sobre a mesma base e1a19fab na preparação. Esta branch parte de main sem sobrescrever essas branches; os hunks de cache/include devem ser reconciliados quando houver integração, preservando as três entregas.

Branch candidata sincronizada sobre main 96a7de5246d3bd4872a4e2e0cc24a18feabe0ec0 após merge da PR207. Registro ERA herdado da nova base; ambos os templates preservam event-ride-destinations.js?v=20261010-3. PR208 ainda independente, sem sobrescrita da sua branch.
