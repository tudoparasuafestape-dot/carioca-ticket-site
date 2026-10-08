# ERA BEAUTY: diagnóstico e recuperação do carregamento

## Conclusão e limite

A causa inicial da falha no Instagram/iPhone do cliente **não foi demonstrada**.
O texto do vídeo identifica o failure handler do transporte (`CT_PUBLIC_RPC_TIMEOUT`
ou envelope `ok:false`), mas o frontend publicado descartava a distinção.
Os aproximadamente 87 segundos de espera não demonstram duas tentativas: existe
uma única chamada com timer de 45 segundos. Não há captura de rede/console do
iPhone que localize a perda entre envio, execução, resposta e `postMessage`.

O defeito de recuperação foi demonstrado no código real: após timeout, o pedido
pendente, iframe e form são removidos; uma resposta tardia é ignorada; eventos
`online`, `visibilitychange` e `pageshow` não fazem nova leitura; não existe botão
de retry. Isso deixa o cliente sem recuperação dentro da página.

Também foi reproduzido um comportamento posterior e separado: carregando o
analytics real, seu fallback pode executar `location.replace` para Apps Script
900 ms após o evento `load`, quando a mensagem de erro já está visível. O teste
intercepta e bloqueia essa navegação. Isso não prova que o redirecionamento
aconteceu no vídeo, nem explica a primeira falha.

## Evidência observada em 08/10/2026 (UTC)

- Bio `@neweradabeauty`, lida em aba separada no Chrome já autenticado: destino
  `https://cariocaticket.com.br/evento/?evento=EVT-23112026-ERA-BEAUTY-EAC4B673&utm_source=ig&utm_medium=social&utm_content=link_in_bio`.
  O wrapper `l.instagram.com` também contém um `fbclid` transitório, omitido aqui.
  A rota e o ID completos estão corretos.
- Site main: `acd6e4328cda9403e7f92c3de296ae52d1e3fe43`.
- Backend main: `02eefbed5b168c390291b91744e1bfbbde8c4f98`.
- [Deploy backend 37796694676](https://github.com/tudoparasuafestape-dot/carioca-ticket/actions/runs/37796694676):
  concluído com sucesso; log final confirma `versaoPROD=386`.
- Probe anônimo Chromium, viewport 390×844, sem perfil do usuário, às 20:05 UTC:
  ERA abriu em 9.674 ms; Roda abriu em 6.926 ms. Em ambos, POST para
  `script.google.com` retornou HTTP 200; duas navegações de iframe em
  `googleusercontent.com` retornaram HTTP 200; chegou `postMessage` de origem
  `googleusercontent.com`, `ok:true` e `resultado.sucesso:true`.
- HTML público de `/evento/` corresponde byte a byte ao main após normalizar
  quebras de linha. SHA256 servido:
  `44c1a0208202e35b7633eb32df48f6b3cd467a306924291ea0e3a217cd7f91cb`.
- ERA: cache miss, `duracaoBackendMs=1475`; Roda: cache hit, valor 1538.
  Esse campo começa depois do gate e pode vir do cache; não mede ponta a ponta.
- Probe equivalente WebKit 26.0 no Windows às 20:19 UTC: ERA abriu em 10.656 ms
  e Roda em 11.306 ms, ambos com HTTP 200 e envelope de sucesso, sem erro JS.
  Isso não reproduz o ambiente Instagram/iPhone e não demonstra que Safari resolve.
- Uma leitura final do ERA às 20:21 UTC mediu 7.155 ms do POST interceptado até
  o envelope aceito. O envio ocorreu em t=2.988 ms; HTTP 200 do POST em 6.209 ms;
  iframes responderam em 8.372/9.569 ms; `postMessage` chegou em 10.143 ms.
  O campo `duracaoBackendMs=1930` veio de cache. Esses intervalos não localizam
  individualmente custo de servidor, bootstrap ou rede, mas mostram por que o
  campo cacheado não substitui medição por pedido. Não houve mais probes depois.
- O probe permitiu somente o RPC `ctEventoPublicoCarregarPROD` com os IDs acima.
  Analytics, service worker e todos os outros POSTs foram bloqueados. Não houve
  criação de pedidos, pagamentos, ingressos, check-in ou RPC administrativo.

## Mitigação proposta

Somente `/evento/` e `/evento-v2/` ganham um botão **Tentar novamente** após erro
de transporte. O botão repete apenas a leitura do mesmo evento; cliques
simultâneos são bloqueados, e cada tentativa recebe um ID novo. Respostas antigas
continuam ignoradas. A URL e os parâmetros de contexto permanecem intactos.

O console local distingue timeout, envelope remoto de erro e falha síncrona de
envio, registrando somente `code`, `elapsedMs`, `online` e `visibility`. Não envia
telemetria nem imprime URL, argumentos, mensagem remota, token ou dado pessoal.
Eventos privados/inativos, erro de renderização e link sem ID preservam seus
tratamentos e não oferecem retry de transporte.

O analytics desativa o fallback de navegação quando a página já possui a
recuperação explícita. As duas páginas usam uma nova versão da URL do asset para
evitar reutilizar o script anterior em cache. O coletor e as demais páginas
mantêm seus fluxos existentes.

Timeout, endpoint, origem aceita, backend, checkout, pagamentos, dados comerciais
e publicação não foram alterados. Isto é uma mitigação da recuperação e uma
melhoria de diagnóstico; não é uma correção comprovada da causa inicial no iPhone.

## Validação

`tests/evento-transport-runtime.cjs` executa o HTML real, forms POST reais e
`postMessage` real de iframe para as respostas aceitas. Cada recurso é atendido
por fixture ou bloqueado, sem `route.continue`/`fallback`. Origem inválida,
resposta tardia e sinais de rede/ciclo de vida são injetados explicitamente;
timers usam o relógio do Playwright. Não há integração Apps Script nesses testes.

- Baseline Chromium: 18/18 caracterizações do código original.
- Mitigação: 20/20 em Chromium e 20/20 em WebKit 26.0 de testes no Windows.
- Cobertura: resposta a 44 s, timeout a 45 s, resposta tardia antes/depois do retry,
  erro `ok:false`, origem rejeitada, gate privado, cliques repetidos, troca de
  rede/sinais de foreground sem duplicação, navegação interrompida e retorno,
  timers atrasados, falha síncrona de envio e fallback do analytics.
- Harness anterior: 4/4 cenários de carregamento/render. Os pontos de observação
  acompanham a nova assinatura; a pausa inicial de relógio evita uma corrida do
  próprio harness (`Cannot fast-forward to the past`).
- Contratos de superfícies, jornada, eventos privados, política comercial,
  campanhas, comissões, desempenho do portal e checkout gratuito.
- Checkout: 73/73 cenários do harness DOM existente e runtime de política
  comercial passaram. Ambos executam código real com RPCs locais de teste;
  não acionam cobrança. Arquivos de checkout permanecem idênticos ao main.

WebKit no Windows com viewport móvel não é Safari/iOS nem o navegador interno do
Instagram. O modo `offline:true` desse runner falhou antes de interceptar uma
página vazia; WebKit usa proxy inacessível e interceptação de todas as requisições
para manter isolamento sem esse modo. Isso não é falha do site.

Execução após instalar as dependências do projeto e os browsers Playwright:

```sh
node --test tests/evento-transport-runtime.cjs
CT_TEST_BROWSER=webkit node --test tests/evento-transport-runtime.cjs
node --test tests/e2e/evento-v2-loading-harness.spec.js
```

## Pendências

Falta uma captura do caso falho no iPhone físico com tempo do POST, status/erro de
rede e presença/ausência do envelope. O teste solicitado ao cliente no Safari
ainda não tem resultado nesta investigação; não há promessa de que resolva.
Merge, deploy e rollback dependem de nova autorização. PRs site #160 e backend
#280 não fazem parte desta branch.
