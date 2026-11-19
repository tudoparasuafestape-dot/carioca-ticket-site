# Ponte temporária Fábrica: proposta LOCAL, não instalada ou executada

Finalidade: liberar a imagem correta da Fábrica sem esperar a solução geral Drive/registro/relay. Esta ponte NÃO substitui a solução permanente e NÃO autoriza sua execução. Esta etapa propõe somente arquivos de revisão em branch/PR draft, sem PNG, merge, dispatch, mudança de configuração ou deploy.

## Escopo exato
Adicionar somente `assets/eventos/fabrica-de-samba-20261129-7089258579f37d13.png` ao TAR do Pages identificado, preservando conteúdo e metadados dos 642 membros existentes. Não publica o checkout inteiro nem modifica HTML, catálogo, evento, valores, capacidade, checkout, backend, banco ou Drive. PR262 contém outra imagem e não é fonte permitida.

Imagem verificada localmente:
- PNG original 1672×941, 2.060.262 bytes.
- SHA256 `7089258579f37d13baaf82d909a65cee5ed361459656590446a9c40bc3cdde2f`.
- Git blob SHA1 calculado `077f8b5fd8420b3da8d34c66a194223279b411d3`.
- O hash fixo identifica os mesmos bytes já examinados/decodificados; não é nova imagem ou sanitização de metadata.

Baseline observado anteriormente, NÃO reconsultado nesta tarefa local:
- Deployment `7765206641`, run `43425385424`, SHA `b47e80028d4a2eed4b9c69a6a85a4493b3ce605e`.
- Artifact `14037465102`.
- ZIP SHA256 `07c90dc72a12df7013239d69eb9141fb2acc3860c1d4a5973183edfe8725f66f`.
- TAR SHA256 `d42bc4c6e8c45e36960f959a11fb461129932f0f39dee67fec0cd2c2ba5178e5`.
- Candidato exato TAR SHA256 `4f7e2e783ba37aea8caf57e4e6e7c8f711e752a78d4222b6d37b7672adc0f97d`.

## Pré-requisito concreto ausente: fonte PNG no checkout aprovado
O arquivo `approved-fabrica.png` foi intencionalmente NÃO incluído neste pacote. A operação anterior de criação de blob não foi repetida. Antes de qualquer nova tentativa, o coordenador deve estabelecer o encerramento formal da solicitação anterior e consultar se o blob acima já existe e se existe referência/revisão autorizada. Um 404 não prova que a aprovação terminou; não repetir uma criação incerta.

Para tornar o workflow utilizável, é preciso obter autorização e completar a inclusão dos bytes corretos em `release/fabrica-image/approved-fabrica.png` no repositório `tudoparasuafestape-dot/carioca-ticket-site`. Verificar por leitura que tamanho, SHA256 e conteúdo do commit correspondem. Arquivo presente não substitui autorização para publicar. Guard aceita somente arquivo regular, sem symlink, tamanho exato e SHA256 fixo; ausência, substituição ou erro falham antes de qualquer upload/deploy. Não há URL arbitrária, token copiado, Drive fallback, base64 inventado ou artefato presumido.

## Instalação futura, ainda não autorizada
Após revisão independente e confirmação do diff completo, propor:
1. Os scripts/testes/docs em `release/fabrica-image/`, com a fonte PNG verificada.
2. Instalar `workflow.yml.proposed` como `.github/workflows/ct-fabrica-image-only-publication.yml`.
3. Rechecar todos os gatilhos de main, environment e permissões. Pedir aprovação específica para integração; não extrapolar autorizações antigas de outras PRs.

O arquivo `.proposed` por si só é inerte. O workflow futuro é apenas manual, main/repo/SHA exatos, runner hospedado e tentativa1. Não há schedule, push trigger ou rollback automático.

## Publicação futura, autorização separada
Revalidar Pages ativo e HEAD/main antes de propor a ação. Se o deployment/base tiver mudado, parar e reconstruir/revisar candidato; não adaptar silenciosamente pins. Para uma execução especificamente aprovada:
- mode `publish`;
- expected_guard_sha = SHA final revisado e integrado, nunca um placeholder;
- expected_current_deployment `7765206641`, somente se ainda confirmado ativo;
- confirmation `PUBLISH_FABRICA_PNG_ONLY`.

Entradas do workflow são guardas, NÃO aprovação do proprietário. O coordenador deve ter a autorização específica antes do dispatch.

O guard confirma API Pages build_type workflow, identidade exata do baseline/run, lista de deployments, ausência de publisher novo/desconhecido, main imutável e hashes do artefato. Downloads autenticados usam somente api.github.com; redirect de storage permitido não recebe Authorization e não segue novo redirect. Ele constrói o TAR incremental e preserva baseline+seal por 30 dias ANTES de upload Pages. Rechecks acontecem antes de upload e imediatamente antes de deploy. Um outcome incerto ou cancelado exige inspeção, jamais rerun cego.

Preflight: GET somente dos quatro arquivos estáticos críticos (`index.html`, `checkout/index.html`, `evento/index.html`, `assets/event-cover-picker.js`) contra bytes do TAR e 404 do PNG novo. Pós-deploy: deployment do próprio run SUCCESS, PNG HTTP200/image/png/tamanho/hash exatos e os quatro arquivos antigos íntegros. Não chama RPC, compra ou check-in. Integridade dos642membros é provada no TAR, não por varrer todos os URLs/CDNs. Propagação CDN pode falhar temporariamente; repetir somente leituras controladas, não deploy.

## Coordenação com backend/evento
Pages tornar o PNG acessível NÃO vincula a capa ao evento. A atualização cirúrgica do catálogo backend e a seleção/estado visual do evento são etapas independentes, com suas próprias provas e autorizações. Só relatar Fábrica corrigida após leitura pública confirmar capa certa e estado relevante. A saída registra `backendNotModified:true` e `salesNotAssessed:true`, apenas para declarar o escopo desta operação. Não afirma estado de vínculo atual nem prontidão comercial.

## Rollback separado e condicionado
Nunca automático. Inspecionar o deployment real, candidato e estado do backend/evento; obter aprovação explícita para repor o TAR baseline e remover a imagem. Se a imagem já foi vinculada, a ordem é: (1) restaurar o estado visual anterior por operação autenticada e CAS separadamente aprovada, com readback; (2) restaurar o backend pela sua operação de rollback aprovada; (3) verificar novamente as referências atuais do evento e demais consumidores conhecidos; (4) só então remover o PNG ao restaurar Pages, se não restar referência. Restaurar apenas o módulo/catálogo pode não remover URLs persistidas na propriedade visual do evento.

Para rollback aprovado: mode `rollback`, expected_current_deployment = deployment exato da publicação candidata, SHA revisado atual, confirmation `ROLLBACK_FABRICA_PNG_ONLY`, backend_detached `true` somente depois de verificar ausência de referências. O booleano é uma atestação manual do operador baseada nessa verificação separada e atual, não uma consulta automática ao backend nem substituto da aprovação. Sem evidência atual, NÃO defini-lo como true. Guard exige candidato TAR exato vindo deste workflow e backup íntegro retido do mesmo run. Publisher interveniente, artefato expirado, run cancelado ou resultado incerto bloqueiam. Reversão de outro deployment requer plano novo, não forçar o guard.

## Limites remanescentes
- API Pages não fornece CAS atômico contra publicadores fora de `ct-pages-production`; precisa janela coordenada sem outras publicações.
- Rechecar que publicadores existentes continuam no mesmo grupo e sem caminhos alternativos automáticos.
- Permissões/environment e disponibilidade de artefatos ainda não foram exercitadas por esta proposta.
- Fonte PNG aprovada no checkout ainda falta; este pacote falha fechado sem ela.
- Testes locais não comprovam CDN, browser, OG, backend, transações ou segurança de venda.
- Baseline/backup expiram. Não prometer rollback disponível indefinidamente.

## Evidências locais
38 testes unittest PASS (identidade, baseline, publicação sintética completa, rollback completo/expiração/corrupção, fonte ausente/errada/symlink, MIME, metadata e origem de log de run, recheck/postverify, paths e limites). Nenhuma rede nos testes. Verificação separada dos bytes reais reconstruiu exatamente o TAR candidato e preservou642membros.

Comandos locais:
```
python -m unittest discover -s fabrica-isolated-20261116/proposed-pages-release -p 'test_*.py' -v
python fabrica-isolated-20261116/proposed-pages-release/verify_local_candidate.py fabrica-isolated-20261116/baseline.zip cover-review/1002273161.png
```
