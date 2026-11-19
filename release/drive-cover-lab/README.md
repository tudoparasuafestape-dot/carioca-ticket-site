# Proposta de revisão, não instalada e não autorizada para execução

Escopo futuro: adicionar somente `review/drive-cover-lab/index.html` ao arquivo Pages ativo preservado. Nenhum upload de imagem, vínculo de evento, banco, backend, permissão Drive ou migração. Os 642 membros existentes conservam conteúdo e metadados. Não publica o checkout inteiro de main.

## Evidência e hashes
Leitura via conector GitHub em 16/11/2026 ~11:03 UTC confirmou último deployment `7765206641`, status `22120762618` success, SHA `b47e80028d4a2eed4b9c69a6a85a4493b3ce605e`, run `43425385424`, URL `https://cariocaticket.com.br/`. Isto não prova bytes no CDN nem dispensa rechecagem imediatamente antes da escrita.

Baseline artifact `14037465102`: ZIP `07c90dc72a12df7013239d69eb9141fb2acc3860c1d4a5973183edfe8725f66f`; TAR `d42bc4c6e8c45e36960f959a11fb461129932f0f39dee67fec0cd2c2ba5178e5`.
Candidato TAR `034cedd995e314932351b803499810df89f12a387eed99453e6fa01bd2cb4c8a`; HTML `d9eca449faa9c0f4c8d3086b73fcb1befdb6d4121c9b99644f4386c23347eebd`.

## Instalação proposta, ainda NÃO feita
Após revisão e autorização específica para integração, copiar artifact_guard.py, release_guard.py, test_release_guard.py, test_rollback_download.py e index.html para `release/drive-cover-lab/`; instalar `workflow.yml.proposed` como `.github/workflows/ct-drive-cover-lab-publication.yml`. Reavaliar diff, testes, checks e todos os gatilhos de main antes do merge. O workflow só tem workflow_dispatch. Instalação não autoriza publicação.

Antes da execução, obter aprovação específica do proprietário para o SHA final revisado, baseline deployment e publicação do HTML indicado. Entradas do workflow não substituem essa aprovação. Usar mode=publish, expected_current_deployment=7765206641, expected_guard_sha=SHA final e confirmation=PUBLISH_DRIVE_COVER_LAB_HTML_ONLY. Se baseline, HTML, escopo ou SHA mudar, parar e rever a autorização.

## Gates e limites
- Só main, repo exato, runner hospedado, SHA exato, run_attempt=1. Reexecução cega bloqueada.
- Actions oficiais fixadas por SHA. Checkout não persiste credencial.
- GET autenticado apenas api.github.com; download redirecionado permitido apenas para hosts storage HTTPS previstos, nova requisição sem Authorization e sem seguir outros redirects. Formato desconhecido falha fechado.
- Retenção de rollback+seal antes do upload Pages, 30 dias. Expiração/ausência bloqueia rollback; não há garantia de disponibilidade indefinida.
- Baseline e main novamente lidos antes de uploads e imediatamente antes do deploy. Deployments concorrentes/desconhecidos inclusive falhos bloqueiam. Somente o próprio deployment pendente identificado por SHA+run pode ser ignorado.
- Grupo `ct-pages-production` compartilhado pelos sete workflows com deploy-pages encontrados no snapshot main `9b254f18f364ea683c648cd4be469b98035fcb1a`. Rechecar antes da integração. A API Pages não fornece CAS atômico aqui; editor/publisher externo que não respeite o grupo ainda gera risco entre recheck e deploy. Exigir janela coordenada sem outras publicações. Não alegar isolamento absoluto.
- Regras de environment/proteção/permissões podem impedir execução; não contornar.
- Preflight HTTP lê somente quatro arquivos estáticos críticos e ausência da nova rota. Nenhuma compra/check-in/escrita. Pós-deploy exige deployment do próprio run SUCCESS, bytes do HTML e os quatro arquivos preservados. Mudança de CDN ou atraso falha fechado; não repetir deploy para corrigir atraso. Investigar e repetir somente verificações GET de forma controlada.
- Pós-deploy não comprova todos os arquivos servidos, transações, renderização browser, disponibilidade permanente do Drive nem OG. Integridade de todos os membros é validada no TAR. Homologação real de imagem e crawler continua etapa manual posterior; eventual falha pode mostrar que Drive não atende ao requisito.

## Rollback separado, jamais automático
Se falhar ou ficar incerto, primeiro inspecionar status e artefato realmente publicado. Obter nova aprovação específica para remover a rota e repor o TAR baseline, identificando o deployment candidato atual. mode=rollback, expected_current_deployment=ID exato desse candidato, expected_guard_sha=SHA revisado atual, confirmation=ROLLBACK_DRIVE_COVER_LAB_HTML_ONLY. Guard exige que candidato atual tenha vindo deste workflow com TAR exato, e recupera rollback do run correspondente. Não desfaz outros deployments e não aceita baseline ultrapassado. Verifica os quatro arquivos e 404 da rota depois.

## Testes realizados localmente
29 testes unittest (incluem dez mutações negativas de identidade), sem rede; preparação real a partir do ZIP preservado confirmou hash candidato e 642 membros intactos. Proposta destinada a branch/PR draft; não houve dispatch, merge ou deploy. Incluídos mocks de redirecionamento sem token, rejeição de host estranho, deployment próprio pendente e rejeição de rollback alheio. Adicionada cobertura de prepare/recheck completo de rollback com bytes sintéticos e digest pins restritos ao teste, expiração, corrupção, cancelamento, tampering, repetição, limites de download e contrato textual do workflow. Revisão independente local concluída sem novo bloqueio de código; reavaliar qualquer alteração posterior. Testes não executam a API Pages nem provam funcionamento de permissões, proteção de environment, armazenamento remoto ou CDN em produção.

## Escopo desta proposta
O arquivo workflow.yml.proposed permanece fora de .github/workflows e não pode publicar. O único workflow instalado nesta proposta é CI de testes offline, contents:read, sem secrets, uploads, dispatch ou deploy. Abrir a PR também pode acionar os checks gerais já existentes de homologação e Scanner. Instalar o publicador requer nova alteração revisada e aprovação específica; merge desta proposta não está autorizado.
