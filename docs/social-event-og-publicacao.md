# Prévias sociais dos eventos públicos — Carioca Ticket

## Por que existe esta rota
O GitHub Pages serve o mesmo HTML estático de `/evento-v2/?evento=...` para todos os IDs. Robôs de prévia do WhatsApp, Facebook, LinkedIn e outras redes normalmente consultam apenas o HTML da resposta, sem executar o JavaScript que recupera o nome e a capa. Portanto, modificar metadados apenas pelo navegador não resolve.

Cada evento elegível com capa aprovada terá um **HTML estático único** em `/compartilhar/<EVENTO_ID>/`, com `og:title`, `og:description`, `og:image`, `og:url` e equivalentes Twitter, já presentes na resposta HTTP. O script apenas redireciona visitantes humanos à página oficial do evento. Com JavaScript desativado, aparece um link manual para a página de venda. **Não existe Pix, reserva, sessão ou gateway nesse HTML**.

## Dados e segurança
- A origem autorizada para o gerador é `ctEventosPublicosListarPROD`, **após** o frontend publicar exclusivamente cartões elegíveis com envelope temporal válido. Não usar `EVENTOS` administrativos, cache stale ou eventos restritos.
- Só criar prévia se há ID de evento válido, nome e descrição públicos, URL de visualização pertencente à Carioca Ticket e capa **JPEG de `/assets/eventos/`** realmente existente, dentro do limite de 600 KiB.
- Evento sem arte elegível: **não gerar rota OG**; o frontend mantém o link público anterior (sem imagem garantida), em vez de apontar para 404.
- Cada HTML contém somente informações públicas de divulgação; nenhum comprador, CPF, token, dado financeiro ou convite.
- Um evento que seja despublicado/privado deve ter a prévia retirada e os links cancelados em uma atualização autorizada. Até essa atualização, o HTML estático anterior ainda poderá ser acessado por quem já conhece a URL — **não reutilizar esta solução para eventos privados**.
- Se a consulta pública falhar, o sincronizador não altera o manifesto e não produz uma proposta que mascare o problema.

## Como gerar e homologar
```sh
node scripts/generate-social-previews.mjs
node scripts/generate-social-previews.mjs --check
node tests/social-preview.contract.mjs
node tests/whatsapp-share-contract.cjs
```

O manifesto `social/events-publicados.json` contém exclusivamente eventos públicos já homologados. A execução automática também roda o gerador com `--prune`, propondo em PR Draft a remoção de páginas sociais quando o evento deixa de aparecer na agenda pública validada (nunca remove de `main` automaticamente). Para cada novo evento aprovado, a rotina `scripts/sync-public-social-manifest.cjs` consulta os cartões públicos do site pelo navegador Playwright, confere a capa local e atualiza esse manifesto. O workflow `social-preview-propose.yml` é agendado a cada 15 minutos (sujeito à política de agendamento do GitHub) e cria **somente um PR Draft**, nunca faz merge ou deploy. A execução requer permissões do GitHub Actions para criar Pull Requests. Caso a conexão ou permissão não exista, o processo falha sem alterar produção.

O **gatilho direto no ato de clicar Publicar vendas ainda não está integrado ao Apps Script**. Este workflow funciona por varredura periódica de eventos já visíveis na agenda; para publicação instantânea, será necessária integração explícita e segura com o backend após validação da elegibilidade. Não fazer esse acoplamento na versão PROD sem homologação e autorização.

## Teste de aceitação
1. Em branch isolada, conferir `view-source:https://cariocaticket.com.br/compartilhar/<ID>/` após publicação autorizada: tags OG devem existir sem executar JavaScript.
2. Conferir capa pública HTTPS e seu peso/dimensões; o primeiro evento usa a JPG oficial do Herminho (900×1600, 344423 bytes). Imagem vertical pode ser recortada na miniatura por aplicativos; futura melhoria opcional é gerar uma derivação horizontal **sem redesenhar nem alterar a capa oficial**.
3. Compartilhar o **novo link /compartilhar/<ID>/** pelo WhatsApp/Status e outro aplicativo, conferindo miniatura; alguns aplicativos guardam prévias em cache e mensagens antigas não mudam.
4. Ao abrir, redirecionar à página oficial `evento-v2` do Herminho. Verificar lote, elegibilidade e checkout sem nova cobrança.
5. Verificar que outros eventos sem página gerada continuam com seus links anteriores; nenhuma alteração em checkout, pagamentos, emissão ou check-in.

## Limite importante
O antigo `/evento-v2/?evento=<ID>` continuará recebendo o HTML genérico em acessos diretos de robôs. **Só os novos URLs `/compartilhar/<ID>/` possuem metadados exclusivos por evento no GitHub Pages.** Os botões Compartilhar, WhatsApp e Copiar da Carioca Ticket devem preferir a nova URL quando disponível.
