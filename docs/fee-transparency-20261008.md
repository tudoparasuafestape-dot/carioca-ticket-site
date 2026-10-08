# Transparência de preço e taxa — rascunho, sem publicação

Base do site: `a7626dbbe084a58ff029edef83497c36a7691767` (PR 159).
Base do backend examinada: `33cfb71` (produção informada: 385).
Não foram encontrados `AGENTS.md` ou `.agents/skills` nas duas cópias clonadas nem nos diretórios pais consultados. As referências de imagem da Library foram solicitadas pelo fluxo oficial; a transferência devolveu 403. Nenhum pixel dessas referências foi usado.

## Superfícies e fontes

| Superfície | Comportamento / fonte |
| --- | --- |
| Catálogo inicial `/` | Não exibe preço; sem consulta adicional e sem alteração de elegibilidade. Se passar a mostrar preço, deverá usar composição completa, nunca `menorPreco` nominal. |
| `/evento/`, `/evento-v2/` | Uma leitura de ofertas por evento; total, ingresso, taxa e encargos visíveis em cada oferta. Menor total somente quando todas as ofertas disponíveis têm composição confirmada. Oferta esgotada ou com menos acessos que o pacote não entra. |
| Seleção nos dois checkouts | O seletor identifica o lote; a composição aparece após selecionar, incluindo quantidade de pacotes e acessos. Campo ausente, resposta degradada ou pendente não vira taxa zero. |
| `/checkout/` ERA | Mantém `CTCheckoutCommercialPolicy.validQuote`, revisão, validade de 30 s, idempotência e payload existentes. Só muda apresentação. Cupom usa o subtotal validado e a cotação existente. |
| `/checkout/` outros eventos / gratuidade; V2 com política inativa | Leitura separada para apresentação, sem preencher revisão nem alterar autorização de pagamento. Somente ausência de cobrança confirmada pelo servidor pode ser combinada com subtotal do cupom já validado para a mesma quantidade. |
| `/checkout-v2/` com política ativa | Cotação existente fornece os valores; apresentação valida campos e conservação do total, sem impor 10%. O refresco visual acompanha aplicação de cupom. Não muda payload ou cálculo. |
| Pagamento, recuperação e conclusão | Composição do snapshot `financeiro` congelado. Encargos do comprador são extraídos das comissões explícitas do snapshot; sem recalcular política. Mantém snapshot ao atualizar o mesmo pedido sem novos campos financeiros. |

`fee-transparency.js` não acessa rede, armazenamento ou histórico. O diálogo nativo contém foco, fecha com Escape/Fechar, devolve foco ao botão e não modifica seleção, cupom, reserva ou pedido. Voltar continua sendo navegação normal, sem adicionar entradas de histórico. O texto é o aprovado pelo revisor; não atribui a taxa a bancos, segurança ou suporte.

## Dependência e bloqueios de publicação

**Este rascunho não é um rollout comercial e não está pronto para publicação independente.** Depende da revisão e disponibilização autorizada de `ctPrecoPublicoLeituraPROD`, preparada no [PR backend 278](https://github.com/tudoparasuafestape-dot/carioca-ticket/pull/278). O frontend falha visualmente com “Total a confirmar” se essa leitura não estiver disponível.

O preview antigo recebe o preço unitário do cliente. O endpoint novo busca o catálogo autorizado e reutiliza o motor existente. Não recebe taxa, preço ou total do cliente; faz no máximo 100 projeções e uma carga de catálogo por chamada, com debounce de 180 ms na seleção. A abertura do diálogo não faz consultas. A carga adicional em cache miss ainda precisa ser medida em ambiente autorizado, antes de publicar; nenhum benchmark foi feito em produção.

A leitura agora resolve a política efetiva dos eventos não-ERA também fora do grace. A política explícita de 0% da Roda pode confirmar ausência de taxa; grace expirado não impede essa consulta. O backend de leitura rejeita preço bruto ausente/inválido, catálogo stale/degradado e não instala abas. Cache tem identidade separada e conserva a data original. Uma falha de cache do motor só admite zero quando a política vigente do índice confirma explicitamente ausência de cobrança.

Há uma incompatibilidade operacional preexistente: o checkout oficial não-ERA não envia revisão comercial, enquanto o backend exige revisão com política global ativa fora do grace. A política zero não isenta essa exigência. Em 08/10 o preview público da Roda confirmou rollout ativo/revisão 6 e fallback degradado; a auditoria registra ativação em 07/10 e não foram encontrados pedidos Roda posteriores. O valor atual do grace não foi obtido (API administrativa negou acesso). Não se pode afirmar que a venda atual esteja preservada ou funcionando. Resolver/verificar essa dependência exige trabalho operacional separado, sem ampliar taxas.

O V2 conserva seus gates transacionais existentes: este PR não endurece a aceitação de cotação do pagamento. Uma resposta malformada/degradada fica com valores explicitamente a confirmar e mantém o link explicativo visível; eventual revisão do bloqueio de pagamento é trabalho separado. Permanece bloqueador de publicação: fora do ERA, uma falha da leitura não adiciona bloqueio transacional neste escopo e ainda pode permitir tentativa sem composição. A validação genérica só deve ser definida depois de verificar a compatibilidade da operação ativa; este PR não está concluído para publicação.

Não há alteração em preço comercial, estoque, criação de pedido, provedor, cobrança, emissão, meia-entrada, cancelamento ou reembolso. Nenhum merge, deploy ou cobrança real integra esta entrega.

## Verificação local e CI

- `node tests/fee-transparency.runtime.js`: campos ausentes, composição, snapshot, encargos fixos e ausência de efeitos no diálogo.
- `node tests/fee-transparency.browser.js`: páginas reais com todas as requisições simuladas; 320/360/390/1365 px, Individual, Casadinha, taxa absorvida/fixa, gratuidade, cupom, atraso, teclado, foco, Escape, repetição, Voltar, snapshot e recuperação.
- `node tests/checkout-era-beauty.dom.js`: 73 regressões do checkout real com mocks.
- `node tests/checkout-era-beauty.browser.js`: 21 cenários; payload e guard ERA preservados, rede simulada.
- Testes existentes de contratos e jornadas públicas locais foram adaptados ao novo contrato de leitura, sem remover verificações de pagamento.
- A workflow de readiness roda os testes e guarda screenshots como artefato do commit testado.

Referência de escopo: [Decreto 13.108, artigos 6 e 7](https://planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13108.htm). O produto aplica o padrão solicitado a todos os eventos; esta alteração não implementa outras disposições do decreto nem afirma que sua incidência específica inclui eventos esportivos.
