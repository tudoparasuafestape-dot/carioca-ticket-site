# Compartilhar apresentação pública do Programa Parceiro CT

Complemento isolado sobre o PR169, base `765714d1571439df94dbcf68108fc1f700f1ba39`.
Branch: `feat/public-program-share-20261009`. Rascunho para revisão, sem publicação.

Adiciona o botão Compartilhar apresentação à página pública `/parceiro/programa/`, usando o componente de compartilhamento do PR169. O endereço é sempre `https://cariocaticket.com.br/parceiro/programa/`, sem parâmetros de indicação, sessão, filtros ou tokens. Menu nativo somente mediante clique; alternativa de copiar com feedback e endereço selecionável quando a área de transferência falha. Cancelamento não é erro e cliques repetidos não abrem solicitações simultâneas. Os aplicativos oferecidos pelo menu são determinados pelo dispositivo.

O HTML recebe apenas stylesheet, script do componente e seu bloco visual. Os scripts existentes, formulários de adesão, regras, links, atribuição, vínculo, comissões, financeiro e backend permanecem idênticos à base. A separação permite revisar o complemento sem incorporar PRs antigos que também alteram este arquivo (117, 112, 110, 108 e 107).

Teste: `npx playwright test tests/home/public-share.spec.js --config=playwright.home.config.cjs`. São 20 combinações: home/programa, 320/1440 px, API nativa simulada, ausência da API, cancelamento, falha de cópia e clique repetido. A página é servida do checkout por interceptação e toda requisição externa ou não GET é bloqueada. Nenhuma chamada de cadastro ou financeiro é enviada. As imagens são capturas do navegador com esse isolamento; o menu do sistema não é aberto de verdade.

Resultados finais constam nos checks e na entrega. A integração depende do PR169; não há autorização para merge ou deploy.
