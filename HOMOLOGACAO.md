# Homologação automática — execução segura candidata

Esta branch prepara isolamento de testes. Não altera configuração real de Actions nem ativa o workflow em main. [Mapa de cobertura e limites](docs/canary-safety-implementation.md).

## Comandos locais explícitos

Instale dependências com `npm install` e Chromium com `npx playwright install chromium`.

Os 38 cenários antes publicados, por viewport, agora exigem a configuração isolada:

```bash
npx playwright test --config=playwright.canary.config.cjs
```

Eles servem os arquivos do checkout por interceptação, usam fixtures e não dependem de servidor ou backend real. Os casos de fachadas selecionados no workflow exigem `CT_BRANCH_MODE=1`, `CT_BASE_URL=http://127.0.0.1:4173` e `CT_EXPECTED_HOST=127.0.0.1`:

```bash
CT_BRANCH_MODE=1 CT_BASE_URL=http://127.0.0.1:4173 CT_EXPECTED_HOST=127.0.0.1 npx playwright test tests/e2e/first-party-facades.spec.js --project=desktop-chromium
```

O workflow lista os 24 specs completos (208 cenários por viewport), preservados. Não executar indiscriminadamente todos os specs pelo config legado: existem suítes fora do escopo deste workflow, e seu fallback de URL ainda é produção. `npm run homologar` / `npm run test:e2e` não são os comandos aprovados deste recorte.

Controles de segurança independentes:

```bash
node tests/safety/public-request-policy.test.cjs
node tests/safety/published-static.test.cjs
node tests/safety/network-isolation.browser.cjs
node tests/safety/telemetry-isolated.browser.cjs
node tests/safety/pwa-isolated.cjs
```

O primeiro é a especificação inicial de política; a guarda efetivamente integrada está em `isolated-network.cjs`. O teste de smoke usa somente um servidor loopback. O PWA registra o service worker em perfil efêmero, com proxy restrito ao servidor local.

## Smoke publicado proposto

O comando abaixo lê 39 arquivos estáticos fixos por GET, não segue redirects, compara bytes/hashes e não executa scripts ou RPC:

```bash
node tests/safety/published-static.cjs --base-url https://cariocaticket.com.br
```

Ele está preparado no workflow para main/schedule/manual. Não foi executado contra o domínio ativo nesta tarefa. Não comprova login, cupons, disponibilidade ou integridade do Apps Script. Conteúdo desatualizado falha, inclusive durante atraso legítimo de publicação. O relatório parcial é mantido em falha.

## Revisão e evidências

Contratos locais e asserções de interface continuam obrigatórios. Jornadas com mutação usam apenas mocks/fixtures; eventos e retornos de cupons não são consultas reais. Os jobs mostram essa diferença no nome. Trace, vídeo e screenshot são mantidos em falha; decisões sanitizadas de rede são anexadas também em sucesso. Nenhum teste autoriza compra, estoque, financeiro ou login reais.

PR165 permanece aguardando o caminho seguro revisado. Merge, deploy, mudanças de agenda/ruleset e refatoração funcional dos leitores backend exigem autorização própria. A aprovação desta branch não atesta a versão implantada do backend.
