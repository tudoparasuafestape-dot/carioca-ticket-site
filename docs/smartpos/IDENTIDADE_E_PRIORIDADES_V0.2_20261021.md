# Carioca Ticket SmartPOS — evolução V0.2 (21/10/2026)

**Natureza:** demonstração independente, sem integração PagBank ou operações reais. **Ambiente:** branch isolada; sem merge e sem deploy.

## Identidade oficial recuperada no Drive
- Pasta-mestre: https://drive.google.com/drive/folders/1Sy9Kh3fTEnVCzVqYM7iESXB1Amdi4BHK
- Manual: https://drive.google.com/file/d/1gF89SSRTtCDRwSsi962LfbeTKMy5KqfP/view
- Logo principal PNG transparente; marca horizontal PNG; ícone app 192×192; logo monocromática preta.
- Paleta: grafite **#080D12**, dourado **#DFA324**, branco **#FFFFFF**.
- Aplicação obrigatória de arquivo oficial (não reconstruído) em app, comprovantes, ingressos, fichas e apresentação; preservar proporções e respiro de ~10%. Comprovante térmico real exige validação visual física.

## Conteúdo da demonstração local V0.2
- Página de portaria, bar, produtor com a marca original, modo fictício sem cobranças.
- Cenários fictícios: pagamento aprovado / negado / sem retorno; no terceiro, aguardar conciliação, sem emitir documento ou baixar estoque até confirmar.
- Impressão pelo navegador com marca original em recibo, QR demonstrativo e bloqueio de segunda utilização.
- Relatórios fictícios com totais de portaria/bar, estoques e pedidos por terminal/operador e exportação CSV.
- Dependência do provedor e de impressora térmica nativa **não implementada**.
- Pacote offline produzido na conversa principal: `Carioca_Ticket_SmartPOS_V0.2_Oficial.zip`. Não hospedado nem implantado.

## Descobertas / limitações do código CT
- `BarCore.js`: produtos, estoque, estoque final, reposição, avarias, movimento e venda direta; controles aproveitáveis, mas falta PDV com vinculação cada item/pagamento/operador/terminal/voucher.
- `CTFinanceiroRelatoriosEventoPROD.js`: relatórios existentes, mas integração POS nova demandará ledger unificado.
- Atendimento deve distinguir cobrança da bilheteria e cobrança de produtos do bar (CNPJs potencialmente distintos). A ficha não substitui documento fiscal.

## Gates próximos
1. **P0:** obter requisitos oficiais PagBank SmartPOS para distribuidor, SDK Kotlin, terminais homologáveis, impressão, vínculo CNPJ e credenciamento.
2. **P0:** definição de modelo de monetização: custo da impressão, e-mail, licença/terminal, taxa comercial, comissão parceiro, MDR, hardware, dados e suporte.
3. **P0:** validar contrato e contabilidade intermediação vs recebimento de terceiros, no bar vs portaria; proibir emissão fiscal inadequada.
4. **P1:** especificar API POS com autenticação de terminal, pedido idempotente, validação no PSP, saída de estoque e documento com token de resgate único.
5. **P1:** teste Android nativo e integração SDK **somente após** parceria e terminal DEBUG.
6. **P2:** homologação PagBank, piloto real pequeno, reconciliation, contingência.

## Benchmark de campo Outgo
Produtor relatou R$ 1,00 por ingresso impresso e R$ 0,50 por envio e-mail. Dados **não confirmados publicamente**, sem extrapolar valor de repasse, incidência e faturamento.

Não autoriza alteração do checkout, das tabelas de preço nem do código da produção Carioca Ticket.