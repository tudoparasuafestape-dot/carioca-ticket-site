# Parceiro CT: ativação e apresentação de elegibilidade

Base: `edcfe04d08438b0ba3a5fd38ef823aa9502aa2e0`.
Branch: `fix/parceiro-ct-ativacao-20261009`.

O main dependia de `current`/`auth.currentUser` ao voltar do e-mail. Em uma
sessão mobile perdida, o botão não conseguia concluir a ativação. O teste de
navegador reproduziu a ausência da tela de sucesso na base antes da correção.

Foram reaproveitadas somente `verified` e `errText` do
[PR 47](https://github.com/tudoparasuafestape-dot/carioca-ticket-site/pull/47),
head `ad0a52dad04f38eceb63094ca677d33a83cf75b5`, compatíveis com o main atual.
Antes do login, `verified` também executa o preflight do e-mail aprovado, como
`loginExisting`. A senha permanece apenas no campo da página; não há nova
persistência. Token Firebase é renovado antes da chamada de ativação.
O PR existente não foi alterado; evitar aplicar os dois diffs cegamente.

O portal diferencia base registrada de novas comissões nominais e apresenta a
política de elegibilidade retornada pelo backend. O prazo acompanha o produtor
(três dias úteis), mas a data exata depende do calendário/feriados e data-base
ainda não homologados. A ausência do novo campo do backend possui mensagem
segura de fallback. Nenhum repasse é executado ou prometido.

## Teste inteiramente offline

Requer a dependência `@playwright/test` já declarada e Chromium instalado.
Definir explicitamente `CT_BASE_URL=http://127.0.0.1:4173` e executar:

```sh
node tests/partner-activation-offline.cjs
node tests/contracts.mjs
```

Não precisa de servidor: a navegação local é atendida pelo interceptor.
O teste recusa URL não local, substitui o destino RPC por
`https://ct-rpc.example.invalid`, bloqueia service workers e intercepta **todas**
as requisições. Firebase e RPC são mocks. Nenhum endpoint real é chamado,
inclusive `ctParceiroOnboardingConfigPublicaPROD`.

Passaram 14 casos, sete em cada viewport desktop/mobile: perda de sessão e
duplo clique, e-mail ainda não verificado com retry, recarga completa com conta
existente, senha ausente, e-mail divergente, falha de rede no login com retry e
convite expirado. Captura: `test-results/partner-activation-mobile.png`.
O contrato geral passou em 41 superfícies. Sem validação real Firebase,
entrega de e-mail ou Safari/iOS.

A suíte adicional `node tests/eventos-privados-v1.mjs` falha em
`cadastro comum deve fixar origem PRODUTOR`; investigar no escopo de eventos,
sem misturar com este patch. O teste e os arquivos envolvidos nessa asserção
não foram modificados por esta branch.

Sem merge/deploy, home PR164, íconeBar, CentralMobile ou V2.
