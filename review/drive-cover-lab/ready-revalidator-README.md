# Registro READY e revalidação antes de salvar

Arquivos novos, isolados, sem efeitos no carregamento:
- `ready-registry.cjs`: `createReadyRegistry({Drive,SpreadsheetApp,config})` retorna list(eventId,producerId) e lookup interno.
- `save-revalidator.cjs`: `createSaveRevalidator({Drive,SpreadsheetApp,UrlFetchApp,Utilities,config,legacy})` retorna função async revalidateAsset(selection).

Config tem folderId, spreadsheetId e sheetName=CT_COVER_INTAKE_V1. Os IDs são configuração do servidor, nunca argumentos públicos. A composição deve passar os serviços Apps Script reais; CommonJS requer adaptação/bundle revisado antes de Apps Script. Nenhuma função destes arquivos é endpoint. Core/facade deve autorizar antes de chamar list/lookup/revalidate. Nenhuma escrita/alteração de compartilhamento acontece aqui.

Registro: planilha owner-only, cabeçalho key/record, JSON limitado, máximo10mil registros, IDs drive-<key>, duplicatas falham fechado. Lista apenas READY do evento/produtor, exige full decode registrado, reviewerId, metadataPolicy ORIGINAL_METADATA_REVIEWED, promotedAt e URL Drive estritamente vinculada ao fileId. Projeta somente campos necessários ao catálogo, sem fileId/pasta/revisor/usuário. Essa lista reflete estado persistido, não prova ACL pública ao vivo de cada asset; salvar revalida novamente.

Save: ignora quaisquer provas de cliente. Relê registro, exige URL/hash iguais à seleção interna, consulta Drive.Files.get para MIME/bytes/SHA256/parent/ACL pública reader com allowFileDiscovery=false e webContentLink oficial vinculado ao mesmo fileId. O URL registrado pode ser o destino final usercontent observado anteriormente, enquanto webContentLink ainda é uc; ambos precisam passar a mesma validação estrita de host/path/parâmetros/fileId. GET público sem Authorization/Cookie, redirects manuais (máximo3), somente endpoints Drive oficiais uc/download e o mesmo fileId/export=download. HTML, login, outros hosts, outro fileId, parâmetros adicionais e redirects em legado são rejeitados. Valida resposta MIME/tamanho/hash. Repete Drive metadata e registro apósfetch para detectar revogação/substituição. Não refaz decode se hash é o mesmo do full decode previamente atestado.

URLs permitidas são deliberadamente conservadoras. Links oficiais com parâmetros além id/export ou que dependam de cookies falharão fechado; não afrouxar sem uma revisão da URL real. UrlFetchApp bufferiza corpo; tamanho em metadata/header é checado, mas Apps Script não oferece stream para impor limite antes do download quando Content-Length está ausente. Por isso destinos externos nunca são aceitos.

Retorna prova checkedAt/expiresAt30s, hash/URL/identidade e registryVersion para writer. O writer continua responsável por reautorizar sob lock, verificar expectedVersion e consumir prova dentro de30s; para fechar janela de revogação deve comparar registryVersion sob seu lock compartilhado antes de gravar. Nenhum protocolo pode prometer atomicidade com ACL externa do Drive, que pode mudar após a última leitura. Revogação editorial externa só é visível quando atualiza o registro (state/reviewer/metadataPolicy); não foi inventado serviço de aprovação adicional.

Legado: apenas catálogo estático server-owned já aprovado, path cariocaticket.com.br/assets/eventos/*.jpg|png, hash/bytes exatos. Mantém JPEG sem mime e não exige DrivefileId/consultaDrive. IDs legados não podem usar namespace drive-. Não reclassifica legado como sanitizado/full decode nem aceita URL do cliente. `sanitized:false` mantém explícito que bytes originais não foram reescritos.

24 testes offline passaram. Nenhum teste ao vivo ou deploy executado. Serviços são dublês, sem rede. Executar:
`node --test review/drive-cover-lab/ready-revalidator.test.cjs`


## Guard síncrono sob lock
`createRegistryVersionGuard({SpreadsheetApp,Utilities,config})` retorna `guardRegistryVersion(selection,proof)`, que retorna true ou lança erro. Exportada em ready-registry.cjs. O writer chama essa função dentro de seu ScriptLock já detido, depois de reautorizar e antes da escrita. Ela não adquire/libera lock e não faz DriveIO; verifica somente Sheets + digest Utilities: schema, tamanho, duplicatas, identidade, READY, JSON atual versus registryVersion e prova recente. Isso fecha revogação no registro entre fetch e gravação para escritores que respeitem o mesmo lock. Modificações externas diretas na planilha/ACL continuam fora da transação e exigem recursos dedicados sem escritores concorrentes.

O URL canônico é uma observação persistida e aprovada no registro durante promoção, não um URL aceito do cliente nem URL gerado por concatenar fileId no fluxo de salvar. Revalidator só compara URLs já existentes no registro/metadata e segue redirects oficiais para o mesmo fileId; depois comprova bytes exatos. Não relaxa para parâmetros extras, hosts externos ou outros arquivos.
