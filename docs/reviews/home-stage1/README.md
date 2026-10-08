# Home: primeira fatia para revisão

Branch: `feat/home-redesign-stage1-20261008`.
Base: `edcfe04d08438b0ba3a5fd38ef823aa9502aa2e0` (main conferida antes e depois da implementação).

O catálogo passa a ter uma apresentação clara/escura, busca e cidade/local visíveis e navegação principal reduzida. O tema começa com a preferência do sistema; a escolha explícita fica restrita à home e continua funcionando quando o armazenamento está indisponível. Cards mantêm a capa inteira, nome, data/horário, local/cidade e os destinos existentes. Campos ausentes são identificados como não informados, sem preencher fatos ou preços fictícios.

## Limite da referência

A referência `libfile_3e18eab004bc8191a1da0e60abaec0d1`, `carioca-ticket-proposta-visual.pdf`, foi resolvida pela Library na versão **11**, tamanho declarado **101797 bytes**. A materialização pelo helper oficial retornou **HTTP 403**. Não houve PDF local legível, extração nem inspeção visual de páginas. Esta implementação resulta da inspeção independente da home e do escopo solicitado; **não está atestada como fiel à proposta v11**. A conferência com o PDF permanece pendente para a revisão.

## Isolamento e preservação

- Clone independente; nenhum checkout ou worktree concorrente foi alterado. Não havia `AGENTS.md` nem `.agents/skills` no checkout nem nos diretórios ancestrais consultados. Foram lidos `HOMOLOGACAO.md`, configuração E2E, contratos e workflows.
- PR 163 está na base. PR 160 permanece aberto e não foi incorporado.
- Somente `index.html`, `assets/home.css`, `assets/home-theme.js`, `assets/home-navigation.js` e a apresentação/filtro local de `assets/public-event-catalog.js` mudam o produto.
- `styles.css`, evento, evento-v2, checkout, checkout-v2, analytics e service worker estão idênticos à base. O transporte POST/iframe do catálogo também foi comparado integralmente com a base.
- O catálogo continua dependendo exclusivamente de `ctEventosPublicosListarPROD`, com `argsJson=[]`, sem sessão ou leitura administrativa. Elegibilidade pública/privada continua no contrato do servidor; não existe fallback com eventos hardcoded.
- Todos os destinos de links da home anterior foram comparados e preservados. Autenticação, checkout, preços, taxas, pagamentos e privacidade não foram redesenhados.
- Nenhum pedido, cobrança, ingresso, código de login ou check-in real foi criado. Nenhum merge, deploy, rollback ou escrita em produção foi feito. GitHub Pages foi consultado: publica `main:/`, não esta branch.

## Preview para revisão

```powershell
node tests/home-preview-server.cjs
```

Abra **http://127.0.0.1:4174/**. O preview escuta apenas loopback, mostra uma faixa de aviso e usa eventos/capas sintéticos rotulados. Não abra a home por um servidor estático genérico para esta revisão, pois o arquivo de produto mantém seu transporte oficial.

- `/?scenario=empty`: catálogo vazio.
- `/?scenario=error`: falha com tentativa explícita (o cenário mantém a falha).
- `/?scenario=missing`: capas ausentes.

O servidor adapta o transporte somente na resposta do preview. Aceita apenas o método de listagem simulado; rejeita qualquer outro POST e qualquer rota fora da home/assets autorizados. CSP bloqueia conexões e formulários externos. Analytics e PWA são desativados nessa superfície. Destinos de compra, contas e portais são bloqueados **apenas no preview**, com aviso; os hrefs oficiais do produto permanecem intactos.

## Validação

Comandos seguros desta etapa (não executar `npm run homologar` sem isolamento):

```powershell
npx playwright test --config=playwright.home.config.cjs
$env:CT_BASE_URL='http://127.0.0.1:4174'
$env:CT_EXPECTED_HOST='127.0.0.1'
$env:CT_BRANCH_MODE='1'
npx playwright test tests/e2e/public-event-catalog.spec.js --workers=2 --reporter=list --output=test-results/catalog-regression
node --test tests/evento-transport-runtime.cjs
```

| Verificação | Resultado |
| --- | --- |
| Nova suíte da home + proteção do preview | 20/20 aprovados em Chromium; zero flaky/skipped |
| Catálogo existente desktop/mobile | 20/20 aprovados, incluindo timeout e resposta atrasada |
| Recuperação do PR 163, evento e evento-v2 | 20/20 aprovados em Chromium com rede bloqueada |
| `contracts.mjs` | 41 superfícies aprovadas |
| `journey-contracts.mjs`, `full-surface-audit.mjs` | Aprovados; 67 páginas na varredura |
| Política comercial, campanhas, comissões, performance do portal, checkout gratuito | Aprovados |
| `eventos-privados-v1.mjs` | Aprovado; helper de leitura passou a normalizar CRLF→LF, como os demais contratos, evitando falso negativo no Windows |
| Sintaxe JavaScript + `git diff --check` | Aprovados; repositório não declara comando de lint |

A suíte nova cobre preferência inicial e mudanças do sistema, override persistente, valor inválido, leitura/escrita de storage bloqueadas, busca combinada sem nova RPC, teclado/skip link/Escape/foco após resize, 320/412/768/1440 px nos dois temas, campos/URLs, capa inteira, ausência de preços inventados, vazios/erro/retry, imagens ausentes/quebradas, dados ausentes, destinos antigos, transporte intacto, contraste e fallback sem JavaScript. A suíte existente acrescenta timeout, resposta atrasada, conteúdo inseguro, duplicados e lazy loading da terceira capa.

Zoom foi verificado como **reflow equivalente a 200%** (janela física de 1440 px, viewport CSS de 720 px, escala 2), mais `CSS zoom: 2`, sem overflow ou perda dos controles. **Zoom nativo manual e leitor de tela não foram exercitados.** Contraste dos tokens de texto/botão passou em 4,5:1 e foco em 3:1. Isso não substitui auditoria completa WCAG.

As falhas iniciais de fixture sem charset UTF-8 e da asserção de `<320px` para o cabeçalho anterior foram corrigidas. O novo limite mobile de 480px documenta o espaço necessário ao campo local rotulado e à ação de pesquisa, mantendo a capa na primeira tela; desktop conserva 320px.

Não executados: `homologar` global, E2E de produção/canários reais, fluxos de outros módulos, Safari/iPhone/Firefox reais, APIs de tradução/Libras. O falso negativo inicial do contrato privado por CRLF foi confirmado em arquivo de produto idêntico à base e corrigido somente na leitura do teste. Nenhuma asserção foi retirada e nenhuma política privada foi alterada.

## Capturas

Todas as capturas de revisão usam fixtures fictícias identificadas; não representam a agenda ou preços reais.

- [Preview com faixa de isolamento](screenshots/preview-local.png)
- [Desktop claro](screenshots/light-1440.png) · [Desktop escuro](screenshots/dark-1440.png)
- [320px claro](screenshots/light-320.png) · [320px escuro](screenshots/dark-320.png)
- [Reflow equivalente a 200%](screenshots/reflow-200-percent.png)
- [Erro com retry](screenshots/catalog-error.png) · [Informações/capas ausentes](screenshots/missing-data.png)

## Ponto de parada

Pronto para revisar esta fatia da home. Referência visual v11 ainda bloqueada; conferir fidelidade quando o arquivo estiver disponível. Tema é deliberadamente exclusivo da home, então páginas seguintes mantêm a apresentação atual. Não há carrossel, filtros complexos, unificação de autenticação ou novos serviços nesta entrega. Não integrar ou publicar sem a revisão solicitada.
