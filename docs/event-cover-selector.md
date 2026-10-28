# Seletor de capa aprovada — candidato isolado

Base do site: main `43760ce15f68c3fa996b8801964e473add414bcd`, incluindo PR229. Independente do PR230 visual. O histórico Git local é um snapshot, não ancestralidade remota para push.

## Escopo

- Biblioteca de assets autorizados no backend; seleção por nome e miniatura, sem URL ou ID manual.
- Primeiro asset: arte oficial de Herminho/TBT do Astro, JPG original 900×1600, 344423 bytes, SHA256 `a2f84c198ed5b283d51252671f9da5111721b1b0fc73d7538977822b4437d51f`.
- Original preservado byte a byte, inclusive seu texto “Ingressos disponíveis”. A aplicação da capa **não abre vendas**.
- Usa a hospedagem estática existente `assets/eventos/`. Sem uploader, infraestrutura, credenciais ou permissões Drive novas.
- Modal mostra arte integral (`object-fit: contain`), exige miniatura carregada e motivo, bloqueia clique duplo, descarta respostas antigas e mantém gravações incertas bloqueadas até reconciliação por leitura.
- Token permanece na ponte de sessão existente. ERA mantém seu fluxo específico sem alterações.

## Contrato

`ctEventoCapaBibliotecaListarSeguraPROD(token, eventId)` retorna catálogo restrito, nome do evento e versão visual. `ctEventoCapaBibliotecaSalvarSeguraPROD(token, {eventId, assetId, expectedVersion, motivo})` resolve a URL no servidor; nunca recebe URL arbitrária.

Backend candidato parte do corpo imutável de produção392 (244 arquivos), não main nem HEAD247. Exige sessão, vínculo exato usuário/produtor/evento e módulo EVENTOS, inclusive para administradores; não há bypass Master. Revalida sob lock, checa versão, confirma bytes/hash do asset público, persiste intenção de auditoria antes da alteração e verifica leitura após escrita. Somente `capaUrl` e `posterUrl` podem mudar; dados restantes são preservados. Invalidação/refresco de cache tem escopo do evento e mantém gates públicos existentes.

## Ordem de publicação — ainda não executada

1. Revisar código, testes sintéticos e browser isolado; reconciliar integração mínima com PR230.
2. Obter aprovação explícita para merge/deploy interno (fora da exceção de design público), apresentando site + delta backend392 e preservação HEAD247.
3. Publicar asset e frontend no pipeline existente; verificar hash estático. Publicar backend candidato com fluxo versionado autorizado, sem transplantar main backend.
4. Somente com arte/fluxo/escopo verificados, selecionar e confirmar a capa para o evento autorizado. Verificar o resultado sem publicar vendas nem alterar governança, preços ou horários.

Não executar testes contra produção. Não chamar RPC ERA, comprar, criar venda ou alterar registro real durante validação.

## Verificações locais

- `npm run test:contracts`: PASS — 41 superfícies + contratos de eventos privados.
- `node tests/event-cover-picker.runtime.cjs`: PASS — 8 cenários sintéticos, nenhuma rede.
- `node --check assets/event-cover-picker.js` e `git diff --check`: PASS.
- Browser: bloqueado no lançamento do Chromium (`socket() failed: Operation not permitted`), antes de qualquer página/assertion. Script isolado preparado para 390/1366 px; nenhuma screenshot gerada e nenhuma validação visual alegada. Não houve contorno/escalonamento.
- Testes backend e patches mínimos: entregues separadamente no pacote backend.

Nenhum merge, deploy, RPC de produção ou vínculo do evento real foi executado nesta implementação.
