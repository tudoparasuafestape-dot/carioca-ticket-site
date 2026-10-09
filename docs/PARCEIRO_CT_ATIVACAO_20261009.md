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

O portal apresenta novas comissões nominais apenas quando o backend informa
`capacidadesComissao.nominalPersistido=true` e versão `INGRESSOS_NOMINAIS_V1`.
Com backend anterior, schema ausente ou versão desconhecida, usa mensagem
neutra sobre a base registrada. Também apresenta a política de elegibilidade.
O prazo acompanha o produtor
(três dias úteis), mas a data exata depende do calendário/feriados e data-base
ainda não homologados. A ausência do novo campo do backend possui mensagem
segura de fallback. Nenhum repasse é executado ou prometido.

## Teste inteiramente offline

Requer a dependência `@playwright/test` já declarada e Chromium instalado.
Definir explicitamente `CT_BASE_URL=http://127.0.0.1:4173` e executar:

```sh
node tests/partner-activation-offline.cjs
node tests/partner-panel-offline.cjs
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

O painel passou em 10 cenários desktop/mobile: backend anterior, schema
ausente, versão desconhecida, capacidade nominal pronta e comissão paga de
venda revertida. O total pago é preservado; a parcela em análise aparece no
resumo e no lançamento, sem compensação automática. Captura:
`test-results/partner-panel-mobile.png`. O teste usa o HTML e a ponte RPC
reais, com sessão e respostas sintéticas e todas as requisições interceptadas.

A suíte adicional `node tests/eventos-privados-v1.mjs` falha no checkout
Windows em `cadastro comum deve fixar origem PRODUTOR`: a asserção textual
espera LF e não tolera CRLF. Com normalização somente em memória, o teste
passou; o contrato também passou no CI Linux do PR. O teste e os arquivos
envolvidos na asserção são idênticos ao main da base e não foram alterados.
Isso não é um bloqueio funcional introduzido por esta correção.

Sem merge/deploy, home PR164, íconeBar, CentralMobile ou V2.

O draft [166](https://github.com/tudoparasuafestape-dot/carioca-ticket-site/pull/166)
contém os commits iniciais até `2880c7f`. A revisão de capacidade nominal e
estorno pago permanece local, sem novo push, em respeito à orientação
posterior de não publicar. Não foi executada no CI remoto. Nenhum schema ou
calendário foi aplicado em produção; esses são pré-requisitos de rollout.
