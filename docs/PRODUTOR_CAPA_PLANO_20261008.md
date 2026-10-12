# Alterar capa pelo produtor — escopo de interface e testes

Estado: **diagnóstico e proposta; sem implementação; não fazer merge/deploy**.

**Complemento da verificação técnica:** foi encontrada infraestrutura Drive existente para mídias, com pastas privadas e capas públicas por permissão individual; as thumbnails atuais responderam HTTP 200 sem autenticação. A menor proposta reutiliza esse Drive, sem novo serviço, sujeita à confirmação do acesso do executor do backend. A restrição inicial de formato ainda precisa ser fechada: um protótipo de PNG estático validou estrutura/CRC, mas isso não equivale a decoder completo nem a suporte JPEG. A verificação detalhada está no PR backend #273; os bloqueios iniciais abaixo devem ser lidos com esse complemento.

O pedido é oferecer “Alterar capa” dentro do evento, com seleção de arquivo, prévia integral, validação e confirmação. Uma nova publicação de vendas exige capa válida. Esta proposta prepara o trabalho separado do catálogo em publicação coordenada.

## Base preservada e capacidades existentes

- Base deste checkout isolado: `6f23443caae4b691fe634df67a29bc4c2b126518`, que já inclui checkout ERA #153 e Cortesias #154. Nenhum checkout compartilhado foi alterado.
- Na última consulta, [catálogo #155](https://github.com/tudoparasuafestape-dot/carioca-ticket-site/pull/155) continuava aberto, head `665cfd8a749b909950498152909091193e7d10af`. A coordenação informou depois que [backend #272](https://github.com/tudoparasuafestape-dot/carioca-ticket/pull/272) foi publicado como `37316de6b849439162b9b6637feac107cd03c405`, versão 383, e o #155 estava finalizando publicação. Aguardar confirmação do término coordenado.
- Não foi encontrado `AGENTS.md` neste clone nem nos ancestrais acessíveis do workspace. Nenhuma habilidade de design/artifact era necessária para o diagnóstico de código.
- `produtor/index.html`, linha 1390, já leva à gestão em `/eventos-v2/`.
- `eventos-v2/index.html`, `secureCall` (linha 850), já troca as chamadas de listagem, status e publicação por RPCs autenticadas. Manter sessão, validação de resposta/origem, timeout e navegação existentes.
- `publicarEvento` (linha 2298) consulta status, mostra pendências e só oferece a confirmação se `prontoPublicar === true`. `confirmarPublicacaoEvento` (linha 2471) já trata nova rejeição pelo servidor. Reutilizar o fluxo e acrescentar estado de capa; não duplicar uma publicação no navegador.
- Não há seleção de arquivo, editor ou upload de capa na gestão atual. Não criar editor de recorte. Não alterar o checkout para implementar essa ação.

## Bloqueios antes da implementação integrada

O backend ainda não possui um destino de upload de capas com autorização comprovada. Referência a bucket/thumbnail no código não autoriza habilitar escrita ou tornar pasta pública. A decisão precisa identificar armazenamento público já aprovado, namespace, domínio de entrega e validação servidor de bytes/corrupção/dimensões. Nenhum serviço, dependência paga, credencial ou permissão foi criado.

Aguardar o encerramento coordenado do catálogo e atualizar as bases. O contrato definitivo de limites/formatos e as novas RPCs devem estar disponíveis e testados antes de liberar o botão para usuários. Não deixar uma UI habilitada que só faça prévia sem conseguir salvar com segurança.

## Fluxo mínimo proposto

1. Na gestão do evento permitido, mostrar a capa atual e o botão **Alterar capa**. Identificar nome e evento em toda a confirmação. O produtor pode ajustar rascunho ou evento publicado sem selecionar outro evento globalmente.
2. Abrir diálogo com requisitos visíveis e entrada de arquivo. Proposta inicial para discussão com backend: JPEG/PNG estáticos, até 5 MiB, mínimo 320 × 320, máximo 8192 por lado e 24 MP. Não impor proporção de corte. São limites propostos, não regras já implantadas.
3. Verificar formato/tamanho e decodificar no navegador para feedback rápido; apresentar prévia com `object-fit: contain`, orientação adequada e todas as bordas. Preservar o arquivo original. Usar URL local de objeto e liberá-la ao trocar arquivo/fechar; não persistir base64 no storage de sessão, analytics ou logs.
4. Mostrar capa atual e candidata com rótulos claros. **Cancelar** fecha o diálogo sem upload/RPC de gravação; **Confirmar nova capa** só fica disponível após validação local. Backend continua sendo autoridade final sobre acesso e conteúdo.
5. Ao confirmar, capturar o evento e a revisão de capa consultados, bloquear duplo envio e mostrar etapas honestas: “Enviando imagem”, “Validando”, “Salvando”. Exibir percentual somente se o transporte realmente medir bytes; o transporte iframe atual não oferece isso por si só.
6. A capa atual continua visível até o servidor confirmar commit e persistência da nova. Erro de formato, permissão, sessão expirada, conflito, timeout e armazenamento deve gerar texto legível e preservar a referência anterior quando o commit não ocorreu.
7. Timeout pode acontecer depois do commit. Reconsultar a operação/revisão antes de oferecer repetição; mesma operação é idempotente. Depois de confirmar, não prometer que fechar o diálogo ou interromper transporte desfaz a gravação. Cancelamento garantido é antes do envio confirmado.
8. Após sucesso, atualizar somente visual/status do evento envolvido e liberar a URL de prévia. Se o usuário mudou de contexto enquanto uma resposta chegava, não aplicar a capa a outro evento. Capas e mensagens de eventos diferentes nunca compartilham estado pendente.

Usar os padrões de modal, foco e mensagens do portal: teclado, escape antes do envio, foco inicial, retorno de foco, rótulo do arquivo, erros associados e `aria-live` para progresso. Nenhum requisito deve ficar apenas em cor, hover ou tooltip. Conferir mobile, teclado e arquivo reescolhido com o mesmo nome.

## Contrato proposto com backend

Nomes candidatos, ainda não implantados:

- `ctEventosOperacionalCapaObterSeguraPROD(token, eventoId)` retorna projeção segura da capa atual, revisão, estado de validade e limites aceitos.
- `ctEventosOperacionalCapaSalvarSeguraPROD(token, eventoId, payload)` recebe bytes e contexto de operação/revisão. Não envia produtor confiável, URL arbitrária, caminho de pasta, bucket, chave de objeto ou campos de descrição a substituir.

Cada operação valida sessão e vínculo do produtor com o evento no servidor. A permissão exibida pelo navegador não é autorização. Helpers internos de visual nunca entram em RPC pública. O JSON persistido conserva descrições e campos desconhecidos quando só a imagem muda; o backend valida e persiste o objeto antes de trocar a referência da capa.

O estado de publicação deve oferecer uma pendência de capa clara e ação para abrir **Alterar capa**. Sem capa válida, não oferecer confirmação de publicação. Reconsultar status depois da troca e tratar rejeição no clique final: a situação pode ter mudado entre leitura e confirmação. Não confiar em `<img>.onload` ou apenas no prefixo HTTPS como prova de publicação válida.

Evento já publicado continua com vendas abertas se uma imagem falhar temporariamente. Não chamar fechar/publicar automaticamente após uma troca. Nova publicação após fechamento passa novamente pelo gate servidor comum, inclusive legado, canário e multi-eventos. Nenhuma mudança em checkout ERA, preços, política comercial, emissão ou finanças.

## Escopo de arquivos e conflito com #155

| Arquivo | Uso futuro | Situação |
| --- | --- | --- |
| `eventos-v2/index.html` | Ação no evento, diálogo, RPCs e feedback de publicação | Fora do diff atual do #155. Revalidar após a publicação. |
| `assets/producer-event-cover.js` (se extraído) | Estado de prévia/envio por evento | Novo arquivo; evitar lógica duplicada entre portal e gestão. |
| `tests/e2e/producer-event-cover.spec.js` | Nova suíte de UX e isolamento com mocks | Novo arquivo; não usa produção. |
| `tests/e2e/producer-event-governance.spec.js` | Capa como requisito e confirmação de publicação | Fora do diff atual do #155. |
| `.github/workflows/homologacao-automatica.yml` | Incluir nova suíte no job local da branch | Sobreposição direta com #155: não editar antes do término coordenado. |
| `tests/contracts.mjs` | Contrato das novas RPCs/superfície, se necessário | Sobreposição direta com #155: aguardar. |

Não é necessário modificar a home, `styles.css`, catálogo público, testes financeiros, Cortesias ou checkout para construir essa ação. Esses arquivos seguem preservados. A regressão do catálogo será executada sobre a base final do #155, mantendo prévia/capa sem corte e tratamento de imagem ausente/quebrada.

## Validação realizada

Na base `6f23443`, passaram `node tests/contracts.mjs` (41 superfícies), `node tests/journey-contracts.mjs` e `node tests/producer-portal-performance.contract.mjs` (10 checks).

`node tests/eventos-privados-v1.mjs` falhou diretamente no Windows porque o contrato busca a string literal `origemComercial:\n` e o checkout estava em CRLF (`git ls-files --eol` confirmou índice LF / worktree CRLF). Passou ao normalizar CRLF → LF somente no retorno em memória de `fs.readFileSync`; nenhum arquivo versionado foi modificado. Isso é limitação preexistente de portabilidade do teste, não correção da funcionalidade nem falha nova de origem comercial.

Não foi executado E2E da nova capa: a interface e o upload ainda não existem. Nenhuma chamada de emissão/cobrança real foi feita. Este PR documental não valida publicação em produção.

## Matriz de aceite após implementação

| Grupo | Cenários necessários |
| --- | --- |
| Fluxo básico | Escolher JPEG/PNG, mostrar imagem inteira, confirmar, sucesso visível; rascunho e evento publicado; proporções retrato/paisagem, EXIF e transparência. |
| Cancelamento | Cancelar sem RPC de escrita; fechar/reabrir descarta candidata; reescolher o mesmo arquivo; cancelar arquivo nativo; capa anterior intacta. |
| Validação | Vazio, MIME/extensão falsos, SVG/HTML/executável, excesso de bytes/pixels, dimensões inválidas e arquivo corrompido. Erros locais não enviam; erros servidor exibem mensagem e mantêm estado correto. |
| Sessão e isolamento | Sessão expirada/revogada, perfil sem acesso, evento adulterado, produtor A versus B; nenhuma gravação autorizada só pelo estado da tela. |
| Concorrência | Duplo clique, repetição idempotente, timeout antes/depois do commit, conflito de revisão, resposta antiga depois de mudar de evento, duas abas. Reconciliar sem sobrescrever capa mais recente. |
| Publicação | Capa ausente/inválida impede confirmação; capa válida exige também os gates já existentes; rejeição no clique final é legível; nenhum auto-publicar/auto-fechar. |
| Progresso/acessibilidade | Estados reais, sem percentual fictício; foco/teclado/leitor de tela; mobile; cancelar antes do envio; não anunciar falha se commit confirmado. |
| Regressão | Governança/portal/login, checkout ERA oficial e legado, política e finanças, Cortesias #154 e catálogo #155; fixtures locais com rede transacional bloqueada. |

Retomar implementação somente após resolver armazenamento/validação de conteúdo e concluir a coordenação. Os PRs de backend e frontend permanecem separados e em rascunho; nenhuma publicação está autorizada nesta etapa.
