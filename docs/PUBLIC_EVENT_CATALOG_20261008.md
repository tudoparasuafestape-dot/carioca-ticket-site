# Catálogo público no início da home — proposta em revisão

Base: `e86cd78a05145f0ec791aa377ebb19e223538893` (`main`).
Branch isolada: `codex/public-event-highlights`.

## Diagnóstico e comportamento

A home da base tinha dois cards estáticos da Roda de Samba e não consultava a
lista de eventos públicos. Por isso a publicação do ERA no checkout não o
adicionava à home. A pesquisa também capturava somente os cards iniciais.

Esta proposta apresenta uma única grade pesquisável de eventos no início da
página, antes do conteúdo institucional. Cada evento tem capa completa, nome,
data/horário/local quando informados e links para as rotas existentes
`/evento/?evento=ID` e `/checkout/?evento=ID`. Os IDs vêm da resposta pública;
não há lista fixa de eventos nem preços no catálogo.

O carregamento, o catálogo vazio, a pesquisa sem resultados e o erro de API
são estados distintos. Há nova tentativa após erro/timeout. Imagens ausentes
ou quebradas mantêm o título e os links de compra. Não se restaura uma lista
estática ou antiga quando a consulta falha. Textos são exibidos como texto,
sem interpretação de HTML ou decodificação genérica de acentos.

## Dependência de backend — ainda não publicada

RPC pública de leitura: `ctEventosPublicosListarPROD`, argumentos `[]`, pela
ponte `publicRpc` já usada nas páginas públicas. Resposta acordada:

```js
{
  sucesso: true,
  eventos: [{
    id, nome, data, horario, local, cidade, uf,
    visual: { capaUrl, posterUrl, descricaoCurta, categoria, destaque },
    links: { evento, comprar }
  }],
  total, atualizadoEm, versaoModulo
}
```

O backend deve fornecer somente os eventos autorizados pelo gate de publicação
vigente, com status ATIVO, acesso PUBLICO e exibirCatalogo estritamente true.
Não deve filtrar pelo booleano administrativo “Evento Ativo” nem decidir pela
governança bruta isolada. Eventos privados, não listados e inativos nunca devem
ser incluídos na resposta. Esses filtros pertencem ao PR backend separado;
o frontend não busca linhas operacionais nem tenta reconstruir permissões.

O frontend monta os links canônicos locais de evento e checkout a partir do ID,
preservando a rota de compra validada e sem confiar em destinos arbitrários.

**Não fazer merge/deploy antes de revisar e disponibilizar o backend compatível.**
Até lá, a API de produção não atende este novo contrato.

## Arte e textos do ERA — pendentes

Referência oficial informada: Library `libfile_457773627ce481918c69158a4932dc77`,
`1002071090.jpg`, 1882 × 836. A materialização neste executor retornou HTTP 403;
nenhum arquivo de imagem foi instalado. Nenhuma capa existente foi substituída.
A captura de teste mostra o estado de capa ausente para ERA; não é aprovação da
arte final. A grade já utiliza `object-fit: contain` para preservar a imagem inteira.

A investigação coordenada localizou os textos corrompidos na propriedade visual
persistida do ERA. A correção dos dados será específica e separada. Textos
confirmados:

- Destaque: “Beleza • Negócios • Mulheres”.
- Descrição curta: “Encontro de mulheres empreendedoras da área da beleza.”
- Descrição completa: “Encontro de mulheres empreendedoras da área da beleza.
  Confira as informações do evento, escolha seu ingresso e finalize sua compra
  com segurança pela Carioca Ticket.”

Título cadastrado ERA BEAUTY, datas, local, preços, revisão6, pagamentos,
emissão e permissões ficam fora desta alteração. Não há mudanças em `/checkout/`
ou `/evento/` nesta etapa. A apresentação da arte nessas páginas precisa ser
revisada após o arquivo oficial ficar disponível.

## Validação local

- 20 testes Playwright do catálogo: 1365 × 768 e 412 × 915, todas as requisições
  interceptadas. Cobrem carregamento e busca antecipada, acentos, nova tentativa,
  timeout/resposta atrasada, vazio, imagem ausente/quebrada, conteúdo não confiável,
  evento futuro sem ID fixo, deduplicação, navegação, ausência de overflow e capas
  completas. Nenhum pedido, cobrança ou ingresso real foi criado.
- Revisão adicional com três cards reproduziu, antes da correção, o lazy loading
  preso em `display:none` e o hover com `matrix(1.025, 0, 0, 1.025, 0, 0)` nos dois
  perfis. As quatro regressões passaram após manter a imagem no layout com
  opacidade zero durante o carregamento e neutralizar o zoom legado nos cards
  públicos. A terceira capa de teste tem dimensões 1882 × 836 e marcadores nas
  bordas; é uma fixture sintética, sem substituir a arte oficial do ERA.
- Os mocks restritivos de proteção financeira agora aceitam a consulta pública
  de catálogo usada pela home na preparação da sessão. Nenhuma lógica financeira
  de produto foi alterada.
- `node tests/contracts.mjs`: 41 superfícies protegidas passaram.
- `tests/eventos-privados-v1.mjs`: a execução direta no Windows falha na comparação
  literal de quebras de linha do cadastro comum (checkout com `core.autocrlf=true`).
  Passou inicialmente com normalização CRLF→LF apenas em memória e depois
  diretamente, após alinhar as quebras de linha do checkout local a LF. O conteúdo
  dos arquivos envolvidos segue idêntico à base; não há alteração lógica.
- Jornada Home → Evento → Checkout → PIX simulado → Minha Carioca → Ingresso:
  passou em desktop e mobile com respostas simuladas, sem cobrança real. O mock
  existente recebeu somente a resposta da nova RPC; o checkout não foi editado.
- GitHub Pages verificado por leitura: fonte `main`, caminho `/`, build `legacy`.
  Esta branch não é fonte de publicação. Não houve merge ou deploy.

Capturas locais: `test-results/public-event-catalog-*/catalog-home.png`,
`catalog-viewport.png` e `catalog-three-events.png`. As capturas de viewport e
do terceiro card são preservadas também pelos artefatos de CI
`catalogo-publico-desktop` e `catalogo-publico-mobile` por 14 dias, inclusive quando
os testes passam. A suíte nova foi incluída no job local de homologação
desktop/mobile do CI; não há chamada real ao novo backend nessa suíte.
