# Home V1 — revisão consolidada

Branch: `fix/home-mode-menu-20261009`  
Base: `bb9f00564d11389aba069604f9fffe56f7f98de4` (PR164 já publicado anteriormente).  
Preview local: http://127.0.0.1:4176  
Esta branch não foi mesclada nem publicada em produção.

## O que revisar

- Cabeçalho fixo compacto, local ao lado da marca, Explorar eventos, Meus ingressos, Entrar e Crie seu evento nos destinos existentes.
- Modo acompanha o sistema; Claro/Escuro são escolhas imediatas e persistentes. Falhas de armazenamento não bloqueiam o uso.
- Menu mobile em grafite, hierarquia de grupos, ícones, estados de foco/seleção e rolagem interna em telas baixas.
- Dourado mais vivo em botões/detalhes; texto dourado mais escuro no tema claro para contraste. Cantos e gradientes discretos, sem imagens de fundo ou animação.
- Interface em português, inglês dos EUA, espanhol e proposta de chinês simplificado (`zh-Hans`). Nomes, descrições e fatos do produtor não são traduzidos. Confirmar essa variante chinesa antes de produção.
- A−/A+ no desktop; idioma e tamanho na área de acessibilidade. Faixa de texto de 100% a 150%, com restauração do padrão.
- Local manual com UF e busca na lista oficial do IBGE, incluindo cidades do interior. O texto digitado precisa ser selecionado na lista. Todos os lugares e filtro apenas por UF também funcionam.
- Filtros recolhíveis Todos/Esta semana/Fim de semana, com intervalo de datas concreto; categorias provenientes do catálogo, sem métricas inventadas. Resultados vazios mantêm os filtros e oferecem limpeza.
- Seções de produtor, pagamento, FAQ e rodapé; emissão do ingresso somente após confirmação do pagamento e texto de privacidade do cartão preservados.
- Anuncie aqui com WhatsApp comercial confirmado pelo proprietário: `https://wa.me/5581999311509`, mensagem preenchida sem envio automático. Etiqueta Publicidade permanente no canto inferior esquerdo.

## Publicidade e materialização pendente

A estrutura reutilizável comporta duas peças por espaço, intervalo de 5 segundos, setas e pausa. Pausa quando há foco, ponteiro sobre o espaço, documento oculto ou espaço fora da tela; inicia pausada com movimento reduzido. A etiqueta Publicidade fica fora das peças. O segundo espaço fica depois de pagamento e antes do FAQ, mas permanece oculto enquanto não houver arte completa.

As duas artes aprovadas foram resolvidas na Library, porém a transferência oficial retornou HTTP 403. Nenhum byte de imagem foi materializado ou inspecionado neste executor. Não houve substituição nem contorno do bloqueio. Os arrays de campanhas permanecem vazios, portanto nenhum banner incompleto ou controle de alternância aparece como recurso pronto.

| Peça aprovada | Referência Library | Destino confirmado | Estado |
| --- | --- | --- | --- |
| Tudo Para Sua Festa | `libfile_b317775e1818819193e73a9a7b62e6ef` — `Tudo-Para-Sua-Festa-banner-institucional-proposta.png` | `https://www.instagram.com/tudoparasuafestape/` | Aguardando transferência legível e inspeção |
| Priscila Ferreira | `libfile_8eacd0eda7d481919a13296b376dce4c` — `priscila-ferreira-banner-home.png` | `https://wa.me/5581996200696` — “Clique aqui e faça seu agendamento” | Aguardando transferência legível e inspeção |

O PDF de referência inicial também não pôde ser materializado. A composição segue o checklist textual posteriormente consolidado pelo proprietário; não há alegação de leitura visual do PDF bloqueado.

## Limites preservados

- `styles.css`, evento, checkout, autenticação, produtor, parceiro, central e backend não foram editados. PR160 e o trabalho concorrente do PR165 não foram incorporados.
- O trecho do adaptador POST/iframe de `public-event-catalog.js` permanece idêntico à base: somente `ctEventosPublicosListarPROD`, mesmos argumentos e validações de resposta/origem/timeout.
- Não há alteração de preço, elegibilidade de evento, privacidade ou URL de compra. Dados ausentes continuam explícitos, sem preenchimento inventado.
- A seleção grava apenas preferência local. Não usa geolocalização, geocoder, API de tradução, Libras, serviço contratado ou pedido de permissão de localização.
- A lista IBGE é carregada sob demanda (ou para revalidar preferência salva), com 5.571 municípios e cerca de 179 KB sem compressão. Proveniência em `municipalities-source.json`.
- Cadastros legados não são migrados: somente correspondência inequívoca de UF e nome oficial normalizado. Nome original e ID do evento permanecem intactos. Padronização de cadastro por código IBGE é etapa separada.
- Não há “mais comprados”, destaques fictícios, carrossel com eventos repetidos ou painéis do produtor apresentados como captura real. Categorias usam somente os metadados recebidos.
- Áudio da descrição do evento permanece uma fatia separada: proposta viável de TTS explícito Ouvir/Pausar/Parar, dependente das vozes do dispositivo, sem autoplay. Libras permanece em avaliação separada.

## Segurança do preview

`tests/home-preview-server.cjs` serve exclusivamente a home, arquivos locais permitidos e catálogo sintético. A CSP restringe rede, formulários e frames à própria origem. Analytics/PWA ficam desativados; links de saída são substituídos por uma página de bloqueio. Escritas e rotas de checkout, login e portais são recusadas. Não há proxy para produção.

```powershell
$env:CT_PREVIEW_PORT='4176'
node tests/home-preview-server.cjs
```

Cenários: `/?scenario=empty`, `/?scenario=error`, `/?scenario=missing`.

## Verificação

Executar somente as configurações isoladas abaixo. Não usar `npm run homologar` sem revisar o destino, pois o padrão do projeto é produção.

```text
npx playwright test --config=playwright.home.config.cjs
npx playwright test --config=playwright.catalog-isolated.config.cjs
```

O primeiro conjunto cobre temas, teclado/foco, largura 320/412/768/1440, reflow equivalente a zoom 200%, CSS zoom adicional, texto 150%, quatro idiomas, preferências indisponíveis/inválidas, local oficial e recuperação, períodos/categorias, catálogo vazio/erro/retry, imagens ausentes, preservação dos links/transportes, ausência de JavaScript e falha de módulo opcional. A alternância publicitária é verificada com arte sintética, sem usar as peças bloqueadas.

O segundo exercita os 20 testes existentes do catálogo público em desktop e mobile com interceptação integral. Os scripts de contratos protegem 41 superfícies, 67 páginas e as jornadas comerciais/operacionais. Não há comando de lint configurado no projeto; os scripts alterados passam por `node --check` e `git diff --check`.

### Revisão de idiomas do PR167

A revisão acrescenta tradução do título da página, nomes acessíveis da navegação e rótulo de conta no rodapé, além de atualizar nomes e estados dos espaços publicitários mesmo quando são montados depois da escolha do idioma. As opções de idioma mantêm seus nomes nativos; marca, endereços, contatos e dados dos produtores permanecem intactos.

O catálogo legado não declara idioma por evento. O frontend preserva a declaração editorial da página de origem (`pt-BR`) como fallback explícito nos títulos, categorias, descrições, datas/horários e locais originais, usando `lang` e `translate="no"`. **Isso não é detecção de idioma:** textos futuros em outros idiomas exigem metadado editorial próprio, fora desta alteração. Os nomes acessíveis de compra/capa referenciam separadamente a ação traduzida e o título original; mensagens sobre dados ausentes continuam no idioma da interface. Essa marcação segue a [semântica de idioma e tradução do HTML](https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes); a pronúncia final ainda depende da combinação navegador/leitor de tela.

Dez novos testes verificam paridade dos dicionários e dos marcadores de interpolação, textos visíveis sem tradução declarada, atributos ARIA/placeholder, menus abertos/fechados, estados dinâmicos e mensagens de erro/vazio/dados ausentes nos quatro idiomas. Um teste remove intencionalmente uma tradução e confirma fallback em português com `lang="pt-BR"`. Capturas do rodapé por idioma complementam as do menu.

Resultados finais e contagens em `validation.json`. Capturas reais do Chromium em `screenshots/`; arquivos `before-*` documentam a base e `after-*` a composição final. Outras capturas registram idiomas, erro, dados ausentes, reflow, fontes e menu. As imagens contêm somente eventos sintéticos.

Limites da validação: Chromium automatizado. Não executado em aparelhos Android/iPhone reais, Safari físico ou leitor de tela humano. Nenhuma compra, cobrança, pedido, ingresso, código de login ou check-in real foi criado.

## Ponto de parada

Revisar o conjunto no preview e nas capturas. Resolver o acesso às duas artes e validar os banners completos antes de aprovar essa parte. Não há autorização nesta entrega para merge, deploy ou rollback.
