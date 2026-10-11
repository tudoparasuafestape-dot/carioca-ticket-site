# Aviso de encerramento de antecipados — Samba 11/10

Preparado para revisão em draft, sem merge ou deploy.
Base: `3c4dd276c8ea56347777d1b9046fadb7b776d654`.
Evento único: `EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD`.

O catálogo mantém o evento e troca a compra por acesso às informações. As duas
páginas de evento e de checkout mostram:

> Vendas antecipadas encerradas. Ingressos disponíveis na portaria por R$30.

As CTAs do samba apontam para o aviso na seção de ingressos; mapa, Uber, Waze,
compartilhamento, conteúdo público e acesso a ingressos existentes continuam.
O preço de portaria não altera o preço de lote ou o total de pedidos anteriores.
A rota `/roda-de-samba/` e os metadados de compartilhamento recebem o aviso.

O checkout novo esconde o formulário e não cria chave nem faz RPC de pagamento.
Recuperação com pedido/token, atualização de pagamento e ingressos concluídos
continuam. Uma chave previamente salva pode representar resposta perdida de
pedido já persistido: o formulário permite repetir a mesma chave e dados, sem
gerar outra chave. Só o backend decide se o pedido existe; uma chave inventada
não autoriza pedido novo. Pedidos expirados/cancelados não oferecem nova compra.
ERA BEAUTY conserva cotação, formulário e fluxo de compra.

## Evidências

```text
node tests/advance-sales-closure.browser.cjs                28 casos PASS
node tests/checkout-language.dom.cjs                       98 casos PASS
node tests/event-directions-contract.cjs                   40 casos PASS
node tests/event-uber-contract.cjs                         PASS
node tests/event-map-contract.cjs                          PASS
node tests/contracts.mjs                                   PASS
node tests/journey-contracts.mjs                            PASS
node tests/full-surface-audit.mjs                           PASS
playwright public-journey.spec.js / canary config           6 casos PASS
```

O teste novo usa o HTML/assets reais com Chromium offline, proxy inacessível,
service workers bloqueados e interceptação que só responde fixtures ou aborta.
Relatório: **zero requisições encaminhadas**. Nenhuma cobrança, ingresso,
autenticação, localização de visitante ou chamada de produção é realizada.
O mapa é fixture local; os destinos de Uber/Waze são conferidos sem navegação.

Cobre catálogo com ambos os eventos, desktop/mobile, ambas as versões de evento
e checkout, manutenção do aviso ao trocar idioma, mapa/rotas, criação do ERA
simulada, recuperação PIX/cartão, retry de resposta perdida e pedidos concluídos,
expirados e cancelados. Testes genéricos de jornada usam ID sintético para não
presumir indefinidamente que o samba específico esteja aberto.

O workflow `Advance sales closure (offline browser)` reproduz os testes e guarda
capturas e `report.json` no artefato `advance-sales-offline-evidence`.

Limitação Windows: os 67 grupos funcionais do contrato Waze passaram, mas a
asserção final de bytes do SVG falhou devido ao checkout CRLF. Normalizar CRLF
para LF produz exatamente o hash esperado `817b77a1d7df3aa57776c18e8f3ba8ee20a298e5ed884395c8c3638b12916c7f`.
O SVG não foi alterado. Os testes de navegador verificaram os links preservados.

## Dependência de publicação

Revisar junto ao PR backend na mesma branch. A proteção autoritativa fica em
`ctCheckoutPixPublicoIniciarPROD`; a UI isolada não garante encerramento contra
abas antigas. Esta entrega não é uma afirmação de encerramento já publicado.
Não altera gate, lotes, emissão, check-in, Caixa Pix ou o outro evento.

## Correções do CI após revisão

A fixture de acessibilidade passou a servir exatamente `/assets/advance-sales.js`;
a verificação de recursos HTTP continua exigindo zero erros, e a prévia continua
negando escritas, checkout e destinos externos.

O caso `checkout-v2-es-320` de idioma foi reproduzido com atraso sintético de
2 segundos na resposta de pagamento. O teste contava o pedido enviado antes de
a resposta chegar e avançava o relógio antes de o polling existir. Agora a
resposta fica explicitamente retida, o teste verifica que o painel pendente
ainda não apareceu, libera a resposta e espera esse painel antes de trocar
idiomas e avançar os mesmos 16 segundos. O mesmo atraso passa com a correção.
Um controle negativo que desativa `startPolling` apenas no HTML da fixture
continua falhando em `pending polling still active`. O código de produção do
polling não foi alterado e nenhuma asserção funcional foi removida.

Os consumidores da fixture de venda aberta importam seu ID sintético comum,
inclusive canários, comprador, cupom e P0 pós-pagamento. Os testes específicos
de encerramento continuam usando o ID real do samba; check-in e operação
existente também preservam suas fixtures do samba. O fallback de capa verifica
explicitamente o aviso sem compra no samba e a compra disponível do ERA BEAUTY.

O comparador estático publicado inclui agora o helper de encerramento, o
catálogo e `/roda-de-samba/`. Ele faz somente GET de arquivos, compara hashes,
não executa JavaScript, não segue redirecionamentos e não faz RPC. Sua execução
contra produção fica para a publicação autorizada, respeitando as restrições
de acesso do ambiente.
