# Área interna: arquitetura e próximos recortes

Auditoria estática em 28/10/2026. Frontend de referência: `main` **43760ce15f68c3fa996b8801964e473add414bcd**, já incluindo o PR #229. O backend consultado foi o checkout local `era-beauty-fix/carioca-ticket`: **referência histórica, não prova da versão implantada**. Nenhum RPC real, upload, gravação financeira, merge ou deploy foi executado nesta auditoria.

## O que já existe

| Superfície | Contrato e comportamento observado |
| --- | --- |
| `/produtor/` | Catálogo de produtores/eventos da sessão; seleção por nomes; painel de leitura e atalhos cuja visibilidade depende do perfil. Não substituir esta autorização por dados de URL/localStorage. |
| `/eventos-v2/` | Lista eventos por nome e cria rascunhos. O seletor de produtor usa `ctEventosOperacionalContextoCadastroSeguraPROD(token)`, passando o ID apenas como valor da opção. Cadastro chama `ctEventosOperacionalCriarSeguraPROD(token,dados)`. |
| Publicação em `/eventos-v2/` | Aliases locais são traduzidos para `ctEventosOperacionalStatusPublicacaoSeguraPROD`, `ctEventosOperacionalPublicarSeguraPROD` e `ctEventosOperacionalFecharSeguraPROD`; todos recebem token e evento. `pendencias` e `governancaRisco.governanca` vêm do servidor. |
| `/produtor/ingressos/` | Configuração de tipos/lotes via `ctIngressosConfigCarregarPROD(token,eventId)` e operações específicas. Não publica automaticamente. Mantém validação temporal e bloqueios de alterações. |
| `/evento-v2/` | Página **pública**, consumidora de `visual.capaUrl`/`posterUrl`; não é editor administrativo. |
| `/backoffice/politicas-comerciais/` | Ainda possui `input#producerId` e `input#eventId` manuais. Exige acesso Master via `ctPoliticaComercialMasterListarPROD`. Não confundir este catálogo administrativo com o catálogo limitado ao produtor. |

## Autorização que não pode ser enfraquecida

Na referência backend, `CTCentralOperacionalPROD.js` restaura sessão autenticada **e** autorizada. `ctEventosOperacionalExigirEventoPROD_` chama `ctCentralOperacionalAutorizarModuloPROD(token,eventoId,'EVENTOS')`. O contexto de cadastro filtra perfis com módulo `EVENTOS`; a criação reconfirma o produtor em `ctEventosOperacionalProdutoresPermitidosPROD_`, recusa IDs fora desse conjunto e define `criadoPor` a partir da sessão.

`CTEventosCadastroSeguroPROD.js` cria `RASCUNHO`, vínculo explícito em `CT2_PRODUTOR_EVENTOS` e governança em `CT_EVENTOS_GOVERNANCA`. Cadastro não é autorização para vender. Uma etapa visual concluída nunca deve publicar, aprovar risco, remover cobrança ou alterar horário/encerramento.

## Capa e editor geral: lacuna confirmada

`eventos-v2/index.html` não contém formulário de capa nem editor geral dos dados de um evento existente. Há um alias de transporte `ctEventosOperacionalVisualEraSeguraPROD`, específico do trabalho visual anterior; ele **não demonstra** a existência de uma API genérica autorizada para qualquer produtor/evento. Não reutilizá-lo como editor geral.

Na referência `CTEventoPublicoExperienciaPROD.js`, `ctEventoPublicoVisualSalvarInterno_` persiste metadados em `ScriptProperties` com prefixo `CT_EVENTO_PUBLICO_VISUAL_`. Aceita URLs HTTPS de capa/poster e textos limitados; mantém mídia principal estática e rejeita vídeo. É função **interna**, sem autorização de produtor visível nessa função: não a expor diretamente por RPC. O leitor público possui cache; futura edição deve prever invalidação por evento, sem contornar elegibilidade pública.

### Implementação futura isolada, antes de qualquer habilitação

1. Confirmar contratos na revisão atual do backend, com teste unitário de proprietário, usuário sem módulo, sessão expirada, evento inexistente e tentativa cross-produtor.
2. Criar proposta de API segura de leitura/gravação de **metadados visuais**, com token, evento, allowlist de campos e versão de edição para conflito concorrente. Reusar autorização existente, nunca confiar no nome exibido.
3. Primeiro protótipo exclusivamente local: imagem sintética ou asset já oficial, prévia responsiva, limites de dimensão/tamanho/tipo e mensagens de erro. Não criar bucket, permissões públicas, credenciais, Drive compartilhado nem upload real.
4. Separar claramente “Salvar rascunho visual” de “Publicar evento”. Confirmar política de armazenamento/URLs, proteção de dados, cache e autorização antes de conectar gravação real. Não aceitar `javascript:`, `data:` ou HTML como URL/texto renderizado.
5. Testar sucesso, falha, timeout, duplo clique, troca de evento durante leitura, cancelamento/voltar, concorrência e preservação de todos os campos não visuais.

## Sequência coesa de UX recomendada

1. **Visão geral e menu**: nomes claros, contexto produtor/evento sempre visível, atalhos originais e permissões preservados, estado de atualização acessível e bloqueio de clique repetido.
2. **Gestão em etapas**: Dados do evento → Ingressos e lotes → Revisão e publicação. Capa/editor entram somente quando houver contrato seguro; não mostrar etapa como pronta por inferência local. Usar status já autorizado e pendências reais retornadas pelo servidor. Mostrar “Não consultado”/“Não foi possível consultar” em vez de ausência de pendências em caso de falha.
3. **Nomes no cadastro administrativo**: definir catálogo Master autorizado de produtores/eventos, filtrar evento pelo produtor escolhido, desambiguar nomes com cidade/data, manter IDs apenas no payload. Esvaziar evento ao mudar produtor e ignorar respostas antigas. Se não existir endpoint adequado, entregar esse seletor em recorte separado; não varrer catálogo público nem ampliar permissões.
4. **Editor/capa**: proposta acima, separada de alterações financeiras, de infraestrutura e publicação.

## Verificação mínima antes de publicar qualquer recorte

- Desktop e telefone; teclado, foco, Escape, fechamento externo, Back/Forward e cancelamento.
- Sessão válida, expirada, não autorizada, perfil restrito e múltiplos produtores; itens ocultos continuam ocultos.
- Seletores sem digitar IDs; nomes duplicados, catálogo vazio/erro, troca rápida de produtor/evento e resposta fora de ordem.
- Botões: carregando, sucesso, erro, timeout e clique repetido; nenhuma repetição de RPC de escrita.
- Invariantes: nenhuma mudança em cobrança, política comercial, temporalidade, fechamento, governança ou endpoints reais; preservar PR #229.
- Toda execução de browser com fixtures sintéticas e rede externa negada. Suíte legada geral pode usar produção como fallback: seguir `HOMOLOGACAO.md`, não executar `npm run homologar` indiscriminadamente.

Este documento é plano/auditoria, não afirma que o editor, upload ou seletor Master foram implementados.
