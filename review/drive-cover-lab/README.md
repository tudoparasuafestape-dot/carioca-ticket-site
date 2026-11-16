# Homologação isolada Drive, não publicada

Proposta apenas. Não há workflow de deploy nem chamada Apps Script. Nenhuma página de produção importa estes módulos. O HTML usa somente uma arte já pública, sem alterar permissões:
https://drive.google.com/file/d/1ZKtn5Z7APZpQjiNEVZSOrfCws5liDLIq/view

URL de download foi observada no HTML oficial, seguida de redirect oficial. Em16/11/2026 recebeu200,image/png,1959605bytes, SHA25651641c2541154228a4f9099f4056c1b47daab1598e369c50b91bccd1d76ce570, decode1080x1350, sem cookies ou Authorization. Content-Disposition attachment. UA de crawler simulado recebeu mesmos bytes; NÃO é teste Meta real nem garantia de estabilidade.

## Testes
`node --test review/drive-cover-lab/*.test.cjs`
Offline, sem rede, credenciais, uploads, permissões ou escrita de evento.

O catálogo estático aprovado legado aceita formato anterior sem state e JPEG sem campo mime. Core geral usa adapters server-owned ainda não implementados. Autoriza antes do lookup, aceita biblioteca vazia, isola evento/produtor, mantém legado, exige READY e preserva expectedVersion. Não executa save; a integração deve usar CAS/auditoria/readback existentes e reautorizar sob lock. O adapter precisa validar URL exata, metadata, origem e persistência.

Política Drive distingue fonte privada, bytes públicos verificados e OG real. Nunca aceitar thumbnailLink temporário como URL permanente. Sessão/token, folderId, fileId, URL, digest e resultados de probe não podem vir sem verificação do cliente.

## Pendências e aprovação
Para testar embed e OG real, hospedar SOMENTE este HTML em superfície de homologação existente, com URL pública revisada; preencher og:url com URL real apenas após destino definido. A publicação ainda depende de aprovação específica. Não publicar main inteiro, não modificar evento, preço, capacidade, cadastro, whitelist ou checkout. Não criar serviços/custos.

Após autorização: abrir página sem login e verificar imagem1080x1350; submeter a crawler real; revalidar URL após intervalo. Meta parse-only não comprova entrega. Se Drive direto falhar, avaliar espelho automatizado no Pages existente, mantendo Drive fonte e registro dinâmico, com aprovação futura delimitada para publicação de mídia. Não usar Cloudinary (usuário não possui conta).

Fontes oficiais:
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/apps-script/reference/content/mime-type
- https://ogp.me/

## Adaptadores reais de intake, ainda não executados
`apps-script-adapters.cjs` compõe Drive advanced v3 Files.get/create, SpreadsheetApp e LockService reais. Não é endpoint público nem código ligado ao site. Configuração de pasta/planilha é exclusiva do servidor. Requer aba privada pré-preparada CT_COVER_INTAKE_V1 com cabeçalho key,record; não cria planilha, aba ou permissão automaticamente. Não usar planilha editável por produtores. Todos os escritores devem usar o mesmo script lock; limite explícito de 10 mil registros.

O intake autentica antes de I/O, limita arquivo a 2.065.000 bytes, computa hash no servidor e exige assinatura PNG/JPEG. Assinatura não é decode: estado final é sempre QUARANTINED, nunca READY. Reserva persistida antes de upload; timeout/resultado incerto deixa RESERVED e tentativa repetida pede reconciliação, sem duplicar upload. Reconciliação por appProperties exige implementação/revisão separada; não apagar reserva nem arquivo automaticamente. Pasta deve ser My Drive com único proprietário e sem outros leitores. Pré/pós-verificação de permissões não é transação de ACL: a pasta deve ser dedicada, sem alteração concorrente de compartilhamento por outros atores.

Ainda faltam integração com autorização real do portal, decoder completo, revisão/promoção pública, reconciliação e escrita final via CAS/auditoria existentes. Não expor esta fábrica diretamente como RPC. O registro de intake não é o catálogo público READY. Não há chamada setSharing/Permissions.create nem escrita de evento. Testes usam dublês locais dos serviços, não comprovam escopos OAuth nem execução no Apps Script. A ativação em homologação requer configuração e aprovação separadas.

Documentação dos adaptadores: https://developers.google.com/apps-script/advanced/drive e https://developers.google.com/apps-script/reference/lock/lock .

## Autorização e destino de homologação verificados
`portal-auth.cjs` resolve produtor pela sessão/evento usando ctCentralOperacionalAutorizarModuloPROD, depois exige novamente vínculo exato no ctPortalProdutorVerificarAcessoFastP1PROD + perfil EVENTOS. Contratos foram inspecionados no backup397; ainda não há prova de equivalência desses módulos na400. Intake reautoriza sob lock imediatamente antes de ler/gravar registro. Não usar CORE_EVENTO_CONSULTAR como aprovação automática de publicação: o adaptador só recebe para quarentena privada.

Destino já existente confirmado em16/11/2026: Railway CT V2 STAGING / serviço api, https://api-staging-5fdf.up.railway.app . GET /api/v2/health retornou status ok; / retornou404. Branch configurada v2/phase9-hardening, head fcbd9815ba31807d4e00de886e6e22dde1cc0e50. Código NestJS usa prefixo global api/v2 e não tem rota estática da prova. Alvo proposto após revisão/autorização: /api/v2/review/drive-cover-lab, controller exclusivo staging servindo apenas o HTML fixture. Isso exige alteração/deploy do serviço existente, não foi realizado. Não substituir o serviço, não criar infraestrutura e não integrar Drive/token ao HTML público. Este teste provará só exibição/OG, não fluxo Apps Script.

### Correções após revisão independente
I/O de Drive fica fora do lock global: pré-checagens de pasta e planilha owner-only, reserva sob lock, liberação, upload/readback de metadata/checksumSHA256, reacquire+reauth+CAS exato da reserva antes da confirmação. Resultado incerto continua reservado. Registro também exige MIME Google Sheets e ID exato. Limites conservadores do protótipo: 50MB total, 10MB por produtor, 10 pedidos por produtor por hora e 100 registros por evento, incluindo reservas incertas. Não são política comercial final, não ativar sem revisão. ACL pode mudar externamente após leitura; usar recursos dedicados com único proprietário e nenhum outro escritor. SDK/oauth/escopos/capacidade de Sheets e equivalência400 continuam não exercitados remotamente.
