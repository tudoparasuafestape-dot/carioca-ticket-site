# Convites de cortesia

O portal mantém a emissão manual e adiciona criação de convite para preenchimento. Tipo/lote individual, quantidade (1–20), validade até sete dias/dia do evento. O link pode ser copiado ou compartilhado voluntariamente no WhatsApp. A interface explica o risco de qualquer portador consumir vagas e separa reservadas, emitidas, disponíveis e entradas. Eventos privados preservam a autorização individual preexistente.

`/cortesia/convite/#TOKEN` recebe o bearer por fragmento, sem analytics, sem service worker e com referrer bloqueado. Cadastro de uma pessoa por vez; o backend real gera QR individual. Só recibos secretos daquele navegador recuperam ingressos anteriores. Nome e WhatsApp de terceiros não fazem parte do resumo público. Dados de tentativa pendente ficam em sessionStorage; recibos sem PII usam chaves append-only no localStorage, permitindo recarregar e usar múltiplas abas.

## Validação e limites

- `node tests/courtesy-invite.browser.cjs`: integração local das telas com os módulos reais do checkout irmão `../carioca-ticket` e planilhas em memória. `CT_INVITE_BACKEND` permite indicar o checkout backend. Rede externa é bloqueada por offline, proxy inválido e interceptação que nega tudo fora do contrato.
- `CT_INVITE_BACKEND_MODE=fixture node tests/courtesy-invite.browser.cjs`: testes de UI isolados usados no CI deste repositório privado, que não recebe novas credenciais para clonar o backend privado. Não representa integração real Apps Script.
- Cenários: criação sem emitir, cópia/WhatsApp voluntário, três vagas/três ingressos, perda de resposta, recarga, cadastro parcial, duas abas abertas antes da primeira emissão, recibos preservados, outro navegador sem dados anteriores, quantidade esgotada, lote futuro corrigível, revogação, expiração, privado, campos inválidos e link incompleto. Desktop 1365px, mobile 390px e 320px.
- Screenshots locais: `test-results/courtesy-invites/`; o workflow guarda os mesmos como artifact.
- Contratos existentes de superfícies e jornadas continuam cobrindo o restante do site. Scanner/ERA/páginas de eventos não foram editados.

Publicar somente após o backend correspondente confirmar deploy. Não criar convite/ingresso real para teste. Fluxo real em Sheets exige homologação não produtiva autorizada; não afirmar que teste em memória comprovou isso. Para publicação/reconciliação e estrutura da nova aba, seguir `docs/cortesia-convites.md` no backend. Tentativas incertas após encerramento permanecem reservadas até reconciliação administrativa, sem reemissão automática.
