# Proposta separada: fronteira de segurança dos canários

Estado: diagnóstico histórico e plano de referência. A integração de testes/workflow foi preparada posteriormente nesta mesma branch, sem ativação em main ou implantação; ver [implementação e limites](canary-safety-implementation.md). Base do site: `bb9f00564d11389aba069604f9fffe56f7f98de4`. O PR165 permanece em `b7b4b12c50161c28b64dfafb4b6a025b2858f502`, sem mudanças novas. Os arquivos JS do backend foram inspecionados na main `02eefbed5b168c390291b91744e1bfbbde8c4f98`; isso não atesta qual versão Apps Script estava implantada durante o run histórico.

## O que o run pós-home164 executou

[Run 37866816267](https://github.com/tudoparasuafestape-dot/carioca-ticket-site/actions/runs/37866816267), evento `push`, head `bb9f005`, de 2026-10-09 00:50:40 a 00:55:59 UTC. Nove jobs concluíram com sucesso:

| Job | Desktop | Mobile | Destino/comando |
| --- | --- | --- | --- |
| Contratos | Uma execução, nove scripts | — | Contratos locais do repositório |
| Facadas first-party branch | 208 testes | 208 testes | `127.0.0.1:4173`, `CT_BRANCH_MODE=1`, 24 specs explícitos do workflow |
| Publico homologado | 7 testes | 7 testes | Domínio oficial, `public-journey.spec.js` e `partner-public-production.spec.js` |
| Operacional publicado | 23 testes | 23 testes | Domínio oficial, `operational-entry.spec.js`, páginas sem sessão |
| Canario real first-party | 8 testes | 8 testes | Domínio oficial, `canary-real.spec.js`, `CT_BRANCH_MODE=0` |

Os oito canários cobriram os dois portais, evento v2/compartilhamento, cupom inexistente, link de campanha/cupom, checkout v2, evento legado e checkout legado. Os dois logs registraram `CT_CANARIO_CAMPANHA_RESULTADO=Este cupom expirou.` — desktop 00:52:04 e mobile 00:52:38 UTC. O teste de cupom inexistente passou, incluindo sua asserção de mensagem. Nenhum desses testes preenche comprador ou clica pagar.

O job público fez Home → Evento → Checkout → Evento, navegação para produtor/parceiro e Minha Carioca, além dos testes de configuração do programa de parceiros, login visível, admin sem sessão e token de ativação inválido. Os 23 testes operacionais abriram as rotas listadas em `operational-entry.spec.js:21`; isso não significa 23 operações autenticadas.

O teste PWA de `public-journey.spec.js` registra um service worker no perfil efêmero do navegador. É um efeito local, que precisa ser considerado no isolamento de rede, distinto de gravação de dados de negócio.

Os passos de espera de publicação verificam marcadores textuais, não o SHA do HTML nem a versão do backend. O SHA do run prova o código de teste executado; não prova sozinho a revisão exata de cada resposta do site ativo.

## O que a evidência permite afirmar

| Observação | Grau de evidência |
| --- | --- |
| 8 canários por viewport rodaram no domínio oficial | Confirmado pelos comandos, env e resultados dos logs |
| A campanha mostrou “Este cupom expirou.” | Confirmado por stdout nos dois jobs |
| A validação do cupom e o catálogo têm caminhos de garantia de schema | Confirmado no código auditado; reproduções offline anteriores |
| A configuração pública de parceiro tem caminhos de bootstrap e seeding | Confirmado no código auditado; prova offline de orquestração nesta fatia |
| Analytics pode gravar acessos após a navegação, mesmo com `src=CANARIO` | Confirmado no código e na VM; não observado como gravação real nos logs do run |
| Abas foram efetivamente criadas, configurações semeadas ou métricas gravadas naquele run | **Não comprovado** |
| Houve pedido, cobrança, reserva ou prejuízo financeiro | **Não há evidência disso**; os testes inspecionados não acionam pagamento |

Foram recuperados os logs completos e o inventário de artefatos pelo GitHub, somente leitura. Há apenas dois artefatos, `catalogo-publico-desktop` e `catalogo-publico-mobile`, produzidos pelo job local. Não há HAR/trace/vídeo dos canários: o workflow os guarda somente em falha e os jobs passaram. O stdout não contém resultados de `appendRow`, `insertSheet`, diffs de planilha ou IDs correlacionáveis de execução Apps Script. Não havia ferramenta de Cloud Logging/Apps Script nem CLI `gcloud`/`clasp` disponível nesta execução. Não houve tentativa de ler credenciais ou chamar RPC para obter logs.

Uma apuração adicional de efeitos reais exigiria logs existentes do backend/Cloud Logging ou auditoria preexistente, para a janela 00:50–00:56 UTC. Ausência de log de escrita também não comprova ausência de escrita. Não se deve reexecutar os RPCs nem acionar funções que garantem bases para investigar o passado.

## Fronteiras propostas

1. **Smoke estático e consultas públicas auditadas:** GET/HEAD de caminhos estáticos explícitos; RPCs permitidos por nome, envelope e argumentos auditados, com versão do backend atestada antes de uso. Candidatos iniciais: catálogo da home `ctEventosPublicosListarPROD`, capacidades/configuração pública e `ctCentralAcessoBootstrapPROD` (nome “Bootstrap” aqui agrega configuração; não instala schema no caminho sem sessão inspecionado). A permissão inicial do protótipo é vazia. Nome de função ou sucesso HTTP não comprova pureza.
2. **Consultas com bootstrap:** cupom, detalhes de evento/checkout e programa/ativação de parceiro ficam fora da permissão de smoke genuíno enquanto puderem instalar/alterar bases. Os cenários de sucesso, erro, base ausente, schema parcial, cupom expirado e limites precisam continuar cobertos em backend isolado ou VM, e as jornadas E2E existentes devem ser preservadas. Requisição não aprovada deve falhar o teste antes do envio; nunca ser substituída por uma resposta de sucesso falsa.
3. **Telemetria:** validar envio, formato, origem, evento e ausência de PII em um coletor local explícito do teste. O coletor não encaminha requisições ao backend real. O backend de analytics deve continuar testado separadamente quanto a append, deduplicação e base ausente. Isso é uma separação declarada de destinos, não um silêncio sobre falhas. Operação normal dos visitantes e analytics do produto permanecem iguais.
4. **Cache e rate limit:** registrar separadamente os efeitos transitórios de `CacheService`; não chamar automaticamente essas funções de “zero escrita”. Não remover rate limit do produto nem criar bypass público de segurança para o canário. Enquanto a política não autorizar expressamente esse efeito, a validação de cupom permanece na suíte isolada. A cobertura de integração publicada desses métodos só poderá voltar após essa fronteira e a implantação real terem sido verificadas.

### Caminhos concretos que exigem correção/revisão

- `CTCuponsCampanhasPROD.js:784 → :639/:640 → :80/:91`: validação pública garante cinco abas (`CT_CAMPANHAS_PROMO*`), expande colunas e configura cabeçalhos. O rate limit em `:569` atualiza cache. A reserva é outra função, `ctCuponsCheckoutPrepararComLockPROD_`, não chamada pelas ações dos canários auditados.
- `CTEventoPublicoExperienciaPROD.js:108` e `CTCheckoutPublicoCatalogoPROD.js:39`: em caminhos sem cache, usam os getters mutantes `obterAbaEventos`, `obterAbaTiposIngresso`, `obterAbaLotesIngresso` de `EventosConfig.js:59`, `TiposIngresso.js:89`, `LotesIngresso.js:97`. A home já tem um leitor específico que não instala a aba (`ctEventosPublicosEventoLer_`); preservá-lo.
- **Achado adicional dos jobs públicos:** `CTParceiroOnboardingPROD.js:468/:469` e `:1376/:1377` chamam `ctParceiroOnboardingGarantirBasePROD_`. Se `BasePronta_` for falsa, `:363–386` garante sete abas, chama `SemearConfig_` e `SemearMateriais_`, e `flush`. `SemearConfig_` pode inserir seis padrões ou corrigir valores inválidos; `SemearMateriais_` pode inserir materiais ausentes. Com base pronta, esse bootstrap retorna sem esses efeitos. A consulta de ativação também pode marcar `STATUS=EXPIRADO` para um token existente expirado (`:1382`). Não há prova de que esses efeitos ocorreram no token do teste histórico.
- `assets/ct-analytics.js` agenda `ctAnalyticsMasterRegistrarLotePublicoPROD`; `CTAnalyticsMasterPROD.js:330/:346` pode atualizar cache e acrescentar linha em base válida. A guarda CANARIO do tráfego de campanha não cobre esse script.

## Ordem de execução e arquivos para revisão

**A. Protótipo inicial, antes da integração descrita no documento de implementação**

- `tests/safety/public-request-policy.cjs`: protótipo de classificação e bloqueio anterior ao transporte; lista inicial de RPCs permitidos vazia, caminhos estáticos explícitos, validação de envelope e coletor local opcional para telemetria.
- `tests/safety/public-request-policy.test.cjs`: testes offline de bloqueio de bootstrap/pagamento/métodos desconhecidos, argumentos, origem, envelope ambíguo e garantia de que captura/bloqueio não chamam o transporte.
- Este documento: diagnóstico, limitações e plano.

Executar apenas os novos testes: `node tests/safety/public-request-policy.test.cjs`. Não importa este protótipo nas suítes existentes ainda. Ele não é uma barreira de navegador pronta: faltam integração de todas as requisições, redirecionamentos, workers, popups, transportes e evidência de versão implantada. Os candidatos de leitura continuam negados por padrão.

**B. Backend, em PR próprio, antes de reclassificar consultas como seguras**

Arquivos previstos: `CTCuponsCampanhasPROD.js`, `CTCheckoutPublicoCatalogoPROD.js`, `CTEventoPublicoExperienciaPROD.js`, `CTParceiroOnboardingPROD.js` e testes em `tests/` específicos para ausência/validade de schema e proibição de mutações. Adicionar leitores internos sem criação; manter os getters/instaladores usados por ações administrativas de escrita. Separar atualização de expiração da consulta, com testes dos contratos de ativação e dos fluxos administrativos. Preservar gates, permissões, cálculo comercial, rate limit e retorno normal em bases válidas. Base ausente/parcial deve gerar erro explícito sem instalar ou corrigir dados. Não implementar fallback que torne evento privado público.

Testes devem interceptar e reprovar `insertSheet`, `insertColumnsAfter`, `setValue(s)`, `appendRow`, gravação de propriedades e `flush` nos caminhos de leitura; testar também que os caminhos administrativos autorizados ainda instalam/migram quando solicitados. Cache deve ser medido à parte. Nenhuma publicação automática desse backend está autorizada nesta fatia.

**C. Integração de testes e workflow — somente após revisão desta proposta**

Arquivos previstos no site: novo adaptador em `tests/e2e/helpers/` e novos testes de isolamento; `tests/e2e/canary-real.spec.js`, `tests/e2e/public-journey.spec.js`, `tests/e2e/partner-public-production.spec.js`, `tests/e2e/operational-entry.spec.js`, `playwright.config.js`, `HOMOLOGACAO.md` e `.github/workflows/homologacao-automatica.yml`.

O adaptador deve ter negação por padrão, falha explícita em negócio não aprovado, registro sanitizado dos métodos/decisões e captura local de telemetria sem encaminhamento. Cobrir chamadas via iframe/form, fetch/beacon, redirecionamentos, novos frames e popups. Service workers devem ser contidos; manter cobertura PWA em perfil isolado próprio com rede controlada, em vez de remover sua asserção atual. Não modificar scripts do produto para reconhecer robôs ou desativar analytics.

Manter nomes/requisitos de checks, viewports e todas as asserções existentes; não introduzir `test.skip`, `continue-on-error`, filtros que eliminem casos nem stubs de sucesso para consultas reais. Mapear cada asserção para smoke publicado ou ambiente isolado completo, e revisar a equivalência de cobertura. A redução de testes integrados no domínio oficial não pode ser apresentada como equivalente sem backend isolado e prova de versão. Até essa infraestrutura existir, o workflow atual não está pronto para execução segura desses caminhos.

Salvar relatório de rede sanitizado em sucesso e falha (sem tokens, PII ou corpos completos de requisição), com versão de teste/backend e identificação de fixtures. O coletor de telemetria deve atestar tentativas/formatos e que houve zero encaminhamento. Falta de ambiente isolado deve bloquear o estágio correspondente, não produzir verde artificial.

O workflow atual também agenda os jobs públicos/operacionais, que incluem o caminho de parceiro. Parar a publicação do PR165 não altera esse agendamento. O código candidato de workflow foi posteriormente alterado nesta branch; configuração real de Actions, agendamento ativo e main não foram alterados.

## Critério para liberar a fronteira

Leitores e suas dependências sem instalação de base; efeitos transitórios explicitamente classificados; telemetria capturada e testada sem gravação real; versão do backend comprovada; cobertura preservada nos dois viewports; evidências sanitizadas inclusive em sucesso; revisão explícita do diff do workflow. Até lá, PR165 continua pronto tecnicamente e aguardando, sem merge/deploy.
