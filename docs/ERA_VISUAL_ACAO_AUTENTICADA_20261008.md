# ERA BEAUTY: acao autenticada para o visual aprovado

Escopo pontual ligado ao backend PR274. Base site main `1cf5ecb92d8877cf556098d533c096c733ee0a0b`, que ja inclui o asset aprovado de PR157. Sem merge, deploy ou save real nesta tarefa. O uploader geral continua separado e pausado.

Em `/eventos-v2/`, apenas o card ERA devolvido pela listagem autenticada recebe **Aplicar visual aprovado do ERA**. O dialog apresenta a capa inteira com object-fit contain e os tres textos da previa backend. Cancelar nao grava. A confirmacao fica indisponivel antes da previa autorizada e do carregamento da imagem.

A unica nova entrada em `secureCall` encaminha `ctEventosOperacionalVisualEraSeguraPROD` pelo transporte operacional existente, que injeta a sessao ja mantida pelo Portal. O modulo novo nao le token, storage ou credenciais e nao cria um endpoint publico. Nao recebe evento/produtor/URL/texto editavel. A autorizacao efetiva permanece no servidor.

Confirma uma vez, mostra progresso e bloqueia envio duplicado/fechamento durante o envio. Confere evento, cinco campos e `textosExatos` na resposta. Em falha ou resposta perdida, faz somente PREVIA de reconciliacao; nao repete CONFIRMAR automaticamente. Readback incerto exige nova consulta. Somente um readback exato permite informar sucesso.

## Validacao offline

24 testes Playwright: 12 cenarios em desktop e mobile, com RPC e imagem interceptadas e nenhuma rede externa. Cobrem evento correto, sessao ausente, evento alheio, previa/cancelamento, confirmacao unica, progresso/readback, acesso negado, identidade/URL divergente, imagem indisponivel, resposta perdida, falha e cancelamento com previa pendente. Capturas desktop/mobile inspecionadas com imagem inteira e textos/controles legiveis.

## Dependencias para uso real

Publicar backend PR274 e esta interface somente em coordenacao, apos revisao. Nao publicar durante a compra real do usuario. Fazer login pelo Portal do Produtor normalmente e acessar o ERA em Eventos. O navegador examinado por esta tarefa exibiu acesso restrito em `/eventos-v2/`; **nao ha sessao operacional confirmada para gravacao real**. Nenhum token foi extraido e nenhum login foi contornado.

Depois da publicacao coordenada e com sessao autorizada: abrir a acao do ERA, conferir capa/textos, confirmar e exigir resposta de sucesso/readback. Verificar publicamente o visual do evento e catalogo. Nenhuma compra, cobranca ou emissao faz parte desta acao.
