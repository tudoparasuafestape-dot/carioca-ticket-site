# Padrão de compartilhamento com capa por evento — proposta de implementação (LAB)

## Próxima camada implementada — atestado Ed25519 e revisão (LAB)

Foi confirmado que `ctEventosPublicosListarPROD()` na `main` do backend segue sem envelope temporal explícito; a implantação ativa do Apps Script ainda não foi inspecionada. Para evitar que um JSON manual seja confundido com autorização:

- `scripts/verify-event-social-attestation.mjs` verifica `version=1`, `issuer='ct-public-catalog-authoritative'`, `audience='ct-social-preview-release-v1'`, `keyId`, `issuedAt`, `expiresAt`, `revision`, `snapshot` e assinatura **Ed25519**, feita sobre serialização canônica de todos os campos menos a assinatura.
- Apenas a **chave pública** é necessária na etapa de geração: `CT_SOCIAL_PREVIEW_PUBLIC_KEY_PEM` e `CT_SOCIAL_PREVIEW_KEY_ID`. A chave privada será exclusiva do futuro emissor confiável, nunca versionada no GitHub nem oferecida ao gerador. Nos testes os pares Ed25519 são gerados em memória e descartados.
- Assinatura, esquema, identidade/audiência, revisão crescente e validade (até 120 segundos) são checados antes de gerar qualquer arquivo; a assinatura **não substitui** os gates públicos e o contrato temporal fresco do snapshot.
- `scripts/build-event-social-sealed-release-lab.mjs` exige o atestado assinado. `tests/event-social-attestation.offline.mjs` testa adulteração, chaves erradas, ausência de chave pública, data expirada, snapshot stale, revogação e revisão repetida.

**Limitações ainda obrigatórias antes do go-live:** o controle de revisão anterior só é forte se a revisão vier de registro protegido e não manipulável pelo publicador; um `previousReceipt` em JSON manual não fornece essa garantia. Também não existe emissor Ed25519 PROD, coleta autenticada da resposta do Apps Script ou prova de que o backend real entrega o contrato temporal. **A PR não publica nada.**

O construtor offline direto `build-event-social-release-lab.mjs` permanece disponível apenas para testes. Nunca deve ser ligado diretamente a um pipeline de publicação; somente a entrada verificada poderá ser usada, após isolamento de credenciais, revisão autoritativa, verificação da capa no domínio e autorização.

## Continuidade implementada — contrato do catálogo e revogação (LAB)

**Fonte auditada no backend:** `CTEventoPublicoExperienciaPROD.js` → `ctEventosPublicosListarPROD()`. Essa função lê o gate de vendas `ctCheckoutPublicoGateStatusPROD()`, revalida cada evento publicado por `ctCheckoutPublicoGateExigirEventoAtivoPROD_`, verifica `ctEventoAcessoResolverPROD_(..., {somenteLeituraAtual:true})` com `modoAcesso='PUBLICO'` e `exibirCatalogo=true`, e exige evento `status='ATIVO'`. Esse retorno é a origem apropriada para a integração, **não** a listagem administrativa.

**Lacuna comprovada:** a implementação de `ctEventosPublicosListarPROD()` no GitHub `main` do backend **não inclui diretamente** `temporalVersion`, `eligibilityContract`, `serverNow`, `temporalEvaluatedAt`, `validUntil`, `nextTransitionAt` nem `event.temporal` em cada linha. Pode existir uma versão PROD diferente, mas **não podemos afirmar compatibilidade sem ler a resposta real da implantação**. O código deste laboratório falha fechado na ausência desse contrato; NÃO gerar prévias reais usando somente os campos `id/nome/capa` retornados pelo backend da `main`.

**Novo código:**
- `scripts/derive-event-social-manifest.mjs`: recebe um snapshot *obtido por processo confiável e auditado* do catálogo público, exige contrato temporal exclusivo V1, validade recente, rejeita `cacheStale`, IDs repetidos, eventos encerrados ou sem `TEMPORAL_V1`, e usa apenas capa estática oficial em `assets/eventos`. Lote antigo `LEGADO_SEM_FIM` é rejeitado enquanto não houver decisão explícita de segurança.
- `scripts/build-event-social-release-lab.mjs`: cria um candidato **completo** de release fora do repositório. Valida existência real e assinatura JPEG/PNG do arquivo da capa, emite HTML OG e recibo de IDs. Cada release só contém eventos elegíveis no snapshot atual; um catálogo público vazio e fresco produz release vazio, para futura despublicação/revogação.
- `tests/event-social-public-catalog.offline.mjs` e `tests/event-social-release.offline.mjs`: fixtures de autorização, recusa de resposta stale/incompleta, compatibilidade de rota do Herminho, imagem, release vazio e ausência de escritas após falha.
- Workflow de CI offline atualizado para executar todos esses testes.

**Invariantes de publicação:** não copiar páginas de um release antigo; se a consulta pública falhar, não publicar candidato novo; nunca tratar um arquivo JSON de usuário como prova de autorização. Um arquivo `manifest.json` pode ser falsificado e o laboratório é incapaz de provar sozinho a autenticidade de sua origem. **A automação em produção exige uma etapa confiável que obtenha a resposta diretamente de fonte autoritativa e ateste origem, sem edição manual.**

**Ainda falta para automação real:** implementar/exportar o contrato de snapshot público no backend PROD com testes, extrair resposta por canal confiável, associar a atualização à publicação/despublicação, ativar geração/revogação no pipeline controlado e verificar conteúdo bruto via HTTPS e cache das redes. **Nenhuma destas operações foi ativada em produção.**

## Estado da implementação de laboratório — 29/10/2026

O gerador **já foi implementado** em `scripts/generate-event-social-previews.mjs` e testado por `tests/event-social-previews.offline.mjs`. A rotina produz somente arquivos locais, rejeitando escrita dentro do checkout do repositório e sem qualquer acesso a rede, Apps Script ou Asaas. O CI `event-social-preview-lab.yml` executa os testes isolados.

**Uso sintético somente em ambiente de laboratório:**

```bash
node tests/event-social-previews.offline.mjs
node scripts/generate-event-social-previews.mjs /tmp/manifesto-aprovado.json /tmp/ct-social-previews
```

O manifesto aceita um array de objetos contendo exclusivamente:
`fonte='CT_PUBLIC_APPROVAL_V1'`, `eventoId`, `titulo`, `descricao`,
`imagemSocialHttps`, `destinoPublicoHttps`, `publicado=true`,
`modoAcesso='PUBLICO'`, `elegivel=true` e `gateVendasAtivo=true`.

**Não confundir campos do manifesto com autenticação**: qualquer pessoa pode escrever esse JSON; a etapa seguinte precisa emitir o manifesto somente por meio de validação autoritativa, sem entradas manuais e com trilha de auditoria. O gerador aceita apenas imagens JPEG/PNG em `https://cariocaticket.com.br/assets/eventos/` e destinos do mesmo domínio nas rotas `/evento/` ou `/evento-v2/`, com ID conferido.

Foi adicionada uma regressão usando **apenas como exemplo offline** o asset estático JPEG `assets/eventos/herminho-tbt-20261107-a2f84c198ed5b283.jpg` existente no repositório. Isso não representa uma liberação de publicação real nem comprova resposta HTTP pública da imagem.

**Ainda NÃO está integrado ao cadastro/publicação automática e não existe nova URL pública de compartilhamento.** Nenhum arquivo em `/compartilhar/` é gerado no site atual.

## Defeito reproduzido / explicação
- `evento-v2/index.html` é uma página estática, com título inicial genérico e sem `og:image` específico de evento. O navegador carrega a capa posteriormente via JavaScript; crawlers de WhatsApp e de redes sociais não dependem dessa renderização.
- `evento/index.html` tem Open Graph genérico apontando para imagem institucional, portanto não supre a prévia por evento.
- Apenas alterar tags no cliente não resolve prévia da URL com `?evento=...` em GitHub Pages.

## Contrato a integrar no fluxo de publicação
1. Depois de aprovação do evento e validação no backend de `modoAcesso=PUBLICO`, status público, gate de vendas e elegibilidade, gerar arquivo HTML estático de prévia em `/compartilhar/<eventoId>/index.html` a partir da fonte autoritativa. **Nunca** derivar elegibilidade exclusivamente de dados administrativos, `EVENTOS` ou cache stale.
2. Inserir no HTML bruto `og:title`, `og:description`, `og:image`, `og:image:secure_url`, `og:url`, `og:type` e `twitter:card=summary_large_image`, com URLs HTTPS públicas, sem cookies, tokens, dados privados ou JavaScript.
3. A imagem deve ser uma variante social da capa oficial estática; preferir 1200×630 JPEG otimizado e manter a capa original sem substituição.
4. Abrindo o URL de compartilhamento, a pessoa deve ser levada à página oficial do evento (`evento-v2/?evento=...` quando homologada), com link explícito de fallback. Esse redirecionamento não pode criar pedido, Pix ou ingresso.
5. Só alterar os botões Compartilhar da home e do evento após confirmar geração, publicação, acesso HTTP 200 da imagem, presença de tags OG no HTML inicial e destino correto. Preservar rotas atuais até lá.
6. Revogação: ao tornar evento privado, restrito, não publicado ou não elegível, remover/indisponibilizar o HTML de prévia na nova versão do site; observar que caches de redes sociais não podem ser revogados instantaneamente.

## Limitações e opções
- GitHub Pages não oferece metatags diferentes para cada query `?evento=` do mesmo arquivo estático. Para que o **mesmo endereço** `evento-v2/?evento=...` forneça OG dinâmico, é necessário serviço de borda ou renderização no servidor, com homologação e implantação separadas.
- A rota estática de compartilhamento é o caminho de menor interferência nas vendas, mas precisa de integração com a publicação aprovada de eventos; criar arquivo OG isolado não implementa o fluxo automático.
- A prévia depende do comportamento/cache do WhatsApp, Telegram e demais serviços; não é possível garantir que qualquer aplicativo mostre imagem sempre.

## Critérios de teste e gates
- Evento público aprovado: HTML da URL compartilhada contém dados e capa oficiais; crawler HTTP recebe HTML sem executar JavaScript; capa acessível e correta.
- Evento privado/restrito/não publicado/venda encerrada: nenhuma nova prévia gerada; links existentes tratados de forma segura.
- Títulos com caracteres especiais escapados; rejeitar URLs `javascript:`, hosts externos não autorizados e IDs inválidos; não incluir PII.
- Compartilhamento de home, WhatsApp e página do evento aponta somente para URL verificada; navegação leva ao evento certo; checkout permanece inalterado.
- Testes offline, branch isolada, CI, homologação, rollback e autorização específica antes de merge/deploy. **Este arquivo não publica nada nem muda a operação atual.**