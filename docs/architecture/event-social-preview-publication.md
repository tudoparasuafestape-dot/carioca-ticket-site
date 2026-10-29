# Padrão de compartilhamento com capa por evento — proposta de implementação (LAB)

## Defeito reproduzido / explicação
- `evento-v2/index.html` é uma página estática, com título inicial genérico e sem `og:image` específico de evento. O navegador carrega a capa posteriormente via JavaScript; crawlers de WhatsApp e de redes sociais não dependem dessa renderização.
- `evento/index.html` tem Open Graph genérico apontando para imagem institucional, portanto não supre a prévia por evento.
- Apenas alterar tags no cliente não resolve prévia da URL com `?evento=...` em GitHub Pages.

## Contrato a integrar no fluxo de publicação
1. Depois de aprovação do evento e validação no backend de `modoAcesso=PUBLICO`, status público, gate de vendas e elegibilidade, gerar arquivo HTML estático de prévia em `/compartilhar/<eventoId>/index.html` a partir da fonte autoritativa. **Nunca** derivar elegibilidade exclusivamente de dados administrativos, `EVENTOS` ou cache stale.
2. Inserir no HTML bruto `og:title`, `og:description`, `og:image`, `og:image:secure_url`, `og:url`, `og:type` e `twitter:card=summary_large_image`, com URLs HTTPS públicas, sem cookies, tokens, dados privados ou JavaScript.
3. A imagem deve ser uma variante social da capa oficial estática; preferir 1200×630 JPEG otimizado e manter a capa original sem substituição.
4. Abrindo o URL de compartilhamento, a pessoa deve ser levada à página oficial do evento (`evento-v2/?evento=...` quando homologada), com link explícito de fallback. Esse redirecionamento não pode criar pedido, Pix ou ingresso.
5. Só alterar os botões Compartilhar da home e do evento após confirmar geração, publicação, acesso HTTP 200 da imagem, presença de tags OG no HTML inicial e destino correto. Preservar rotas atuais até lá.
6. Revogação: ao tornar evento privado, restrito, não publicado ou não elegível, remover/indisponibilizar o HTML de prévia na nova versão do site; observar que caches de redes sociais não podem ser revogados instantaneamente.

## Limitações e opções
- GitHub Pages não oferece metatags diferentes para cada query `?evento=` do mesmo arquivo estático. Para que o **mesmo endereço** `evento-v2/?evento=...` forneça OG dinâmico, é necessário serviço de borda ou renderização no servidor, com homologação e implantação separadas.
- A rota estática de compartilhamento é o caminho de menor interferência nas vendas, mas precisa de integração com a publicação aprovada de eventos; criar arquivo OG isolado não implementa o fluxo automático.
- A prévia depende do comportamento/cache do WhatsApp, Telegram e demais serviços; não é possível garantir que qualquer aplicativo mostre imagem sempre.

## Critérios de teste e gates
- Evento público aprovado: HTML da URL compartilhada contém dados e capa oficiais; crawler HTTP recebe HTML sem executar JavaScript; capa acessível e correta.
- Evento privado/restrito/não publicado/venda encerrada: nenhuma nova prévia gerada; links existentes tratados de forma segura.
- Títulos com caracteres especiais escapados; rejeitar URLs `javascript:`, hosts externos não autorizados e IDs inválidos; não incluir PII.
- Compartilhamento de home, WhatsApp e página do evento aponta somente para URL verificada; navegação leva ao evento certo; checkout permanece inalterado.
- Testes offline, branch isolada, CI, homologação, rollback e autorização específica antes de merge/deploy. **Este arquivo não publica nada nem muda a operação atual.**