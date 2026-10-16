# Modelo de evento e vitrine pública

`/demonstracao/roda-de-samba/` é uma página estática para apresentar a Carioca
Ticket. A home aponta para ela em uma seção própria, fora do catálogo, da busca,
das categorias, do carrossel e da contagem de eventos ativos.

## Conteúdo e limites

- “DEMONSTRAÇÃO” no acesso da home, página, título e metadados. A página é `noindex`.
- Identidade da Roda de Samba Estilo Carioca, com arte local identificada como
  referência de uma edição passada. Sem data futura, atrações ou disponibilidade
  anunciadas; sem preços, compra, cadastro ou emissão de ingressos.
- Informações, endereço de exemplo e ilustração de mapa sem escala. O local real
  Vevets Recepções é explicitamente uma referência; a página não anuncia evento ali.
- Waze, Google Maps e Uber são links externos, acionados pelo visitante. O destino do
  Samba existente em `event-ride-destinations.js` fundamenta os valores usados,
  sem reutilizar o ID real ou carregar esse registro no modelo.
- Um mapa externo pode ser carregado após clique e aviso sobre dados recebidos
  pelo Google. Pode ser ocultado; não há geolocalização. A ilustração e os links
  permanecem disponíveis se o iframe falhar. O endpoint é o legado já usado pelo
  site; os testes não atestam seu funcionamento real ou precisão do destino.

O modelo carrega apenas `demo-event.js`, `demo-event.css` e imagens locais.
Não há RPC, scripts operacionais, analytics, PWA, sessão, armazenamento de dados,
formulários ou leitura de query/hash para selecionar evento. A CSP bloqueia
conexões do documento e envio de formulários. O conteúdo funciona sem JavaScript;
cópia de endereço e o iframe opcional são melhorias locais.

O botão Uber usa um link estático `https://m.uber.com/looking` com `drop[0]`
contendo latitude, longitude, `addressLine1` e `addressLine2`. O destino público
é o mesmo do registro aprovado já existente no projeto; não é uma nova verificação
da entrada do local. Não há origem, `pickup=my_location`, produto, pagamento,
credenciais, ID de evento ou dados do visitante no link. A origem deve ser escolhida
e o destino conferido no Uber. Nenhuma corrida é solicitada pelo modelo.

Formato conferido em 16/10/2026 na
[documentação oficial de deep links da Uber](https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction).
A documentação foi acessada pelo link do blog oficial após falhas no acesso direto.
A abertura efetiva pode depender do aplicativo, conta, dispositivo e navegador;
não foi testada em aplicativo real. Não foram feitos login, pedido de corrida,
compartilhamento de localização atual ou teste de pagamento.

## Exceções visuais do catálogo

Somente estes IDs são removidos da apresentação, antes de cartões e categorias:

- `EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD`
- `EVT-23112026-ERA-BEAUTY-EAC4B673`

A exceção é por ID exato, não por data, nome ou categoria. Os dados do backend,
gate, links diretos, pagamentos, consulta/retomada de pedidos e ingressos ficam
intactos. Ocultar da vitrine **não bloqueia vendas por links diretos** e não
implementa uma política temporal geral.

Os convites antigos do Samba (portaria/R$30 e compra) foram substituídos por
“Evento encerrado” em `/roda-de-samba/` e na apresentação de `/evento/` e
`/evento-v2/` para o ID exato. A mensagem compartilhada de `advance-sales.js`
também mudou; a função `closed` e as regras de checkout permanecem iguais.
Os dois checkouts só receberam a versão desse asset, o título textual dos
avisos e a descrição neutra do Samba encerrado, sem mudar condições ou ações. Consulta, recuperação, retomada com chave salva e ingressos existentes
são preservados. O ERA operacional não foi alterado. Textos recebidos do backend
não foram gravados: a apresentação do Samba usa uma descrição histórica neutra.
A demonstração não contém oferta de portaria/R$30 e seus convites são para
explorar informações e um trajeto de exemplo, sem venda.

Limite de prévias: `/evento/` tem descrições de metadados estáticas e genéricas
com convite de compra para todos os IDs. Bots que não executam JavaScript podem
mostrar esse texto ao receber um link direto do Samba. `/evento-v2/` tem título
genérico, sem esses metadados de descrição. O alias `/roda-de-samba/` tem título
e descrições de encerramento. Uma solução de metadados por evento exige decisão
separada; não trocar o texto global dos demais eventos por “Evento encerrado”.

## Validação exclusivamente offline

```sh
node tests/demo-event-isolated.cjs
npx playwright test --config=playwright.catalog-isolated.config.cjs
node tests/advance-sales-closure.browser.cjs
node tests/catalog-performance-isolated.cjs
```

As suítes usam perfis efêmeros, `offline`, service workers bloqueados e arquivos/
respostas locais. O modelo tem testes de parâmetros de URL, ausência de compra/
RPC/armazenamento/geolocalização, conteúdo sem JavaScript, 320/390/1440 px, cópia e
mapa opt-in. O link do Uber é decodificado e comparado com o destino público;
parâmetros maliciosos da URL do modelo não o alteram. Foco por teclado, ativação
interceptada sem navegação externa, área de toque e ausência de estouro horizontal
também são conferidos. Capturas da seção de rotas complementam as páginas completas.
Não abrir o site de produção para esses testes. Capturas ficam em
`test-results/demonstration/`; relatórios em suas pastas de `test-results/`.

O workflow `event-demo-isolated.yml` foi preparado para PRs futuros com permissões
de leitura. Não contém deploy, schedule ou workflow_dispatch. Preparar esse
arquivo não executa Actions. Publicação, PR, merge e deploy exigem aprovação
posterior, vinculada ao diff/commit revisado e ao efeito da hospedagem.
