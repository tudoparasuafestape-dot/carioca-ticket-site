# Proposta local: browser real sem publicar HTML

Não executada contra Drive. Quatro testes unitários locais passaram; eles NÃO comprovam exibição real.

## Menor risco / primeira aprovação concreta
Pedir autorização para publicar uma branch/PR de teste com CI que abre, em Chromium novo e anônimo no runner GitHub já utilizado, apenas a fixture Drive já pública e o HTML servido em loopback. O teste acessa por GET a URL exata da fixture, em desktop/mobile, verifica renderização, dimensões, MIME, bytes e SHA256. Não usa sessão do proprietário, credenciais de app, banco, Apps Script, evento, compra, webhook, alteração Drive ou Pages. Abertura/atualização da PR dispara essa leitura; portanto aprovar antes de publicar o workflow executável. Não exige merge em main ou deploy.

Implementação local drive-browser-probe.cjs: bloqueio de service workers, nenhum download aceito, allowlist exata de duas URLs GET, máximo8requests por contexto, fresh context por viewport, prova em JSON com criação exclusiva. Redirect novo é recusado, não se amplia allowlist automaticamente. Sem screenshot/upload remoto por padrão. Playwright1.55.0 é a versão já utilizada no workflow Scanner do repo, não uma dependência nova presumida disponível; instalação usa registro oficial existente e está separada da fase do probe. Não colocar secrets na execução.

## Ordem recomendada
1. Revisão independente dos arquivos locais. Nenhuma ação externa.
2. Aprovação explícita da PR de leitura real e de sua execução automática do teste acima; criar PR draft separada ou delta específico revisado. Não reutilizar autorização dos9arquivos nem disparar produção.
3. Observar CI, retornar APROVADO_BROWSER ou falha exata. Não reenviar em loop se falhar; diagnosticar redirects/CSP/Content-Disposition. O Chromium desktop com viewport mobile não equivale a Safari/iOS; registrar essa limitação.
4. Se browser falhar, resolver incompatibilidade antes de solicitar publicação de HTML. Se passar, OG continua NÃO COMPROVADO.
5. Só então solicitar autorização específica para instalar mecanismo de PR268 e publicar exclusivamente HTML1arquivo no Pages ativo. Pode apresentar ambos os atos juntos com SHA/escopo/baseline exatos, mas nenhum autorizado agora.
6. Após sucesso de publicação, testar navegador na origem HTTPS real e crawlerOG real. Este passo detecta diferenças de origem/CSP que loopback não prova. Compartilhar em contato/grupo requer autorização própria.
7. Rollback de produção continua aprovação separada. Eventos/capas reais permanecem inalterados até aprovação e homologação de runtime.

## Execução futura proposta, não executada aqui
NODE_PATH=<runtimeisolado>/node_modules CT_PROBE_APPROVAL=READ_ONLY_EXISTING_PUBLIC_FIXTURE node drive-browser-probe.cjs <HTMLpinado> <novoresultado.json>

Não instalar workflow que contenha este comando antes da aprovação do passo2. O flag do processo apenas verifica escopo, não substitui aprovação do proprietário.

Revisão independente local concluída. A allowlist controla requisições dos contextos Playwright, não é um firewall global do processo Chromium. Não alegar egress completamente isolado. O encerramento do servidor é protegido mesmo se browser.close falhar.
