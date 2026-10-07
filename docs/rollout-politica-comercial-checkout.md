# Rollout seguro — Política Comercial no checkout

## Regra de compatibilidade

O código pode ser publicado com `CT_POLITICA_COMERCIAL_ATIVA=NAO`. Nesse estado, o checkout oficial não consulta a prévia comercial, não acrescenta taxa e mantém o fluxo legado de preço e pagamento.

O bloqueio por cotação comercial só existe quando o catálogo público informa explicitamente que a política está ativa. Com a flag desligada, `feeBusy`, `feeReady` e validade da cotação não podem impedir a criação do pagamento.

## Ordem de publicação

1. CI e homologação automática verdes.
2. Backend P0 financeiro publicado primeiro, com a política comercial ainda desligada.
3. Publicar o site mantendo a política comercial desligada.
4. Executar smoke do fluxo atual: seleção de ingresso/lote, cupom, PIX, cartão, recuperação/idempotência e emissão.
5. Auditar as políticas comerciais dos eventos que participarão do piloto.
6. Validar a matriz 0%, 5%, 7% e 10% com COMPRADOR, PRODUTOR e DIVIDIDA.
7. Confirmar que o total exibido no checkout é igual ao total autoritativo criado pelo backend.
8. Ativar a política somente mediante autorização operacional explícita.
9. Fazer canário real de baixo risco, sem cobrança artificial.

## Rollback

Em qualquer divergência de total, taxa, cupom ou latência, desligar `CT_POLITICA_COMERCIAL_ATIVA` antes de qualquer outra ação. O checkout deve voltar imediatamente ao comportamento legado sem sobrecobrança.
