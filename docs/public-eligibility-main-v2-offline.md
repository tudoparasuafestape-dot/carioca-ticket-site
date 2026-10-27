# Site: reconstrução temporal V2 sobre main, somente offline

## Estado e correção de aplicabilidade

Esta é uma revisão separada do pacote de 21/10/2026, não uma atualização silenciosa daquele arquivo. O contrato de dados continua `CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1` com `temporalVersion: 1`; V2 identifica a revisão do pacote do site, não um novo contrato.

Base fixa: `tudoparasuafestape-dot/carioca-ticket-site` em `5d3a820a63bc2f6784f2296f5b1dda8888e65dc3`. A evidência GitHub associa esse commit ao Pages run `39529262176`, artefato `12314636886`. Os bytes do artefato Pages não foram baixados nem o site servido sondado nesta reconstrução.

A versão anterior derivava de `1cefedc61514cd85b2434e75b7520a4739bc903e`, com três commits históricos que não estavam na main. Aplicar seu patch incremental diretamente à main falha em oito arquivos conflitantes e sete bases ausentes. O novo patch parte dos bytes da main e incorpora somente os deltas públicos e seus pré-requisitos. Não substitui a árvore atual pela candidata histórica nem importa mudanças históricas do painel produtor.

Materialização: 190 entradas pinadas, sendo 177 fontes de texto e 13 assets binários, incluindo todos os 131 runtimes HTML/JS/CSS/SVG/webmanifest. O manifesto registra os 518 blobs da árvore completa; os outros 328 arquivos não foram materializados. A pasta de trabalho não é árvore publicável. O patch não remove nem substitui arquivos não materializados e deve ser aplicado apenas em checkout completo da base exata.

## Escopo: nove fontes de runtime

1. `assets/public-catalog-clock.js`: novo pré-requisito, cópia exata do helper exclusivo já revisado. Limites de idade calculados desde a avaliação, não desde uma resposta tardia.
2. `assets/public-event-catalog.js`: home exige contrato, expira eventos e envelope, revalida antes de interações e controla refresh. Mantém os filtros de vitrine da PR222.
3. `assets/home-event-rail.js`: delta explícito para preservar card ativo e pausa durante atualização/expiração. Sem redesign.
4. `index.html`: adiciona helper e altera namespaces dos scripts temporais. Demonstração, seção, CSS, idiomas e demais namespaces de main preservados.
5–8. `evento/index.html`, `evento-v2/index.html`, `checkout/index.html`, `checkout-v2/index.html`: contrato, fim exclusivo, suspensão/retorno, callbacks tardios, refresh limitado e fechamento seguro da oferta. Blocos de evento encerrado da PR222 preservados.
9. `assets/checkout-translations.js`: quatro mensagens adicionais de recuperação de pedidos, mantendo todas as entradas da main.

O clock é usado com máximo de 300 s na home/detalhes; checkout normal 120 s e stale 600 s apenas com `cacheStale === true`. Contrato antigo, desconhecido, ausente ou validade inconsistente é rejeitado mesmo em URL nova. Não há fallback para memória antiga.

## Preservação e alteração semântica deliberada

- PR222: demonstração e filtros Samba/ERA mantidos; textos e compartilhamento de evento encerrado mantidos. A integração resolveu um conflito real: expiração/suspensão não pode apagar o aviso de encerramento. O `#tickets` informativo do evento já encerrado não é uma URL de checkout nem autorização de compra.
- PR225: política, seção Google, data 20/10/2026, traduções e testes/fixtures preservados byte a byte.
- PR226: `google994ee99d62e24f28.html` preservado exatamente, 53 bytes e sem newline final.
- PR223: painel de cadastro de eventos/lotes e demais fontes produtor/operacionais da main preservados. Não foi importado o formulário produtor da candidata histórica.
- Quatro transportes RPC e 24 funções de TTL, polling, recovery storage, idempotência e link seguro são conferidos contra hashes da main. Nenhum código backend, financeiro, gateway, credencial, OAuth, workflow ou Service Worker foi alterado.
- A UI pública muda intencionalmente o tratamento de tentativa com resultado desconhecido: não presume ausência de pedido nem permite nova compra/chave por troca de método ou reload. Isso não cancela pedidos nem altera pagamentos existentes. Rejeição comprovada anterior ao pedido pode revalidar com a mesma chave.
- Os dois harnesses checkout existentes não são declarados byte-idênticos: além de fixtures temporais, expectativas legadas de retry desconhecido/cupom tardio foram corrigidas explicitamente e novos casos foram adicionados. As regras financeiras/valores autoritativos continuam em adapters simulados; isto não certifica transação real.

## Reprodução permitida

Em checkout completo dessa main, aplicar apenas o patch V2 e executar, sem instalação de pacotes:

```
for zone in Etc/UTC Asia/Tokyo America/Sao_Paulo; do
  TZ="$zone" node tests/public-eligibility-main-v2-offline.cjs
done
```

Esse runner enumera somente Node, VM/fakeDOM e dados sintéticos; injeta bloqueio de rede nos processos filhos. Não executa npm lifecycle, browser, servidor, site servido, Apps Script, CacheService real ou compra. Fixtures browser/e2e afetadas foram adaptadas explicitamente, mas as suites de navegador NÃO foram executadas. O runner inclui 10 checks VM adicionais de fixtures positivas/negativas, totalizando 564 checks por fuso.

## Gates e limitações

1. O backend pareado permanece a candidata local `73832548ae58353fd0a3fccb59189a44e3936983`, derivada de backend upstream `8fffd69cd96edb907fd4c5c341ba4c964141dbeb`. Nenhuma fonte de backend foi tocada nesta revisão. Isso não prova o runtime implantado; a reconciliação completa e imutável continua pendente.
2. Não publicar o site sozinho: cliente novo rejeita backend antigo; tabs antigas não recebem o novo contrato retroativamente. Exige plano pareado de rollout e tratamento de CDN/tabs/retorno, com autorização aplicável.
3. A suite Node não comprova browser/mobile, iframe, concorrência real, cache real, montagem/hosting ou CI completo.
4. As fixtures conhecidamente incompatíveis foram reconciliadas com fontes pinadas e revisão. Positivos usam envelopes frescos por resposta; contratos ausentes/inclusivos e outros negativos não são reparados automaticamente. Previews recebem o helper local; assertions de resultado desconhecido passam a exigir recuperação sem recriação. Nos dois testes financeiros, somente import e dois ramos de catálogo público vazio foram adicionados: reversão desses acréscimos reproduz a main byte a byte. Isto não equivale a PASS browser/CI.
5. O probe mínimo about:blank, desktop e mobile, tentou iniciar Chromium 154 com Playwright local 1.62.1, proxy morto, DNS negado, offline, SW bloqueado e guard Node. Ambos abortaram antes de criar página: process_singleton_posix.cc:297, socket() failed: Operation not permitted, SIGABRT. Não houve remoção de isolamento, escalada, instalação ou execução de suites. A versão instalada difere da dependência 1.55.0 pinada; essa combinação tampouco certificaria o CI. O config padrão do repo aponta para produção: não executar aggregate/e2e por conveniência.
6. Qualquer publicação, push/PR, workflow, merge, deploy ou rollback permanece fora desta preparação. Nenhum deles foi executado.

Esta candidata é para revisão e reprodução offline. Não é um pacote pronto para produção.

## Ordem dos gates, não autorização de rollout

1. Obter e reconciliar snapshot imutável do backend realmente implantado; a referência GitHub histórica não o substitui.
2. Revisar o par backend/clientes com o mesmo contrato exclusivo, leitores de todos os formatos, preparador e namespaces separados normal/stale/evento leve. Alterar apenas o preparador não invalida leitores ou envelopes legados.
3. Montar checkout completo da base fixa com o patch, executar browser/iframe em ambiente isolado compatível e avaliar tabs antigas/CDN. Evidência de cache real pertence à autorização separada de laboratório e não certifica produção.
4. Somente após esses gates, planejar publicação pareada e obter a autorização exigida. Não publicar cliente novo contra backend antigo, nem permitir mistura de versões durante transição. Esta entrega não executa ou autoriza essa etapa.
