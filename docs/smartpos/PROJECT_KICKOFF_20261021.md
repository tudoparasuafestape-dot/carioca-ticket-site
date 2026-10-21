# Carioca Ticket SmartPOS — abertura do projeto (2026-10-21)

**Status:** descoberta / V0.1, sem integração PagBank. **Política:** 100% isolado, sem merge, deploy ou modificação de produção.

## Origem e requisito comercial
A experiência de campo relatada pelo fundador demonstra que o operador de clubes e eventos considera **ter maquininhas realmente disponíveis** requisito inicial para começar a trabalhar com a Carioca Ticket. Não confundir apresentação de aplicativo com posse, liberação, entrega e manutenção de terminais homologados. Pipeline comercial só promete hardware após contrato, logística e vínculo de CNPJ confirmados.

## Operação desejada
- **Portaria:** selecionar ingresso e lote; pagamento no SDK PagBank; emissão de QR exclusivo; impressão em terminal ou envio digital; evento/operador/terminal e pagamento conciliados; check-in único.
- **Bar:** selecionar produtos; pagamento; emitir uma ficha verificável por unidade ou impressão consolidada configurável; retirada única por QR; baixar estoque na venda sem dupla baixa na entrega.
- **Produtor:** painel unificado bilheteria/bar por evento, operadores, meios de pagamento, devoluções, estoques, taxas CT, despesas de processamento e repasses.
- **Infraestrutura:** app Android nativo Kotlin + SDK PagBank após aprovação; API POS transacional idempotente intermediando os módulos existentes da CT; logs, autorização de terminal, auditoria, controle de rede e conciliação independente.
- **Segurança:** nunca emitir/entregar após mero timeout; confirmar autorização no PSP; garantir reimpressão sem duplicidade e bloquear resgate repetido.
- **Fiscal:** titular de cada venda, CNPJ de cada terminal, receita da plataforma distinta da bilheteria e do bar; ficha não substitui documento fiscal.

## Benchmark Outgo (relato de campo, não tarifário oficial)
Produtor informou: **R$1,00 por impressão de ingresso; R$0,50 por envio de ingresso por e-mail**. A Outgo publicamente confirma parceria com PagSeguro e maquininha para impressão, mas não localizamos tabela pública oficial confirmando esses valores. **Pendências:** quem paga, se taxas são alternativas ou cumulativas, eventual desconto no repasse, custo de adquirência, cobrança de reimpressão e documentos fiscais.
https://outgo.com.br/para_produtores

## Restrições confirmadas pelo PagBank
1. SmartPOS exige parceria comercial e terminal de desenvolvimento para integração/homologação.
2. SDK exige Android nativo Java/Kotlin; WebView não é aceito.
3. Cada terminal está vinculado a uma única loja/CNPJ.
4. Pagamentos devem usar o SDK PagBank no terminal; impressão personalizada é suportada.
5. App homologado é distribuído em terminal selecionado via reseller; hardware e disponibilidade dependem da parceria.
Fontes: https://developer.pagbank.com.br/docs/faq-smartpos e https://developer.pagbank.com.br/docs/integracao-smartpos-1 .

## Modelos de remuneração a testar, sem assumir aprovação
- Portaria: serviço por emissão/ingresso, com alternativas impressa e digital, taxa acordada e transparente.
- Bar: licença por terminal/evento ou software por transação; evitar multiplicar a tarifa pelo número de fichas emitidas em compra única sem ajuste econômico.
- Receita por indicação PagBank apenas mediante contrato formal.
- Calcular custos de hardware, dados, papel, suporte, MDR, falhas, estornos, fiscal e comissão do captador.

## Gates
**P0 agora:** prova de conceito navegável e arquitetura de integração, demonstrativo de custos, requisitos e proposta comercial.
**P1:** sondagem informal de elegibilidade via contato do fundador no PagBank; documentos oficiais de hardware, vínculo CNPJ, preços, split de operações presenciais e distribuição.
**P2 somente após aprovação:** Kotlin + SDK, terminal DEBUG, homologação, piloto e conciliação auditável.

## Artefatos V0.1 (offline)
Protótipo HTML local com abas Portaria, Bar, Produtor; dados fictícios; pagamento simulado, recibos/fichas com QR demonstrativo, impressão no navegador e painel consolidado. Não envia vendas, não imprime no SDK, não processa pagamentos reais nem modifica CT. O arquivo de demonstração está disponível no pacote ZIP gerado na conversa de kickoff.

**Não realizados:** integração PagBank, comercialização ou provisionamento de máquina, lançamento de tarifa, homologação, alterações em produção.
