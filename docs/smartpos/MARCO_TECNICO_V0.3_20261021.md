# Carioca Ticket SmartPOS — Marco V0.3 (21/10/2026)

**Escopo:** API de laboratório compartilhada entre consulta gerencial na maquininha e painel web do produtor, sem conexão com Carioca Ticket PROD, PagBank ou Asaas.

## Implementado no laboratório
- Servidor Node.js com motor transacional simulado em memória; sem cobranças ou dados reais.
- UI responsiva para portaria, bar, produtor no terminal e produtor web: todos usam a mesma resposta GET /api/reports/{eventId}.
- Autorização por perfil, terminal e evento; dados gerenciais exigem login do produtor; eventos de outros produtores bloqueados.
- Pedidos idempotentes com valores em centavos, reservas de estoque, estados PAID/DENIED/PENDING_RECONCILIATION.
- Ingressos e fichas somente após pagamento fictício confirmado, reimpressão sem novas emissões e utilização única.
- Relatório por evento de vendas, bar, bilheteria, estoque, meios de pagamento, operador, terminal e pendências.
- Consulta periódica a cada 10s com painel visível; seleção de eventos autorizados.
- Marca original recuperada do Google Drive, sem refazer a arte; paleta #080D12/#DFA324/#FFFFFF.
- Interfaces Kotlin de referência para futuro backend, SDK PagBank e impressão; sem APK ou SDK integrado.

## Testes executados
- 10 de 10 testes Node concluídos (inclui HTTP, permissões, estoque, idempotência, duplicação, conciliação).
- Teste de navegador demonstrou venda de R$ 8,00 no bar no terminal, refletida como R$ 8,00 no painel web e na consulta gerencial do terminal, sem erros JS.
- Capturas do navegador e código da simulação fornecidos em pacote local Carioca_Ticket_SmartPOS_V0.3_Integrado.zip nesta conversa. O código V0.3 ainda não foi versionado no GitHub, somente o registro técnico.

## Restrições e próximos gates
- Mock com PINs fictícios, saldo em memória e sem QR escaneável; NÃO publicar em rede ou usar para transações reais.
- P0: adaptar dados reais da CT exclusivamente em ambiente de homologação; ledger durável e conciliação por PSP.
- P0: separar vendedor/CNPJ de bilheteria e bar e homologar vínculo de terminal, fiscal, taxas e repasse.
- P1: autenticação forte no terminal, app nativo Kotlin com SDK aprovado, impressão real/QR e testes físicos.
- P2: piloto de evento e controle de qualidade antes de eventual deploy autorizado.

**Nenhum merge, deploy, cobrança ou alteração em produção realizado.**