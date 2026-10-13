# Composição temporal pública, isolada

Preparada em 13/10/2026. Não houve push, PR novo, merge, deploy, workflow dispatch, rollback, Google RPC, criação real de pedido ou acesso a credenciais.

## Fontes e escopo

- Repositório: `tudoparasuafestape-dot/carioca-ticket-site`.
- Base exata: `ccaefcee980b47e1e589e5a05ecb4c95595d529f`.
- Fonte das quatro páginas e das traduções: PR #220, commit `b3d36a135065cfaf0154fc83530c836c5cbedc9a`.
- `evento/index.html`, `evento-v2/index.html`, `checkout/index.html` e `checkout-v2/index.html` recebem a lógica temporal de PR #220 e os ajustes de integração descritos abaixo.
- `assets/checkout-translations.js` recebe apenas o delta de PR #220, necessário às mensagens de recuperação.
- As páginas, assets e testes-base foram materializados pelo plugin GitHub com `ref` exata e validados pelo hash de blob Git. Nenhum arquivo da tentativa anterior foi usado como base implícita.
- A materialização local contém um slice de teste. Em eventual publicação autorizada, apenas os caminhos revisados devem ser aplicados sobre a árvore completa da base, preservando todos os demais arquivos; a árvore do commit não deve ser substituída por este diretório. A prontidão de deploy não foi comprovada. O índice `temporal-integrated-source-index.json` registra os 54 arquivos-base, suas origens e hashes, os arquivos de produção alterados e as dependências JS/CSS dos seis entrypoints materializados.

## Integração e contratos

A home, `eventos-v2/index.html`, `assets/public-event-catalog.js`, `assets/home-event-rail.js` e `assets/public-catalog-clock.js` permanecem idênticos à base. O clock conserva a âncora de servidor, os high-water marks, o desconto integral do tempo da requisição, a validação estrita de instantes UTC e `remainingUntil` para expiração individual de eventos. Não foi substituído pelo clock menos conservador de PR #220.

As quatro páginas usam `begin`, `accept`, `isFresh` e `invalidate`; essas APIs já são compatíveis com o clock preservado. Todas referenciam a mesma revisão de cache da home: `20261013-event-expiry1`.

O backend precisa fornecer o envelope raiz `temporalVersion: 1`, `serverNow`, `temporalEvaluatedAt`, `validUntil` e `nextTransitionAt` nas leituras de catálogo, detalhe e checkout. O bloqueio de novos pedidos após o fim precisa estar presente no backend, compatível com PR #299. Esse backend não faz parte deste diretório; ausência ou inconsistência do envelope mantém a nova venda bloqueada.

Ajustes sobre PR #220:

1. No detalhe, `click`, `auxclick`, `contextmenu`, `dragstart`, Enter e Espaço verificam a lease na própria ação, mesmo que o timer de expiração esteja atrasado.
2. Ocultação e `pagehide` invalidam imediatamente ofertas para novas vendas. Foco, retorno visível, `online` e BFCache pedem nova validação.
3. Refresh automático, retomadas repetidas e leases muito curtas respeitam um intervalo mínimo de 5 segundos entre requisições. A expiração da oferta continua imediata; somente a nova leitura é limitada.
4. `orderOwnsCheckout` separa esse comportamento do pedido existente, pagamento em andamento, recuperação e ingresso já emitido.

Não houve alteração da política comercial, precificação, capacidade, escolha automática de próximo lote ou prazo de pagamento. A atualização limpa a seleção de um lote retirado e exige nova escolha. O bridge RPC de cada página e 12 funções por checkout, incluindo expiração da reserva, polling, chaves de idempotência, recuperação armazenada e URL segura do ingresso, são verificados por hash contra a base.

Privacidade, analytics, fechamento antecipado e helper de política comercial permanecem idênticos à base. O checkout V2 continua encaminhando o grant recebido; o detalhe público V2 permanece uma consulta pública por evento. Não foi criado novo armazenamento de grant nem de dados pessoais. A campanha é registrada somente no primeiro carregamento bem-sucedido.

## Execução offline reproduzível

Na raiz deste slice:

```sh
node tests/temporal-integrated-offline.cjs
```

Para repetir nos três fusos:

```sh
for tz in Etc/UTC America/Sao_Paulo Asia/Tokyo; do
  TZ="$tz" node tests/temporal-integrated-offline.cjs
done
```

O runner executa 356 verificações em cada fuso:

- 22 testes do clock compartilhado
- 24 testes da home/catalog/rail e expiração por evento
- 82 testes VM/fakeDOM dos quatro entrypoints
- 18 invariantes de composição e preservação da base
- 75 regressões DOM do checkout
- 100 regressões de idioma do checkout
- 35 regressões de idioma do checkout V2

Os testes das quatro páginas executam seus scripts inline reais, sem alterá-los ou exportar o estado interno. O DOM é sintético e o transporte RPC é substituído por mocks após a instalação do bridge real. Form submission, fetch, XHR, WebSocket e navegação externa são proibidos no harness. As respostas, grants, pedidos, links e dados do comprador são exclusivamente sintéticos; não há credenciais ou acesso real ao provedor.

## Cobertura principal

- Envelope obrigatório, relógio ausente, resposta inválida e resposta consumida integralmente no trânsito
- Fronteira exata de `nextTransitionAt`, timer atrasado e ação síncrona
- Alterações para frente/trás no relógio civil do dispositivo
- Repetição de resposta em cache sem renovação da lease; regressão de servidor/evaluation rejeitada
- Suspensão durante requisição e rejeição de resposta antiga após invalidação
- Ocultar/retomar, pagehide, foco, online e BFCache sem rajada de consultas
- Preço/CTA removidos no detalhe; catálogo vazio legítimo e leitura pública negada
- Formulário e participantes preservados na atualização; nenhum avanço automático de lote
- Bloqueio de pagamento direto, cupom tardio e fee quote tardio com lease expirada
- PIX e cartão existentes, prazo de reserva e polling preservados após o catálogo expirar
- Recuperação de pedido mesmo com catálogo indisponível e ingresso emitido preservado
- Pagamento pendente, resposta perdida e reload sem segunda cobrança ou nova chave
- Acesso/campanha V2 sem novo armazenamento sensível

## Limites e dependências antes de homologação completa

- Os 356 checks são offline. Não validam renderização nativa, CSS, foco/accessibilidade nativos, navegação real, iframe/postMessage, provider, cobrança, idempotência do servidor ou instalação/deploy.
- Nenhum browser real foi executado nesta composição. A tentativa anterior de Chromium havia sido bloqueada no lançamento por socket local (`EPERM`); isso não conta como teste de navegador aprovado.
- Foi tentado `npm run test:contracts`. O agregado parou por páginas protegidas e três ícones PNG ausentes neste slice. Não houve outro tipo de falha reportado nessa execução. `eventos-privados-v1.mjs` não chegou a executar por causa do encadeamento `&&`.
- Antes de usar a suíte completa do repositório, integrar/revisar os mocks de envelope, rotas de assets e fixtures de browser de PR #220 contra esta composição. Os workflows isolados de PR #220 também adicionavam a permissão de servir `public-catalog-clock.js`; essas mudanças não foram portadas aqui.
- A suíte browser temporal original de PR #220 usava agendamento de 50 ms. Suas expectativas de tempo precisam ser ajustadas ao intervalo mínimo de 5 segundos antes de rodá-la contra esta composição.
- Requer revisão independente da composição e verificação das dependências backend. Este documento não autoriza publicação, merge, deploy ou rollback.
