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
