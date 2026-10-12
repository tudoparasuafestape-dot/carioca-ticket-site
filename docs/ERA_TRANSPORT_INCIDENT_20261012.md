# ERA: leitura disponível, falha do cliente ainda sem causa comprovada

Base do site: `059b8554b14c7b26c0447b2cf3ce51e7b66f10f3`.
Backend informado e inspecionado: `43cddbb8fb07ad7bbb89b1da39e102f0dc28e726`.
Esta alteração melhora o diagnóstico; não declara o incidente resolvido.

## Evidência real, com escopo limitado

- Em 12/10/2026 às 00:00:01 UTC, GET de
  `/evento/?evento=EVT-23112026-ERA-BEAUTY-EAC4B673` respondeu HTTP 200 em 1476 ms.
  HTML igual à base, normalizando quebras de linha e newline final;
  Last-Modified `11 Oct 2026 22:04:57 GMT`; Cache-Control `max-age=600`.
- Às 00:01:09 UTC, uma única chamada pública de leitura
  `ctEventoPublicoCarregarPROD` respondeu HTTP 200 em 3785 ms. O envelope
  codificado no HTML retornou `ok:true`, `resultado.sucesso:true`, ERA em
  23/11/2026, lote Individual R$87 e Casadinha R$120, ambos até 29/10 às 23:59.
  Isso não mede estoque transacional nem valida checkout ou compra.
- O resultado estava em cache (`cacheHit:true`, atualizado em
  `2026-10-11T23:57:57.714Z`). `duracaoBackendMs:2216` é valor do resultado
  cacheado e não o tempo desta chamada.
- O Chrome conectado criou uma aba, mas a inspeção retornou
  `Debugger unattached`. Não houve captura visual válida nem contorno de acesso.
- O screenshot relatado mostra a mensagem do failure handler de transporte,
  que reúne timeout, erro remoto e falha de envio. Não demonstra esgotamento.
- PR295 compara exatamente o ID do samba no guard de novos pedidos; não
  altera catálogo/lotes/gate. O catálogo público não usa a seleção administrativa
  `EventoAtivo`. Não houve alteração comercial nesta investigação.

## Caracterização sintética

A suíte executa os HTMLs reais de `/evento/` e `/evento-v2/`, com formulários
POST reais e respostas locais. Todas as requisições são satisfeitas por
fixtures ou abortadas; service workers e WebSockets são bloqueados. O proxy
é inacessível; Chromium também usa contexto offline. Não há chamada de produção.

A ampliação de 20 para 34 cenários passou em Chromium antes desta alteração
de interface, caracterizando o comportamento publicado:

- Ponte aninhada `script.google.com` → `googleusercontent.com`, com
  `postMessage` real, funciona em apex e www.
- HTTP 200 dos iframes sem entrega do envelope termina em timeout de 45 s.
- Um `targetOrigin` diferente da página não entrega a mensagem e causa timeout.
- Colocar a página pública dentro de um iframe cujo topo é de outro domínio
  reproduz o timeout: o emissor da fixture replica `window.top.postMessage`
  com os alvos apex/www observados na resposta pública. É uma limitação de
  incorporação, não prova de que o Instagram usa essa estrutura.
- Um user-agent móvel sintético contendo Instagram, sozinho, não impede a
  resposta. Não simula cookies de terceiros, ITP, rede, suspensão, iOS nem o app.
- A resposta a 44 s funciona; a tardia é ignorada; retry gera ID novo, mantém
  contexto e não duplica chamadas. Origem e ID desconhecidos são ignorados.

Não se demonstrou a causa do caso do produtor. Faltam ambiente/URL exatos,
referência da falha e captura do POST, iframes e presença/origem do postMessage
durante uma ocorrência real. A comparação no navegador externo ajuda a separar
ambientes, mas não prova causa nem garante recuperação.

## Melhoria mínima proposta

A tela de falha de transporte passa a mostrar uma referência fixa para suporte:

| Referência | Classe já identificada pelo código |
| --- | --- |
| E01 | `CT_PUBLIC_RPC_TIMEOUT` |
| E02 | `CT_PUBLIC_RPC_REMOTE_ERROR` |
| E03 | `CT_PUBLIC_RPC_SUBMIT_ERROR` |
| E00 | Falha de transporte não classificada |

Uma captura móvel poderá distinguir essas classes sem acesso ao console. E01
ainda não identifica em qual trecho a resposta se perdeu. O texto explicativo
é traduzido; o código é estável. Nenhum ID de requisição, URL, argumento,
mensagem remota, token ou dado pessoal é exibido. Não existe telemetria nova.
A referência é limpa no retry e não aparece em rejeição comercial/de acesso.

Timeout, origens aceitas, endpoint, retries e mensagens existentes permanecem
iguais. Não foi adicionado retry automático, fallback para compra, mudança de
cookies/permissões ou alteração em dados/backend. A versão do asset de tradução
foi atualizada nas duas páginas para evitar texto antigo em cache.

## Validação e publicação

Validação local concluída em 12/10/2026:

- `node --test tests/evento-transport-runtime.cjs`: **36/36 Chromium**.
- Mesma suíte com `CT_TEST_BROWSER=webkit`: **36/36 WebKit 26.0 no Windows**.
- `node --test tests/e2e/evento-v2-loading-harness.spec.js`: **4/4**.
- `node --check` dos scripts alterados e `git diff --check`: passaram.
- Captura sintética móvel da referência E01 inspecionada, sem corte ou sobreposição.

A suíte inclui os cenários anteriores e novos testes da referência, tradução,
limpeza no retry e ausência de mensagem remota/dados privados. O harness antigo
precisou atualizar suas âncoras textuais de `render` (já desatualizada na base)
e `showError` (assinatura ampliada nesta branch); sua primeira execução falhou
nessas âncoras, sem atingir o produto. A execução após os ajustes passou 4/4.
Não foram substituídas regras do produto por mocks para conseguir esses passes.
O workflow de transporte executa Chromium/WebKit e inclui o harness em Chromium.
WebKit no Windows não é Safari/iOS nem o Instagram físico.

Esta branch é para revisão. Merge, main, deploy e rollback dependem de aprovação
específica posterior. A correção da causa real continua pendente.
