# Home: destaque horizontal, publicidade e compartilhamento

Base inspecionada: `8d6ef2da57f69ed6b3e4201d090a570ac3c2c66a` (main, PR167).
Branch: `feat/home-event-rail-20261009`. Preparação para revisão, sem merge ou deploy.

## Diagnóstico

`assets/home.css` definia duas colunas para `.events-grid` e uma coluna em telas de até 600 px. O catálogo não possuía gesto, faixa horizontal ou controles de carrossel. Portanto, 15 eventos produziam uma lista vertical extensa no celular.

`assets/home-advertisements.js` já possuía um único temporizador de 5000 ms por espaço. A troca dependia de visibilidade, foco, hover e movimento reduzido. Navegação manual pausava a rotação; falha da imagem deixava Anuncie aqui. Eventos de mouse sintetizados por toque podiam manter hover. Esta fatia conserva o temporizador, distingue ponteiro de mouse, mostra estado de pausa e permite retomar pelo botão mesmo quando ele continua com foco. Não foi possível observar a configuração do aparelho do usuário; essas são causas verificáveis no código, não uma afirmação sobre seu dispositivo.

## Comportamento preparado

- A agenda pública existente é a faixa principal: mantém a ordem e todos os eventos recebidos, sem eleger destaques comerciais ou criar dados. Um card legível aparece com parte do seguinte como indicação visual; no desktop, capa e informações ficam lado a lado.
- Avanço para a esquerda a cada cinco segundos, inclusive na volta ao primeiro evento. Toque, arraste de mouse, setas, Home/End e controles explícitos. Cards originais, sem duplicar links ou reorganizar nós durante a transição. Todos contribuem para uma altura estável; a página e o foco não são deslocados pelo avanço.
- Pausa explícita, pausa com foco/interação, mouse sobre a faixa, documento oculto e faixa fora da tela. Movimento reduzido desliga avanço e animação; o controle manual permanece disponível. Depois de interação, retomar exige ação explícita. Cards inativos são `inert` e ficam fora da leitura e do Tab; posição e instruções têm traduções locais.
- Categorias mantêm os filtros existentes. Não foram adicionadas fileiras automáticas secundárias.
- Publicidade: TPSSF ↔ Anuncie aqui e Priscila ↔ Anuncie aqui, cinco segundos por troca, com setas e pausa. A posição inicial é sorteada uma única vez por espaço ao carregar a página. Nenhum identificador é persistido e nenhum evento do catálogo é reordenado. Isso varia a primeira exposição; não garante alcance igual.
- Medição de visualizações por anúncio permanece proposta pendente de definição e análise. Nenhuma telemetria ou gravação foi adicionada.
- Compartilhar site usa apenas `https://cariocaticket.com.br/`, mediante clique. Menu nativo quando suportado; copiar com feedback como alternativa; falha da área de transferência revela o endereço selecionável. Cancelamento é normal e cliques repetidos não abrem pedidos simultâneos. Aplicativos disponíveis são decisão do aparelho.

## Isolamento e complemento Parceiro

Somente home e seus assets são alterados nesta branch. `styles.css`, transporte público, checkout, evento, autenticação e financeiro permanecem intactos. A UI reutilizável de compartilhamento tem CSS restrito a `.ct-public-share`.

Há PRs abertos que também alteram `parceiro/programa/index.html` (117, 112, 110, 108 e 107). O botão da apresentação pública será entregue em um PR dependente separado, com o endereço fixo `https://cariocaticket.com.br/parceiro/programa/`. Não é link individual de indicação. Sem alteração de atribuição, comissões, vínculo ou backend.

Tema da página pública do evento, Ouvir descrição e VLibras pertencem a outro executor/fatia. Não estão implementados por este trabalho.

## Referências e acessibilidade

As referências JPEG `libfile_580881b857188191bbbcdd18ee441203` e `libfile_2b9d1f412f1481918298f8b774e3f520` foram resolvidas pela Library. A transferência oficial da primeira recebeu HTTP 403; a operação foi interrompida, sem alternativa de acesso. Nenhum dos dois arquivos foi inspecionado em pixels. A composição se baseia na descrição confirmada; não há alegação de fidelidade às imagens da Sympla.

Controles e pausa seguem as orientações do [padrão de carrossel WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/). Validação automatizada não substitui inspeção com leitor de tela ou dispositivo físico.

## Validação e prévia

Fixtures de 1, 2 e 15 eventos; 320/412/1440 px; claro/escuro; toque Chromium, mouse, teclado, loop, pausas, movimento reduzido, texto 150%, reflow equivalente a zoom 200%, armazenamento bloqueado, busca, recuperação, imagens ausentes, links e sessão sintética preservados. APIs nativas de compartilhar/copiar são simuladas; nenhum destinatário é acionado.

Todos os testes de browser usam conteúdo local/interceptado e bloqueiam chamadas não declaradas. Não usar `npm run homologar` nem o config legado para este recorte.

```powershell
npx playwright test --config=playwright.home.config.cjs
npx playwright test --config=playwright.catalog-isolated.config.cjs
npm run test:contracts
$env:CT_PREVIEW_PORT='4178'; node tests/home-preview-server.cjs
```

Prévia: `http://127.0.0.1:4178/?count=15` (também `count=1`, `count=2`, `scenario=empty`, `scenario=error`, `scenario=missing`). Somente dados sintéticos, destinos operacionais bloqueados e nenhum proxy para produção.

Os resultados finais constam nos checks do PR e no relatório entregue junto à revisão. As capturas em `screenshots/` são imagens reais do navegador usando fixtures. As artes de publicidade permanecem em seus bytes originais (aproximadamente 2,68 MB); não houve medição de Web Vitals.
