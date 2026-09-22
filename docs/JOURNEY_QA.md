# Gate de Jornada — Carioca Ticket

Este documento define quando uma funcionalidade pode ser chamada de **jornada homologada**.

## Regra de qualidade

“Teste verde” não significa automaticamente “experiência pronta”. A partir deste gate há dois níveis:

1. **Tecnicamente validado** — RPC, autorização, contrato, estado e regressão funcionam.
2. **Jornada homologada** — uma pessoa consegue encontrar a função, entrar, concluir a tarefa, voltar, sair e trocar de contexto sem conhecer URLs internas.

Somente o segundo nível autoriza tratar uma jornada como pronta para uso real.

## Matriz obrigatória

| Perfil | Entrada | Jornada mínima | Saída/retorno |
|---|---|---|---|
| Cliente | Home/evento | evento → checkout → confirmação → ingresso/Minha Carioca | voltar ao evento/conta |
| Produtor | Portal do Produtor | produtor → evento → Central → módulos autorizados | Portal + Sair |
| Novo produtor | indicação | cadastro → enviado → análise → aprovação → primeiro acesso | Portal + Sair |
| Parceiro CT | Programa/Portal | candidatura → ativação → link → produtor indicado → carteira/comissão | Programa + Sair |
| Administrador | Portal do Produtor | Gestão Parceiros → Solicitações de produtores → decisão | Portal do Produtor + Sair |

## Regras do gate

- Funcionalidade crítica não pode ser validada apenas com `page.goto('/rota/')`.
- O E2E deve provar pelo menos um caminho real clicável a partir da tela anterior.
- Toda área autenticada deve ter saída explícita.
- Toda área secundária deve ter retorno claro ao contexto principal.
- Nomes semelhantes precisam indicar contexto: **Portal Parceiro CT** ≠ **Gestão Parceiros CT**.
- Estado mostrado em lista, detalhe, contador e badge deve convergir após mutações.
- Mobile e desktop passam pela mesma matriz.
- Falha de wayfinding é falha de release, mesmo que a rota isolada funcione.

## Cobertura incremental

O arquivo `tests/journey-contracts.mjs` protege o grafo crítico de navegação.
O arquivo `tests/e2e/navigation-journey.spec.js` valida a jornada clicável em desktop e mobile.
Novos módulos críticos devem entrar nesses gates antes de serem considerados homologados.

## Homologação pós-deploy

- Auditoria sistêmica 22/09/2026: branch candidata aprovada com 49/49 testes em desktop e 49/49 em mobile.
- Este registro é também o marcador de revalidação pós-publicação: não altera código do aplicativo.
