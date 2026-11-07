# Check-in: tela de espera da validação

## Escopo local

Base: `dde027425c03c6e1c42a797e6613842048e0a038`, confirmada como `main` no remoto.

- Tela inteira com “Aguardando validação”, a logomarca existente em
  `/assets/carioca-ticket-logo.png` e o nome `eventoNome` enviado pela Central Mobile.
- Nome do evento exibido com `textContent`. Se não vier nome, mostra o ID do contexto;
  o rótulo nunca altera o evento autorizado na requisição.
- A espera aparece tanto na consulta inicial quanto após a confirmação explícita.
  Some antes da confirmação, do resultado ou do erro. A ação Cancelar existente continua acessível.
- Região `role="status"`, `aria-live="polite"`, sem atualização a cada frame da câmera.
  Fundo não interativo durante espera, sem deslocar a página; movimento reduzido respeitado.
- Retirada de referências técnicas a planilha/Apps Script nas mensagens locais da validação.

Não foram alterados credencial, parâmetros/quantidade de requisições, confirmação,
timeout, debounce, proteção de confirmação sem resposta, sons/vibração ou liberação.
Não há validação de ingresso real, escrita de evento, publicação, merge ou deploy neste trabalho.

## Verificação

Executado localmente:

- `node --check checkin/checkin.js`
- `node --check tests/scanner-feedback.browser.cjs`
- `node tests/scanner-session.runtime.cjs checkin/checkin.js`: 42 cenários passaram.
  Inclui espera lenta, repetição de frames, cancelamento, sucesso, já utilizado,
  timeout, confirmação incerta, nova leitura e contexto de evento malicioso/ausente.
- `npm run test:contracts`: 41 superfícies protegidas e contratos de eventos privados passaram.
- `node --test social-preview-build/reader-publication.test.mjs`: 146 testes passaram.
- `git diff --check`

Preparado, mas **não executado até o fim** neste ambiente:

- `node tests/scanner-feedback.browser.cjs`: HTML/CSS reais, câmera e API sintéticas,
  todas as respostas interceptadas, contexto offline e rede bloqueada.
- Cobertura de 320×568, 390×667, 568×320, 844×390 e 1366×768. Verifica geometria da tela,
  logo, nome, ausência de rolagem, cancelamento, resultado, erro e movimento reduzido.
- O Chromium encerra antes de abrir uma página: `socket() failed: Operation not permitted`.
  Portanto não há screenshots renderizados nem aprovação visual local.
  Anúncios em leitor de tela real também não foram validados.
- O workflow de regressão existente foi estendido para executar esse teste e guardar
  `test-results/scanner-waiting-*.png` e `scanner-feedback-browser.json` como evidência.
  Ele ainda não foi enviado nem executado no CI por esta tarefa.

## Limite para publicação

O guard `ct-reader-only-publication.yml` atual aprova bytes específicos de uma mudança
anterior somente em JavaScript e arquivos de suporte fixos. Ele **não autoriza** esta
mudança de CSS/JS/testes. Não foi ampliado ou acionado. Publicação desta UI exige revisão
própria dos arquivos/bytes e a autorização aplicável; não reutilizar a aprovação anterior.
