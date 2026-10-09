# Página pública do evento: tema e leitura da descrição

Base conferida: `8d6ef2da57f69ed6b3e4201d090a570ac3c2c66a` em `main`, em 09/10/2026. Branch isolada: `feat/event-accessibility-20261009`.

## Integração com a home publicada em 09/10/2026

A branch foi reconciliada com main `62ed8b511802ea3be97fcca3154d6ab002a8edbc` (PR179), preservando os dois commits originais do PR170. As duas páginas do evento e `assets/home-theme.js` não tinham mudanças concorrentes. A home já possui Claro/Escuro/Modo; este PR acrescenta tema compartilhado e áudio somente às páginas do evento.

A lista permitida da prévia agora inclui os três recursos locais adicionados à home: `home-event-rail.js`, `public-share.js` e `public-share.css`. Um cenário novo verifica carregamento sem falhas de scripts/CSS/imagens, ausência de erros JavaScript e sincronização de tema nas duas rotas. A suíte passa a ter 18 cenários. O workflow isolado existente também executa as configurações atuais de home e catálogo e guarda seus resultados. Triggers, permissões `contents: read`, runner, timeout e ausência de secrets permanecem iguais. Não há execução manual de workflow ou acesso ao backend.

Os resultados e capturas abaixo são históricos até a conclusão dos checks do head integrado. Capturas atualizadas ficam no artifact `event-accessibility-review` da execução correspondente. Os limites de dispositivos reais e voz humana continuam válidos.

## Implementação

- `evento/index.html` e `evento-v2/index.html` carregam o `assets/home-theme.js` existente. O seletor usa a mesma chave `ct-home-theme`, com Claro, Escuro e Automático; acompanha preferência do sistema e mudanças em outra aba. Não houve edição em `index.html`, `assets/home.css`, `assets/home-theme.js` ou no Programa Parceiro.
- `assets/event-accessibility.css` tem seletores limitados a `.ct-event`. A capa, seu recorte, gradientes da imagem e CTAs de compra continuam com os estilos originais. As superfícies de texto acompanham o tema.
- `assets/event-description-speech.js` oferece **Ouvir descrição**, **Pausar**, **Continuar descrição** e **Parar**, acima de `#longDescription`. Não há autoplay.
- Usa apenas vozes que o navegador declara locais (`localService`) e em português, preferindo pt-BR. Vozes remotas e ausência de vozes produzem orientação explícita, mantendo o texto disponível. O recurso não envia a descrição a uma API própria ou de terceiros.
- Limpa HTML em um template inerte, inclusive uma camada escapada, remove scripts/estilos/elementos ocultos e marcação Markdown comum. Lê somente a descrição, sem capa, preços, botões, links de checkout ou texto do restante da página. Divide descrições longas em trechos de até 220 caracteres.
- Os estados de leitura/pausa/retomada dependem dos eventos do sintetizador. Se início ou pausa/retomada não forem confirmados, interrompe a sessão e mostra fallback. Cancelamentos ignoram eventos atrasados. `pagehide`, `popstate` e troca da descrição encerram a leitura anterior.
- Os controles têm botões nativos, nomes visíveis, foco, alvos de ao menos 44 px, relação com a descrição e região de status. LocalStorage bloqueado não impede mudar o tema durante a visita.

Os scripts inline de renderização, compartilhamento, campanhas e destinos de compra das duas páginas foram preservados. Nenhum arquivo de checkout, pagamento, emissão, backend ou configuração financeira foi editado. Não há merge, deploy, rollback ou migração nesta entrega.

## Reproduzir a prévia e os testes

```sh
npm install --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npx playwright test --config=playwright.event-accessibility.config.cjs
node --test tests/evento-transport-runtime.cjs
node tests/contracts.mjs
node tests/eventos-privados-v1.mjs
```

Para abrir a prévia manual:

```sh
node tests/event-accessibility-preview.cjs
```

Endereço: `http://127.0.0.1:42971/evento/?evento=PREVIEW-EVENT` (ou `/evento-v2/`). A home no mesmo servidor permite revisar a preferência compartilhada.

A prévia aceita somente loopback, tem lista explícita de arquivos permitidos, recusa POST e checkout, desativa analytics/PWA e intercepta o envio de formulários com uma resposta sintética. A CSP bloqueia conexões, frames e formulários externos. A suíte acrescenta interceptação de rede. Não consulta RPC operacional, não cria compras ou ingressos e não usa dados reais. O link original de compra é preservado no DOM para comparação, mas o clique é bloqueado na prévia.

## Evidências

- Suíte isolada: 17 cenários cobrindo ambas as rotas, limpeza de texto, vozes tardias/ausentes/remotas, início e pausa que falham, chunks, eventos tardios, alteração da descrição, navegação, preferência da home, outra aba, sistema, armazenamento bloqueado, contraste dos controles, reflow e eventos sem capa.
- Regressão existente: 20 cenários de transporte/carregamento com fixtures no Chromium.
- Contratos: 41 superfícies protegidas e contrato de eventos privados aprovados.
- `screenshots/light-{320,390,768,1440}.png` e `dark-{320,390,768,1440}.png`: capturas com dados fictícios e voz simulada para tornar a interface determinística. Sem overflow horizontal nas quatro larguras. O contraste medido dos novos botões habilitados excede 4,5:1 nos dois temas.
- Revisão independente: corrigida herança da cor do nome no fallback sem imagem. `.cover-fallback` mantém o texto branco sobre seu gradiente escuro, inclusive no tema claro. A regra do logotipo foi limitada ao fallback para impedir que `.cover img` aplique a ele a altura da capa e esconda o título por recorte. As capturas `screenshots/{evento,evento-v2}-no-cover-{light,dark}-{390,1440}.png` cobrem ausência simultânea de `capaUrl` e `posterUrl`, título contido na área visível, logotipo de até 90 px e contraste calculado acima de 4,5:1 mesmo usando o limite mais claro do gradiente/overlay.
- `screenshots/*-audio-*.png` e `capture-audio.json`: estados ouvir, lendo, pausado/continuar e parado com a voz real local do Windows, em viewport 390. Capturas feitas no head `bccd69b` antes da correção exclusivamente visual do fallback; o código TTS permaneceu idêntico.
- [`native-speech-audit.json`](native-speech-audit.json): auditoria **sem mock de voz**, em Windows, Chromium 140.0.7339.16 e Edge 154.0.4258.62, headless. Ambos expuseram Microsoft Daniel/Maria pt-BR locais e confirmaram estados de início, pausa, retomada e parada. Após navegação: `speaking=false`, `paused=false`, `pending=false`.
- O workflow `event-accessibility-isolated.yml` executa somente a suíte de fixtures; a prova externa de Libras é manual e não é executada pelo CI.

## Limites de validação

Não houve escuta humana do áudio, teste com leitor de tela, iPhone, Android, Safari físico ou validação linguística da pronúncia. Emulação de largura não prova suporte nesses aparelhos. Vozes locais variam por navegador/sistema e podem precisar ser instaladas pelo usuário; se indisponíveis, o recurso permanece em fallback. A limpeza cobre HTML e Markdown comum, sem tentar ser um interpretador universal de todas as marcações. Estes são limites para a revisão do draft, sem promessa de suporte móvel real.

## Libras: prova separada e diagnóstico

A integração de produção **não foi adicionada**. Existe uma prova manual e reproduzível em `tests/event-accessibility/vlibras-proof.cjs` e auditoria opt-in em `audit-vlibras.cjs`. Elas não são carregadas por nenhuma página do produto.

```sh
node tests/event-accessibility/vlibras-proof.cjs
# abrir http://127.0.0.1:42972/
# auditoria com serviços externos e SOMENTE a frase sintética da prova:
node tests/event-accessibility/audit-vlibras.cjs
```

A prova carrega o script oficial apenas após **Ativar prova de Libras**. O script fica num iframe de outra origem local (`42973`), com sandbox, sem formulários, sem navegação do topo, sem dados privados e sem acesso ao DOM/storage da página externa. O botão de compra demonstrativo permanece fora do iframe e acima dele. Fechar remove o frame. Isso demonstra uma estratégia de isolamento, mas exige adaptação para traduzir somente conteúdo público selecionado numa futura integração.

### Resultado observado

- Fonte oficial de integração: [manual do widget](https://vlibras.gov.br/doc/widget/installation/webpageintegration.html) e [aplicação](https://vlibras.gov.br/app/), consultadas em 09/10/2026. O bootstrap atual inicia o botão automaticamente e carrega o módulo maior quando aberto; não é necessário duplicar inicialização. A prova configura o lado esquerdo.
- [`vlibras-audit.json`](vlibras-audit.json): zero solicitações externas antes do clique, 6 solicitações para o botão inicial e 69 após abri-lo, incluindo redirecionamentos. Os hosts observados foram `vlibras.gov.br` e `cdn.jsdelivr.net`. Sem POST de tradução nessa rodada; nenhum conteúdo privado foi enviado.
- Os cabeçalhos de tamanho somam **20.718.847 bytes para URLs distintas** e **40.868.493 bytes contando repetições**. São tamanhos declarados, não medida exata dos bytes efetivamente transferidos nem benchmark universal. Os maiores recursos são dados Unity (~17 MB) e WebAssembly (~3 MB).
- O avatar ainda estava na tela de carregamento após a janela de observação de 20 segundos e fez uma tentativa `retry=1`. O widget abriu sem erros JavaScript na segunda rodada, mas **não foi confirmada tradução animada completa**. Ver [`screenshots/libras-proof-390.png`](screenshots/libras-proof-390.png). Não se afirma que a prova entregou interpretação funcional.
- A primeira tentativa revelou que não são só fontes que redirecionam ao jsDelivr: scripts e recursos Unity também. A CSP da prova foi ajustada somente ali. O [manual CSP](https://vlibras.gov.br/doc/widget/installation/content-security-policy.html) não basta, por si só, para descrever toda a carga observada.

### Dados externos e telemetria: inspeção do código entregue

O módulo `https://vlibras.gov.br/app/vlibras-initial-CMx6VRWn.js`, observado no bootstrap v7.12.2 e baixado para inspeção, tem SHA-256 `8B5363432F0DCF1D7C12D12632C2483734D02D7AAAB94ACC8161DADB981B73E8`. O bootstrap tem SHA-256 `267BA6E2B10110CDD5BFB2D6BD4AD35398707D24222FD02D83C121509182E6F7`.

- A função de tradução faz POST JSON com campo `text` para `https://traducao2.vlibras.gov.br/translate`. Dicionários e sinais usam subdomínios de VLibras, incluindo `dicionario2.vlibras.gov.br` e `repositorio.vlibras.gov.br`. Isso é inspeção estática; não houve POST de tradução observado nesta prova.
- O código contém importação de `posthog-js` pelo jsDelivr e destino `https://us.i.posthog.com`. Exclui localhost/loopback da inicialização da telemetria. Fora desses ambientes, contém evento de inicialização amostrado em 7%, com hostname e origem+caminho; outros eventos verificam um estado de consentimento. A sessão local sem PostHog **não prova ausência de telemetria numa instalação pública**. Não enviei requisições ao PostHog e não tentei desativar essa proteção para simular produção.
- O [aviso de privacidade](https://www.vlibras.gov.br/privacy.html), atualizado em 27/08/2026, declara descarte do material enviado para tradução e ausência de coleta de dados pessoais/rastreamento publicitário. A presença de telemetria no módulo precisa ser esclarecida e validada antes de qualquer integração pública; as declarações do portal não substituem esta auditoria técnica.

### Licença e decisão de escopo

O [repositório do widget](https://github.com/spbgovbr-vlibras/vlibras-web-browsers) e seu [LICENSE](https://github.com/spbgovbr-vlibras/vlibras-web-browsers/blob/master/LICENSE) declaram LGPLv3. Essa é a licença do código e não uma proibição geral de utilização comercial. Uma questão separada aparece nos [Termos de Uso oficiais](https://www.vlibras.gov.br/privacy.html), seção “Restrições de Uso”, atualizados em 27/08/2026: a cláusula referente à marca, aos avatares ou ao serviço para fins comerciais/publicitários diz que o uso “depende de autorização prévia e expressa dos responsáveis pelo projeto”. A fonte está identificada; não concluímos que acessibilidade em qualquer site comercial esteja proibida. A aplicação exata dessa cláusula ao serviço hospedado neste portal precisa ser esclarecida. Não houve aceite de novos termos nem contato com o fornecedor.

O [portal oficial](https://www.gov.br/governodigital/pt-br/acessibilidade-e-usuario/vlibras) também explica que tradução automática não substitui intérprete humano. Não foi contratado Hand Talk, criada credencial, contatado fornecedor ou alterado ambiente de produção.

**Próxima etapa de Libras, separada deste draft:** resolver os termos aplicáveis, medir inicialização/uso de memória em aparelhos reais, concluir tradução de frases públicas com validação por pessoa fluente em Libras, definir consentimento e limites de dados/telemetria, e validar posição do painel com a compra móvel. A avaliação e a prova foram realizadas; a integração fica separada porque esses pontos excedem a simples inclusão do script.
