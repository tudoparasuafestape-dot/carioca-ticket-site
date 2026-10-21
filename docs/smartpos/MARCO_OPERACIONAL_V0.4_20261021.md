# Carioca Ticket SmartPOS V0.4 — Modo Evento, caixa por maquininha e produtor integrado

**Data:** 21/10/2026. **Estado:** versão de LABORATÓRIO, não integrada com PagBank ou Carioca Ticket PROD; sem merge ou deploy.

## Diretriz operacional do produtor
Produtor consulta as operações **na web e na maquininha**, autenticado, com a mesma fonte de dados; operadores de bar e portaria não visualizam o financeiro gerencial. Relatórios agregados por evento, setor, terminal, operador, turno e meio de pagamento.

## Benchmark oficial PagVendas / Modo Evento
- Impressão automática ou sob demanda, ficha numerada por terminal e QR de utilização única.
- Abertura/fechamento de caixa, reforço, retirada, resumo e relatórios.
- Fontes https://faq.pagbank.com.br/duvida/como-habilitar-o-modo-evento-para-emitir-fichas-de-consumo/944 ; https://faq.pagbank.com.br/duvida/como-fazer-controle-de-caixa-com-o-pagvendas/709 ; https://faq.pagbank.com.br/duvida/como-funcionam-as-fichas-com-numerao-no-modo-evento/2193

## Laboratório V0.4 criado nesta conversa
- HTML independente com LOGO ORIGINAL do Drive, três terminais PORT-01, BAR-01 e BAR-02, seleção rápida de produtos, pagamentos fictícios e fichas/ingressos imprimíveis pelo navegador.
- Cada terminal tem caixa/turno: fundo, operador, reforço, sangria, resumo por meio, contagem de numerário e fechamento com divergência e justificativa; histórico de turnos.
- Painel web e consulta gerencial no terminal exibem vendas agrupadas por maquininha. Consulta no terminal requer PIN de laboratório separado do operador.
- API Node local derivada do marco V0.3; novos endpoints `/api/register`, `/api/register/open`, `/api/register/movement`, `/api/register/close`; relatório compartilhado inclui `summary.byTerminal`.
- Testes: 12/12 testes Node API; teste de navegação do HTML autônomo aprovado; teste de navegador consumindo o servidor comum aprovado.
- Versão entregue em arquivo local `Carioca_Ticket_SmartPOS_V0.4_Operacao_Caixa.zip` e demonstrador HTML autônomo `CT_SmartPOS_V04_Demo.html` na conversa. **Esses binários/código ainda não estão versionados neste repositório**, somente este registro. 

## Regras críticas de evolução
- Confirmar venda no PSP antes de emitir ficha/ingresso e baixar estoque; conciliar pagamentos sem retorno.
- Reimpressão não cria novo direito; retirada e check-in são de uso único.
- Caixa físico esperado = fundo + vendas em dinheiro + reforços - sangrias - devoluções em dinheiro.
- Fechamento de caixa ≠ liquidação PagBank ≠ repasse ao produtor. Ledger fiscal e financeiro separados.
- Credenciais de demo NÃO adequadas para produção. Exigir sessão gerencial forte, autorização terminal, isolamento de tenant e rastreio de ações.
- Terminal PagBank vinculado a um CNPJ/loja; modelo portaria vs bar (possíveis CNPJs distintos) deve ser homologado antes do piloto.
- App final exige Android Kotlin/Java, SDK PagBank homologado e máquina DEBUG aprovada pela área de Parcerias.

## Próximo gate técnico
Desenhar adaptadores de homologação com backend CT: evento, lotes, vendas, BarCore, relatórios, cadastro de dispositivos, ledger durável, conciliação PSP e separação de CNPJ/bar e bilheteria. Nenhuma mutação na produção até aprovação e testes.

**Sem merge, publicação, recebimento real ou alteração de dados dos produtores.**