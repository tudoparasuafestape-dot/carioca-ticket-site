# SmartPOS V0.6 — ponte com os contratos reais da Carioca Ticket (21/10/2026)

**Natureza:** laboratório isolado; **não conectado** à planilha CT de homologação, ao backend PROD, ao Asaas ou ao PagBank. Sem merge/deploy e sem movimentação real.

## Fonte única para produtor web + maquininha
O laboratório normaliza eventos, governança, produtos e movimentos em um contrato de leitura `CT_SMARTPOS_SNAPSHOT_V06`. A mesma API `GET /api/v06/snapshot` serve as duas visões. O gateway de laboratório executa apenas em localhost, com fixtures sintéticas, sem rotas de escrita.

## Campos comprovados no backend CT
- `EventosConfig.js` / `EventosDados.js`: `EVENTOS.ID,NOME,DATA,HORARIO`; horário de exibição não é fonte confiável de encerramento.
- `CTEventosCadastroSeguroPROD.js`: `CT_EVENTOS_GOVERNANCA.EVENTO_ID,PRODUTOR_ID,HORARIO_INICIO,HORARIO_FIM` e função `ctEventoGovernancaObterPROD_()`.
- `BarCore.js`: `barApiCarregarEvento(eventoId)` retorna `evento,produtos,movimentacoes`; lista de produtos contém `produtoId,eventoId,produto,unidade,custoUnitario,precoVenda,estoqueMinimo,status`; movimentos incluem `ESTOQUE_INICIAL,REPOSICAO,CORTESIA,AVARIA,VENDA_DIRETA,AJUSTE_POSITIVO,AJUSTE_NEGATIVO,ESTOQUE_FINAL,ESTORNO`.
- `CTPagamentosPublicosCore.js`: `CT_PAGAMENTOS_PUBLICOS` registra `PEDIDO_ID,VENDA_ID,PRODUTOR_ID,EVENTO_ID,FORMA_PAGAMENTO,VALOR,STATUS_INTERNO,CONFIRMADO_EM`, mas não registra cada item físico da venda no bar.
- `CTFinanceiroRelatoriosEventoPROD.js`: `ctFinanceiroEventoCarregarPROD(token,eventoId)` aplica acesso do produtor e entrega resumo da bilheteria.

## V0.6 implementado no pacote local
- Adaptador CT `src/ct-adapter.js` e inteligência `src/inventory-intelligence.js`.
- Componente de ledger POS fictício com `transactionId,lineId,eventId,producerId,productId,qty,status,paidAt,terminalId`.
- Filtro rigoroso de tenant/evento, confirmação de pagamento com timestamp, reservas pendentes, deduplicação, estados conflitantes bloqueados.
- Horário de início e fim convertido em fuso `America/Recife`, inclusive evento atravessando meia-noite.
- Resultados por produto, por terminal e recomendações sensíveis ao tempo restante.
- HTML offline com identidade visual oficial preservada, que alterna 30/90 minutos, ausência de horário e misturas legadas, mais visualizações web e maquininha.
- **20/20 testes Node**, smoke de navegador e smoke da demonstração offline: aprovados. Pacote entregue na conversa com código e capturas de tela.
- Código e HTML completos do laboratório estão no pacote local `Carioca_Ticket_SmartPOS_V0.6_Contrato_CT.zip`; este registro no GitHub **não é deploy, nem contém todas as fontes desse ZIP**.

## Bloqueios para a conexão REAL
1. Criar, em homologação e com escopo autorizado, um backend CT que expose snapshot por PRODUTOR e EVENTO após autenticação (não expor `barApiCarregarEvento` diretamente por URL).
2. Criar ledger POS persistente por linha de item, máquina, operador, pagamento e vendedor jurídico/CNPJ, com idempotência e conciliação PSP.
3. Reconciliar `VENDA_DIRETA` legada e POS para evitar baixa em dobro; tratamento específico de `ESTOQUE_FINAL`, estornos físicos e financeiros.
4. Unir os módulos V0.4 (caixa por terminal) e V0.5 (alertas) aos pagamentos reais, níveis de acesso e relatórios já homologados.
5. Homologar integração Kotlin + SDK PagBank e impressão somente com parceria/terminal DEBUG.
6. Alinhar fiscalmente documento de bilheteria x comercialização do bar (possíveis CNPJs diferentes).

## Gates de execução seguintes (V0.7)
**Primeiro:** arquitetura durável e autenticação em ambiente CT de homologação isolado, sem tocar produção. **Segundo:** testes multi-terminal de concorrência, estorno, encerramento, internet, saldo, reimpressão, fechamento e divergência. **Terceiro:** integração/homologação PagBank após liberação. Mudanças em produção exigem autorização explícita.

**Risco conhecido e intencional:** o código legado do bar não fornece, sozinho, ritmo minuto a minuto a partir de pagamentos confirmados. A simulação de ledger não deve ser confundida com capacidade já ativa na CT.
