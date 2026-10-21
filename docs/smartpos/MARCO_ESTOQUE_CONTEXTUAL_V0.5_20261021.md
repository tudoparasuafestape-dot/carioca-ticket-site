# Carioca Ticket SmartPOS — Marco V0.5: estoque contextual (2026-10-21)

**Natureza:** laboratório isolado. Sem merge, deploy, dados reais da CT, PagBank, nem movimentações financeiras.

## Requisito obrigatório do produtor
Saldo abaixo de 25% NÃO implica comprar mais. O alerta deve considerar simultaneamente:
- saldo físico disponível e reservas de pedidos ainda não conciliados;
- vendas **confirmadas**, com timestamps, agregadas entre todas as maquininhas;
- ritmo recente por item: janelas de 15 e 30 minutos, com indicador de amostra insuficiente;
- minutos reais até o encerramento do evento, a partir do cadastro oficial (e extensão auditável);
- prazo de entrega do fornecedor, unidade/múltiplos de embalagem, compra mínima, preço de aquisição, frete, margem e produto substituto;
- previsão de consumo até o fim, tempo até a possível ruptura e risco de sobra após encerramento.

## Regras
1. Se faltarem dados de encerramento ou velocidade, informar **dados insuficientes**, nunca sugerir compra automaticamente.
2. Se o saldo cobrir previsão + margem, recomendar **acompanhar e não repor** mesmo com baixo % do inicial.
3. Se possível falta e prazo de entrega >= tempo até encerramento, recomendar **não comprar; avaliar alternativa**.
4. Se houver risco de falta e chegada em tempo, realizar avaliação de rentabilidade do lote mínimo e da demanda **após** a entrega; não executar compras automaticamente.
5. Notificações devem ser contextualizadas, agrupadas para evitar spam, revisadas após venda, reposição, extensão ou mudança relevante de ritmo.
6. Fichas/ingressos devem exibir o nome do evento cadastrado e marca oficial, inclusive na impressão.

## Exemplo auditável de simulação
Heineken: inicial 120, vendidas 89, disponíveis 31, ritmo **hipotético** de 48 un./hora.
- Com 30 min restantes: previsão 24; com margem 10% arredondada 3, estoque 31 é suficiente. **Não repor**; fim antes da ruptura estimada (~38,8 min).
- Com 90 min restantes: previsão 72; falta 41 antes da margem, avaliar aproximadamente 49 com margem; caixa de 12 => avaliação de 60 unidades, condicionada à compra mínima e economia real.
- Se entrega ocorrer depois do encerramento, não recomendar reposição.

## Implementação de prova de conceito produzida nesta conversa
- Motor puro JavaScript `inventory-intelligence.js` com 11 testes automatizados aprovados.
- Demo offline `CT_SmartPOS_V05_Estoque_Inteligente.html`, usando a identidade ORIGINAL do Drive, integrada visualmente ao simulador de portaria/bar/caixa V0.4: saldo dos itens atualizado pelas vendas fictícias confirmadas e simulador de decisão editável no **painel web do produtor**.
- Ficha demonstrativa inclui nome do evento; testes de navegador desktop e mobile aprovaram os cenários 30/90 minutos, impressão e atualização de saldo de 180 para 179 após uma venda aprovada.
- Arquivos de laboratório apenas no ZIP entregue na conversa `Carioca_Ticket_SmartPOS_V0.5_Estoque_Contextual.zip`; **este commit registra a especificação, não hospeda o simulador**.

## Próximo gate técnico
Adaptador na homologação da CT para eventos, horário de encerramento, BarCore, estoque multi-terminal, timestamps de pagamentos confirmados, reserva de saldo pendente e ledger de reposições/avarias; recomendações calculadas no servidor e expostas no portal e na consulta gerencial autorizada pela maquininha.

**Nenhuma compra automática, cobrança, alteração de estoque real, integração fiscal ou publicação em produção.**
