# Canários isolados e smoke estático — proposta implementada na branch

Base: `bb9f00564d11389aba069604f9fffe56f7f98de4`. O produto não foi alterado. Esta branch prepara código de testes e workflow; não ativa configuração, agenda, ruleset, deploy ou merge. PR165 não está incluído e continua aguardando revisão do caminho seguro.

## Cobertura e diferença explícita

| Casos anteriores por viewport | Destino preparado | Limite |
| --- | --- | --- |
| 208 fachadas em 24 specs | Mocks existentes + fallback fechado, offline e proxy indisponível | Testa interface/contratos simulados; não integra Apps Script |
| 7 jornadas públicas/parceiro | Fixtures locais, mesmas asserções de interface | Dados de evento, política, ativação e autenticação são simulados |
| 23 entradas operacionais sem sessão | Fixtures locais | Não testa autenticação real nem disponibilidade do backend |
| 8 canários | Fixtures locais para eventos, cupons, checkout e portal | Cupom expirado/inexistente são respostas deliberadas da fixture, não resultados reais |
| Bloco PWA dentro da jornada pública | `pwa-isolated.cjs`, nos dois viewports | Asserções originais de manifesto, dimensões e registro preservadas; página sintética e arquivos reais do checkout |
| Site publicado | 39 GETs de caminhos estáticos fixos, comparação de conteúdo e hashes | Não executa JavaScript, RPC, login ou operações de negócio; não comprova saúde do backend |

Há redução declarada de cobertura de integração publicada. Fixtures e smoke estático não equivalem a E2E com Apps Script real. Os nomes visíveis dos jobs agora dizem `com fixtures`; os três checks exigidos conhecidos (Contratos e duas Fachadas) mantêm os nomes. Chaves internas históricas de jobs/specs foram mantidas para facilitar o diff, não indicam acesso real. Não há novo skip, continue-on-error ou filtro de casos.

## Fronteira de rede

`tests/safety/isolated-network.cjs` serve os arquivos do checkout com `route.fulfill`; não usa transporte para encaminhar RPC. Os dois endpoints já presentes nas páginas (principal e checkout-v2) são reconhecidos apenas para simulação. O segundo deployment não foi atestado como equivalente ao backend auditado. Métodos e envelopes inesperados abortam e falham no teardown, mesmo que a interface ignore o erro.

O contexto inteiro é interceptado, incluindo frames e popups. Offline, service workers bloqueados, proxy indisponível e resolução de host restrita complementam a guarda. WebSockets nunca conectam ao servidor. Nove controles negativos exercitam fetch, XHR, beacon, iframe, popup, WebSocket, worker, RPC de pagamento desconhecido e registro de service worker. O controle exige que a tentativa inesperada reprove a guarda. Nenhuma chamada de compra real é enviada.

As 24 suítes de branch mantêm seus mocks por teste; `route.fallback` entrega requisições não respondidas à guarda. Seus mocks continuam sendo os contratos dos respectivos cenários, e o ledger do fallback não enumera as chamadas já satisfeitas por eles. A leitura de HTML via APIRequestContext foi substituída por leitura local, preservando asserções e normalizando CRLF.

A fixture compartilhada declara SDK Firebase sem autenticação, leitor QR sem câmera, imagens locais e CSS de fonte com fallback do sistema. Não testa os serviços externos nem a aparência exata da fonte Google. Seis casos dedicados executam o script real de analytics em Home/Evento/Checkout nos dois viewports, exigem captura e validam página, origem, evento e dispositivo. Analytics é validado e capturado localmente com retorno `LOCAL_TEST_CAPTURE`; o ledger omite sessões, payloads completos e URLs com query. `forwarded: 0` é uma declaração do adaptador, corroborada pela implementação sem encaminhamento e pelos controles de rede, não uma captura de pacotes.

O teste PWA usa servidor e proxy locais: somente GET para origem/portas e caminhos fixos; CONNECT e destinos externos são rejeitados. Assim o service worker real pode registrar sem acesso a serviços de negócio. O smoke publicado usa Node HTTP, não segue redirects e reprova conteúdo diferente do checkout. Relatório parcial é salvo também em falha. Atraso de publicação causa falha legítima; não é ignorado.

## Backend separado

O PR de contratos backend usa como base `02eefbed5b168c390291b91744e1bfbbde8c4f98`, sem mudanças funcionais. Ele roda os 42 testes existentes do catálogo estritamente leitor, oito testes de capacidades/configuração/bootstrap de acesso com serviços proibidos e sete testes de analytics com append/cache em memória. As mutações observadas de analytics não são chamadas de leitura segura.

Detalhes de evento/checkout, cupons e parceiro ainda contêm garantia de base ou outros efeitos. Corrigi-los funcionalmente exige recorte próprio envolvendo getters, instalação administrativa, expiração e rate limit. Esta proposta não faz essa refatoração e não os libera em produção. Os testes de leitor certificam apenas o código/dependências executados na VM; não comprovam a versão Apps Script implantada.

## Execução e revisão

Consulte `HOMOLOGACAO.md` para comandos explícitos. Os novos jobs com fixtures rodam também em PR. O job publicado estático está preparado apenas para main/schedule/manual; nenhum run manual foi disparado nesta tarefa. Até merge e revisão/ativação autorizados, o workflow ativo anterior permanece como está — esta branch não elimina seu risco atual.

Revisar primeiro guarda/controles negativos, depois fixtures e adaptação das asserções, em seguida workflow, smoke e contratos backend. O protótipo `public-request-policy.cjs` e seus 16 testes permanecem como especificação inicial; não são usados como transporte nem autorizam RPC nesta implementação. O smoke efetivo tem zero RPC permitidos.
